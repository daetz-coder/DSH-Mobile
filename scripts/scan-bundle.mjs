// Fetch the DSH main JS bundle WITH session cookie and scan for HITL constants.
// The session cookie is obtained at runtime (never hardcoded) — see lib/pocket-auth.cjs.
import { createRequire } from 'module';
const { obtainCookie } = createRequire(import.meta.url)('./lib/pocket-auth.cjs');
const cookie = await obtainCookie();
const res = await fetch('http://192.168.95.115:3081/assets/index-C-1AiF3k.js', {
  headers: { Cookie: cookie },
});
const t = await res.text();
console.log('JS len: ' + t.length + ' status: ' + res.status);
if (t.length < 1000) { console.log('BODY: ' + t.slice(0, 200)); process.exit(0); }

const needles = [
  /ask_user/, /user[-/]question/, /approval\/request/, /permission\/request/,
  /"question"/, /"approval"/, /user-question/, /question\/request/, /askUser/i,
];
const seen = new Set();
for (const re of needles) {
  const rx = new RegExp(re.source, (re.flags.includes('g') ? re.flags : re.flags + 'g'));
  let m;
  while ((m = rx.exec(t)) !== null) {
    const ctx = t.slice(Math.max(0, m.index - 25), m.index + 45).replace(/\s+/g, ' ').trim();
    seen.add(re.source + ' => ' + ctx);
    rx.lastIndex++;
    if (seen.size > 40) break;
  }
}
console.log(JSON.stringify([...seen].slice(0, 40), null, 1));