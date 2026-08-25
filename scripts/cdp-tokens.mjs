// CDP: extract the live DSH web UI design tokens (CSS custom props, fonts,
// colors, radii, spacing) from the running harness page.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.startsWith('http://localhost') || p.url.includes('192.168'));
if (!page) { console.error('no page'); process.exit(1); }

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

// Find the frame that is the DSH UI (192.168)
const tree = await send('Page.getFrameTree');
let remoteId = null;
(function walk(n) {
  if (n.frame.url && n.frame.url.includes('192.168')) remoteId = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
if (!remoteId) { console.error('no dsh frame'); process.exit(1); }

const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-tokens', grantUniveralAccess: true });
const expr = `JSON.stringify((() => {
  const cs = getComputedStyle(document.documentElement);
  const vars = {};
  for (const prop of cs) {
    if (prop.startsWith('--') && cs.getPropertyValue(prop)) vars[prop] = cs.getPropertyValue(prop).trim();
  }
  const body = getComputedStyle(document.body);
  // grab one visible button + input-ish token if present
  const btn = document.querySelector('button');
  const btnStyle = btn ? { bg: getComputedStyle(btn).backgroundColor, fg: getComputedStyle(btn).color, radius: getComputedStyle(btn).borderRadius, font: getComputedStyle(btn).fontFamily } : null;
  const link = document.querySelector('a[href], [data-dsh]');
  return {
    vars: Object.fromEntries(Object.entries(vars).filter(([k]) => /color|bg|radius|font|border|shadow|spac/i.test(k)).slice(0, 80)),
    bodyFont: body.fontFamily,
    bodyBg: body.backgroundColor,
    bodyFg: body.color,
    btn: btnStyle,
    theme: document.documentElement.getAttribute('data-ds-dark-theme'),
    colorScheme: document.documentElement.style.colorScheme,
  };
})())`;
const r = await send('Runtime.evaluate', { expression: expr, contextId: ev.executionContextId, returnByValue: true });
console.log('TOKENS ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);