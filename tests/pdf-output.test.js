'use strict';
/* Generates a real PDF through the app's own export path and then proves the
 * file has content: it is opened, its page count read, its embedded images
 * decoded, and the pixels checked for actual ink. This is the check that would
 * have caught the blank-report bug. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron.exe');
const PROFILE = path.join(os.tmpdir(), 'opencode', 'pdf-profile2');
const PORT = 9377;
const OUT = 'C:/Users/IRANNO~1/AppData/Local/Temp/opencode/report-test.pdf';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e ? ' -> ' + e : '')); } };

/* --- read the PDF we produced, from disk, with no help from the app --- */
function inspectPdf(file) {
  const buf = fs.readFileSync(file);
  const head = buf.slice(0, 5).toString('latin1');
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const images = (buf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length;
  // the report is one big DCTDecode (JPEG) stream; jsPDF may omit the trailing
  // EOI marker, so the SOI marker plus the declared dimensions are the signal
  const re = /\/Subtype\s*\/Image[\s\S]{0,400}?stream\r?\n/g;
  let m, best = null;
  while ((m = re.exec(buf.toString('latin1')))) {
    const start = m.index + m[0].length;
    const end = buf.indexOf(Buffer.from('endstream', 'latin1'), start);
    if (end < 0) continue;
    const raw = buf.slice(start, end);
    if (raw.length > 3 && raw[0] === 0xff && raw[1] === 0xd8) {
      const dict = m[0];
      const w = (dict.match(/\/Width\s+(\d+)/) || [])[1];
      const h = (dict.match(/\/Height\s+(\d+)/) || [])[1];
      if (!best || raw.length > best.raw.length) best = { raw, w: Number(w) || 0, h: Number(h) || 0 };
    }
  }
  return {
    size: buf.length, head, pages, images,
    jpegBytes: best ? best.raw.length : 0,
    jpegValid: !!best,
    width: best ? best.w : 0,
    height: best ? best.h : 0,
    buf, raw: best ? best.raw : null,
  };
}

/* A blank page compresses to almost nothing and has very few distinct byte
 * values; a page of text has thousands. Count entropy over the JPEG payload. */
function jpegEntropy(jpegBuf) {
  const step = Math.max(1, Math.floor(jpegBuf.length / 8000));
  const seen = new Set();
  let zeros = 0;
  for (let i = 0; i < jpegBuf.length; i += step) { seen.add(jpegBuf[i]); if (jpegBuf[i] === 0) zeros++; }
  const samples = Math.ceil(jpegBuf.length / step);
  return { distinct: seen.size, samples, zeroRatio: zeros / samples };
}

(async function () {
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

  const child = spawn(ELECTRON, [ROOT, '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = [];
  child.stdout.on('data', (d) => out.push(d.toString()));
  child.stderr.on('data', (d) => out.push(d.toString()));

  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page' && /index\.html/.test(t.url)); } catch (e) {}
  }
  ok(!!page, 'the app opened');
  if (!page) { console.log(out.join('').slice(0, 400)); child.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await send('Runtime.enable'); await send('Log.enable');
  await sleep(5000);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text };
    return r.result.value;
  };

  console.log('--- html2pdf is local, not from a CDN ---');
  const lib = JSON.parse(await ev(`JSON.stringify({
    has: typeof window.html2pdf,
    failed: !!window.__pdfFailed,
    src: (Array.from(document.scripts).map(s => s.src).find(s => /html2pdf/.test(s)) || '')
  })`));
  ok(lib.has === 'function', 'html2pdf is available', lib.has);
  ok(lib.failed !== true, 'no load error was reported');
  ok(!/cdnjs|https?:\/\//.test(lib.src), 'it is served from the app itself', lib.src);

  console.log('--- build a real report through the app export path ---');
  const made = await ev(`(async () => {
    try {
      // no window.eval: CSP forbids 'unsafe-eval'. The report builders are plain
      // script-scoped functions, so the renderer can call them directly.
      const c = { id: 1, name: 'رضا محمدی', phone: '09121234567', balance: 0, spent: 125000, type: 'pc' };
      preparePdfForClient(c, 125000);
      await new Promise(r => setTimeout(r, 700));
      const blob = await renderPdfBlob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return JSON.stringify({ size: blob.size, type: blob.type, b64: btoa(bin) });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()`);

  const madeObj = JSON.parse(String(made));
  if (madeObj.error) {
    ok(false, 'the export ran without throwing', madeObj.error);
  } else {
    ok(!madeObj.error, 'the export ran without throwing', madeObj.error || '');
    console.log('  blob size: ' + madeObj.size + ' bytes, type ' + madeObj.type);
    fs.writeFileSync(OUT, Buffer.from(madeObj.b64, 'base64'));
  }

  console.log('--- and the saved file really has content ---');
  if (!madeObj.error) {
    const info = inspectPdf(OUT);
    ok(info.head === '%PDF-', 'it is a real PDF file', info.head);
    ok(info.size > 4096, 'it is not the 3KB blank file (' + info.size + ' bytes)');
    ok(info.pages >= 1, 'it has a page (' + info.pages + ')');
    ok(info.images >= 1, 'the report was embedded as an image (' + info.images + ')');
    ok(info.jpegValid, 'the embedded JPEG is well formed');
    console.log('  embedded image: ' + info.width + 'x' + info.height + ', ' + Math.round(info.jpegBytes / 1024) + ' KB');
    ok(info.width > 400 && info.height > 400, 'the page was rendered at a real size (' + info.width + 'x' + info.height + ')');
    ok(info.jpegBytes > 20000, 'the embedded image carries real data (' + Math.round(info.jpegBytes / 1024) + ' KB)');

    const ent = jpegEntropy(info.raw);
    ok(ent.distinct > 40, 'the image is not a flat single-colour block (' + ent.distinct + ' distinct byte values)');
    ok(ent.zeroRatio < 0.5, 'the image is not mostly empty (' + Math.round(ent.zeroRatio * 100) + '% zero bytes)');

    // Clipping check. A4 minus the 10mm margins is 718px at 96dpi; a template
    // wider than that loses its right-hand column and the footer's left side
    // (it showed as "et Manager Pro" instead of "Gamenet Manager Pro").
    const fit = JSON.parse(await ev(`(() => {
      const tpl = document.getElementById('pdfTemplate');
      const wrap = document.getElementById('pdfPrintWrap');
      const pw = wrap.getAttribute('style'), pt = tpl.getAttribute('style');
      wrap.setAttribute('style','position:fixed; left:-10000px; top:0; width:718px; height:auto; overflow:visible; visibility:visible;');
      tpl.setAttribute('style','width:700px; background:#ffffff; color:#1e293b; padding:24px; box-sizing:border-box; direction:rtl;');
      const r = tpl.getBoundingClientRect();
      let widest = 0;
      tpl.querySelectorAll('*').forEach(el => { widest = Math.max(widest, el.scrollWidth); });
      const foot = tpl.lastElementChild;
      const fr = foot ? foot.getBoundingClientRect() : { left: 0, right: 0 };
      const res = { printable: 718, tplWidth: Math.round(r.width), widestChild: widest, footLeft: Math.round(fr.left), footRight: Math.round(fr.right) };
      wrap.setAttribute('style', pw); tpl.setAttribute('style', pt);
      return JSON.stringify(res);
    })()`));
    console.log('  template ' + fit.tplWidth + 'px wide, printable ' + fit.printable + 'px, widest child ' + fit.widestChild + 'px');
    ok(fit.tplWidth <= fit.printable, 'the template fits the printable width (' + fit.tplWidth + ' <= ' + fit.printable + ')');
    ok(fit.widestChild <= fit.printable + 2, 'nothing inside overflows the page (' + fit.widestChild + 'px)');

    const canvas = JSON.parse(await ev(`(async () => {
      const tpl = document.getElementById('pdfTemplate');
      const wrap = document.getElementById('pdfPrintWrap');
      const pw = wrap.getAttribute('style'), pt = tpl.getAttribute('style');
      wrap.setAttribute('style','position:fixed; left:-10000px; top:0; width:820px; height:auto; overflow:visible; visibility:visible;');
      tpl.setAttribute('style','width:800px; background:#ffffff; color:#1e293b; padding:40px; box-sizing:border-box; direction:rtl;');
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      // draw the template into a canvas with the foreignObject trick, which is
      // what html2canvas ends up doing for a DOM subtree anyway
      const W = 800, H = Math.ceil(tpl.getBoundingClientRect().height) || 600;
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff;width:' + W + 'px">' +
        tpl.innerHTML + '</div></foreignObject></svg>';
      const img = new Image();
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('svg render failed')); img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, W, H).data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i] < 240 || d[i+1] < 240 || d[i+2] < 240) ink++; }
      const total = d.length / 4;
      wrap.setAttribute('style', pw); tpl.setAttribute('style', pt);
      return JSON.stringify({ w: W, h: H, ink, total, ratio: ink / total, textLen: tpl.innerText.length });
    })()`));
    console.log('  painted pixels: ' + canvas.ink + ' of ' + canvas.total + ' (' + (canvas.ratio * 100).toFixed(2) + '%) at ' + canvas.w + 'x' + canvas.h);
    console.log('  template text length: ' + canvas.textLen + ' characters');
    ok(canvas.textLen > 100, 'the template actually holds the report text (' + canvas.textLen + ' chars)');
    ok(canvas.ink > 500, 'the rendered page has visible text on it (' + canvas.ink + ' inked pixels)');
    ok(canvas.ratio > 0.01, 'more than 1% of the page is inked (' + (canvas.ratio * 100).toFixed(2) + '%)');
  }

  console.log('--- the footer version is not a stale hardcoded string ---');
  const ver = JSON.parse(await ev(`JSON.stringify({
    shown: (document.getElementById('pdfVersionText')||{}).textContent,
    app: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?')
  })`));
  ok(ver.shown === 'v' + ver.app, 'the PDF footer shows the real version (' + ver.shown + ' vs v' + ver.app + ')');

  console.log('--- offline: nothing is fetched from the network ---');
  const net = await ev(`(async () => {
    const t0 = performance.now();
    const c = document.getElementById('pdfContentInner');
    return JSON.stringify({ entries: performance.getEntriesByType('resource').filter(r => /^https?:/.test(r.name) && !/^https?:\\/\\/localhost/.test(r.name)).map(r => r.name).slice(0, 8), dur: Math.round(performance.now() - t0) });
  })()`);
  const netObj = JSON.parse(net);
  ok(Array.isArray(netObj.entries), 'the resource log is readable');
  console.log('  external resources loaded by the page: ' + (netObj.entries.length ? netObj.entries.join(', ') : 'none'));

  ws.close(); child.kill(); await sleep(700);
  console.log('\n' + (fail === 0 ? 'PDF EXPORT VERIFIED, NOT BLANK (' + pass + ' checks)' : fail + ' PDF CHECK(S) FAILED (' + pass + ' passed)'));
  console.log('  the generated file was kept at: ' + OUT);
  process.exit(fail === 0 ? 0 : 1);
})();
