'use strict';
/* Deleting a client who is still playing throws away the played time: the card
 * goes, the session record is never written and the cash is never banked. */
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

  console.log('--- the store the sessions are written to ---');
  ok(typeof window.sessions !== 'undefined', 'the sessions store exists');

  console.log('--- deleting a client mid-session must not swallow the time ---');
  window.tariffs = { single: 20000, double: 35000, extra: 15000 };
  window.stationTypes = [{ id: 'pc', name: 'PC', icon: 'P' }];
  window.sessions = [];
  window.clients = [
    { id: 1, name: 'در حال بازی', tariff: 'single', stationType: 'pc', status: 'online', startTime: Date.now() - 3600 * 1000, elapsed: 3600, totalCost: 0 },
    { id: 2, name: 'آزاد', tariff: 'single', stationType: 'pc', status: 'offline', startTime: null, elapsed: 0, totalCost: 0 },
  ];
  const before = window.sessions.length;

  // the shop deletes the first card by hand
  window.deleteClient(0);

  console.log('  clients left : ' + window.clients.length);
  console.log('  sessions     : ' + window.sessions.length + ' (was ' + before + ')');
  ok(window.clients.length === 1, 'the client is gone', window.clients.length);
  ok(window.sessions.length > before,
     'the hour that was played was recorded before the card was removed',
     'sessions went from ' + before + ' to ' + window.sessions.length);
  if (window.sessions.length > before) {
    const rec = window.sessions[window.sessions.length - 1];
    console.log('  the banked record: duration=' + rec.duration + 's cost=' + rec.cost +
                ' clientName=' + rec.clientName);
    ok(rec.duration >= 3599, 'the full hour is on the record', rec.duration);
    ok(rec.cost > 0, 'and it was billed', rec.cost);
    ok(rec.clientName === 'در حال بازی', 'against the right name', rec.clientName);
  }
  const payments = JSON.parse(window.localStorage.getItem('alvand_payments') || '[]');
  ok(payments.length === 1, 'the cash ledger was credited once', payments.length);
  if (payments.length) ok(payments[0].amount > 0, 'with the amount', payments[0].amount);

  console.log('--- deleting an idle client must NOT invent a session ---');
  window.sessions = [];
  window.clients = [
    { id: 5, name: 'بیکار', tariff: 'single', stationType: 'pc', status: 'offline', startTime: null, elapsed: 0, totalCost: 0 },
  ];
  window.deleteClient(0);
  ok(window.sessions.length === 0, 'no session for someone who never played', window.sessions.length);
  ok(window.clients.length === 0, 'and the card is gone', window.clients.length);

  console.log('--- a paused client is still mid-session ---');
  window.sessions = [];
  window.clients = [
    { id: 7, name: 'متوقف', tariff: 'single', stationType: 'pc', status: 'paused', startTime: null, elapsed: 1800, totalCost: 0 },
  ];
  window.deleteClient(0);
  ok(window.sessions.length === 1, 'a paused client had 30 minutes played and must be billed', window.sessions.length);
  if (window.sessions.length) ok(window.sessions[0].duration === 1800, 'with the right duration', window.sessions[0].duration);

  console.log('--- deleting while a group party is running ---');
  window.sessions = [];
  window.clients = [
    { id: 10, name: 'عضو گروه', tariff: 'single', stationType: 'pc', status: 'online', startTime: Date.now() - 3600 * 1000, elapsed: 3600, totalCost: 0 },
  ];
  window.gpStart({ clientIds: ['10'], guestLabel: '', guestCount: 0 });
  let g = window.gpActive();
  if (g) { g.startedAt = Date.now() - 3600 * 1000; window.gpSetActive(g); }
  window.deleteClient(0);
  const still = window.gpActive();
  ok(!still || still.members.length === 0,
     'the running party is settled when its member is deleted', still ? still.members.length + ' left' : 'cleared');
  ok(window.sessions.length > 0, 'and the group session was banked', window.sessions.length);

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nALL DELETE-SAFETY CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
