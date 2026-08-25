// CDP: check if turnStatus exists right now; if not, send a task then re-check.
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

console.log('status now: ' + await ev(`JSON.stringify((() => {
  const e = document.querySelector('[class*="turnStatus"]:not([class*="Clock"])');
  return { exists: !!e, text: e ? e.textContent.trim() : null };
})())`));

// send a task to make it appear
await ev(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return 'no-ta';
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'think for a moment about the color blue, then reply with the single word: done');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
  ta.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', keyCode:13, bubbles:true }));
  return 'sent';
})()`);
await new Promise((r) => setTimeout(r, 5000));
console.log('status after 5s: ' + await ev(`JSON.stringify((() => {
  const e = document.querySelector('[class*="turnStatus"]:not([class*="Clock"])');
  return { exists: !!e, text: e ? e.textContent.trim() : null };
})())`));
ws.close();
process.exit(0);