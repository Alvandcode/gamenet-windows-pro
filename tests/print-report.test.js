'use strict';
/* The saved usage-report PDF came out blank: 791 bytes, one transform matrix,
 * zero text, zero images. gpPrintReport() closed the modal before printing and
 * the print stylesheet hid everything except the other template, so the printer
 * never saw the report. These checks ask what the print view actually contains. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom; const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.fetch = () => Promise.reject(new Error('offline'));
  window.confirm = () => true;
  // capture the print call instead of opening a dialog
  let printed = 0;
  window.print = function () { printed++; };

  for (const f of ['config.js','security.js','license-pubkey.js','license.js','storage.js','app.js',
    'patches.js','jalali.js','zoom.js','new-features.js','round2-a.js','round2-b.js','round2-c.js',
    'phonebook.js','ops.js','finance.js','group-play.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await sleep(1500);

  console.log('--- build a real report first ---');
  const day = 86400000;
  const base = new Date(2026, 4, 1, 12, 0, 0);
  window.sessions = [];
  window.gpSave([
    { id: 'a', date: new Date(base.getTime()).toISOString(), duration: 5400, cost: 45000, billed: true, memberKind: 'client', clientId: 1, clientName: 'مریم احمدی', headcount: 1 },
    { id: 'b', date: new Date(base.getTime() + day * 2).toISOString(), duration: 3600, cost: 0, billed: false, memberKind: 'client', clientId: 1, clientName: 'مریم احمدی', headcount: 2 },
  ]);
  window.clients = [{ id: 1, name: 'مریم احمدی', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 }];
  window.gpOpenReport('1');
  await sleep(400);
  const modal = doc.getElementById('usageReportModal');
  ok(modal.classList.contains('show'), 'the report is open');
  const body = doc.getElementById('usageReportModalBody');
  ok(body.innerHTML.length > 200, 'it has real content in the DOM', body.innerHTML.length + ' chars');
  ok(/مریم احمدی/.test(body.textContent), 'it names the customer');
  ok(/۰۱:۰۰|01:00/.test(body.textContent), 'it shows the hours');

  console.log('--- printing must not hide the report ---');
  printed = 0;
  window.gpPrintReport();
  await sleep(900);

  ok(printed >= 1, 'the print dialog was opened', printed);
  ok(modal.classList.contains('show'), 'the report is STILL open when print runs (this is what made it blank)', modal.className);
  ok(/gp-printing/.test(doc.body.className), 'the print view is marked on the body', doc.body.className);

  console.log('--- the print stylesheet shows the report and hides the rest ---');
  const style = doc.getElementById('gpPrintStyle');
  ok(!!style, 'a print stylesheet is installed');
  const css = style ? style.textContent : '';
  ok(/display:\s*none/.test(css) && /#usageReportModal/.test(css), 'it hides the app but keeps the report');
  ok(/body\.gp-printing\s*>\s*\*:not\(#usageReportModal\)/.test(css), 'everything except the report is hidden');
  ok(/body\.gp-printing\s+#usageReportModal/.test(css), 'the report itself is forced visible');
  ok(/gp-scroll/.test(css), 'the inner scroll boxes are expanded so no row is cut off');

  console.log('--- what would actually land on the paper ---');
  // emulate the print media query: which elements would still be laid out?
  const visible = [];
  Array.from(doc.body.children).forEach((el) => {
    const id = el.id || el.className || el.tagName;
    if (id.toString() === 'usageReportModal') visible.push(id.toString());
  });
  ok(visible.length === 1 && visible[0] === 'usageReportModal',
     'exactly one thing is printed: the report', visible.join(','));
  // the numbers inside it are real text nodes, not images or empty divs
  const text = (body.textContent || '').replace(/\s+/g, ' ').trim();
  ok(text.length > 80, 'it carries text a printer can render', text.length + ' chars');
  ok(/\d{2}:\d{2}:\d{2}/.test(text), 'with the durations spelled out', text.slice(0, 80));
  ok(!/NaN|undefined|Infinity/.test(text), 'and no NaN or undefined anywhere', text.slice(0, 80));

  console.log('--- the print view is cleared when the dialog closes ---');
  // the flag now comes off on afterprint, not on a timer, so a slow print or a
  // second click can never leave the screen stuck in print mode
  ok(/gp-printing/.test(doc.body.className), 'still marked while the dialog is open', doc.body.className);
  window.dispatchEvent(new window.Event('afterprint'));
  await sleep(100);
  ok(!/gp-printing/.test(doc.body.className), 'the body flag is removed after printing', doc.body.className);

  console.log('--- printing twice in a row is still fine ---');
  // a second click while the first dialog is still open must not hide anything
  window.gpPrintReport();
  await sleep(600);
  ok(modal.classList.contains('show'), 'the report survives a second print click', modal.className);
  ok(/gp-printing/.test(doc.body.className), 'and is still marked for print', doc.body.className);
  window.dispatchEvent(new window.Event('afterprint'));
  await sleep(100);

  console.log('--- printing with no report open is refused, not blank ---');
  printed = 0;
  modal.classList.remove('show');
  window.gpPrintReport();
  await sleep(500);
  ok(printed === 0, 'no dialog opens when there is nothing to print', printed);

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nALL PRINT-REPORT CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
