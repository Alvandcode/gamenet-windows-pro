'use strict';
/* PDF export from the PACKAGED app with the network cut.
 * This is the check that matters: what a shop installs must save a PDF that
 * actually has the report on it, with no internet connection. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const EXE = path.join(ROOT, 'dist/win-unpacked/Gamenet Manager Pro.exe');
const PROFILE = path.join(os.tmpdir(), 'opencode', 'pkg-pdf');
const PORT = 9401;
const OUT = 'C:/Users/IRANNO~1/AppData/Local/Temp/opencode/report-packaged.pdf';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e ? ' -> ' + e : '')); } };

(async function () {
  ok(fs.existsSync(EXE), 'the packaged exe exists');
  if (!fs.existsSync(EXE)) process.exit(1);
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

  const child = spawn(EXE, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  child.stdout.on('data', (d) => out.push(d.toString()));
  child.stderr.on('data', (d) => out.push(d.toString()));

  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page' && /index\.html/.test(t.url)); } catch (e) {}
  }
  ok(!!page, 'the packaged app opened');
  if (!page) { console.log(out.join('').slice(0, 400)); child.kill(); process.exit(1); }

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

  console.log('--- the bundle really shipped ---');
  const env = JSON.parse(await ev(`JSON.stringify({
    ver: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'),
    pdf: typeof window.html2pdf,
    pdfFailed: !!window.__pdfFailed,
    font: document.fonts.check('12px Vazirmatn'),
    pdfSrc: (Array.from(document.scripts).map(s => s.src).find(s => /html2pdf/.test(s)) || ''),
    fontHref: (Array.from(document.querySelectorAll('link[rel=stylesheet]')).map(l => l.getAttribute('href')).find(h => /vazirmatn/i.test(h)) || ''),
  })`));
  const want = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  ok(env.ver === want, 'the packaged app is ' + want, env.ver);
  ok(env.pdf === 'function', 'html2pdf is present in the package');
  ok(env.pdfFailed !== true, 'it did not fail to load');
  ok(!/^https?:/.test(env.pdfSrc), 'html2pdf is served locally', env.pdfSrc);
  ok(env.font === true, 'the Persian font is available', String(env.font));
  ok(/^assets\//.test(env.fontHref), 'the font css is served locally', env.fontHref);

  console.log('--- export with the network cut ---');
  const made = await ev(`(async () => {
    try {
      preparePdfForClient({ id: 1, name: 'حسین رضایی', phone: '09120000000', balance: 0, spent: 240000, type: 'ps' }, 240000);
      await new Promise(r => setTimeout(r, 800));
      const blob = await renderPdfBlob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return JSON.stringify({ size: blob.size, b64: btoa(bin) });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()`);
  const m = JSON.parse(String(made));
  ok(!m.error, 'the export produced a file', m.error || '');

  if (!m.error) {
    fs.writeFileSync(OUT, Buffer.from(m.b64, 'base64'));
    const raw = fs.readFileSync(OUT);
    const txt = raw.toString('latin1');
    console.log('  file: ' + Math.round(raw.length / 1024) + ' KB');
    ok(raw.length > 4096, 'it is not a 3KB blank file (' + Math.round(raw.length / 1024) + ' KB)');
    ok(raw.slice(0, 5).toString('latin1') === '%PDF-', 'it is a real PDF');
    ok(/\/Type\s*\/Page[^s]/.test(txt), 'it has a page');
    // find the embedded page image and pull it out
    const re = /\/Subtype\s*\/Image[\s\S]{0,400}?stream\r?\n/g;
    let mm, best = null;
    while ((mm = re.exec(txt))) {
      const st = mm.index + mm[0].length;
      const en = raw.indexOf(Buffer.from('endstream', 'latin1'), st);
      if (en < 0) continue;
      const chunk = raw.slice(st, en);
      if (chunk.length > 3 && chunk[0] === 0xff && chunk[1] === 0xd8) {
        const w = parseInt((mm[0].match(/\/Width\s+(\d+)/) || [])[1] || '0', 10);
        const h = parseInt((mm[0].match(/\/Height\s+(\d+)/) || [])[1] || '0', 10);
        if (!best || chunk.length > best.buf.length) best = { buf: chunk, w, h };
      }
    }
    ok(!!best, 'the report was embedded as an image');
    if (best) {
      const IMG = 'C:/Users/IRANNO~1/AppData/Local/Temp/opencode/report-packaged.jpg';
      fs.writeFileSync(IMG, best.buf);
      console.log('  page image: ' + best.w + 'x' + best.h + ', ' + Math.round(best.buf.length / 1024) + ' KB -> ' + IMG);
      ok(best.w > 400 && best.h > 400, 'the page was rendered at a real size');
      ok(best.buf.length > 20000, 'the page image carries real data (' + Math.round(best.buf.length / 1024) + ' KB)');
      const step = Math.max(1, Math.floor(best.buf.length / 8000));
      const seen = new Set();
      for (let i = 0; i < best.buf.length; i += step) seen.add(best.buf[i]);
      ok(seen.size > 40, 'the page is not a flat blank block (' + seen.size + ' distinct byte values)');
    }
  }

  ws.close(); child.kill(); await sleep(700);
  console.log('\n' + (fail === 0 ? 'PACKAGED OFFLINE PDF VERIFIED (' + pass + ' checks)' : fail + ' CHECK(S) FAILED (' + pass + ' passed)'));
  process.exit(fail === 0 ? 0 : 1);
})();
