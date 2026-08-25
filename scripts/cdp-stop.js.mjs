// CDP: find any stop/generate button in the DSH page and stop; then send a
// short task that will finish fast, to observe the done transition.
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
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.result && r.result.value;
}

// 1) find stop button
console.log('STOPBTN ' + await ev(`JSON.stringify((() => {
  const btns = [...document.querySelectorAll('button')];
  const stop = btns.filter(b => /停止|stop|interrupt|cancel/i.test((b.getAttribute('aria-label')||'') + (b.textContent||'')));
  return stop.map(b => ({ t: (b.textContent||'').trim().slice(0,10), label: (b.getAttribute('aria-label')||'').slice(0,20) }));
})())`));

// 2) send a guaranteed-fast task
console.log('SEND ' + await ev(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return 'no-ta';
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Reply with the single word: ok');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
  ta.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
  return 'sent';
})()`));
ws.close();
process.exit(0);