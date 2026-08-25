// Listen to DSH events.mux and print EVERY distinct event type + any frame
// mentioning approval/question/ask/permission — to find the HITL signals.
const NODE_PATH_GLOBAL = 'C:\\Users\\ASUS\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules';
process.env.NODE_PATH = NODE_PATH_GLOBAL;
require('module').Module._initPaths();
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:3081/api/events.mux', {
  headers: { Cookie: 'dsh_pocket_token=741f9929ec7b13efe518dc8b81bc31d0aece274ae6ff1dbf9892274cb6e696e5' },
});
ws.on('open', () => console.log('WS OPEN'));
const seen = {};
ws.on('message', (d) => {
  const s = String(d);
  try {
    const j = JSON.parse(s);
    const inner = (j.payload && j.payload.event) || {};
    const t = inner.type || (j.payload && j.payload.type) || j.type || '?';
    if (!seen[t]) { seen[t] = 1; console.log('NEW TYPE: ' + t); }
    else seen[t]++;
    if (/approval|question|ask|permission|human|intervention|required|input/i.test(s)) {
      console.log('HITL SIGNAL (' + t + '): ' + s.slice(0, 600));
    }
  } catch (e) { /* ignore */ }
});
ws.on('error', (e) => console.log('WS ERR: ' + e.message));
setTimeout(() => { console.log('SUMMARY ' + JSON.stringify(seen)); process.exit(0); }, 30000);