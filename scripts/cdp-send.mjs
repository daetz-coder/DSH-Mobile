// CDP: find the DSH composer on the remote page and type + submit a message.
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

// Find composer: contenteditable or textarea; try focusing and setting text.
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify((() => {
    const ce = document.querySelector('[contenteditable=true]');
    const ta = document.querySelector('textarea');
    const el = ce || ta;
    if (!el) return { found: false };
    el.focus();
    if (ce) {
      ce.textContent = 'hello from dsh-mobile test';
      ce.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'hello from dsh-mobile test');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return { found: true, tag: el.tagName, value: (ce ? ce.textContent : ta.value).slice(0, 60) };
  })())`,
  returnByValue: true,
});
console.log('COMPOSER ' + JSON.stringify(r.result && r.result.value));

// Look for a send button and click it
const r2 = await send('Runtime.evaluate', {
  expression: `JSON.stringify((() => {
    const btns = [...document.querySelectorAll('button')];
    const send = btns.find(b => /send|发送|submit|prompt/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.textContent||'')));
    if (send) { send.click(); return { clicked: true, label: (send.getAttribute('aria-label')||send.textContent||'').slice(0,30) }; }
    return { clicked: false, count: btns.length };
  })())`,
  returnByValue: true,
});
console.log('SEND ' + JSON.stringify(r2.result && r2.result.value));
ws.close();
process.exit(0);