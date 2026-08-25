// Fetch the DSH main JS bundle WITH session cookie and scan for HITL constants.
const tokens = [
  'dsh_pocket_token=741f9929ec7b13efe518dc8b81bc31d0aece274ae6ff1dbf9892274cb6e696e5',
];
const res = await fetch('http://192.168.95.115:3081/assets/index-C-1AiF3k.js', {
  headers: { Cookie: tokens[0] },
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