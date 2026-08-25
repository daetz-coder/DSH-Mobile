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
 * DsEventWatcher: a read-only WebSocket client (RFC 6455) that connects to the
 * DSH harness /api/events.mux stream (via the dsh-pocket proxy) and fires a
 * TRANSIENT popup ONLY when the human must act (approval / question / ask).
 *
 * The persistent "DSH status" notification is NOT handled here — MainActivity
 * periodically reads the DSH page's own rendered turn-status text (.Md3f7G_
 * turnStatus, e.g. "Deep diving...1分45秒") so the status notification mirrors
 * exactly what the harness UI shows, with no guessing on our side.
 *
 * Event signals observed live (2026-08):
 *   - approval: nested session/event "approval/asked" / "approval/decided",
 *     and standalone frames method "approval/requested" / "approval/resolved".
 *   - question / ask-user tool: agent waiting on the operator.
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
    private int popupId = 0;

    private static final Pattern APPROVAL_SIGNAL = Pattern.compile(
            "\"(?:type|method)\"\\s*:\\s*\"(?:user[-/])?(question|approval|permission)(?:_?[a-z]*)?\"",
            Pattern.DOTALL);
    private static final Pattern CONSENT_SIGNAL = Pattern.compile(
            "\"(?:name|card|kind)\"\\s*:\\s*\"(permission|approval|consent|escalat)(e|ion)?\"",
            Pattern.DOTALL);
    private static final Pattern ASK_TOOL = Pattern.compile(
            "\"name\"\\s*:\\s*\"([^\"]*(?:ask|question|input|prompt)[^\"]*)\"",
            Pattern.DOTALL);

    public DsEventWatcher(Context context, String baseUrl, String sessionCookie) {
        this.appContext = context.getApplicationContext();
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
                    CHANNEL_ID, "DSH 提醒", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("需要你审批或回答时提醒");
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
            if (masked) in.read(mask);
            byte[] payload = new byte[(int) len];
            int off = 0;
            while (off < payload.length) {
                int n = in.read(payload, off, payload.length - off);
                if (n < 0) break;
                off += n;
            }
            if (masked) for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
            int opcode = b0 & 0x0F;
            if (opcode == 1) {
                handleFrame(new String(payload, StandardCharsets.UTF_8));
            } else if (opcode == 8) {
                break;
            }
        }
    }

    private void handleFrame(String text) {
        if (text == null || text.isEmpty()) return;
        if (isPermissionRequest(text)) {
            popup("DSH 需要审批", "Agent 请求一项需要你批准的操作");
        } else if (isAskUserTool(text) || isQuestionEvent(text)) {
            popup("DSH 向你提问", "Agent 正在等待你的回答");
        }
    }

    private void popup(final String title, final String body) {
        main.post(() -> {
            try {
                Notification n = new Notification.Builder(appContext, CHANNEL_ID)
                        .setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setAutoCancel(true)
                        .setColor(0xFF4176E6)
                        .build();
                notifier.notify(200 + (popupId++ % 90), n);
            } catch (Exception ignored) {
            }
        });
    }

    private boolean isPermissionRequest(String text) {
        return APPROVAL_SIGNAL.matcher(text).find() || CONSENT_SIGNAL.matcher(text).find();
    }

    private boolean isAskUserTool(String text) {
        Matcher m = ASK_TOOL.matcher(text);
        if (!m.find()) return false;
        String name = m.group(1).toLowerCase(Locale.ROOT);
        return name.contains("ask") || name.contains("question") || name.contains("input")
                || name.contains("prompt");
    }

    private boolean isQuestionEvent(String text) {
        return APPROVAL_SIGNAL.matcher(text).find();
    }

    private static final int FRAME_MAX = 256 * 1024;
    private static final String EVENTS_PATH = "/api/events.mux";
    private static final String TAG = "dsh-events";
}