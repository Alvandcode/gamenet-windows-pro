'use strict';
/* The shop has been running for a while. Records saved by older builds, or by a
 * hand-edited/shared backup, must not break the new features. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };

(async function () {
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom; const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.fetch = () => Promise.reject(new Error('offline'));
  window.confirm = () => true; window.print = () => {};
  for (const f of ['config.js','security.js','license-pubkey.js','license.js','storage.js','app.js',
    'patches.js','jalali.js','zoom.js','new-features.js','round2-a.js','round2-b.js','round2-c.js',
    'phonebook.js','ops.js','finance.js','group-play.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await new Promise((r) => setTimeout(r, 1500));

  console.log('--- sessions saved before branching existed ---');
  // an old session has no branchId at all
  window.gpSave([]);
  window.tariffs = { single: 20000, double: 35000, extra: 15000 };
  window.stationTypes = [{ id: 'pc', name: 'PC', icon: 'P' }];
  window.sessions = [
    { id: 'old1', date: new Date().toISOString(), cost: 20000, duration: 3600, clientId: 1, clientName: 'قدیمی', tariff: 'single' },
  ];
  let stats = window.branchStats();
  const main = stats.find((s) => String(s.id) === '1');
  ok(!!main, 'branch 1 exists in the stats', JSON.stringify(stats.map((s) => s.id)));
  ok(main && main.income === 20000, 'an old session with no branchId counts for the main branch', main && main.income);

  console.log('--- a new session is counted once, not twice ---');
  window.clients = [
    { id: 1, name: 'مشتری', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
  ];
  window.sessions = [];
  window.gpSave([]);
  const g = window.gpStart({ clientIds: ['1'], guestLabel: '', guestCount: 0 });
  g.startedAt = Date.now() - 3600 * 1000;
  window.gpSetActive(g);
  window.gpFinish();
  const b = window.branchStats();
  const mainB = b.find((s) => String(s.id) === '1');
  ok(mainB && mainB.income === 20000, 'a one-hour session at 20000/hour shows 20000 on the card', mainB && mainB.income);
  ok(mainB && mainB.sessions === 1, 'and it is one session, not two', mainB && mainB.sessions);

  console.log('--- a session with a Persian-digit cost still totals ---');
  // seed only the ordinary ledger; the report must pick it up on its own
  window.gpSave([]);
  window.sessions = [
    { id: 'p1', date: new Date().toISOString(), cost: '۲۰٬۰۰۰', duration: '۳۶۰۰', clientId: 1, clientName: 'فارسی', tariff: 'single', branchId: '1' },
  ];
  const pc = window.branchStats().find((s) => String(s.id) === '1');
  ok(pc && pc.income === 20000, 'the Persian-digit cost is read as 20000', pc && pc.income);

  console.log('--- the usage report works for somebody with one old row ---');
  // already in the ordinary ledger from the previous block; do not copy it into
  // the group store as well, that would count the same visit twice
  const rep = window.gpReport('1');
  ok(rep.visits === 1, 'one visit from the ordinary ledger', rep.visits);
  ok(rep.totalSeconds === 3600, 'one hour', rep.totalSeconds);
  ok(rep.totalPaid === 20000, 'and the Persian-digit amount is read', rep.totalPaid);
  ok(rep.today === 3600, 'and it is today', rep.today);

  console.log('--- the report for someone who never played ---');
  window.sessions = [];
  window.gpSave([]);
  const empty = window.gpReport('999');
  ok(empty.visits === 0, 'no visits', empty.visits);
  ok(empty.totalSeconds === 0, 'no time', empty.totalSeconds);
  ok(empty.totalPaid === 0, 'no money', empty.totalPaid);
  ok(Array.isArray(empty.days) && empty.days.length === 0, 'no days listed', empty.days.length);
  ok(Array.isArray(empty.absent) && empty.absent.length === 0, 'and no invented "absent" days', empty.absent.length);

  console.log('--- the report must not claim a day they played is absent ---');
  // played on the 1st, the 2nd and the 4th of May 2026, so only the 3rd is absent
  const day = 86400000;
  const base = new Date(2026, 4, 1, 12, 0, 0);
  window.sessions = [];
  window.gpSave([
    { id: 'x', date: new Date(base.getTime()).toISOString(), duration: 600, cost: 0, billed: false, memberKind: 'client', clientId: 1, clientName: 'x', headcount: 1 },
    { id: 'y', date: new Date(base.getTime() + day).toISOString(), duration: 600, cost: 0, billed: false, memberKind: 'client', clientId: 1, clientName: 'x', headcount: 1 },
    { id: 'z', date: new Date(base.getTime() + day * 3).toISOString(), duration: 600, cost: 0, billed: false, memberKind: 'client', clientId: 1, clientName: 'x', headcount: 1 },
  ]);
  const r3 = window.gpReport('1');
  ok(r3.days.length === 3, 'three playing days', r3.days.join(','));
  ok(r3.absent.length === 1, 'exactly one day in the span without play (got ' + r3.absent.join(',') + ')', r3.absent.join(','));
  ok(r3.absent[0] === '2026/05/03', 'and it is the 3rd', r3.absent[0]);
  ok(r3.absent.indexOf('2026/05/01') === -1, 'the 1st is not listed as absent', r3.absent.join(','));
  ok(r3.absent.indexOf('2026/05/02') === -1, 'the 2nd is not listed as absent', r3.absent.join(','));
  ok(r3.absent.indexOf('2026/05/04') === -1, 'the 4th is not listed as absent', r3.absent.join(','));

  console.log('--- a guest report works ---');
  window.sessions = [];
  window.gpSave([
    { id: 'g1', date: new Date().toISOString(), duration: 1800, cost: 0, billed: false, memberKind: 'guest', clientId: null, clientName: 'مهمان', headcount: 1 },
  ]);
  const gr = window.gpReport('guest:مهمان');
  ok(gr.visits === 1, 'the guest has one visit', gr.visits);
  ok(gr.totalSeconds === 1800, 'for 30 minutes', gr.totalSeconds);

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nALL LEGACY-RECORD CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
