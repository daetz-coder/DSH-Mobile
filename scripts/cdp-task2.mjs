// CDP: find the send button (rightmost near composer bottom) and submit a task.
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
    const msg = 'list the files in the current working directory';
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, msg);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // send = Enter key on textarea (standard for chat composers)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    // also try clicking the rightmost bottom button if Enter didn't fire
    const btns = [...document.querySelectorAll('button')].filter(b => {
      const br = b.getBoundingClientRect();
      const tr = ta.getBoundingClientRect();
      return br.top >= tr.bottom - 10 && br.top <= tr.bottom + 90 && br.right < 420;
    });
    const rightmost = btns.sort((a,b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
    if (rightmost) {
      const label = (rightmost.getAttribute('aria-label')||rightmost.textContent||'').trim();
      if (!label) { rightmost.click(); return { clicked: 'rightmost-empty', value: ta.value.slice(0,40) }; }
      return { clicked: 'rightmost:' + label.slice(0,20), value: ta.value.slice(0,40) };
    }
    return { clicked: 'none', value: ta.value.slice(0,40) };
  })())`,
  returnByValue: true,
});
console.log('SEND ' + JSON.stringify(r.result && r.result.value));
ws.close();
process.exit(0);