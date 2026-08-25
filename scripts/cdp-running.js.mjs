// CDP: find where the DSH UI shows running state / elapsed time / "进行中"
// in the session header, to reuse its authoritative source.
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
    const all = [...document.querySelectorAll('*')];
    const out = [];
    for (const el of all) {
      const t = (el.textContent||'').trim();
      const hasRunning = /进行中|running|in progress|elapsed|耗时|已运行|\\d+:\\d{2}/i.test(t);
      if (hasRunning && t.length < 80) {
        out.push({ tag: el.tagName, cls: String(el.className||'').slice(0,50), text: t.slice(0,60) });
      }
    }
    return out.slice(0, 10);
  })())`,
  returnByValue: true,
});
console.log('RUNNING_UI ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);