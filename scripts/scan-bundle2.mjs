// Scan DSH bundle for slash-event strings and words like question/approval/ask/consent.
// The session cookie is obtained at runtime (never hardcoded) — see lib/pocket-auth.cjs.
import { createRequire } from 'module';
const { obtainCookie } = createRequire(import.meta.url)('./lib/pocket-auth.cjs');
const cookie = await obtainCookie();
const res = await fetch('http://192.168.95.115:3081/assets/index-C-1AiF3k.js', {
  headers: { Cookie: cookie },
});
const t = await res.text();

// 1) all quoted "xxx/yyy" slash tokens (likely event names)
const slash = new Set();
let m;
const re1 = /["'`]([a-z][a-z0-9_-]*\/[a-z0-9._/-]*)[a-z0-9/_-]*["'`]/gi;
while ((m = re1.exec(t)) !== null) slash.add(m[1]);
console.log('SLASH_TOKENS: ' + JSON.stringify([...slash].filter(x => !x.includes('http') && !x.includes('://')).slice(0, 60)));

// 2) words containing ask/question/approval/permission/consent/intervention
const kw = new Set();
const re2 = /[A-Za-z_-]*(ask|question|approval|permission|consent|intervention|human|inbox)[A-Za-z_-]*/gi;
while ((m = re2.exec(t)) !== null) { if (m[0].length > 3) kw.add(m[0]); }
console.log('KEYWORDS: ' + JSON.stringify([...kw].slice(0, 40)));