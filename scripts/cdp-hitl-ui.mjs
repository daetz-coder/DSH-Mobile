// CDP: inspect the DSH page DOM for question/approval UI components and any
// element whose text hints at waiting-for-user.
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
    const hits = all.filter(el => {
      const t = (el.textContent || '');
      const cls = (el.className || '') + ' ' + (el.id || '');
      return /question|approval|permission|ask|待审批|需要审批|允许|拒绝/i.test(t + ' ' + cls) && t.length < 200;
    }).slice(0, 8).map(el => ({
      cls: String(el.className||'').slice(0,60),
      id: el.id,
      text: (el.textContent||'').trim().slice(0,80)
    }));
    return hits;
  })())`,
  returnByValue: true,
});
console.log('HITL_UI ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);