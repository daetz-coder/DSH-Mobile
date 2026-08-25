/**
 * DSH-Mobile i18n.
 *
 * Mirrors the DeepSeek Harness UI language pair (zh / en). The shell auto-
 * follows the first navigation language, persists the user's choice across
 * launches (localStorage), and the in-app switch re-applies immediately.
 *
 * Markup hooks:
 *   data-i18n="key"          → textContent
 *   data-i18n-html="key"     → innerHTML  (for inline <b>/<i> emphasis)
 *   data-i18n-ph="key"       → placeholder
 *   data-i18n-prefix="key"   → prefix textContent (for "+ Add ..." buttons)
 */

const STORE_KEY = 'dsh.mobile.lang';

export const LANGUAGES = ['zh', 'en'];

const STRINGS = {
  zh: {
    langLabel: '语言',
    scanQr: '扫码配对',
    homeHint: '与电脑上正在运行的 DeepSeek Harness 配对：扫描 <b>DSH Web → 设置 → 插件 → 手机访问</b>（dsh-pocket）显示的二维码，或手动添加地址。',
    noPairings: '还没有配对。扫描二维码开始。',
    addManual: '+ 手动添加地址',
    cancel: '取消',
    scanQrTitle: '扫描二维码',
    scanHint: '将相机对准 dsh-pocket 在 Harness 设置页显示的二维码。',
    scanAgain: '重新扫描',
    useAddress: '使用此地址',
    opening: '正在打开 Harness…',
    addHarnessUrl: '添加 Harness 地址',
    name: '名称',
    namePh: '例如：Home PC',
    url: '地址',
    urlPh: 'http://192.168.1.10:3081 或 https://xxx.trycloudflare.com',
    unreachableHint: '无法连接该地址 — 请确认电脑上 dsh web 正在运行、手机与电脑在同一网络，然后重试。',
    add: '添加',
    accessPin: '访问密码 (PIN)',
    pinDesc: '此 Harness 受访问密码保护（dsh-pocket）。输入电脑端「手机访问」页面显示的 <b>8 位数字 PIN</b> 以解锁。',
    pinPh: '8 位数字',
    unlock: '解锁',
    invalidUrl: '地址无效 — 应为 http(s)://…',
    failedSave: '保存配对失败：',
    pairingRemoved: '已移除配对',
    scannerError: '扫码失败',
    pinError: 'PIN 应为 4–16 位数字',
    pinUnlockFailed: 'PIN 登录失败 — 请重连或重试',
    openRemoteFailed: '打开远程 Harness 失败',
    statusOnline: '在线 — 点击进入',
    statusOffline: '离线 — 检查电脑与网络',
    statusPin: '受密码保护 — 点击输入 PIN',
    lastUsed: '上次使用 ',
    removePairing: '移除配对',
    renamePairingTitle: '重命名配对',
    save: '保存',
    emptyName: '名称不能为空',
    renamed: '已重命名',
  },
  en: {
    langLabel: 'Language',
    scanQr: 'Scan QR',
    homeHint: 'Pair with the DeepSeek Harness running on your computer: scan the QR code shown in <b>DSH Web → Settings → Plugins → Mobile access</b> (dsh-pocket). Or add the URL manually.',
    noPairings: 'No pairings yet. Scan a QR code to begin.',
    addManual: '+ Add URL manually',
    cancel: 'Cancel',
    scanQrTitle: 'Scan QR code',
    scanHint: 'Point the camera at the QR code shown by dsh-pocket on the Harness settings page.',
    scanAgain: 'Scan again',
    useAddress: 'Use this address',
    opening: 'Opening Harness…',
    addHarnessUrl: 'Add Harness URL',
    name: 'Name',
    namePh: 'e.g. Home PC',
    url: 'URL',
    urlPh: 'http://192.168.1.10:3081 or https://xxx.trycloudflare.com',
    unreachableHint: 'Cannot reach that address — make sure dsh web is running on the computer, the phone and computer are on the same network, then retry.',
    add: 'Add',
    accessPin: 'Access PIN',
    pinDesc: 'This Harness is password-protected (dsh-pocket). Enter the <b>8-digit PIN</b> shown on the computer\'s <i>Mobile access</i> page to unlock it.',
    pinPh: '8 digits',
    unlock: 'Unlock',
    invalidUrl: 'Invalid URL — expected http(s)://…',
    failedSave: 'Failed to save pairing: ',
    pairingRemoved: 'Pairing removed',
    scannerError: 'Scanner error',
    pinError: 'PIN should be 4–16 digits',
    pinUnlockFailed: 'PIN login failed — reconnect or retry',
    openRemoteFailed: 'Failed to open remote harness',
    statusOnline: 'Online — tap to open',
    statusOffline: 'Offline — check the computer and network',
    statusPin: 'Password-protected — tap to enter PIN',
    lastUsed: 'Last used ',
    removePairing: 'Remove pairing',
    renamePairingTitle: 'Rename pairing',
    save: 'Save',
    emptyName: 'Name cannot be empty',
    renamed: 'Renamed',
  },
};

let currentLang = 'en';

function detectInitial() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && LANGUAGES.includes(saved)) return saved;
    const nav = (navigator.language || 'en').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function t(key) {
  const table = STRINGS[currentLang] || STRINGS.en;
  return table[key] != null ? table[key] : STRINGS.en[key] != null ? STRINGS.en[key] : key;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!LANGUAGES.includes(lang)) lang = 'en';
  currentLang = lang;
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
  apply();
  window.dispatchEvent(new CustomEvent('dsh:langchange', { detail: lang }));
}

function apply() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
  document.querySelectorAll('[data-i18n-prefix]').forEach((el) => {
    const key = el.getAttribute('data-i18n-prefix');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  document.querySelectorAll('#lang-switch button[data-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
  });
}

/** Wire the language switch. Returns initial language. */
export function initI18n() {
  currentLang = detectInitial();
  document.querySelectorAll('#lang-switch button[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang')));
  });
  setLang(currentLang);
  initThemeFollow();
  return currentLang;
}

/**
 * Mirror the DSH dark theme onto the shell: the harness toggles the document
 * via data-ds-dark-theme driven by prefers-color-scheme. We follow the same
 * system preference so the pairing list matches the harness look.
 */
function initThemeFollow() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.setAttribute('data-ds-dark-theme', mq.matches ? 'true' : 'false');
  };
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else mq.addListener(apply);
}