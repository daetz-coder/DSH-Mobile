package io.dsh.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.io.BufferedInputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DsEventWatcher: a minimal read-only WebSocket client (RFC 6455) that
 * connects to the DSH harness's /api/events.mux stream (through the
 * dsh-pocket proxy) and turns interesting session events into Android
 * notifications.
 *
 * Event protocol (observed live, 2026-08):
 *   {"type":"server-request",...,"payload":{"type":"session/event",...,
 *     "event":{"type":"tool/call","name":"pwsh",...}}}
 *   event.type ∈ { assistant/chunk, assistant/message, tool/call,
 *                  tool/result, step/start, step/end, ... }
 *
 * Notification rules (quiet-first):
 *   - tool/call for a shell-like tool  -> "DSH 正在执行 <tool>…" (throttled)
 *   - step/end                         -> "DSH 步骤完成"          (throttled)
 *   - assistant/message (assistant role) -> "DSH 回复完成"
 *
 * Runs on its own thread; auto-reconnects with a small backoff. The cookie
 * comes from the WebView session so the proxy authenticates the stream.
 */
public class DsEventWatcher {

    public static final String CHANNEL_ID = "dsh_events";

    private final Context appContext;
    private final String wsUrl;
    private final String cookie;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final NotificationManager notifier;

    private Thread thread;
    private volatile boolean running = false;

    private static final Pattern EVENT_MARK = Pattern.compile("\"session/event\"");

    public DsEventWatcher(Context context, String baseUrl, String sessionCookie) {
        this.appContext = context.getApplicationContext();
        // baseUrl may carry a ?token= query (URL auth form); strip it and
        // rebuild a clean ws://host:port/api/events.mux URL.
        String clean = baseUrl.replaceAll("\\?.*$", "").replaceAll("/+$", "");
        String host = clean.replaceAll("^https?://", "");
        this.wsUrl = "ws://" + host + EVENTS_PATH;
        this.cookie = sessionCookie;
        this.notifier = (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannel();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "DSH 事件", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Agent 任务进度与完成通知");
            notifier.createNotificationChannel(ch);
        }
    }

    public void start() {
        if (running) return;
        running = true;
        thread = new Thread(this::loop, "dsh-events");
        thread.setDaemon(true);
        thread.start();
    }

    public void stop() {
        running = false;
        if (thread != null) thread.interrupt();
    }

    private void loop() {
        while (running) {
            try (Socket sock = new Socket()) {
                android.util.Log.d(TAG, "connecting " + wsUrl);
                sock.connect(new InetSocketAddress(hostOf(), portOf()), 5000);
                handshake(sock);
                android.util.Log.d(TAG, "connected, reading frames");
                readFrames(sock);
            } catch (Exception ex) {
                android.util.Log.w(TAG, "watch error: " + ex);
            }
            if (!running) break;
            try { Thread.sleep(4000); } catch (InterruptedException ie) { break; }
        }
    }

    private String hostOf() {
        String rest = wsUrl.replaceAll("^ws://", "");
        int idx = rest.indexOf(':');
        return idx < 0 ? rest : rest.substring(0, idx);
    }

    private int portOf() {
        String rest = wsUrl.replaceAll("^ws://", "");
        int idx = rest.indexOf(':');
        if (idx < 0) return 80;
        String p = rest.substring(idx + 1).split("/")[0];
        try { return Integer.parseInt(p); } catch (Exception e) { return 80; }
    }

    private void handshake(Socket sock) throws Exception {
        byte[] rand = new byte[16];
        new SecureRandom().nextBytes(rand);
        String key = Base64.getEncoder().encodeToString(rand);

        String rest = wsUrl.replaceAll("^ws://", "");
        String path = "/" + rest.substring(rest.indexOf('/') + 1);
        // strip any leftover query string
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);

        OutputStream os = sock.getOutputStream();
        StringBuilder req = new StringBuilder();
        req.append("GET ").append(path).append(" HTTP/1.1\r\n");
        req.append("Host: ").append(hostOf()).append(':').append(portOf()).append("\r\n");
        req.append("Upgrade: websocket\r\n");
        req.append("Connection: Upgrade\r\n");
        req.append("Sec-WebSocket-Key: ").append(key).append("\r\n");
        req.append("Sec-WebSocket-Version: 13\r\n");
        if (cookie != null && !cookie.isEmpty()) {
            req.append("Cookie: ").append(cookie).append("\r\n");
        }
        req.append("\r\n");
        os.write(req.toString().getBytes(StandardCharsets.UTF_8));
        os.flush();

