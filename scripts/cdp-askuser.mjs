// CDP: ask the agent to use the ask-user tool (guaranteed HITL).
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
    ta.focus();
    const msg = 'Before doing anything, ask me one question using the ask_user tool: what color do you prefer?';
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, msg);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    return { value: ta.value.slice(0, 70) };
  })())`,
  returnByValue: true,
});
console.log('SENT ' + JSON.stringify(r.result && r.result.value));
ws.close();
process.exit(0);