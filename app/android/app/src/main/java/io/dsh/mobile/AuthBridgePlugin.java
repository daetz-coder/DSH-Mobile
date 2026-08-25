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
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * AuthBridgePlugin: completes the dsh-pocket PIN login natively and injects
 * the session cookie into the WebView cookie store.
 *
 * Why: Android WebView blocks autofocus and form submission *inside a
 * cross-origin iframe* (the DSH remote UI is hosted in one), so the
 * dsh-pocket /pocket-login form cannot be submitted from within the frame.
 * This plugin performs the same POST with a plain HTTP client, captures the
 * HttpOnly session cookie from the 302 response, and plants it via
 * CookieManager so the iframe's next load carries the session.
 *
 * Exposed as Capacitor plugin "AuthBridge":
 *   check({ url })                -> { protected: bool, reachable: bool }
 *   login({ url, pin })           -> { ok, status, token }
 */
@CapacitorPlugin(name = "AuthBridge")
public class AuthBridgePlugin extends Plugin {

    private static final String LOGIN_PATH = "/pocket-login";
    private static final String VERIFY_MARK = "访问验证";
    private static final String VERIFY_MARK_EN = "password-protected";
    private static final int TIMEOUT_MS = 10_000;

    /**
     * Probe a remote origin without authenticating: does it sit behind the
     * dsh-pocket password gate? A GET that returns the verify page (zh/en
     * markers) or 401 means protected; anything else (real DSH HTML/302/403
     * from upstream) means the LAN PIN switch is off and direct access works.
     */
    @PluginMethod
    public void check(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("missing url");
            return;
        }
        new Thread(() -> {
            try {
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
            }
        }).start();
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