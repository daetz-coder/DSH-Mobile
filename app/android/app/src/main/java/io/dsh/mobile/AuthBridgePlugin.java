package io.dsh.mobile;

import android.webkit.CookieManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * AuthBridgePlugin: completes the dsh-pocket PIN login natively and either
 * (a) seeds the WebView cookie store, or (b) full-page navigates the shell to
 * the remote harness.
 *
 * Why: Android WebView blocks autofocus/form submission inside a cross-origin
 * iframe, and SameSite cookies are not forwarded to cross-site iframe
 * requests at all. Loading the harness as the *top-level* page (full-page
 * navigation) makes it same-site, so session cookies flow naturally to every
 * API/WS request. The pairing list stays in the Capacitor shell; the android
 * back button (handled natively in MainActivity) returns to it.
 *
 * Exposed as Capacitor plugin "AuthBridge":
 *   check({ url })                -> { protected, reachable }  (NO cookies)
 *   login({ url, pin })           -> { ok, status, token }
 *   open({ url })                 -> full-page navigate to remote
 *   isRemote()                    -> { remote: bool }
 */
@CapacitorPlugin(name = "AuthBridge")
public class AuthBridgePlugin extends Plugin {

    private static final String LOGIN_PATH = "/pocket-login";
    private static final String VERIFY_MARK = "访问验证";
    private static final String VERIFY_MARK_EN = "password-protected";
    private static final int TIMEOUT_MS = 10_000;

    /** True while the WebView is showing a remote harness (full-page). */
    private static volatile boolean inRemote = false;

    public static boolean isRemote() {
        return inRemote;
    }

    public static void setRemote(boolean v) {
        inRemote = v;
    }

