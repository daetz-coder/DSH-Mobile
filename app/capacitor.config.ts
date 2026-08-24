import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.dsh.mobile',
  appName: 'DSH Mobile',
  webDir: 'www',
  server: {
    // http scheme so the local shell can embed plain-http LAN dashboards
    // (https://localhost + http://192.168.x.x iframe = mixed content, blocked
    // by Android WebView). Keep cleartext on for dev; see docs/03 for hardening.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;