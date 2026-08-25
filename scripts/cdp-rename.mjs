// CDP: exercise the rename dialog — open, optionally fill+save.
// usage: node cdp-rename.mjs [fill:<name>]
const fill = (process.argv[2] || '').startsWith('fill:') ? process.argv[2].slice(5) : null;

const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url === 'http://localhost/');
if (!page) { console.error('no shell page'); process.exit(1); }
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

const before = await ev(`JSON.stringify((() => {
  const first = document.querySelector('.pair-item');
  if (!first) return { items: 0 };
  const edit = first.querySelector('.pair-edit');
  edit && edit.click();
  return {
    items: document.querySelectorAll('.pair-item').length,
    nameBefore: (first.querySelector('.pair-name') || {}).textContent,
    dlgOpen: !!document.getElementById('dlg-rename').open,
    inputVal: document.getElementById('input-rename').value,
  };
})())`);
console.log('OPEN ' + before);

if (fill !== null) {
  const after = await ev(`JSON.stringify((() => {
    const inp = document.getElementById('input-rename');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ${JSON.stringify(fill)});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-rename-ok').click();
    return 'clicked';
  })())`);
  console.log('SAVE ' + after);
  await new Promise((r) => setTimeout(r, 800));
  const result = await ev(`JSON.stringify({
    name: (document.querySelector('.pair-item .pair-name') || {}).textContent,
    dlgOpen: document.getElementById('dlg-rename').open,
  })`);
  console.log('AFTER ' + result);
}
ws.close();
process.exit(0);