        BufferedInputStream in = new BufferedInputStream(sock.getInputStream());
        String status = readLine(in);
        android.util.Log.d(TAG, "handshake status: " + status);
        if (status == null || !status.contains(" 101")) {
            throw new IllegalStateException("WS handshake failed: " + status);
        }
        String line;
        while ((line = readLine(in)) != null && !line.isEmpty()) { /* consume headers */ }
    }

    private String readLine(BufferedInputStream in) throws Exception {
        StringBuilder sb = new StringBuilder();
        int c = -1;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') sb.append((char) c);
            if (sb.length() > 4096) break;
        }
        return (sb.length() == 0 && c == -1) ? null : sb.toString();
    }

    private void readFrames(Socket sock) throws Exception {
        BufferedInputStream in = new BufferedInputStream(sock.getInputStream());
        while (running) {
            int b0 = in.read();
            if (b0 < 0) break;
            int b1 = in.read();
            if (b1 < 0) break;
            boolean masked = (b1 & 0x80) != 0;
            long len = b1 & 0x7F;
            if (len == 126) {
                len = ((long) (in.read() & 0xFF) << 8) | (in.read() & 0xFF);
            } else if (len == 127) {
                len = 0;
                for (int i = 0; i < 8; i++) len = (len << 8) | (in.read() & 0xFF);
            }
            if (len > FRAME_MAX) {
                long skip = len;
                while (skip > 0) skip -= in.skip(skip);
                continue;
            }
            byte[] mask = new byte[4];
            if (masked) {
                in.read(mask);
            }
            byte[] payload = new byte[(int) len];
            int off = 0;
            while (off < payload.length) {
                int n = in.read(payload, off, payload.length - off);
                if (n < 0) break;
                off += n;
            }
            if (masked) {
                for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
            }
            int opcode = b0 & 0x0F;
            if (opcode == 1) {
                handleFrame(new String(payload, StandardCharsets.UTF_8));
            } else if (opcode == 8) {
                break;
            }
        }
    }

    private void handleFrame(String text) {
        if (text == null || !text.contains("session/event")) return;

        // Only surface notifications when the agent needs the human:
        //   1) a permission/approval request (tool call escalated to the user),
        //   2) an ask-user / question tool (agent is asking the operator).
        // Everything else (tool progress, step ends, replies) is silent so the
        // phone is not spammed while the agent just works.
        if (isPermissionRequest(text)) {
            notify("DSH 需要审批", "Agent 请求一项需要你批准的操作");
            return;
        }
        if (isAskUserTool(text)) {
            notify("DSH 向你提问", "Agent 正在等待你的回答");
        }
    }

    private static final Pattern PERMISSION_HINT = Pattern.compile(
            "\"type\":\"tool/call\".*?\"(?:name|card|kind)\":\\s*\"(permission|approval|request|grant|allow)([^\"]*)\"",
            Pattern.DOTALL);
    private static final Pattern ASK_TOOL = Pattern.compile(
            "\"type\":\"tool/call\".*?\"name\":\\s*\"([^\"]*(?:ask|question|input)[^\"]*)\"",
            Pattern.DOTALL);

    private boolean isPermissionRequest(String text) {
        // A tool call that must be approved by the user before it runs.
        // Detect the approval/permission view on the tool call, or a tool whose
        // own name signals authorization.
        if (text.contains("\"type\":\"tool/call\"")) {
            if (PERMISSION_HINT.matcher(text).find()) return true;
            // dsh approval often surfaces as tool arguments requesting permission,
            // or a dedicated "permission"/"approve" tool name.
            if (text.matches("(?s).*\"(name|card|kind)\"\\s*:\\s*\"(permission|approval)\".*")) return true;
        }
        return false;
    }

    private boolean isAskUserTool(String text) {
        // ask_user_question and similar HITL tools.
        if (!text.contains("\"type\":\"tool/call\"")) return false;
        Matcher m = ASK_TOOL.matcher(text);
        if (!m.find()) return false;
        String name = m.group(1).toLowerCase(Locale.ROOT);
        return name.contains("ask") || name.contains("question") || name.contains("input");
    }

    private void notify(final String title, final String body) {
        main.post(() -> {
            try {
                Notification n = new Notification.Builder(appContext, CHANNEL_ID)
                        .setSmallIcon(android.R.drawable.ic_popup_sync)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setAutoCancel(true)
                        .setColor(0xFF4176E6)
                        .build();
                notifier.notify((int) (System.currentTimeMillis() % 100000), n);
            } catch (Exception ignored) {
            }
        });
    }

    private static final int FRAME_MAX = 256 * 1024;
    private static final String EVENTS_PATH = "/api/events.mux";
    private static final String TAG = "dsh-events";
}