    /**
     * Probe WITHOUT cookies (important: the global CapacitorCookieManager
     * silently re-sends the session cookie we planted, which would make the
     * origin look unprotected). Temporarily replace the global CookieHandler
     * with a reject-all one, probe, then restore.
     */
    @PluginMethod
    public void check(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("missing url");
            return;
        }
        new Thread(() -> {
            CookieHandler prev = null;
            try {
                prev = CookieHandler.getDefault();
            } catch (Throwable ignored) {
            }
            try {
                CookieHandler.setDefault(new java.net.CookieManager(null, java.net.CookiePolicy.ACCEPT_NONE));
                String base = url.replaceAll("/+$", "");
                URL target = new URL(base + "/");
                HttpURLConnection conn = (HttpURLConnection) target.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(TIMEOUT_MS);
                conn.setReadTimeout(TIMEOUT_MS);
                conn.setInstanceFollowRedirects(false);
                int status = conn.getResponseCode();
                String body = status < 400 ? readBody(conn) : "";
                boolean protectedByPin =
                        (status == HttpURLConnection.HTTP_UNAUTHORIZED) ||
                        (status == HttpURLConnection.HTTP_FORBIDDEN) ||
                        (body.contains(VERIFY_MARK) || body.contains(VERIFY_MARK_EN));
                JSObject ret = new JSObject();
                ret.put("protected", protectedByPin);
                ret.put("reachable", status > 0);
                ret.put("status", status);
                call.resolve(ret);
                conn.disconnect();
            } catch (Exception ex) {
                JSObject ret = new JSObject();
                ret.put("protected", false);
                ret.put("reachable", false);
                ret.put("error", String.valueOf(ex));
                call.resolve(ret);
            } finally {
                if (prev != null) {
                    try {
                        CookieHandler.setDefault(prev);
                    } catch (Throwable ignored) {
                    }
                }
            }
        }).start();
    }

    /**
     * Full-page navigate the WebView to the remote harness. This makes the
     * remote page the top-level document (same-site), so the session cookie
     * planted by login() is sent with every API/WS request.
     */
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("missing url");
            return;
        }
        inRemote = true;
        getActivity().runOnUiThread(() -> {
            try {
                getBridge().getWebView().loadUrl(url);
                // Start the DSH event watcher: session events (tool calls,
                // step completions, assistant replies) become notifications.
                startEventWatcher(url);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Exception ex) {
                inRemote = false;
                call.reject("navigate failed: " + ex);
            }
        });
    }

    /** Go back to the Capacitor shell (pairing list). */
    @PluginMethod
    public void exit(PluginCall call) {
        inRemote = false;
        stopEventWatcher();
        getActivity().runOnUiThread(() -> {
            try {
                getBridge().getWebView().loadUrl(getBridge().getLocalUrl());
                JSObject ret = new JSObject();
                ret.put("ok", true);
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject("exit failed: " + ex);
            }
        });
    }

    /* ---------- DSH event watcher ---------- */

    private DsEventWatcher watcher;

    private void startEventWatcher(String url) {
        try {
            stopEventWatcher();
            String base = url.replaceAll("/+$", "");
            // Session cookie is already in the WebView store (planted by
            // login); read it back and pass it to the watcher so the proxy
            // authenticates the events.mux stream.
            String cookieStr = CookieManager.getInstance().getCookie(base);
            if (cookieStr == null || cookieStr.isEmpty()) {
                // LAN with auth disabled — connect without a cookie.
                cookieStr = "";
            }
            DsEventWatcher w = new DsEventWatcher(getContext(), base, cookieStr);
            w.start();
            watcher = w;
        } catch (Exception ex) {
            // watcher is best-effort; never break navigation
        }
    }

    private void stopEventWatcher() {
        if (watcher != null) {
            watcher.stop();
            watcher = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopEventWatcher();
        super.handleOnDestroy();
    }

    /** Query whether the WebView is currently showing a remote harness. */
    @PluginMethod
    public void isRemote(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("remote", inRemote);
        call.resolve(ret);
    }

    @PluginMethod
    public void login(PluginCall call) {
        String url = call.getString("url");
        String pin = call.getString("pin");
        if (url == null || pin == null) {
            call.reject("missing url or pin");
            return;
        }

        new Thread(() -> {
            try {
                String base = url.replaceAll("/+$", "");
                URL loginUrl = new URL(base + LOGIN_PATH);
                HttpURLConnection conn = (HttpURLConnection) loginUrl.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(TIMEOUT_MS);
                conn.setReadTimeout(TIMEOUT_MS);
                conn.setDoOutput(true);
                conn.setInstanceFollowRedirects(false); // we need the 302 + Set-Cookie
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                conn.setRequestProperty("Origin", base);
                conn.setRequestProperty("Referer", base + "/");

                String body = "token=" + URLEncoder.encode(pin, StandardCharsets.UTF_8.name());
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }

                int status = conn.getResponseCode();
                // dsh-pocket replies 302 Found with Set-Cookie on success,
                // 200 + error page on wrong PIN, 429 when rate-limited.
                if (status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM) {
                    String setCookie = conn.getHeaderField("Set-Cookie");
                    if (setCookie != null) {
                        String domain = new URL(base).getHost();
                        // CookieManager.setCookie(key/expires/httpOnly breakdown):
                        // use the raw Set-Cookie value trimmed of attributes we
                        // cannot map, keeping name=value + expires + path.
                        String cookieSpec = sanitizeSetCookie(setCookie);
                        CookieManager.getInstance().setCookie(base, cookieSpec);
                        flushSync();

                        // Extract the raw session token (dsh_pocket_token=...) so
                        // the JS layer can also use the URL-parameter auth form
                        // (dsh-pocket accepts ?token=<sha256(PIN:sessionKey)>),
                        // which sidesteps any remaining iframe/cookie plumbing.
                        String sessionToken = extractToken(setCookie);

                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        ret.put("status", status);
                        ret.put("token", sessionToken);
                        call.resolve(ret);
                    } else {
                        call.reject("no session cookie returned (status " + status + ")");
                    }
                } else {
                    String detail = readText(conn);
                    call.reject("login failed (HTTP " + status + ") " + (detail != null ? detail.substring(0, Math.min(120, detail.length())) : ""));
                }
                conn.disconnect();
            } catch (Exception ex) {
                call.reject("login error: " + ex);
            }
        }).start();
    }

    /**
     * Convert a raw HTTP Set-Cookie header into something CookieManager
     * accepts. CookieManager.setCookie(url, value) expects "name=value;
     * expires=...; path=...". Strip HttpOnly/SameSite/Secure attributes
     * (handled by WebView policy), keep name=value and expires/path.
     */
    private String sanitizeSetCookie(String raw) {
        StringBuilder keep = new StringBuilder();
        boolean first = true;
        for (String part : raw.split(";")) {
            String trimmed = part.trim();
            String lower = trimmed.toLowerCase(Locale.ROOT);
            if (lower.startsWith("httponly") || lower.startsWith("samesite") || lower.startsWith("secure")) {
                continue;
            }
            if (!first) keep.append("; ");
            keep.append(trimmed);
            first = false;
        }
        return keep.toString();
    }

    private void flushSync() {
        try {
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
        }
    }

    /** Extract the raw token value from a Set-Cookie header like
     *  "dsh_pocket_token=<hex>; HttpOnly; ...". Returns null if absent. */
    private String extractToken(String setCookie) {
        try {
            for (String part : setCookie.split(";")) {
                String trimmed = part.trim();
                int eq = trimmed.indexOf('=');
                if (eq > 0 && "dsh_pocket_token".equals(trimmed.substring(0, eq).trim())) {
                    return trimmed.substring(eq + 1).trim();
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private String readText(HttpURLConnection conn) {
        try {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(
                    conn.getErrorStream() != null ? conn.getErrorStream() : conn.getInputStream(),
                    StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
            }
            return sb.toString();
        } catch (Exception ex) {
            return null;
        }
    }

    /** Read the 2xx response body (for auth-gate detection). */
    private String readBody(HttpURLConnection conn) {
        try {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(
                    conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
            }
            return sb.toString();
        } catch (Exception ex) {
            return "";
        }
    }
}