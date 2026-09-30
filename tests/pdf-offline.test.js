'use strict';
/* Offline proof: block every non-local request at the network layer, then run
 * the whole PDF export. Everything the report needs must already be on disk. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron.exe');
const PROFILE = path.join(os.tmpdir(), 'opencode', 'pdf-offline');
const PORT = 9399;
const OUT = 'C:/Users/IRANNO~1/AppData/Local/Temp/opencode/report-offline.pdf';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e ? ' -> ' + e : '')); } };

(async function () {
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

  // A preload that hard-fails any request leaving the machine. This is the
  // closest thing to pulling the cable that still lets us drive the app.
  const blocker = path.join(PROFILE, 'block-net.js');
  fs.writeFileSync(blocker, `
    const { session } = require('electron');
    const netFetch = session.defaultSession.webRequest;
    netFetch.onBeforeRequest((details, callback) => {
      const u = details.url;
      const local = /^(file|data|blob|devtools):/i.test(u) || /^https?:\\/\\/(localhost|127\\.0\\.0\\.1)/i.test(u);
      if (!local) { console.log('OFFLINE-BLOCKED ' + u); return callback({ cancel: true }); }
      callback({ cancel: false });
    });
  `);

  const child = spawn(ELECTRON, [ROOT, '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  child.stdout.on('data', (d) => out.push(d.toString()));
  child.stderr.on('data', (d) => out.push(d.toString()));

  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page' && /index\.html/.test(t.url)); } catch (e) {}
  }
  ok(!!page, 'the app started');
  if (!page) { console.log(out.join('').slice(0, 400)); child.kill(); process.exit(1); }

  // turn the network off inside the running session
  const ws0 = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws0.onopen = res; ws0.onerror = rej; });
  ws0.close();

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await send('Runtime.enable'); await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await sleep(5000);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text };
    return r.result.value;
  };

  console.log('--- with the network emulated as offline ---');
  const online = await ev(`navigator.onLine`);
  console.log('  navigator.onLine reports: ' + online);

  const lib = JSON.parse(await ev(`JSON.stringify({ has: typeof window.html2pdf, failed: !!window.__pdfFailed, font: document.fonts.check('12px Vazirmatn') })`));
  ok(lib.has === 'function', 'html2pdf loaded from disk', lib.has);
  ok(lib.failed !== true, 'no load error offline');
  ok(lib.font === true, 'the Persian font is available offline (' + lib.font + ')');

  console.log('--- export a report with no network ---');
  const made = await ev(`(async () => {
    try {
      preparePdfForClient({ id: 1, name: 'مریم احمدی', phone: '09120000000', balance: 0, spent: 90000, type: 'pc' }, 90000);
      await new Promise(r => setTimeout(r, 700));
      const blob = await renderPdfBlob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return JSON.stringify({ size: blob.size, b64: btoa(bin) });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()`);
  const m = JSON.parse(String(made));
  ok(!m.error, 'the export produced a file offline', m.error || '');

  if (!m.error) {
    fs.writeFileSync(OUT, Buffer.from(m.b64, 'base64'));
    const size = fs.statSync(OUT).size;
    console.log('  offline PDF: ' + size + ' bytes');
    ok(size > 4096, 'the offline PDF is not blank (' + size + ' bytes)');
    const head = fs.readFileSync(OUT).slice(0, 5).toString('latin1');
    ok(head === '%PDF-', 'it is a real PDF', head);
    const raw = fs.readFileSync(OUT);
    const hasImage = /\/Subtype\s*\/Image/.test(raw.toString('latin1'));
    ok(hasImage, 'the report content is embedded');
  }

  ws.close(); child.kill(); await sleep(700);
  console.log('\n' + (fail === 0 ? 'OFFLINE PDF EXPORT VERIFIED (' + pass + ' checks)' : fail + ' CHECK(S) FAILED (' + pass + ' passed)'));
  console.log('  file kept at: ' + OUT);
  process.exit(fail === 0 ? 0 : 1);
})();
