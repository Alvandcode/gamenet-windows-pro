'use strict';
/* Group play and walk-in guests: the whole flow against a real DOM.
   Covers the rules the shop asked for:
     - start one OR many clients at once, plus free-text "other" guests
     - one shared timer, one invoice paid by one person
     - the time credited to EVERY member's own record
     - membership hours only spent when the tariff matches the party size
     - per-customer report: today, per-date detail, totals, days not played */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

(async function () {
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom;
  const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.fetch = () => Promise.reject(new Error('offline'));
  window.confirm = () => true;
  window.print = () => {};

  for (const f of ['config.js', 'security.js', 'license-pubkey.js', 'license.js', 'storage.js', 'app.js',
    'patches.js', 'jalali.js', 'zoom.js', 'new-features.js', 'round2-a.js', 'round2-b.js', 'round2-c.js',
    'phonebook.js', 'ops.js', 'finance.js', 'group-play.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await new Promise((r) => setTimeout(r, 1200));

  console.log('--- 1. the panel is really on the clients page ---');
  ok(!!doc.getElementById('gpSetup'), 'the start-play panel exists');
  ok(!!doc.getElementById('gpPicker'), 'the customer picker exists');
  ok(!!doc.getElementById('gpGuestLabel'), 'there is an "other" field for people with no account');
  ok(!!doc.getElementById('usageReportModal'), 'the usage report modal exists');
  ok(typeof window.gpStart === 'function', 'gpStart is available');

  // publishState() defines window.clients with a real setter, so this is the
  // app's own supported way to seed the shop's list
  window.clients = [
    { id: 1, name: 'رضا محمدی', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
    { id: 2, name: 'سارا احمدی', tariff: 'double', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
    { id: 3, name: 'کیان شریفی', tariff: 'single', stationType: 'ps', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
  ];
  window.tariffs = { single: 20000, double: 35000, extra: 15000 };
  window.stationTypes = [{ id: 'pc', name: 'PC', icon: '🖥' }, { id: 'ps', name: 'PS', icon: '🎮' }];
  window.renderGroupPanel();
  window.gpRenderPicker();

  console.log('--- 2. the picker lists the customers ---');
  const chips = doc.querySelectorAll('#gpPicker .gp-chip');
  ok(chips.length === 3, 'all three customers are offered', chips.length);
  ok(doc.getElementById('gpPicker').innerHTML.indexOf('رضا محمدی') !== -1, 'a customer name is shown');

  console.log('--- 3. the hourly estimate updates with the headcount ---');
  window.__gpSelection = { ids: [] };
  doc.getElementById('gpGuestCount').value = '0';
  window.gpRenderPicker();
  ok(/انتخاب نشده/.test(doc.getElementById('gpEstimate').textContent), 'nothing selected -> a prompt');
  window.gpSelectAllVisible();
  const est = doc.getElementById('gpEstimate').textContent;
  ok(/\b3\b|۳/.test(est), '3 selected -> 3 people', est);
  ok(/تومان در ساعت/.test(est), 'the estimate mentions an hourly rate', est);
  ok(/نفر اضافه/.test(est), 'a party of 3 is billed with the extra-person rate', est);
  window.gpClearPick();

  console.log('--- 3b. the selection survives a re-render of the client list ---');
  // click for real, the way the shop does
  // fire the real change event, the way a tick in the UI does
  const cb = doc.querySelector('#gpPicker input[type=checkbox]');
  cb.checked = true;
  cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  const picked = window.gpSelectionSize();
  ok(picked === 1, 'ticking a box selects that customer', picked);
  window.renderClients();            // the app re-renders the grid constantly
  window.gpRenderPicker();
  ok(window.__gpSelection.ids.length === picked, 'the tick is kept after a re-render', picked + ' -> ' + window.__gpSelection.ids.length);
  const stillChecked = doc.querySelectorAll('#gpPicker input[type=checkbox]:checked').length;
  ok(stillChecked === picked, 'the box is still ticked in the DOM', stillChecked + ' checked vs ' + picked + ' selected');
  window.gpClearPick();
  window.gpRenderPicker();

  console.log('--- 4. starting a party of two, one invoice ---');
  let g = window.gpStart({ clientIds: ['1', '2'], guestLabel: '', guestCount: 0 });
  ok(!!g, 'the party started');
  ok(g.members.length === 2, 'two members in the party');
  ok(window.clients.find((c) => c.id === 1).status === 'online', 'the first client is marked as playing');
  ok(window.clients.find((c) => c.id === 2).status === 'online', 'the second client is marked as playing');
  ok(doc.getElementById('gpRunning').style.display !== 'none', 'the running panel is shown');
  ok(/^\d{2}:\d{2}:\d{2}$/.test(doc.getElementById('gpClock').textContent), 'the shared clock is running',
     doc.getElementById('gpClock').textContent);

  console.log('--- 5. a walk-in guest with no account ---');
  window.gpAbort();
  g = window.gpStart({ clientIds: [], guestLabel: 'مهمان', guestCount: 2 });
  ok(g.members.length === 2, 'two walk-in guests started');
  ok(g.members.every((m) => m.kind === 'guest'), 'they are guests, not client records');
  ok(g.members[0].name === 'مهمان 1' && g.members[1].name === 'مهمان 2', 'the labels are numbered so the two are told apart',
     g.members.map((m) => m.name).join(', '));
  window.gpAbort();

  console.log('--- 6. the clock runs and the money follows it ---');
  g = window.gpStart({ clientIds: ['1', '2'], guestLabel: '', guestCount: 0 });
  // move the clock forward by exactly one hour instead of waiting for it
  const startedAt = Date.now();
  g.startedAt = startedAt - 3600 * 1000;
  window.gpSetActive(g);
  const elapsed = window.gpElapsed(window.gpActive());
  ok(elapsed >= 3599 && elapsed <= 3601, 'one hour elapsed', elapsed);
  // double rate 35000 for 2 people -> 35000
  const expected = window.gpCostFor(2, 3600);
  ok(expected === 35000, 'two people for an hour costs the double rate', expected);

  console.log('--- 7. finishing writes one record per member, one bill ---');
  const before = window.gpSessionsOf('all').length;
  const paymentsBefore = JSON.parse(window.localStorage.getItem('alvand_payments') || '[]').length;
  const summary = window.gpFinish();
  ok(!!summary, 'finish returned a summary');
  const after = window.gpSessionsOf('all');
  ok(after.length === before + 2, 'one record per member', after.length - before);
  const forOne = window.gpSessionsOf('1');
  ok(forOne.length === 1, 'customer 1 has their own record');
  const forTwo = window.gpSessionsOf('2');
  ok(forTwo.length === 1, 'customer 2 has their own record');
  ok(forOne[0].duration === 3600, 'customer 1 was credited the hour', forOne[0].duration);
  ok(forTwo[0].duration === 3600, 'customer 2 was credited the hour', forTwo[0].duration);
  const billed = after.filter((r) => r.billed);
  ok(billed.length === 1, 'exactly one of them carries the bill', billed.length);
  ok(billed[0].cost === 35000, 'the bill is the full amount', billed[0].cost);
  ok(after.filter((r) => r.cost === 0).length === 1, 'the other member is not charged again');
  const paymentsAfter = JSON.parse(window.localStorage.getItem('alvand_payments') || '[]');
  ok(paymentsAfter.length === paymentsBefore + 1, 'the cash ledger got the total exactly once', paymentsAfter.length - paymentsBefore);
  ok(paymentsAfter[paymentsAfter.length - 1].amount === 35000, 'the ledger amount is the full bill', paymentsAfter[paymentsAfter.length - 1].amount);
  ok(window.clients.find((c) => c.id === 1).status === 'offline', 'the clients are free again');
  ok(window.clients.find((c) => c.id === 1).elapsed === 0, 'their timer is cleared');
  ok(!window.gpActive(), 'there is no running party any more');

  console.log('--- 8. membership: only spent when the tariff matches ---');
  ok(window.gpPlanApplies({ tariff: 'single' }, 1) === true, 'single plan, played alone -> plan used');
  ok(window.gpPlanApplies({ tariff: 'single' }, 2) === false, 'single plan, played as a pair -> normal price');
  ok(window.gpPlanApplies({ tariff: 'double' }, 2) === true, 'two-person plan, played as a pair -> plan used');
  ok(window.gpPlanApplies({ tariff: 'double' }, 1) === false, 'two-person plan, played alone -> normal price');
  ok(window.gpPlanApplies({ tariff: 'single' }, 3) === false, 'single plan, played in a group -> normal price');
  ok(window.gpPlanApplies({ tariff: 'double' }, 3) === false, 'two-person plan, played in a group -> normal price');

  console.log('--- 9. a membership is actually deducted on a matching session ---');
  // assign through the app's own function, not by overwriting the array
  window.customerMemberships.length = 0;
  window.customerMemberships.push({
    customerId: 3, planId: 1, planName: 'پایه',
    startDate: new Date().toISOString(),
    expires: new Date(Date.now() + 86400000).toISOString(),
    hoursUsed: 0, hoursTotal: 20, discount: 0, active: true,
  });
  window.saveCustomerMemberships();
  let gg = window.gpStart({ clientIds: ['3'], guestLabel: '', guestCount: 0 });
  gg.startedAt = Date.now() - 3600 * 1000;
  window.gpSetActive(gg);
  window.gpFinish();
  const mem3 = window.customerMemberships.find((m) => m.customerId === 3);
  ok(mem3 && mem3.hoursUsed > 0.9, 'a matching session spent plan hours (' + (mem3 ? mem3.hoursUsed.toFixed(2) : '?') + 'h)');
  mem3.hoursUsed = 0;
  window.saveCustomerMemberships();
  // now the same person plays in a pair: the plan must stay untouched
  gg = window.gpStart({ clientIds: ['3', '1'], guestLabel: '', guestCount: 0 });
  gg.startedAt = Date.now() - 3600 * 1000;
  window.gpSetActive(gg);
  window.gpFinish();
  const mem3b = window.customerMemberships.find((m) => m.customerId === 3);
  ok(mem3b && mem3b.hoursUsed === 0, 'a group session did NOT touch the single-person plan', mem3b ? mem3b.hoursUsed : '?');

  console.log('--- 10. the report says who played, when, and when not ---');
  // build the history from fixed calendar days so the gap is unambiguous:
  // the 1st, the 3rd and the 4th of an ordinary month, so the 2nd is the one
  // day in the span with no play.
  const day = 86400000;
  const base = new Date(2026, 8, 1, 12, 0, 0);          // 2026-09-01 midday
  const at = (d) => new Date(base.getTime() + d * day).toISOString();
  window.gpSave([
    { id: 'r1', date: at(0), duration: 3600, cost: 35000, billed: true, memberKind: 'client', clientId: 1, clientName: 'رضا محمدی', headcount: 2, startedAt: base.getTime(), endedAt: base.getTime() },
    { id: 'r2', date: at(2), duration: 1800, cost: 0, billed: false, memberKind: 'client', clientId: 1, clientName: 'رضا محمدی', headcount: 2, startedAt: base.getTime() + 2 * day, endedAt: base.getTime() + 2 * day },
    { id: 'r3', date: at(3), duration: 5400, cost: 0, billed: false, memberKind: 'client', clientId: 1, clientName: 'رضا محمدی', headcount: 2, startedAt: base.getTime() + 3 * day, endedAt: base.getTime() + 3 * day },
  ]);
  const rep = window.gpReport('1');
  ok(rep.visits === 3, 'three visits', rep.visits);
  ok(rep.totalSeconds === 3600 + 1800 + 5400, 'the total time is the sum of the visits', rep.totalSeconds);
  ok(rep.totalPaid === 35000, 'the total paid only counts the billed record', rep.totalPaid);
  ok(rep.days.length === 3, 'three distinct dates', rep.days.length);
  ok(rep.days[0] === '2026/09/04' && rep.days[2] === '2026/09/01', 'the days are newest first', rep.days.join(','));
  ok(!rep.byDay[window.gpFaDate(new Date())] || rep.byDay[window.gpFaDate(new Date())].seconds === 0,
     'today shows nothing when they have not played today');
  ok(rep.absent.length === 1, 'exactly one day without play in the span', rep.absent.join(','));
  ok(rep.absent[0] === '2026/09/02', 'and it is the 2nd, the day in the middle', rep.absent[0]);
  // a real bug here produced "2026/01/01": the date string was split by hand
  // and new Date(y, 0, 1) silently became January
  ok(rep.absent.every((d) => /^20\d{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(d)),
     'every listed date is a real calendar day', rep.absent.join(','));
  ok(rep.absent.indexOf('2026/01/01') === -1, 'no month-zero date is ever listed', rep.absent.join(','));

  console.log('--- 11. today is reported separately ---');
  const nowReal = Date.now();
  window.gpSave([{ id: 't1', date: new Date(nowReal).toISOString(), duration: 2700, cost: 0, billed: false, memberKind: 'client', clientId: 2, clientName: 'سارا احمدی', headcount: 1, startedAt: nowReal, endedAt: nowReal }]);
  const rep2 = window.gpReport('2');
  ok(rep2.today === 2700, '"today" is counted on its own', rep2.today);
  // a session stored as an ISO instant must land on the shop's own calendar
  ok(rep2.byDay[window.gpFaDate(new Date(nowReal))] !== undefined, 'and it is filed under the local date',
     Object.keys(rep2.byDay).join(','));

  console.log('--- 12. the report modal opens and shows the numbers ---');
  window.gpOpenReport('1');
  const modal = doc.getElementById('usageReportModal');
  ok(modal.classList.contains('show'), 'the report modal opened');
  const body = doc.getElementById('usageReportModalBody').innerHTML;
  ok(body.indexOf('رضا محمدی') !== -1, 'it names the customer');
  ok(body.indexOf('امروز') !== -1, 'it has a today box');
  ok(body.indexOf('روزهایی که بازی نکرد') !== -1, 'it lists the days they did not play');
  ok(body.indexOf('خلاصه بر اساس تاریخ') !== -1, 'it has the per-date summary');
  ok(body.indexOf('جزئیات بازی') !== -1, 'it has the session detail');

  console.log('--- 13. the walk-in book remembers a label that was actually used ---');
  // abort() throws the party away, so the label is only remembered on finish()
  window.gpStart({ clientIds: [], guestLabel: 'مهمان رهاشده', guestCount: 1 });
  window.gpAbort();
  ok(!window.gpGuestBook().some((b) => b.label === 'مهمان رهاشده'), 'a cancelled party leaves no trace', JSON.stringify(window.gpGuestBook()));
  window.gpStart({ clientIds: [], guestLabel: 'مشتری تازه', guestCount: 1 });
  window.gpFinish();
  ok(window.gpGuestBook().some((b) => b.label === 'مشتری تازه'), 'a finished walk-in label is remembered', JSON.stringify(window.gpGuestBook()));

  console.log('--- 14. a second party cannot start on top of one ---');
  g = window.gpStart({ clientIds: ['1'], guestLabel: '', guestCount: 0 });
  ok(!!g, 'first party started');
  const again = window.gpStart({ clientIds: ['2'], guestLabel: '', guestCount: 0 });
  ok(window.gpActive() && window.gpActive().members.length === 1, 'the running party is left alone', again ? 'was replaced' : 'refused');
  window.gpAbort();

  console.log('--- 15. nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nALL GROUP-PLAY CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
