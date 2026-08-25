// CDP: send a task that takes a while, then watch session/event frames.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const frames = [];
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
  } else if (msg.method === 'Network.webSocketFrameReceived') {
    frames.push(msg.params.response.payloadData);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Runtime.enable');
await send('Network.enable');

// 1) send a task that will produce multiple events
await send('Runtime.evaluate', {
  expression: `(() => {
    const ta = document.querySelector('textarea, [contenteditable=true]');
    if (!ta) return 'no-composer';
    ta.focus();
    const msg = 'Please write a short 3-line poem about the ocean, in Chinese.';
    if (ta.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, msg);
    } else {
      ta.textContent = msg;
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const btns = [...document.querySelectorAll('button')];
    const send = btns.find(b => /send|发送|prompt/i.test((b.getAttribute('aria-label')||'') + (b.textContent||'')));
    if (send) send.click();
    return 'sent';
  })()`,
  returnByValue: true,
});

console.log('TASK SENT, LISTENING 25s...');
await new Promise((res) => setTimeout(res, 25000));

const eventTypes = new Map();
const samples = [];
for (const f of frames) {
  try {
    const j = JSON.parse(f);
    const inner = (j.payload && j.payload.event) || {};
    const t = inner.type || (j.payload && j.payload.type) || '?';
    if (!eventTypes.has(t)) { eventTypes.set(t, 0); samples.push(f.slice(0, 400)); }
    eventTypes.set(t, eventTypes.get(t) + 1);
  } catch { /* ignore */ }
}
console.log('EVENT_TYPES ' + JSON.stringify([...eventTypes.entries()]));
console.log('SAMPLES ' + JSON.stringify(samples.slice(0, 12)));
ws.close();
process.exit(0);