package io.dsh.mobile;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private long lastErrorToastAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureStorePlugin.class);
        registerPlugin(QrScannerPlugin.class);
        registerPlugin(AuthBridgePlugin.class);
        super.onCreate(savedInstanceState);

        installConnectionMonitor();
    }

    /**
     * Native connection monitor: while the WebView shows a remote harness
     * (full-page navigation), network/HTTP failures are surfaced as native
     * toasts so the user always knows the link died, even though the pairing
     * shell's JS isn't running on the remote page. Back still returns to the
     * shell where the user can tap the pairing again to reconnect.
     */
    private void installConnectionMonitor() {
        // The listener is registered via the WebView's handler after
        // onCreate so getBridge() is alive.
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
                } catch (Exception ignored) {
                    // Listener hookup is best-effort.
                }
            });
        } catch (Exception ignored) {
            // Bridge not ready yet; monitor hookup is best-effort.
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
}