// CDP: inspect composer area — buttons near the textarea with labels.
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
    // buttons whose center is near/below the textarea bottom
    const near = [...document.querySelectorAll('button')].filter(b => {
      const br = b.getBoundingClientRect();
      return Math.abs(br.bottom - tr.bottom) < 200 || (br.top >= tr.top && br.top < tr.bottom + 120);
    }).map(b => ({ label: (b.getAttribute('aria-label')||b.textContent||'').trim().slice(0,24), x: Math.round((b.getBoundingClientRect().left+b.getBoundingClientRect().right)/2), y: Math.round((b.getBoundingClientRect().top+b.getBoundingClientRect().bottom)/2), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
    return { taRect: { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) }, nearButtons: near.slice(0, 10), allButtons: document.querySelectorAll('button').length };
  })())`,
  returnByValue: true,
});
console.log('COMPS ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);