/**
 * DSH-Mobile notifications.
 *
 * Wraps @capacitor/local-notifications for the Android-only first pass:
 *  - request permission (system dialog on Android 13+)
 *  - fire a local notification on demand
 *  - schedule connect/disconnect status pings
 *
 * Future (agent events): the native layer can push events into
 * window.__DSH_MOBILE_NOTIFY.emit() when the remote harness reports an
 * agent completion / approval request over the WebSocket channel.
 */

const PLUGIN_NAME = 'LocalNotifications';

function native() {
  const cap = typeof window !== 'undefined' ? (window.Capacitor || null) : null;
  return cap && cap.Plugins && cap.Plugins.LocalNotifications ? cap.Plugins.LocalNotifications : null;
}

let permissionAsked = false;

/** Request notification permission (no-op on Android <13). */
export async function ensurePermission() {
  const p = native();
  if (!p) return true; // web preview: nothing to do
  try {
    const status = await p.checkPermissions();
    if (status.display === 'granted') return true;
    if (status.display === 'denied') {
      // User already refused once — don't nag; they can enable in settings.
      return false;
    }
    const req = await p.requestPermissions();
    return req.display === 'granted';
  } catch (err) {
    console.error('[notify] permission check failed', err);
    return false;
  }
}

/**
 * Fire a local notification immediately.
 * @param {{title?: string, body?: string, id?: number}} opts
 */
export async function notify({ title = 'DSH Mobile', body = '', id }) {
  const p = native();
  if (!p) return;
  if (!permissionAsked) {
    permissionAsked = true;
    const ok = await ensurePermission();
    if (!ok) return;
  }
  try {
    await p.schedule({
      notifications: [
        {
          id: id != null ? id : Date.now() % 100000,
          title,
          body,
          sound: 'default',
          smallIcon: 'ic_stat_dsh',
          iconColor: '#4176E6',
        },
      ],
    });
  } catch (err) {
    console.error('[notify] schedule failed', err);
  }
}

/**
 * Test hook: fire a demo notification (used by the debug entry point and
 * during development on device).
 */
export async function testNotification() {
  await notify({
    title: 'DSH Mobile',
    body: 'Test notification — notifications work!',
    id: 999,
  });
}

export { PLUGIN_NAME };