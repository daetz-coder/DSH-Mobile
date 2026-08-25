package io.dsh.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * SecureStorePlugin: encrypted key-value storage backed by AndroidKeyStore.
 *
 * Values are encrypted with AES-256-GCM using a non-exportable key held in the
 * Android Keystore ("dsh_mobile_master_key"). Only ciphertext touches disk
 * (SharedPreferences). This is what keeps pairing tokens / URLs at rest.
 *
 * Exposed to the web layer as Capacitor plugin "SecureStore":
 *   get(key)   -> { value: string | null }
 *   set(key)   -> { ok: true }
 *   remove(key)-> { ok: true }
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "dsh_mobile_master_key";
    private static final String PREFS = "dsh_mobile_secure_vault";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int GCM_IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    private SecretKey keyCache;

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("missing key");
            return;
        }
        // Read from the new SHA-256-based key; fall back to the legacy
        // hashCode-based key so pairings stored before the digest switch
        // are not lost.
        String cipherB64 = prefs().getString(sanitize(key), null);
        if (cipherB64 == null) cipherB64 = prefs().getString(legacyKey(key), null);
        if (cipherB64 == null) {
            JSObject ret = new JSObject();
            ret.put("value", JSONObject.NULL);
            call.resolve(ret);
            return;
        }
        try {
            byte[] payload = Base64.decode(cipherB64, Base64.NO_WRAP);
            if (payload.length < GCM_IV_BYTES + 1) {
                call.reject("corrupt ciphertext");
                return;
            }
            byte[] iv = Arrays.copyOfRange(payload, 0, GCM_IV_BYTES);
            byte[] ct = Arrays.copyOfRange(payload, GCM_IV_BYTES, payload.length);
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.DECRYPT_MODE, masterKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            String value = new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
            JSObject ret = new JSObject();
            ret.put("value", value);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("decrypt failed: " + ex);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("missing key or value");
            return;
        }
        try {
            // AndroidKeyStore GCM keys default to setRandomizedEncryptionRequired
            // = true: the caller must NOT supply an IV when encrypting — the
            // KeyStore generates a fresh random IV and we read it back via
            // cipher.getIV(). It is then stored alongside the ciphertext and
            // supplied explicitly on decrypt (which IS permitted).
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.ENCRYPT_MODE, masterKey());
            byte[] iv = cipher.getIV();
            byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] payload = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(ct, 0, payload, iv.length, ct.length);
            prefs().edit()
                    .putString(sanitize(key), Base64.encodeToString(payload, Base64.NO_WRAP))
                    .remove(legacyKey(key))   // migrate away from hashCode key
                    .apply();
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("encrypt failed: " + ex);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("missing key");
            return;
        }
        prefs().edit()
                .remove(sanitize(key))
                .remove(legacyKey(key))
                .apply();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    /* ---------- internals ---------- */

    private SharedPreferences prefs() {
        Context ctx = getContext();
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Legacy pre-digest key (String.hashCode). Kept for data migration. */
    private String legacyKey(String key) {
        return "v." + Integer.toHexString(key.hashCode());
    }

    /** SharedPreferences keys allow a narrow charset; derive a stable safe key.
     *  hashCode() collides for distinct URLs (e.g. similar pairing hosts), which
     *  would silently overwrite another pair's entry — use a hex digest instead. */
    private String sanitize(String key) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(key.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder("v.");
            for (byte b : digest) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (Exception ex) {
            // Fallback: never collide via hashCode alone; add length prefix.
            return "v." + key.length() + "." + Integer.toHexString(key.hashCode());
        }
    }

    private SecretKey masterKey() throws Exception {
        if (keyCache != null) return keyCache;
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) {
            keyCache = (SecretKey) ks.getKey(KEY_ALIAS, null);
            return keyCache;
        }
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        keyCache = generator.generateKey();
        return keyCache;
    }
}