// CDP: capture the DSH dark-theme palette, then restore to light.
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
await send('Page.enable');

const tree = await send('Page.getFrameTree');
let remoteId = null;
(function walk(n) {
  if (n.frame.url && n.frame.url.includes('192.168')) remoteId = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-dark', grantUniveralAccess: true });

// Toggle dark then read
await send('Runtime.evaluate', {
  contextId: ev.executionContextId,
  expression: `(() => { document.documentElement.toggleAttribute('data-ds-dark-theme', true); document.documentElement.style.colorScheme = 'dark'; return 'dark-on'; })()`,
  returnByValue: true,
});
await new Promise((res) => setTimeout(res, 300));

const expr = `JSON.stringify((() => {
  const cs = getComputedStyle(document.body);
  const btn = document.querySelector('button');
  const btnCs = btn ? getComputedStyle(btn) : null;
  const sb = document.querySelector('[class*="sidebar"], aside, nav');
  const sbCs = sb ? getComputedStyle(sb) : null;
  const inp = document.querySelector('textarea, input[type="text"], [contenteditable]');
  const inpCs = inp ? getComputedStyle(inp) : null;
  return {
    bodyBg: cs.backgroundColor, bodyColor: cs.color,
    primary: document.querySelector('[class*="primary"]') ? getComputedStyle(document.querySelector('[class*="primary"]')).backgroundColor : null,
    btnBg: btnCs ? btnCs.backgroundColor : null,
    sidebarBg: sbCs ? sbCs.backgroundColor : null,
    inputBg: inpCs ? inpCs.backgroundColor : null, inputColor: inpCs ? inpCs.color : null,
    border: btnCs ? btnCs.borderColor : null,
  };
})())`;
const r = await send('Runtime.evaluate', { expression: expr, contextId: ev.executionContextId, returnByValue: true });
console.log('DARK ' + JSON.stringify(r.result && r.result.value));

// Restore light
await send('Runtime.evaluate', {
  contextId: ev.executionContextId,
  expression: `(() => { document.documentElement.removeAttribute('data-ds-dark-theme'); document.documentElement.style.colorScheme = 'light'; return 'restored'; })()`,
  returnByValue: true,
});
ws.close();
process.exit(0);