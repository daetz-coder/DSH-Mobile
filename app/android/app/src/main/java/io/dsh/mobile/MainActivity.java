package io.dsh.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureStorePlugin.class);
        registerPlugin(QrScannerPlugin.class);
        registerPlugin(AuthBridgePlugin.class);
        super.onCreate(savedInstanceState);
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