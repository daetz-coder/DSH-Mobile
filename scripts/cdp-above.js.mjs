// CDP: inspect the DSH composer area — capture everything immediately ABOVE
// the textarea (the status/progress strip: "Deep diving…", running, elapsed).
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Runtime.enable');
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify((() => {
    const ta = document.querySelector('textarea');
    if (!ta) return { noTextarea: true };
    const tr = ta.getBoundingClientRect();
    // walk up from textarea, collect text of sibling/ancestor strips above it
    const rows = [];
    // elements near/above the textarea within ~200px, sorted top->down
    const all = [...document.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.top >= tr.top - 200 && r.bottom <= tr.top + 10 && r.height < 60 && (el.textContent||'').trim();
    });
    const seen = new Set();
    const unique = all
      .filter(el => {
        const t = (el.textContent||'').trim();
        if (seen.has(t) || t.length > 120) return false;
        seen.add(t); return true;
      })
      .sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map(el => ({
        top: Math.round(el.getBoundingClientRect().top - tr.top),
        cls: String(el.className||'').slice(0,40),
        cid: el.classList && el.classList[0] || '',
        text: (el.textContent||'').trim().slice(0,70)
      }));
    return { textareaTop: Math.round(tr.top), above: unique.slice(0, 12) };
  })())`,
  returnByValue: true,
});
console.log('ABOVE ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);