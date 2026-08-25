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
 * DSH harness /api/events.mux stream (via the dsh-pocket proxy) and drives a
 * persistent status notification plus occasional HITL popups.
 *
 * Status notification (id STATUS_NOTIF_ID), updated as the agent works:
 *   - "working" : set when tool/step/assistant activity is seen; a 1s ticker
 *                 refreshes the elapsed duration shown in the notification.
 *   - "idle"    : set after IDLE_MS with no activity, showing the last run's
 *                 total duration ("已完成，用时 mm:ss").
 * This persistent notification means the user never has to reopen the app to
 * see whether the agent is running / how long it has been going.
 *
 * HITL popups (separate transient notifications) fire only when the human
 * must act — approval/permission/question — everything else stays silent.
 *
 * Event protocol (observed live, 2026-08):
 *   {"type":"server-request","payload":{"type":"session/event",
 *     "event":{"type":"tool/call"|"step/start"|"assistant/chunk"|...}}}
 *   approval signals: session/event event.type "approval/asked"/"approval/decided"
 *   and standalone frames method "approval/requested"/"approval/resolved".
 */
public class DsEventWatcher {

    public static final String CHANNEL_ID = "dsh_events";
    private static final int STATUS_NOTIF_ID = 100;
    private static final int IDLE_MS = 8000;
    private static final long TICK_MS = 1000;

    private final Context appContext;
    private final String wsUrl;
    private final String cookie;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final NotificationManager notifier;

    private Thread thread;
    private volatile boolean running = false;

    // activity clock (guarded by main thread)
    private boolean active = false;
    private long activeSince = 0L;
    private long lastActivityAt = 0L;
    private long idleDisplayMs = 0L;
    private final Runnable ticker = this::tick;

    private static final Pattern ACTIVITY = Pattern.compile(
            "\"(?:type|method)\"\\s*:\\s*\"(?:(?:session/)?event|tool/call|tool/result|step/start|step/end|assistant/(?:chunk|message)|session/jobs)\"",
            Pattern.DOTALL);
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
                    CHANNEL_ID, "DSH 状态", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Agent 任务状态与审批/提问通知");
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
        main.removeCallbacks(ticker);
        notifyStatus("disconnected", null);
        if (thread != null) thread.interrupt();
    }

    private void loop() {
        while (running) {
            try (Socket sock = new Socket()) {
                android.util.Log.d(TAG, "connecting " + wsUrl);
                sock.connect(new InetSocketAddress(hostOf(), portOf()), 5000);
                handshake(sock);
                android.util.Log.d(TAG, "connected, reading frames");
                onConnected();
                readFrames(sock);
            } catch (Exception ex) {
                android.util.Log.w(TAG, "watch error: " + ex);
            }
            if (!running) break;
            try { Thread.sleep(4000); } catch (InterruptedException ie) { break; }
        }
    }

    private void onConnected() {
        main.post(() -> {
            lastActivityAt = System.currentTimeMillis();
            // status: show "receiving" immediately so the user knows it's live
            if (!active) {
                active = true;
                activeSince = System.currentTimeMillis();
            }
            scheduleTick();
            notifyStatus("connected", null);
        });
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

        // Activity → mark the agent as working (feeds the persistent status).
        if (ACTIVITY.matcher(text).find()) {
            markActivity();
        }

        // HITL → transient popup only when the human must act.
        if (isPermissionRequest(text)) {
            notify("DSH 需要审批", "Agent 请求一项需要你批准的操作");
            markAwaitingInput("等待审批中");
        } else if (isAskUserTool(text) || isQuestionEvent(text)) {
            notify("DSH 向你提问", "Agent 正在等待你的回答");
            markAwaitingInput("等待你的输入");
        }
    }

    private void markActivity() {
        main.post(() -> {
            long now = System.currentTimeMillis();
            lastActivityAt = now;
            if (!active) {
                active = true;
                activeSince = now;
                notifyStatus("working", null);
                scheduleTick();
            }
        });
    }

    private void markAwaitingInput(final String label) {
        main.post(() -> {
            active = false;
            if (label != null) notifyStatus("waiting", label);
        });
    }

    private void scheduleTick() {
        main.removeCallbacks(ticker);
        main.postDelayed(ticker, TICK_MS);
    }

    /** Runs every second: refresh elapsed time; flip to idle when quiet. */
    private void tick() {
        if (!running) return;
        long now = System.currentTimeMillis();
        if (active) {
            if (now - lastActivityAt > IDLE_MS) {
                // went quiet → the current activity finished
                idleDisplayMs = now - activeSince;
                active = false;
                notifyStatus("idle", null);
                return;
            }
            notifyStatus("working", null);
            scheduleTick();
        }
    }

    /** Renders the persistent status notification. */
    private void notifyStatus(String state, String extraLabel) {
        final String title;
        final String text;
        long now = System.currentTimeMillis();
        if ("connected".equals(state)) {
            title = "DSH 已连接";
            text = "正在接收电脑上的 Harness 状态…";
        } else if ("working".equals(state)) {
            title = "DSH 进行中";
            text = "已运行 " + fmtDuration(now - activeSince) + (extraLabel != null ? " · " + extraLabel : "");
        } else if ("waiting".equals(state)) {
            title = "DSH 等待你";
            text = extraLabel != null ? extraLabel : "需要你的输入";
        } else if ("idle".equals(state)) {
            title = "DSH 已完成";
            text = "本次用时 " + fmtDuration(idleDisplayMs);
        } else { // disconnected
            title = "DSH 连接已断开";
            text = "返回程序重新连接";
        }
        main.post(() -> showNotification(title, text, true));
    }

    private String fmtDuration(long ms) {
        long s = ms / 1000;
        long m = s / 60;
        long h = m / 60;
        if (h > 0) return String.format(Locale.ROOT, "%d:%02d:%02d", h, m % 60, s % 60);
        return String.format(Locale.ROOT, "%d:%02d", m % 60, s % 60);
    }

    private void notify(final String title, final String body) {
        main.post(() -> showNotification(title, body, false));
    }

    private void showNotification(String title, String text, boolean persistent) {
        try {
            Notification.Builder b = new Notification.Builder(appContext, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_popup_sync)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setColor(0xFF4176E6)
                    .setOnlyAlertOnce(true);
            if (persistent) {
                b.setOngoing(true)
                        .setContentInfo("")
                        .setWhen(System.currentTimeMillis());
            } else {
                b.setAutoCancel(true);
            }
            notifier.notify(persistent ? STATUS_NOTIF_ID : (int) (System.currentTimeMillis() % 100000), b.build());
        } catch (Exception ignored) {
        }
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
