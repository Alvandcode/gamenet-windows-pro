'use strict';
/* The packaged app, printing the usage report for real.
 *
 * The packaged build cannot call webContents.printToPDF from outside, so the
 * check is done over CDP: open the report, press the print button, then read
 * what the print view would lay out - the content, the visibility of the report
 * under print media, and that nothing else is on the page.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* resolve the repo from this file, so the check works on the CI runner too and
 * not only on this machine */
const ROOT = path.resolve(__dirname, '..');
/* electron-builder names the unpacked folder after the package productName, so
 * resolve it instead of hardcoding "Gamenet Manager Pro.exe" */
function findExe() {
  const dir = path.join(ROOT, 'dist/win-unpacked');
  if (!fs.existsSync(dir)) return null;
  const wanted = String(process.argv[2] || 'Gamenet Manager Pro');
  const direct = path.join(dir, wanted + '.exe');
  if (fs.existsSync(direct)) return direct;
  const hit = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.exe') && !/unins|setup|updater/i.test(f));
  return hit ? path.join(dir, hit) : null;
}
const EXE = findExe();
const PROFILE = path.join(os.tmpdir(), 'opencode', 'packaged-print');
const PORT = 9441;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };

(async function () {
  if (!fs.existsSync(EXE)) {
    console.log('  the packaged app is not built at ' + path.join(ROOT, 'dist/win-unpacked'));
    console.log('  looked for: ' + EXE);
    process.exit(1);
  }
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });

  const proc = spawn(EXE, [ROOT, '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT], { stdio: 'ignore' });
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page' && /index\.html/.test(t.url)); } catch (e) {}
  }
  ok(!!page, 'the packaged app opened');
  if (!page) { proc.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((res) => { const mid = ++id; pending.set(mid, res); try { ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); } catch (e) { pending.delete(mid); res(null); } });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  await sleep(5000);

  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (!r) return 'no reply';
    if (r.exceptionDetails) return 'THREW ' + (((r.exceptionDetails.exception || {}).description) || r.exceptionDetails.text);
    return r.result.value;
  };

  console.log('--- the packaged app version ---');
  // read the expected version from package.json instead of hardcoding it, so
  // this check does not fail every time the version is bumped
  const want = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const ver = String(await ev('String(window.APP_VERSION)'));
  ok(ver === want, `it is the built version ${want}`, ver);

  console.log('--- open a report with history ---');
  console.log('  ' + await ev(`(function(){
    var day = 86400000, base = new Date(2026, 4, 1, 12, 0, 0);
    sessions = [];
    gpSave([
      { id:'a', date:new Date(base.getTime()).toISOString(), duration:5400, cost:45000, billed:true, memberKind:'client', clientId:1, clientName:'مريم احمدي', headcount:1 },
      { id:'b', date:new Date(base.getTime()+day*2).toISOString(), duration:3600, cost:0, billed:false, memberKind:'client', clientId:1, clientName:'مريم احمدي', headcount:2 }
    ]);
    clients = [{ id:1, name:'مريم احمدي', tariff:'single', stationType:'pc', status:'offline', elapsed:0, startTime:null, totalCost:0 }];
    gpOpenReport('1'); return 'opened';
  })()`));
  await sleep(900);

  console.log('--- press the print button ---');
  console.log('  ' + await ev(`(function(){
    var b = document.querySelector('#usageReportModal button[onclick*="gpPrintReport"]');
    if (!b) return 'no button';
    window.__calls = 0; window.print = function(){ window.__calls++; };
    b.click(); return 'clicked';
  })()`));
  await sleep(700);
  ok(Number(await ev('String(window.__calls)')) >= 1, 'the print path ran');
  // the flag now stays until afterprint, so this check no longer races a timer
  ok(/gp-printing/.test(String(await ev('document.body.className'))), 'the print view is marked');

  console.log('--- under print media, is the report the only thing on the page? ---');
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await sleep(500);
  const layout = JSON.parse(await ev(`(function(){
    var vis = [];
    Array.prototype.forEach.call(document.body.children, function(el){
      if (getComputedStyle(el).display === 'none') return;
      vis.push(el.id || el.className || el.tagName);
    });
    var m = document.getElementById('usageReportModal');
    var cs = getComputedStyle(m);
    var inner = m.querySelector('.modal');
    var sc = m.querySelector('.gp-scroll');
    var txt = (document.getElementById('usageReportModalBody').innerText||'').replace(/\\s+/g,' ').trim();
    var btnVisible = false;
    Array.prototype.forEach.call(m.querySelectorAll('button'), function(b){
      if (getComputedStyle(b).display !== 'none') btnVisible = true;
    });
    return JSON.stringify({
      visible: vis, modalDisplay: cs.display,
      innerDisplay: inner ? getComputedStyle(inner).display : 'none',
      scrollMaxH: sc ? getComputedStyle(sc).maxHeight : '-',
      chars: txt.length, buttonsVisible: btnVisible
    });
  })()`));
  console.log('  ' + JSON.stringify(layout));
  ok(layout.modalDisplay === 'block', 'the report overlay is laid out for print', layout.modalDisplay);
  ok(layout.visible.length === 1 && /usageReportModal/.test(String(layout.visible[0])),
     'nothing else prints - just the report', JSON.stringify(layout.visible));
  ok(layout.chars > 150, 'the printed page carries the report text', layout.chars + ' chars');
  ok(layout.scrollMaxH === 'none', 'the table boxes are not clipped, so no rows are cut', layout.scrollMaxH);
  ok(layout.buttonsVisible === false, 'the on-screen buttons stay off the paper');

  await send('Emulation.setEmulatedMedia', { media: '' });
  await sleep(300);
  console.log('--- the dialog closes, and the screen is normal again ---');
  // stand in for the browser firing afterprint when the dialog is dismissed
  await ev(`(function(){ window.dispatchEvent(new Event('afterprint')); return 1; })()`);
  await sleep(300);
  const after = String(await ev('document.body.className'));
  ok(!/gp-printing/.test(after), 'the print view is cleared after printing', after);

  ws.close(); proc.kill();
  await sleep(600);
  console.log(fail === 0 ? '\nPACKAGED PRINT REPORT VERIFIED (' + pass + ' checks)' : '\n' + fail + ' CHECK(S) FAILED (' + pass + ' passed)');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); try { process.kill(); } catch (x) {} process.exit(1); });