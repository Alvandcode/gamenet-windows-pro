'use strict';
/* The shop asked for a PDF of one customer's play detail: date, time, how long,
 * how many people, who they were with, and the money. The HTML is checked here;
 * tests/print-pdf.js style checks that it really becomes a file are in
 * tests/detail-pdf.test.js.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
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

  for (const f of ['config.js','security.js','license-pubkey.js','license.js','storage.js','app.js',
    'patches.js','jalali.js','zoom.js','new-features.js','round2-a.js','round2-b.js','round2-c.js',
    'phonebook.js','ops.js','finance.js','group-play.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await sleep(1500);

  console.log('--- the builders exist ---');
  ['gpDetailRows','gpDetailHtml','gpDetailPdfBlob','gpDownloadDetailPdf'].forEach((fn) => {
    ok(typeof window[fn] === 'function', 'window.' + fn + ' exists');
  });

  console.log('--- two customers, three parties between them ---');
  window.clients = [
    { id: 1, name: 'مریم احمدی', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
    { id: 2, name: 'رضا کریمی', tariff: 'double', stationType: 'ps5', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
    { id: 3, name: 'سارا محمدی', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
  ];
  window.localStorage.setItem('alvand_shopName', 'گیم‌نت الماس');
  window.localStorage.setItem('alvand_shopPhone', '09121234567');

  // a party of three, then a solo session, recorded the way finish() records them
  const day = 86400000;
  const base = new Date(2026, 4, 1, 12, 0, 0);
  const mk = (gid, when, secs, who, head, cost, billed) => ({
    id: gid + '-' + who, groupId: gid,
    date: new Date(base.getTime() + day * when).toISOString(),
    duration: secs, cost: cost, billed: billed,
    memberKind: 'client', clientId: Number(who), clientName: window.clients[Number(who) - 1].name,
    headcount: head, tariff: head > 1 ? 'double' : 'single', stationTypeName: 'کامپیوتر',
  });
  const rows = [
    mk('g1', 0, 5400, '1', 3, 0, false),
    mk('g1', 0, 5400, '2', 3, 0, false),
    mk('g1', 0, 5400, '3', 3, 90000, true),
    mk('g2', 2, 3600, '1', 1, 45000, true),
  ];
  window.localStorage.setItem('alvand_groupSessions', JSON.stringify(rows));

  console.log('--- the rows carry everything the shop asked for ---');
  const r1 = window.gpDetailRows('1');
  ok(r1.length === 2, 'customer 1 has both sessions', r1.length + ' rows');
  const party = r1.find((r) => r.headcount === 3);
  ok(!!party, 'the three-person party is there');
  ok(/^\d{4}\/\d{2}\/\d{2}$/.test(party.date), 'with a date', party.date);
  ok(/\d{2}:\d{2}/.test(party.time), 'and a time', party.time);
  ok(party.duration === 5400, 'and how long they played', String(party.duration));
  ok(party.headcount === 3, 'and how many people were there', String(party.headcount));
  ok(/رضا کریمی/.test(party.withNames) && /سارا محمدی/.test(party.withNames),
     'and who they were with', party.withNames);
  ok(!/مریم احمدی/.test(party.withNames), 'without listing themselves', party.withNames);
  const solo = r1.find((r) => r.headcount === 1);
  ok(solo.cost === 45000, 'the money comes through', String(solo.cost));

  console.log('--- the sheet itself ---');
  const sheet = window.gpDetailHtml('1');
  ok(sheet.length > 800, 'it builds a document', sheet.length + ' chars');
  ok(/گزارش ریز کارکرد/.test(sheet), 'it says what it is');
  ok(/گیم‌نت الماس/.test(sheet), 'the shop name is on it');
  ok(/09121234567/.test(sheet), 'and the shop number');
  ok(/مریم احمدی/.test(sheet), 'and whose report it is');
  ['تاریخ', 'ساعت', 'مدت بازی', 'تعداد نفر', 'با چه کسانی', 'مبلغ'].forEach((h) => {
    ok(sheet.indexOf(h) > 0, 'it has a "' + h + '" column');
  });
  ok(/رضا کریمی/.test(sheet), 'the names they played with are listed');
  ok(/۰۱:۳۰:۰۰|01:30:00/.test(sheet), 'the duration is written out');
  ok(/مجموع زمان بازی/.test(sheet), 'and a total');
  ok(/تعداد دفعات/.test(sheet), 'and a visit count');
  ok(/۴۵٬۰۰۰|45,000/.test(sheet), 'and the money');
  ok(!/NaN|undefined/.test(sheet), 'nothing broken in it',
     (sheet.match(/.{0,40}(NaN|undefined).{0,40}/) || [''])[0]);

  console.log('--- a customer with no history must not produce a broken page ---');
  // customer 3 was in the party, so use somebody who has never played
  window.clients.push({ id: 9, name: 'مشتری تازه', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 });
  const empty = window.gpDetailHtml('9');
  ok(empty.length > 600, 'it still builds a document', empty.length + ' chars');
  ok(/ثبت نشده/.test(empty), 'and says there is nothing to show');
  ok(/مشتری تازه/.test(empty), 'and still names who the sheet is about');
  ok(!/NaN|undefined/.test(empty), 'and nothing broken');

  console.log('--- it fits the page: A4 and the header repeats ---');
  ok(/@page\{size:A4/.test(sheet), 'it declares A4');
  ok(/thead\{display:table-header-group/.test(sheet), 'the table header repeats on every page');
  ok(/page-break-inside:avoid/.test(sheet), 'and no row is split across a page');

  console.log('--- names with markup cannot break into the sheet ---');
  window.clients[0].name = '<img src=x onerror=alert(1)>';
  const evil = window.gpDetailHtml('1');
  ok(!/<img src=x/.test(evil), 'a hostile name is escaped, not injected',
     (evil.match(/.{0,50}<img.{0,50}/) || [''])[0]);
  ok(/&lt;img/.test(evil), 'and shows up as text instead');
  window.clients[0].name = 'مریم احمدی';

  console.log('--- the modal remembers whose report is open ---');
  window.gpOpenReport('2');
  await sleep(300);
  ok(String(window.gpReportKey) === '2', 'opening a report records the customer', String(window.gpReportKey));
  ok(/رضا کریمی/.test(doc.getElementById('usageReportModalBody').textContent), 'and the modal shows it');

  console.log('--- the PDF button is in the modal ---');
  const btnHtml = doc.getElementById('usageReportModal').innerHTML;
  ok(/gpDownloadDetailPdf/.test(btnHtml), 'there is a PDF button');

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nDETAIL REPORT CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });