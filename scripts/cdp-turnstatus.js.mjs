// CDP: poll the DSH turnStatus elements over 15s to capture how the
// native status text evolves (Deep diving.../thinking/done) and its clock.
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

async function grab() {
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify((() => {
      const status = document.querySelector('[class*="turnStatus"]:not([class*="Clock"])');
      const clock = document.querySelector('[class*="turnStatusClock"]');
      // also any running/awaiting badge
      const running = [...document.querySelectorAll('[class*="flowItem"],[class*="status"],[class*="badge"]')]
        .map(e=>(e.textContent||'').trim()).filter(t=>/运行|进行|等待|思考|diving|完成|输出|Deep/i.test(t)).slice(0,6);
      return {
        status: status ? status.textContent.trim() : null,
        clock: clock ? clock.textContent.trim() : null,
        badges: [...new Set(running)].slice(0,6),
        ts: Date.now() % 100000
      };
    })())`,
    returnByValue: true,
  });
  return r.result && r.result.value;
}

console.log('POLLING turnStatus 15s...');
for (let i = 0; i < 15; i++) {
  const v = await grab();
  console.log('T+' + i + ' ' + JSON.stringify(v));
  await new Promise((res) => setTimeout(res, 1000));
}
ws.close();
process.exit(0);