package io.dsh.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private static final String CHANNEL_ID = "dsh_events";
    private static final int STATUS_NOTIF_ID = 100;
    private static final long POLL_MS = 2000;
    // consecutive identical turnStatus reads (2s apart) → treat as finished
    private static final int FREEZE_LIMIT = 4;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private long lastErrorToastAt = 0L;
    private String lastStatusText = "";
    private boolean wasActive = false;   // saw a turnStatus while running
    private String lastActiveText = "";  // latest non-empty turnStatus text
    private int freezeStreak = 0;        // consecutive identical reads → run ended

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureStorePlugin.class);
        registerPlugin(QrScannerPlugin.class);
        registerPlugin(AuthBridgePlugin.class);
        super.onCreate(savedInstanceState);

        disableWebViewOverscroll();
        installConnectionMonitor();
    }

    /**
     * Disable the WebView-level overscroll "stretch" effect. With Android 15
     * enforcing edge-to-edge (targetSdk 36), the status bar floats ABOVE the
     * WebView content. On OPPO/ColorOS especially, scrolling past the top of
     * the message list yanks the whole page view (including position:fixed
     * headers — conversation list / background tasks) up into the status-bar
     * region, where the system layer swallows taps. Killing overscroll removes
     * that page-level translation at the source.
     */
    private void disableWebViewOverscroll() {
        try {
            getBridge().getWebView().post(() -> {
                try {
                    android.webkit.WebView wv = getBridge().getWebView();
                    wv.setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
                    // Belt-and-braces: also stop nested/fling scroll chaining.
                    wv.setNestedScrollingEnabled(false);
                } catch (Exception ignored) {
                }
            });
        } catch (Exception ignored) {
        }
    }

    /**
     * Native status poller: while a remote harness is open (full-page
     * navigation), periodically inject a snippet into the DSH page to read its
     * OWN rendered turn-status text (.Md3f7G_turnStatus, e.g. "Deep diving...
     * 1分45秒" shown above the composer). Surfacing that exact string as a
     * persistent notification keeps the phone in sync with the harness UI —
     * no clock/state guessing on our side.
     */
    private final Runnable statusPoller = new Runnable() {
        @Override
        public void run() {
            try {
                if (AuthBridgePlugin.isRemote()) {
                    WebView wv = getBridge().getWebView();
                    wv.post(() -> wv.evaluateJavascript(
                            "(function(){" +
                            // Guard 1: stop overscroll chaining in page CSS.
                            // On edge-to-edge Android 15, overscrolling past the
                            // top moves fixed headers under the floating status
                            // bar where taps die (OPPO/ColorOS). This CSS forces
                            // scroll containment instead of page translation.
                            "if(!document.getElementById('dsh-osc-guard')){" +
                            "var st=document.createElement('style');st.id='dsh-osc-guard';" +
                            "st.textContent='html,body,#app,#root{overscroll-behavior-y:none!important;-webkit-overflow-scrolling:touch;}'" +
                            ";(document.head||document.documentElement).appendChild(st);}" +
                            "var e=document.querySelector('[class*=\"turnStatus\"]:not([class*=\"Clock\"])');" +
                            "var s=e?e.textContent.trim():'';" +
                            "return JSON.stringify({s:s});})()",
                            value -> {
                                android.util.Log.d("dsh-status", "poller callback: " + value);
                                if (value != null && !"null".equals(value) && !value.isEmpty()) {
                                    try {
                                        String json = value;
                                        if (json.startsWith("\"") && json.endsWith("\"")) {
                                            json = json.substring(1, json.length() - 1);
                                            json = json.replace("\\\"", "\"").replace("\\\\", "\\");
                                        }
                                        org.json.JSONObject o = new org.json.JSONObject(json);
                                        String statusText = o.optString("s", "");
                                        android.util.Log.d("dsh-status", "poller read: '" + statusText + "'");

                                        if (!statusText.isEmpty()) {
                                            if (statusText.equals(lastStatusText)) {
                                                // Same text again → DSH stopped ticking
                                                // (finished/paused). Transition to done
                                                // after a short stable window.
                                                freezeStreak++;
                                                if (wasActive && freezeStreak >= FREEZE_LIMIT) {
                                                    wasActive = false;
                                                    showStatus("DSH 已完成", "本次用时 " + elapsedFrom(lastActiveText));
                                                }
                                            } else {
                                                // text still advancing → actively working.
                                                wasActive = true;
                                                freezeStreak = 0;
                                                lastActiveText = statusText;
                                                showStatus("DSH 进行中", statusText);
                                            }
                                            lastStatusText = statusText;
                                        } else if (wasActive) {
                                            // turnStatus element gone → the run finished.
                                            wasActive = false;
                                            freezeStreak = 0;
                                            lastStatusText = "";
                                            showStatus("DSH 已完成", "本次用时 " + elapsedFrom(lastActiveText));
                                        }
                                    } catch (Exception ex) {
                                        android.util.Log.w("dsh-status", "poller parse failed: " + ex + " raw=" + value);
                                    }
                                }
                            }));
                }
            } catch (Exception ignored) {
            } finally {
                mainHandler.postDelayed(this, POLL_MS);
            }
        }
    };

    private void showStatus(String title, String text) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "DSH 状态", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("Agent 任务状态与审批/提问通知");
                nm.createNotificationChannel(ch);
            }
            Notification n = new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_popup_sync)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setColor(0xFF4176E6)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .build();
            nm.notify(STATUS_NOTIF_ID, n);
        } catch (Exception ignored) {
        }
    }

    /**
     * Extract the elapsed-time portion from the DSH native turnStatus text,
     * e.g. "Deep diving...1分45秒" → "1分45秒". Falls back to the whole text.
     */
    private String elapsedFrom(String nativeText) {
        if (nativeText == null || nativeText.isEmpty()) return "";
        int idx = nativeText.lastIndexOf("...");
        if (idx >= 0) return nativeText.substring(idx + 3).trim();
        return nativeText;
    }

    /**
     * Native connection monitor: while the WebView shows a remote harness
     * (full-page navigation), network/HTTP failures are surfaced as native
     * toasts so the user always knows the link died, even though the pairing
     * shell's JS isn't running on the remote page. Back still returns to the
     * shell where the user can tap the pairing again to reconnect.
     */
    private void installConnectionMonitor() {
        try {
            getBridge().getWebView().post(() -> {
                try {
                    getBridge().addWebViewListener(new WebViewListener() {
                        @Override
                        public void onReceivedError(WebView webView) {
                            showError("DSH connection lost — check network, then press Back and reconnect");
                        }

                        @Override
                        public void onReceivedHttpError(WebView webView) {
                            showError("DSH request failed (HTTP) — press Back and reconnect");
                        }

                        @Override
                        public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                            showError("DSH view crashed — press Back and reopen");
                            return false;
                        }
                    });
                    // Start the status poller once bridge is up.
                    mainHandler.post(statusPoller);
                } catch (Exception ignored) {
                }
            });
        } catch (Exception ignored) {
        }
    }

    private void showError(String message) {
        if (!AuthBridgePlugin.isRemote()) return; // only noisy while remote
        long now = System.currentTimeMillis();
        if (now - lastErrorToastAt < 5000) return; // throttle
        lastErrorToastAt = now;
        mainHandler.post(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    /**
     * Native-app back behaviour: while the WebView is showing a remote
     * harness (full-page navigation via AuthBridgePlugin.open), the back
     * button returns to the pairing-list shell instead of exiting the app.
     * Capacitor 8 handles back in the JS layer for its own pages; for the
     * remote page there is no JS bridge, so we intercept here.
     */
    @Override
    public void onBackPressed() {
        if (AuthBridgePlugin.isRemote()) {
            AuthBridgePlugin.setRemote(false);
            getBridge().getWebView().post(() ->
                    getBridge().getWebView().loadUrl(getBridge().getLocalUrl()));
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(statusPoller);
        super.onDestroy();
    }
}