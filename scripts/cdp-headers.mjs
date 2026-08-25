// CDP: capture request headers of DSH iframe subresource calls —
// determine whether Cookie header is attached to API/WS requests.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.startsWith('http://localhost'));
if (!page) { console.error('no local page'); process.exit(1); }

let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const reqs = [];
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
  } else if (msg.method === 'Network.requestWillBeSent') {
    reqs.push(msg.params);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
await send('Page.enable');

// Reload iframe to capture requests
await send('Runtime.evaluate', {
  expression: `(() => { const f = document.getElementById('remote-frame'); f.src = f.src; return 'reload'; })()`,
  returnByValue: true,
});
await new Promise((res) => setTimeout(res, 6000));

const out = reqs.slice(0, 12).map((p) => ({
  url: (p.request.url || '').slice(0, 90),
  method: p.request.method,
  hasCookie: !!(p.request.headers && p.request.headers.Cookie),
  cookieHdr: p.request.headers && p.request.headers.Cookie ? p.request.headers.Cookie.slice(0, 60) : null,
}));
console.log('REQS ' + JSON.stringify(out, null, 1));
ws.close();
process.exit(0);