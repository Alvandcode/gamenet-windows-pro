'use strict';
/* Prints the usage report through Electron's own print pipeline and reads the
 * PDF back off disk, so "is the saved file blank?" is answered by the file
 * itself rather than by the DOM.
 *
 * Usage: electron tests/print-pdf.js  ->  prints results to stdout, exit 0/1
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  || path.join(os.tmpdir(), 'opencode', 'print-pdf-check.pdf');

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };
const out = (m) => process.stdout.write(m + '\n');

/* count what a PDF actually paints: text-showing and fill/stroke operators */
function inspectPdf(file) {
  const b = fs.readFileSync(file);
  let text = '', images = 0, fills = 0, strokes = 0;
  let pos = 0;
  while (true) {
    const s = b.indexOf('stream', pos);
    if (s < 0) break;
    if (b[s - 1] === 101 /* e */ || b[s - 2] === 101) { pos = s + 6; continue; }
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
      if (/\bTj|\bTJ/.test(t)) text += t;
      fills += (t.match(/\bf\b|\bf\*|\bB\b/g) || []).length;
      strokes += (t.match(/\bS\b|\bs\b/g) || []).length;
    }
    pos = e + 9;
  }
  const pages = (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const fonts = (b.toString('latin1').match(/\/Type\s*\/Font\b/g) || []).length;
  return { size: b.length, pages, fonts, textOps: (text.match(/\bTj|\bTJ/g) || []).length, images, fills, strokes,
           header: b.toString('latin1', 0, 8) };
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
  await new Promise((r) => setTimeout(r, 3500));

  const ev = async (e) => {
    const r = await win.webContents.executeJavaScript(e, true);
    return r;
  };

  out('--- seed two real play sessions and open the report ---');
  const seed = await ev(`(function(){
    localStorage.setItem('alvand_shopName', 'گیم‌نت الماس');
    localStorage.setItem('alvand_shopPhone', '09121234567');
    var day = 86400000, base = new Date(2026, 4, 1, 12, 0, 0);
    sessions = [];
    /* seed the register as well as the session list: the report names people
     * from the register now, and a check that compares against an empty list
     * only passes by accident when storage happens to hold something */
    customers = [
      { id:1, name:'مريم احمدي', phone:'09121110001', wallet:0, debt:0, totalHours:9, totalSpent:135000 },
      { id:2, name:'رضا کريمي', phone:'09121110002', wallet:0, debt:0, totalHours:5, totalSpent:90000 },
      { id:3, name:'سارا محمدي', phone:'09121110003', wallet:0, debt:0, totalHours:12, totalSpent:180000 }
    ];
    gpSave([
      { id:'a', date:new Date(base.getTime()).toISOString(), duration:5400, cost:45000, billed:true, memberKind:'client', clientId:1, clientName:'مريم احمدي', headcount:1 },
      { id:'b', date:new Date(base.getTime()+day*2).toISOString(), duration:3600, cost:0, billed:false, memberKind:'client', clientId:1, clientName:'مريم احمدي', headcount:2 }
    ]);
    clients = [{ id:1, name:'مريم احمدي', tariff:'single', stationType:'pc', status:'offline', elapsed:0, startTime:null, totalCost:0 }];
    gpOpenReport('1');
    return 'ok';
  })()`);
  ok(seed === 'ok', 'the report opened', seed);
  await new Promise((r) => setTimeout(r, 800));

  const dom = await ev(`(function(){
    var m = document.getElementById('usageReportModal');
    var b = document.getElementById('usageReportModalBody');
    var t = (b.innerText||'').replace(/\\s+/g,' ').trim();
    // compare against the name that was seeded, so a different spelling of ی
    // in the test cannot fail the check for the wrong reason
    var reg = (window.customers || []).map(function (c) { return c && c.name; });
    /* textContent, not innerText: innerText is the laid-out text, and the bidi
     * algorithm around a Latin phone number beside Persian can reorder runs or
     * insert directional marks, so an indexOf against it is not reliable across
     * machines. textContent is the characters as written. */
    var raw = m.textContent || '';
    var body = (document.getElementById('usageReportModalBody') || {}).textContent || '';
    var hasName = false, which = '';
    for (var i = 0; i < reg.length; i++) {
      if (reg[i] && (raw.indexOf(reg[i]) >= 0 || body.indexOf(reg[i]) >= 0)) { hasName = true; which = reg[i]; break; }
    }
    return JSON.stringify({ shown: m.classList.contains('show'), chars: t.length,
      hasName: hasName, regCount: reg.length, rawLen: raw.length, bodyLen: body.length,
      tables: m.querySelectorAll('table').length });
  })()`);
  const d = JSON.parse(dom);
  ok(d.shown, 'the modal is open', dom);
  ok(d.chars > 150, 'it holds real text', d.chars + ' chars');
  ok(d.hasName, 'the customer name is in the report',
     'register=' + d.regCount + ' raw=' + d.rawLen + ' body=' + d.bodyLen);
  ok(d.regCount >= 3, 'the register was seeded before the check', 'register=' + d.regCount);
  ok(d.tables >= 2, 'both report tables are rendered', d.tables + ' tables');

  const head = JSON.parse(await ev(`(function(){
    var m = document.querySelector('#usageReportModal .gp-shop-head');
    if (!m) return JSON.stringify({ present: false });
    return JSON.stringify({
      present: true,
      name: (m.querySelector('.gp-shop-name')||{}).textContent || '',
      phone: (m.querySelector('.gp-shop-phone')||{}).textContent || '',
      nameSize: getComputedStyle(m.querySelector('.gp-shop-name')).fontSize,
      centered: getComputedStyle(m).textAlign
    });
  })()`));
  ok(head.present, 'the report carries a shop letterhead');
  ok(/الماس/.test(head.name || ''), 'with the shop name', head.name);
  ok(/09121234567/.test(head.phone || ''), 'and the phone number', head.phone);
  // the sheet that gets handed over is built separately with inline styles, so
  // that is what has to be measured - the on-screen modal is a different element
  const sheetStyle = await ev(`(function(){
    var h = gpDetailHtml('1');
    // parse the attributes off the elements rather than pattern-matching the
    // source: the order of class= and style= is not guaranteed
    function grab(cls){
      var re = new RegExp('<div[^>]*class="' + cls + '"[^>]*>', '');
      var m = h.match(re);
      if (!m) return '';
      var st = m[0].match(/style="([^"]*)"/);
      return st ? st[1] : '';
    }
    return JSON.stringify({ head: grab('head'), shop: grab('shop'), phone: grab('phone') });
  })()`);
  const ss = JSON.parse(sheetStyle);
  ok(/text-align:\s*center/.test(ss.head), 'the printed letterhead is centred', ss.head.slice(0, 70));
  ok(/border-bottom/.test(ss.head), 'with a rule under it', ss.head.slice(0, 90));
  const shopPx = (ss.shop.match(/font-size:\s*(\d+)px/) || [])[1];
  ok(Number(shopPx) >= 20, 'the shop name prints large in px, not pt', shopPx + 'px');
  const phonePx = (ss.phone.match(/font-size:\s*(\d+)px/) || [])[1];
  ok(Number(phonePx) >= 14, 'and the number is readable', phonePx + 'px');
  ok(/direction:\s*ltr/.test(ss.phone), 'the number keeps left-to-right digits', ss.phone.slice(0, 60));

  out('--- press the print button ---');
  // stub window.print for the whole run, otherwise a real print dialog opens
  // and blocks this headless check forever
  await ev(`(function(){ window.__gpPrintCalls = 0; window.print = function(){ window.__gpPrintCalls++; }; return 1; })()`);
  const clicked = await ev(`(function(){
    var btn = document.querySelector('#usageReportModal button[onclick*="gpPrintReport"]');
    if (!btn) return 'no button';
    btn.click();
    return 'clicked';
  })()`);
  ok(clicked === 'clicked', 'the print button was pressed', clicked);
  await new Promise((r) => setTimeout(r, 700));
  const calls = await ev(`String(window.__gpPrintCalls)`);
  ok(Number(calls) >= 1, 'the print path ran', calls + ' call(s)');

  const flagged = JSON.parse(await ev(`JSON.stringify({ body: document.body.className, modal: document.getElementById('usageReportModal').className })`));
  ok(/gp-printing/.test(flagged.body), 'body is marked for printing', flagged.body);
  ok(/show/.test(flagged.modal), 'the report is still open for the printer', flagged.modal);

  // hold the print view for the rest of the check: the app clears it on
  // afterprint, and a real dialog keeps it set for as long as it is open
  await ev(`(function(){
    window.addEventListener('afterprint', function(e){ e.stopImmediatePropagation(); }, true);
    document.body.classList.add('gp-printing');
    return 1;
  })()`);

  out('--- with print media on, read what is on the paper ---');
  win.webContents.debugger.attach('1.3');
  try { win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' }); } catch (e) { out('  could not emulate print: ' + e.message); }
  // an offscreen window has no viewport until it is told its size; measuring
  // before that gives transient offsets
  try { win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }); } catch (e) {}
  await new Promise((r) => setTimeout(r, 700));

  const ink = JSON.parse(await ev(`(function(){
    var h = document.querySelector('#usageReportModal .gp-shop-head .gp-shop-name');
    var ph = document.querySelector('#usageReportModal .gp-shop-head .gp-shop-phone');
    var modal = document.getElementById('usageReportModal');
    var m = modal.querySelector('.modal');
    var t = document.getElementById('usageReportModalBody');
    function sum(sel){ var c = getComputedStyle(sel).color.match(/\\d+/g)||[]; return c.length>=3 ? (+c[0]+ +c[1]+ +c[2]) : -1; }
    var vis = [];
    Array.prototype.forEach.call(document.body.children, function(el){ if (getComputedStyle(el).display !== 'none') vis.push(el.id || el.className || el.tagName); });
    return JSON.stringify({
      nameInk: sum(h), phoneInk: sum(ph),
      nameSize: getComputedStyle(h).fontSize,
      first: modal.getBoundingClientRect().top,
      bodyFlag: document.body.className,
      visible: vis,
      chars: (t.innerText||'').replace(/\\s+/g,' ').trim().length,
      nameOnPage: /الماس/.test(t.innerText||''),
      phoneOnPage: /09121234567/.test(t.innerText||'')
    });
  })()`));
  out('  ' + JSON.stringify(ink));
  ok(ink.nameInk >= 0 && ink.nameInk < 200, 'the name prints in dark ink', 'sum ' + ink.nameInk);
  ok(ink.phoneInk >= 0 && ink.phoneInk < 200, 'the phone prints in dark ink', 'sum ' + ink.phoneInk);
  ok(parseFloat(ink.nameSize) >= 22, 'and larger on paper than on screen', ink.nameSize);
  ok(ink.first <= 2, 'the letterhead is the first thing on the page', ink.first + 'px from the top');
  ok(ink.visible.length === 1 && /usageReportModal/.test(String(ink.visible[0])),
     'the letterhead is the only thing printed', JSON.stringify(ink.visible));
  ok(ink.chars > 150, 'the page still carries the report', ink.chars + ' chars');
  ok(ink.nameOnPage && ink.phoneOnPage, 'and the shop name and number are among the text');

  out('--- print to PDF with Electron, then read the file ---');
  // back to screen media for the capture; printToPDF applies print CSS itself
  try { win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: '' }); } catch (e) {}
  await ev(`(function(){ document.body.classList.add('gp-printing'); return 1; })()`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  let wrote = null;
  try {
    wrote = await win.webContents.printToPDF({
      printBackground: true, pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
  } catch (e) { out('  printToPDF threw: ' + e.message); }
  ok(!!wrote, 'Electron produced a PDF buffer', wrote ? (wrote.length + ' bytes') : 'nothing');
  if (wrote) {
    fs.writeFileSync(OUT, wrote);
    const info = inspectPdf(OUT);
    out('  file   : ' + OUT);
    out('  size   : ' + info.size + ' bytes');
    out('  pages  : ' + info.pages);
    out('  text   : ' + info.textOps + ' text-showing operators');
    out('  drawn  : ' + info.fills + ' fill / ' + info.strokes + ' stroke ops, ' + info.images + ' images');
    ok(info.size > 3000, 'the file is substantial, not a 791-byte blank', info.size + ' bytes');
    ok(/^%PDF-/.test(info.header), 'it is a valid PDF', info.header);
    ok(info.pages >= 1, 'it has at least one page', info.pages);
    const painted = info.textOps > 20 || info.images >= 1 || (info.fills + info.strokes) > 20;
    ok(painted, 'it actually paints content on the page',
       info.textOps + ' text ops, ' + info.fills + '/' + info.strokes + ' fill/stroke, ' + info.images + ' images');
    /* the letterhead must be ink on the paper, not just markup on the screen:
     * a font has to be embedded and far more text than before the header existed */
    const raw = fs.readFileSync(OUT).toString('latin1');
    ok(/FontFile2|\/FontFile3|\/FontFile\b/.test(raw) || info.fonts > 0,
       'a font is embedded in the PDF', info.fonts + ' fonts');
    ok(info.textOps >= 250, 'the page carries the whole report in text', info.textOps + ' text ops');

  }

  out(fail === 0 ? '\nPRINT PDF VERIFIED (' + pass + ' checks)' : '\n' + fail + ' CHECK(S) FAILED (' + pass + ' passed)');
  win.destroy();
  app.exit(fail === 0 ? 0 : 1);
}).catch((e) => { out('  FAIL crashed: ' + (e && e.stack || e)); app.exit(1); });