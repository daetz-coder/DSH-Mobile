/**
 * DSH-Mobile native bridge bootstrap.
 *
 * Maps the local Capacitor plugins (SecureStorePlugin, QrScannerPlugin —
 * implemented under android/app/src/main/java/io/dsh/mobile/) onto the two
 * globals consumed by store.js and qr.js. In a plain browser (dev preview)
 * the globals are intentionally absent so the web fallbacks kick in.
 */

(function bootstrap() {
  const cap = typeof window !== 'undefined' ? (window.Capacitor || null) : null;
  if (!cap || !cap.Plugins) return;

  // SecureStorePlugin registered as name "SecureStore".
  const secure = cap.Plugins.SecureStore;
  if (secure) {
    window.__DSH_MOBILE_SECURE = {
      async get(key) {
        const r = await secure.get({ key });
        return r && r.value != null ? JSON.parse(r.value) : null;
      },
      async set(key, value) {
        await secure.set({ key, value: JSON.stringify(value) });
      },
    };
  }

  // QrScannerPlugin registered as name "QrScanner".
  const qr = cap.Plugins.QrScanner;
  if (qr) {
    window.__DSH_MOBILE_QR = {
      async scan() {
        const r = await qr.scan();
        return r && typeof r.value === 'string' ? r.value : null;
      },
    };
  }

  // AuthBridgePlugin registered as name "AuthBridge".
  const auth = cap.Plugins.AuthBridge;
  if (auth) {
    window.__DSH_MOBILE_AUTH = {
      async check(url) {
        const r = await auth.check({ url });
        return { protected: !!(r && r.protected), reachable: !!(r && r.reachable) };
      },
      async login(url, pin) {
        const r = await auth.login({ url, pin });
        return { ok: !!(r && r.ok), token: (r && r.token) || null, status: r && r.status };
      },
    };
  }
})();