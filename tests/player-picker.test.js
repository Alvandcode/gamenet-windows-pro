'use strict';
/* The shop asked for a dropdown in the "شروع بازی" box that lists the customer
 * names from the client list and lets them pick any number of them from inside
 * it, so the picker has to hold many at once and stay in step with the chips.
 *
 * Then, at the end of the session, every one of those people needs their own
 * usage row so the owner can hand over a PDF of the detail later. That part
 * existed; these checks pin it down.
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

  /* The picker reads the customers register, so seed that. The session list
   * (window.clients) is the dashboard's per-station rows and is a different
   * store - see the "two stores" case below. */
  window.customers = [
    { id: 1, name: 'مریم احمدی', phone: '09121110001', wallet: 50000, debt: 0, totalHours: 12, totalSpent: 320000, createdAt: '2026-01-05' },
    { id: 2, name: 'رضا کریمی', phone: '09121110002', wallet: 0, debt: 150000, totalHours: 8, totalSpent: 180000, createdAt: '2026-02-11' },
    { id: 3, name: 'سارا محمدی', phone: '09121110003', wallet: 200000, debt: 0, totalHours: 30, totalSpent: 950000, createdAt: '2025-11-02' },
    { id: 4, name: 'امیر حسینی', phone: '09121110004', wallet: 0, debt: 0, totalHours: 0, totalSpent: 0, createdAt: '2026-05-20' },
    { id: 5, name: 'نگار رضایی', phone: '09121110005', wallet: 75000, debt: 0, totalHours: 4, totalSpent: 95000, createdAt: '2026-03-30' },
  ];
  window.clients = [];

  console.log('--- the dropdown exists and is wired up ---');
  const btn = doc.getElementById('gpDropBtn');
  const panel = doc.getElementById('gpDropPanel');
  const list = doc.getElementById('gpDropList');
  ok(!!btn, 'there is a button to open it');
  ok(!!panel && !!list, 'and a panel with a list inside');
  ok(panel.hidden === true, 'it starts closed');
  ok(btn.getAttribute('aria-expanded') === 'false', 'the button says so for screen readers');
  ok(!!doc.getElementById('gpDropSearch'), 'it has its own search box');
  ok(!!doc.getElementById('gpChosen'), 'and somewhere to show who is chosen');
  ['gpDropToggle','gpDropClose','gpDropPick','gpDropRemove','gpDropSelectAll','gpDropRender',
   'gpDropRenderChosen','gpDropRenderLabel','gpDropCount'].forEach((fn) => {
    ok(typeof window[fn] === 'function', 'window.' + fn + ' exists');
  });

  console.log('--- opening it lists the customers from the client list ---');
  window.gpRenderPicker();
  window.gpDropToggle();
  await sleep(250);
  ok(panel.hidden === false, 'the panel opened');
  ok(btn.getAttribute('aria-expanded') === 'true', 'and the button updated');
  let rows = list.querySelectorAll('.gp-drop-row');
  ok(rows.length === 5, 'all five customers are listed', rows.length + ' rows');
  ok(/مریم احمدی/.test(list.textContent), 'with their names');
  ok(/نگار رضایی/.test(list.textContent), 'including the last one');
  ok(list.querySelectorAll('input[type=checkbox]').length === 5, 'each row is a checkbox');

  console.log('--- picking several from inside the dropdown ---');
  rows = list.querySelectorAll('.gp-drop-row');
  rows[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  rows = list.querySelectorAll('.gp-drop-row');
  rows[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  rows = list.querySelectorAll('.gp-drop-row');
  rows[4].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);

  let ids = window.gpSelectionIds();
  ok(ids.length === 3, 'three people are selected at once', JSON.stringify(ids));
  ok(ids.map(String).indexOf('1') >= 0 && ids.map(String).indexOf('3') >= 0 && ids.map(String).indexOf('5') >= 0,
     'the right three', JSON.stringify(ids));
  rows = list.querySelectorAll('.gp-drop-row');
  const ticked = Array.prototype.filter.call(rows, (r) => r.getAttribute('aria-selected') === 'true');
  ok(ticked.length === 3, 'and the rows show it', ticked.length + ' ticked');

  console.log('--- the ticks do not vanish when the list re-renders ---');
  window.gpDropRender();
  await sleep(120);
  ids = window.gpSelectionIds();
  ok(ids.length === 3, 'the selection survives a re-render', JSON.stringify(ids));
  const ticked2 = Array.prototype.filter.call(
    doc.querySelectorAll('#gpDropList .gp-drop-row'),
    (r) => r.getAttribute('aria-selected') === 'true');
  ok(ticked2.length === 3, 'and the checkboxes come back ticked', ticked2.length + ' ticked');

  console.log('--- un-ticking removes them ---');
  const first = doc.querySelector('#gpDropList .gp-drop-row');
  first.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ids = window.gpSelectionIds();
  ok(ids.length === 2, 'now two', JSON.stringify(ids));

  console.log('--- the chosen names are shown, and removable ---');
  const tags = doc.querySelectorAll('#gpChosen .gp-tag');
  ok(tags.length === ids.length, 'one tag per chosen person', tags.length + ' tags');
  ok(/رضا کریمی|سارا محمدی|نگار رضایی/.test(doc.getElementById('gpChosen').textContent),
     'the tags carry the names', doc.getElementById('gpChosen').textContent.trim());
  const x = doc.querySelector('#gpChosen .gp-tag [data-gp-remove]');
  ok(!!x, 'each tag has a remove button');
  x.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ok(window.gpSelectionIds().length === ids.length - 1, 'removing a tag removes the person');
  ok(doc.querySelectorAll('#gpChosen .gp-tag').length === window.gpSelectionIds().length,
     'the tags and the selection stay the same size');

  console.log('--- search inside the dropdown ---');
  window.gpDropSelectAll();
  await sleep(150);
  ok(window.gpSelectionIds().length === 5, 'select-all picks everybody', window.gpSelectionIds().length + '');
  const sb = doc.getElementById('gpDropSearch');
  sb.value = 'مهدی';   // nobody
  window.gpDropRender();
  await sleep(120);
  ok(/پیدا نشد/.test(list.textContent), 'a name nobody has says so instead of listing everyone');
  sb.value = 'کریمی';
  window.gpDropRender();
  await sleep(120);
  const filtered = list.querySelectorAll('.gp-drop-row');
  ok(filtered.length === 1 && /رضا کریمی/.test(list.textContent), 'and a real name narrows to one row', filtered.length + ' rows');
  sb.value = '';
  window.gpDropRender();
  await sleep(120);

  console.log('--- closing ---');
  window.gpDropClose();
  await sleep(120);
  ok(panel.hidden === true, 'the panel closed');
  ok(btn.getAttribute('aria-expanded') === 'false', 'and the button says so');
  window.gpDropToggle();
  await sleep(200);
  window.gpDropClose();
  await sleep(100);

  console.log('--- the chips and the dropdown never disagree ---');
  // clear it the way the shop does: from inside the open panel
  window.gpDropToggle();
  await sleep(220);
  const clearBtn = Array.prototype.filter.call(
    doc.querySelectorAll('#gpDropPanel button'),
    (b) => /پاک کردن/.test(b.textContent))[0];
  ok(!!clearBtn, 'the panel has a clear button');
  clearBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  ok(window.gpSelectionIds().length === 0, 'clearing empties the selection',
     JSON.stringify(window.gpSelectionIds()));
  ok(doc.querySelectorAll('#gpChosen .gp-tag').length === 0, 'and clears the tags',
     String(doc.querySelectorAll('#gpChosen .gp-tag').length));
  const boxes = doc.querySelectorAll('#gpDropList input[type=checkbox]');
  ok(Array.prototype.every.call(boxes, (b) => !b.checked), 'and unchecks every row');
  const chipsOff = doc.querySelectorAll('#gpPicker .gp-chip input');
  ok(Array.prototype.every.call(chipsOff, (c) => !c.checked), 'and the chips too');
  window.gpDropClose();

  console.log('--- selecting in the dropdown also ticks the chips ---');
  window.gpDropToggle();
  await sleep(200);
  const r0 = doc.querySelector('#gpDropList .gp-drop-row');
  r0.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  const chips = doc.querySelectorAll('#gpPicker .gp-chip input');
  const chipOn = Array.prototype.filter.call(chips, (c) => c.checked);
  ok(chipOn.length === 1, 'the matching chip is ticked too', chipOn.length + ' of ' + chips.length);
  window.gpDropClose();

  console.log('--- a customer who is already playing is not offered ---');
  // the register holds everyone; the session list holds whoever is at a station
  window.clients = [
    { id: 2, customerId: 2, name: 'رضا کریمی', status: 'online', elapsed: 300, startTime: Date.now(), totalCost: 0 },
  ];
  window.gpDropToggle();
  await sleep(200);
  const names = doc.getElementById('gpDropList').textContent;
  ok(!/رضا کریمی/.test(names), 'someone mid-session is left out');
  ok(/مریم احمدی/.test(names), 'the others are still there');
  window.gpDropClose();
  window.clients = [];

  console.log('--- the register and the session list are different stores ---');
  /* The bug: the picker read window.clients, which is the dashboard's
     per-station rows, so it listed whoever was at a machine instead of the
     people in the register. Seed both stores with different names. */
  window.customers = [
    { id: 11, name: 'زهرا عضویت', phone: '09120000011', wallet: 0, debt: 0, totalHours: 3, totalSpent: 90000 },
    { id: 12, name: 'بهرام عضویت', phone: '09120000012', wallet: 0, debt: 0, totalHours: 5, totalSpent: 150000 },
  ];
  window.clients = [
    { id: 77, name: 'کاربر کارت', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
  ];
  window.gpClearPick();
  window.gpDropToggle();
  await sleep(250);
  const regNames = Array.prototype.map.call(
    doc.querySelectorAll('#gpDropList .gp-drop-row-name'), (e) => e.textContent.trim());
  ok(regNames.length === 2, 'it lists the register, not the session cards', regNames.join(' / '));
  ok(/زهرا عضویت/.test(regNames.join('|')) && /بهرام عضویت/.test(regNames.join('|')),
     'and those are the registered customers', regNames.join(' / '));
  ok(!/کاربر کارت/.test(regNames.join('|')),
     'the person who only has a session card is not listed', regNames.join(' / '));
  window.gpDropClose();

  console.log('--- search finds a customer by phone too ---');
  window.gpDropToggle();
  await sleep(200);
  doc.getElementById('gpDropSearch').value = '09120000012';
  window.gpDropRender();
  await sleep(150);
  ok(doc.querySelectorAll('#gpDropList .gp-drop-row').length === 1,
     'a phone number narrows to one row',
     String(doc.querySelectorAll('#gpDropList .gp-drop-row').length));
  doc.getElementById('gpDropSearch').value = '';
  window.gpDropRender();
  window.gpDropClose();

  // back to the main register for the rest of the file
  window.customers = [
    { id: 1, name: 'مریم احمدی', phone: '09121110001', wallet: 50000, debt: 0, totalHours: 12, totalSpent: 320000 },
    { id: 3, name: 'سارا محمدی', phone: '09121110003', wallet: 200000, debt: 0, totalHours: 30, totalSpent: 950000 },
    { id: 5, name: 'نگار رضایی', phone: '09121110005', wallet: 75000, debt: 0, totalHours: 4, totalSpent: 95000 },
  ];
  window.clients = [];

console.log('--- ending the session writes a row for every one of them ---');
  window.gpClearPick();
  await sleep(100);
  window.gpStart({ clientIds: ['1', '3', '5'], guestLabel: '', guestCount: 0 });
  await sleep(200);
  ok(window.gpSelectionSize() === 0,
     'starting a party clears the picker, so the next one cannot inherit it',
     String(window.gpSelectionSize()));
  ok(doc.querySelectorAll('#gpChosen .gp-tag').length === 0,
     'and the tags are cleared with it', String(doc.querySelectorAll('#gpChosen .gp-tag').length));
  const party = window.gpActive ? window.gpActive() : null;
  ok(party && party.members.length === 3, 'the party has three members',
     party ? party.members.length + ' members' : 'no party');
  ok(party && party.members.map((m) => m.name).sort().join(',') === ['سارا محمدی', 'مریم احمدی', 'نگار رضایی'].sort().join(','),
     'the three the dropdown had ticked', party ? party.members.map((m) => m.name).join(' / ') : '');

  // the timer has to actually run, or every recorded duration is zero.
  // active() re-reads the party from storage each time, so backdate it there.
  window.gpSetActive(Object.assign({}, window.gpActive(), {
    startedAt: Date.now() - 5400 * 1000, running: true,
  }));
  window.gpFinish();
  await sleep(400);

  const stored = JSON.parse(window.localStorage.getItem('alvand_groupSessions') || '[]');
  ok(stored.length === 3, 'one usage row per person was written', stored.length + ' rows');
  const names2 = stored.map((r) => r.clientName).sort();
  ok(names2.join('|') === ['مریم احمدی', 'سارا محمدی', 'نگار رضایی'].sort().join('|'),
     'the right three names', names2.join(' / '));
  ok(stored.every((r) => r.duration >= 5400), 'every row carries the elapsed time',
     stored.map((r) => r.duration).join(','));
  ok(stored.every((r) => r.headcount === 3), 'every row says how many people were there',
     stored.map((r) => r.headcount).join(','));
  const groupIds = new Set(stored.map((r) => r.groupId));
  ok(groupIds.size === 1, 'and they share one group id, so the party is one visit', [...groupIds].join(','));
  const billed = stored.filter((r) => r.billed);
  ok(billed.length === 1, 'exactly one row is billed', billed.length + ' billed');
  ok(billed[0].cost > 0, 'and it carries the money', String(billed[0].cost));
  ok(stored.filter((r) => !r.billed).every((r) => r.cost === 0), 'the others are marked free');

  console.log('--- each of them gets their own usage report ---');
  ['1', '3', '5'].forEach((id) => {
    const r = window.gpReport(id);
    ok(r.visits === 1, 'customer ' + id + ' has the session in their own report', r.visits + ' visit(s)');
    ok(r.totalSeconds >= 5400, 'customer ' + id + ' has the time', String(r.totalSeconds));
    ok(r.days.length === 1, 'customer ' + id + ' has one day', String(r.days.length));
  });
  const report = window.gpReport('3');
  ok(report.rows[0].headcount === 3, 'the report says they played as three');
  ok(report.rows[0].clientName === 'سارا محمدی', 'and names the person it belongs to');

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nPLAYER PICKER CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });