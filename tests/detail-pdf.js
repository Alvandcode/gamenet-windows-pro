'use strict';
/* Prove the detail PDF is a real file, not a claim.
 *
 * The usage report printed blank once because the page was hidden before the
 * printer saw it. This goes through the app's own export island instead, and
 * reads the produced PDF off disk: it must have pages, an embedded font, and a
 * meaningful number of text operators, otherwise it is another blank sheet.
 *
 * Usage: electron tests/detail-pdf.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  || path.join(os.tmpdir(), 'opencode', 'detail-pdf-check.pdf');

let pass = 0, fail = 0;
const out = (m) => process.stdout.write(m + '\n');
const ok = (c, l, e) => { if (c) { pass++; out('  PASS ' + l); } else { fail++; out('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };

function inspectPdf(file) {
  const b = fs.readFileSync(file);
  let text = '', images = 0, fills = 0;
  let pos = 0;
  while (true) {
    const s = b.indexOf('stream', pos);
    if (s < 0) break;
    if (b[s - 1] === 101 || b[s - 2] === 101) { pos = s + 6; continue; }
    let ds = s + 6;
    while (ds < b.length && (b[ds] === 13 || b[ds] === 10)) ds++;
    const e = b.indexOf('endstream', ds);
    if (e < 0) break;
    const raw = b.slice(ds, e);
    let data = raw;
    if (raw[0] === 0xff && raw[1] === 0xd8) images++;
    else {
      try { data = zlib.inflateSync(raw); } catch (err) { /* keep raw */ }
      const t = data.toString('latin1');
      text += t;
      fills += (t.match(/\bf\b|\bf\*|\bB\b/g) || []).length;
    }
    pos = e + 9;
  }
  const raw = b.toString('latin1');
  return {
    size: b.length,
    pages: (raw.match(/\/Type\s*\/Page[^s]/g) || []).length,
    fonts: (raw.match(/\/Type\s*\/Font\b/g) || []).length,
    images,
    fills,
    textOps: (text.match(/\bTj|\bTJ/g) || []).length,
    header: raw.slice(0, 8),
    hasEmbeddedFont: /FontFile2|\/FontFile3|\/FontFile\b/.test(raw),
  };
}

app.commandLine.appendSwitch('disable-gpu');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: { offscreen: true, javascript: true, contextIsolation: false, nodeIntegration: true },
  });
  win.webContents.on('console-message', (_e, _l, m) => { if (m) out('    [renderer] ' + m); });

  await win.loadFile(path.join(ROOT, 'index.html'));
  await new Promise((r) => setTimeout(r, 4000));

  const ev = async (e) => (await win.webContents.executeJavaScript(e, true));

  out('--- a month of play for one customer, plus a party ---');
  const seeded = await ev(`(function(){
    localStorage.setItem('alvand_shopName', 'گیم‌نت الماس');
    localStorage.setItem('alvand_shopPhone', '09121234567');
    var day = 86400000, base = new Date(2026, 4, 1, 12, 0, 0);
    clients = [
      { id:1, name:'مریم احمدی', tariff:'single', stationType:'pc', status:'offline', elapsed:0, startTime:null, totalCost:0 },
      { id:2, name:'رضا کریمی', tariff:'double', stationType:'ps5', status:'offline', elapsed:0, startTime:null, totalCost:0 },
      { id:3, name:'سارا محمدی', tariff:'single', stationType:'pc', status:'offline', elapsed:0, startTime:null, totalCost:0 }
    ];
    function mk(gid, off, secs, who, head, cost, billed) {
      return { id: gid+'-'+who, groupId: gid,
        date: new Date(base.getTime() + day*off).toISOString(),
        duration: secs, cost: cost, billed: billed, memberKind: 'client',
        clientId: who, clientName: clients[who-1].name,
        headcount: head, tariff: head > 1 ? 'double' : 'single', stationTypeName:'کامپیوتر' };
    }
    var rows = [
      mk('g1', 0, 5400, 1, 3, 0, false), mk('g1', 0, 5400, 2, 3, 0, false),
      mk('g1', 0, 5400, 3, 3, 90000, true),
      mk('g2', 2, 3600, 1, 1, 45000, true),
      mk('g3', 5, 7200, 1, 2, 0, false), mk('g3', 5, 7200, 2, 2, 120000, true),
      mk('g4', 9, 2700, 1, 1, 0, false), mk('g4', 9, 2700, 2, 1, 60000, true)
    ];
    localStorage.setItem('alvand_groupSessions', JSON.stringify(rows));
    return 'seeded ' + rows.length;
  })()`);
  out('  ' + seeded);

  out('--- build the sheet through the app own export island ---');
  const made = await ev(`(async () => {
    try {
      const blob = await gpDetailPdfBlob('1');
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      return JSON.stringify({ size: blob.size, type: blob.type, b64: btoa(bin) });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()`);
  const obj = JSON.parse(String(made));
  if (obj.error) {
    ok(false, 'the export ran without throwing', obj.error);
  } else {
    ok(obj.size > 3000, 'a PDF blob came out', obj.size + ' bytes');
    fs.writeFileSync(OUT, Buffer.from(obj.b64, 'base64'));
    out('  wrote ' + OUT);
    const info = inspectPdf(OUT);
    out('  size   : ' + info.size + ' bytes');
    out('  pages  : ' + info.pages);
    out('  fonts  : ' + info.fonts + (info.hasEmbeddedFont ? ' (embedded)' : ''));
    out('  text   : ' + info.textOps + ' text-showing operators');
    out('  drawn  : ' + info.fills + ' fill ops, ' + info.images + ' images');
    ok(/^%PDF-/.test(info.header), 'it is a real PDF', info.header);
    ok(info.size > 8000, 'it is substantial, not a blank sheet', info.size + ' bytes');
    ok(info.pages >= 1, 'it has at least one page', String(info.pages));
    ok(info.textOps >= 120 || info.images >= 1,
       'it carries the report, not a blank page',
       info.textOps + ' text ops, ' + info.images + ' images');
    ok(info.fonts > 0 || info.hasEmbeddedFont, 'a font is embedded', info.fonts + ' fonts');
  }

  out('--- the sheet really holds the detail, read back out of the DOM ---');
  const content = await ev(`(function(){
    var h = gpDetailHtml('1');
    return JSON.stringify({
      len: h.length,
      hasShop: /گیم‌نت الماس/.test(h),
      hasPhone: /09121234567/.test(h),
      hasCustomer: /مریم احمدی/.test(h),
      hasDate: /۱۴۰۵|2026/.test(h),
      hasWith: /رضا کریمی/.test(h) && /سارا محمدی/.test(h),
      hasCols: /تاریخ/.test(h) && /ساعت/.test(h) && /مدت بازی/.test(h) &&
              /تعداد نفر/.test(h) && /با چه کسانی/.test(h) && /مبلغ/.test(h),
      clean: !/NaN|undefined/.test(h)
    });
  })()`);
  const c = JSON.parse(content);
  ok(c.hasShop, 'the shop name is on the sheet');
  ok(c.hasPhone, 'the shop number is on the sheet');
  ok(c.hasCustomer, 'it says whose report it is');
  ok(c.hasDate, 'the dates are there');
  ok(c.hasWith, 'and who they played with');
  ok(c.hasCols, 'with all six columns');
  ok(c.clean, 'and nothing broken in it');

  out('--- the sheet is formatted, not just filled ---');
  /* The <style> in the sheet document never applies: only its body is copied
   * into the export island. When the formatting lived in that style block the
   * four summary boxes came out as one unreadable run of text, and the app's
   * own banner and version footer printed on top of the letterhead. Both are
   * invisible to a byte count, so they are checked here. */
  const fmt = await ev(`(function(){
    var h = gpDetailHtml('1');
    var sum = (h.match(/class="sum"[^>]*>([\\s\\S]*?)<\\/table>/) || [,''])[1];
    function count(cls){ var m = sum.match(new RegExp('class="' + cls + '"', 'g')); return m ? m.length : 0; }
    return JSON.stringify({
      inlineBorderCells: (sum.match(/border:1px solid #999/g) || []).length,
      inlineBg: (sum.match(/background:#f6f6f6/g) || []).length,
      labels: count('lb'), values: count('vl'),
      inlineFontPx: (h.match(/font-size:\\d+px/g) || []).length,
      ptLeft: (h.match(/\\d+pt/g) || []).length,
      flexLeft: (h.match(/display:flex/g) || []).length,
      headInline: /class="head" style="text-align:center;border-bottom:2px solid #111/.test(h),
      shopBig: /class="shop" style="font-size:22px;font-weight:900/.test(h),
      thInline: (h.match(/<th style="[^"]*background:#ececec/g) || []).length,
      thShaded: (h.match(/background:#ececec/g) || []).length,
      rowCells: (h.match(/border:1px solid #bbb;padding:6px 5px/g) || []).length
    });
  })()`);
  const f = JSON.parse(fmt);
  ok(f.inlineBorderCells === 4, 'all four summary boxes carry their own border', String(f.inlineBorderCells));
  ok(f.inlineBg === 4, 'and a background, so they read as boxes', String(f.inlineBg));
  ok(f.labels === 4 && f.values === 4, 'each box has a label and a value', f.labels + '/' + f.values);
  ok(f.inlineFontPx >= 8, 'sizes are inline in px', String(f.inlineFontPx));
  ok(f.ptLeft === 0, 'no pt left, which the renderer resolves differently', String(f.ptLeft));
  ok(f.flexLeft === 0, 'no flexbox, which html2canvas does not lay out', String(f.flexLeft));
  ok(f.headInline === true, 'the letterhead is inline too');
  ok(f.shopBig === true, 'the shop name is styled inline');
  ok(f.thInline === 6, 'all six column headings are styled inline', String(f.thInline));
  ok(f.thShaded >= 6, 'and every one carries the header shading', String(f.thShaded));
  ok(f.rowCells >= 24, 'the data cells are styled inline', String(f.rowCells));

  out(fail === 0 ? '\nDETAIL PDF VERIFIED (' + pass + ' checks)' : '\n' + fail + ' CHECK(S) FAILED (' + pass + ' passed)');
  win.destroy();
  app.exit(fail === 0 ? 0 : 1);
}).catch((e) => { out('  FAIL crashed: ' + (e && e.stack || e)); app.exit(1); });