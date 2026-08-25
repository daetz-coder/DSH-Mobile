// CDP: capture the exact DOM selectors + text for DSH's authoritative
// per-message timing ("用时 X" / timeStart timeEnd) so we can scrape it.
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
    const found = [];
    const all = [...document.querySelectorAll('*')];
    for (const el of all) {
      const t = (el.textContent||'').trim();
      if (/用时|tok\/s|timeStart|timeEnd|\\d+分\\d+秒/.test(t) && t.length < 90) {
        found.push({
          cls: String(el.className||''),
          cid: el.classList && el.classList.length ? el.classList[0] : '',
          text: t.slice(0,60)
        });
      }
    }
    // unique by text
    return found.slice(0, 12);
  })())`,
  returnByValue: true,
});
console.log('TIMING_UI ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);