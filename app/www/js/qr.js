/**
 * DSH-Mobile QR scanning bridge.
 *
 * Delegates to the native QrScannerPlugin (CameraX + ZXing, no Google Play
 * Services dependency). The native plugin owns the camera preview overlay and
 * resolves with the raw QR payload string (or null on cancel).
 */

const PLUGIN_NAME = 'QrScanner';

function nativeAvailable() {
  return typeof window !== 'undefined' &&
    typeof window.__DSH_MOBILE_QR !== 'undefined';
}

/**
 * Start the native scanner. Resolves with the decoded string, or null when
 * the user cancels / scanning fails.
 * @returns {Promise<string|null>}
 */
export function scan() {
  if (!nativeAvailable()) {
    return Promise.reject(new Error('QrScanner native plugin not available'));
  }
  try {
    return window.__DSH_MOBILE_QR.scan();
  } catch (err) {
    return Promise.reject(err);
  }
}

export { PLUGIN_NAME };