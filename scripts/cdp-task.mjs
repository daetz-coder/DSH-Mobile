// CDP: send a task that triggers tool use (approval) from the DSH composer.
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
  expression: `(() => {
    const ta = document.querySelector('textarea, [contenteditable=true]');
    if (!ta) return 'no-composer';
    ta.focus();
    const msg = 'list the files in the current directory';
    if (ta.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, msg);
    } else {
      ta.textContent = msg;
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // find send: usually Enter or a button with aria-label containing send
    const btns = [...document.querySelectorAll('button')];
    const candidates = btns.filter(b => {
      const s = (b.getAttribute('aria-label')||'') + (b.textContent||'');
      return /send|发送|submit/i.test(s);
    });
    const used = [];
    for (const b of candidates) {
      const rect = b.getBoundingClientRect();
      if (rect.width > 20 && rect.height > 20) { b.click(); used.push((b.getAttribute('aria-label')||b.textContent||'').trim().slice(0,20)); break; }
    }
    // fallback: Enter key on the textarea
    if (!used.length) ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    return JSON.stringify({ used, value: (ta.value || ta.textContent || '').slice(0, 50) });
  })()`,
  returnByValue: true,
});
console.log('SENT ' + JSON.stringify(r.result && r.result.value));
ws.close();
process.exit(0);