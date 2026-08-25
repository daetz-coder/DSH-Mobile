// CDP: verify the shell's dark CSS branch by toggling data-ds-dark-theme.
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
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify((() => {
    document.documentElement.setAttribute('data-ds-dark-theme', 'true');
    const cs = getComputedStyle(document.body);
    const list = document.querySelector('.pair-item');
    const out = {
      attr: document.documentElement.getAttribute('data-ds-dark-theme'),
      bodyBg: cs.backgroundColor,
      pairBg: list ? getComputedStyle(list).backgroundColor : null,
      text: cs.color,
    };
    document.documentElement.setAttribute('data-ds-dark-theme', 'false');
    return out;
  })())`,
  returnByValue: true,
});
console.log('DARK ' + JSON.stringify(r.result && r.result.value));
ws.close();
process.exit(0);