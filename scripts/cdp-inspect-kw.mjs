// CDP: query the DSH page for the user-question client and its subscribed
// event names, by evaluating over the DSH app's module registry if reachable.
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
    // Try common hooks for the DSH runtime; also inspect any window keys with
    // 'question'/'approval'.
    const hits = [];
    for (const k of Object.keys(window)) {
      if (/question|approval|permission|ask/i.test(k)) hits.push(k);
    }
    // collect all script srcs to later scan for event constants
    const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
    return { hits, scripts: scripts.slice(0, 8), state: document.readyState };
  })())`,
  returnByValue: true,
});
console.log('INSPECT ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);