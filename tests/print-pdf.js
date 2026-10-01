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
  return { size: b.length, pages, textOps: (text.match(/\bTj|\bTJ/g) || []).length, images, fills, strokes,
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
    var day = 86400000, base = new Date(2026, 4, 1, 12, 0, 0);
    sessions = [];
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
    return JSON.stringify({ shown: m.classList.contains('show'), chars: t.length, hasName: /احمدي/.test(t), tables: m.querySelectorAll('table').length });
  })()`);
  const d = JSON.parse(dom);
  ok(d.shown, 'the modal is open', dom);
  ok(d.chars > 150, 'it holds real text', d.chars + ' chars');
  ok(d.hasName, 'the customer name is in it');
  ok(d.tables >= 2, 'both report tables are rendered', d.tables + ' tables');

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

  out('--- print to PDF with Electron, then read the file ---');
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
  }

  out(fail === 0 ? '\nPRINT PDF VERIFIED (' + pass + ' checks)' : '\n' + fail + ' CHECK(S) FAILED (' + pass + ' passed)');
  win.destroy();
  app.exit(fail === 0 ? 0 : 1);
}).catch((e) => { out('  FAIL crashed: ' + (e && e.stack || e)); app.exit(1); });