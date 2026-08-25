// CDP probe: enumerate frames of the DSH-Mobile WebView and locate the
// dsh-pocket PIN input inside the remoter iframe, returning its coordinates.
const WS_URL = process.argv[2];
const PORT = Number(process.argv[3] || 9222);

const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
console.error('pages:', pages.map(p => `${p.type} ${p.url}`).join('\n'));

let ws = new WebSocket(WS_URL);
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
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }
};

await new Promise((res) => (ws.onopen = res));

await send('Runtime.enable');
await send('Page.enable');

// Find the frame that hosts the remote content (dsh-pocket verify page).
const tree = await send('Page.getFrameTree');
console.error('frames:');
function walk(node, depth = 0) {
  const f = node.frame;
  console.error(' '.repeat(depth) + `${f.id} ${f.url}`);
  if (f.url && !f.url.startsWith('http://localhost')) remoteFrameId = f.id;
  (node.childFrames || []).forEach((c) => walk(c, depth + 1));
}
let remoteFrameId = null;
walk(tree.frameTree);

if (!remoteFrameId) {
  console.error('NO remote frame found');
  process.exit(1);
}

// Evaluate inside the remote frame context.
const evalCtx = await send('Page.createIsolatedWorld', {
  frameId: remoteFrameId,
  worldName: 'dsh-probe',
  grantUniveralAccess: true,
});
const ctxId = evalCtx.executionContextId;
const expr = `(() => {
  const inp = document.querySelector('input[name="token"], input[type="password"], input[inputmode="numeric"]');
  const btn = document.querySelector('button[type="submit"], button, input[type="submit"]');
  const form = document.querySelector('form');
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width/2, cy: r.y + r.height/2 }; };
  return JSON.stringify({
    bodyHtmlLen: document.body ? document.body.innerHTML.length : -1,
    title: document.title,
    input: rect(inp),
    button: rect(btn),
    formAction: form ? form.action : null,
    inputCount: document.querySelectorAll('input').length,
  });
})()`;

const res = await send('Runtime.evaluate', {
  expression: expr,
  contextId: ctxId,
  returnByValue: true,
});
console.log('PROBE_RESULT ' + JSON.stringify(res.result && res.result.value));

ws.close();
process.exit(0);