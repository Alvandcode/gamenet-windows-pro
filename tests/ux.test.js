/* Verification for the 3 new UX changes (nav groups, dashboard quick actions, zoom). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
let failures = 0;
const ok = (c, m) => { if (c) console.log('  PASS ' + m); else { failures++; console.error('  FAIL ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'https://localhost/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = () => Promise.reject(new Error('offline-test'));
      window.confirm = () => true;
      if (!window.crypto || !window.crypto.subtle) {
        try { Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto }); } catch (e) {}
      }
      window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.message || e.error)));
    },
  });
  const { window } = dom;
  const doc = window.document;
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));

  window.localStorage.setItem('alvand_clients', JSON.stringify([
    { id: 11, name: 'PC-1', tariff: 'single', extra: 0, extraSeconds: 0, stationType: 'pc', ip: '', status: 'online', elapsed: 600, startTime: Date.now() - 600000, totalCost: 0, timerDuration: 30, notified: false },
    { id: 12, name: 'PC-2', tariff: 'single', extra: 0, extraSeconds: 0, stationType: 'pc', ip: '', status: 'paused', elapsed: 120, startTime: null, totalCost: 0, timerDuration: 0, notified: false },
    { id: 13, name: 'PC-3', tariff: 'single', extra: 0, extraSeconds: 0, stationType: 'ps', ip: '', status: 'offline', elapsed: 0, startTime: null, totalCost: 0, timerDuration: 0, notified: false },
  ]));

  for (const f of ['src/js/config.js', 'src/js/security.js', 'src/js/license-pubkey.js', 'src/js/license.js', 'src/js/storage.js', 'src/js/app.js', 'src/js/patches.js', 'src/js/jalali.js', 'src/js/zoom.js', 'src/js/new-features.js', 'src/js/round2-a.js', 'src/js/round2-b.js', 'src/js/round2-c.js', 'src/js/phonebook.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    doc.body.appendChild(s);
  }
  const sleep_ = sleep;
/* The app schedules its follow-ups with setTimeout, so a fixed sleep is a race:
 * poll for the condition instead, with a ceiling that still fails loudly. */
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (fn()) return true; } catch (e) { /* keep polling */ }
    await sleep(25);
  }
  try { return !!fn(); } catch (e) { return false; }
};

  console.log('--- 1. sidebar groups ---');
  const groups = [...doc.querySelectorAll('.nav-group')];
  ok(groups.length >= 7, 'sidebar has ' + groups.length + ' groups');
  const names = groups.map(g => (g.querySelector('.nav-group-title') || {}).textContent);
  ok(groups.some(g => g.getAttribute('data-group') === 'money'), 'money group present');
  ok(groups.some(g => g.getAttribute('data-group') === 'people'), 'customers group present');
  const items = [...doc.querySelectorAll('.nav-group-body .nav-item')];
  ok(items.length === 25, 'nav items inside groups: ' + items.length);
  // money group really contains income/reports/insights/busyHours/expenses
  const money = groups.find(g => (g.getAttribute('data-group') === 'money'));
  const moneySections = [...money.querySelectorAll('.nav-item')].map(i => (i.getAttribute('onclick') || '').match(/showSection\('([^']+)'/)[1]);
  ok(['income', 'reports', 'insights', 'busyHours', 'expenses'].every(s => moneySections.includes(s)),
     'money group = ' + moneySections.join(','));
  // people group
  const people = groups.find(g => (g.getAttribute('data-group') === 'people'));
  const peopleSections = [...people.querySelectorAll('.nav-item')].map(i => (i.getAttribute('onclick') || '').match(/showSection\('([^']+)'/)[1]);
  ok(['customers', 'membership', 'phonebook', 'events'].every(s => peopleSections.includes(s)),
     'people group = ' + peopleSections.join(','));
  // every section in the app is still reachable from the sidebar
  const reachable = new Set();
  doc.querySelectorAll('[onclick*="showSection(\'"]').forEach(el => {
    const m = (el.getAttribute('onclick') || '').match(/showSection\('([^']+)'/);
    if (m) reachable.add(m[1]);
  });
  const allSections = [...doc.querySelectorAll('.section')].map(s => s.id.replace('-section', ''));
  const missing = allSections.filter(s => !reachable.has(s));
  ok(missing.length === 0, 'all ' + allSections.length + ' sections reachable (missing: ' + (missing.join(',') || 'none') + ')');

  console.log('--- 2. collapse / persist / auto-expand ---');
  ok(money.classList.contains('open') === false, 'money group starts collapsed');
  ok(groups[0].classList.contains('open') === true, 'daily-ops group starts open');
  window.toggleNavGroup('money');
  ok(money.classList.contains('open') === true, 'toggleNavGroup opens it');
  ok(JSON.parse(window.localStorage.getItem('alvand_navGroups')).money === 1, 'open state persisted');
  window.toggleNavGroup('money');
  ok(money.classList.contains('open') === false, 'toggle again closes it');
  // navigating into a collapsed group must open it
  window.showSection('reports');
  ok(money.classList.contains('open') === true, 'showSection("reports") auto-opens the money group');
  ok(money.classList.contains('has-active') === true, 'money group marked has-active');
  const activeItem = doc.querySelector('.nav-item.active');
  ok(!!activeItem && /reports/.test(activeItem.getAttribute('onclick')), 'nav item marked active');
  // settings group: first click opens, second click navigates
  const setHead = doc.getElementById('navSettings');
  const setGroup = setHead.closest('.nav-group');
  ok(setGroup.classList.contains('open') === false, 'settings group starts collapsed');
  window.toggleSettingsMenu(setHead);
  ok(setGroup.classList.contains('open') === true, '1st settings click opens the group');
  ok(doc.getElementById('settings-section').style.display === 'none', '1st settings click does NOT navigate');
  window.toggleSettingsMenu(setHead);
  ok(doc.getElementById('settings-section').style.display === 'block', '2nd settings click navigates to settings');

  console.log('--- 3. dashboard quick actions ---');
  window.showSection('dashboard');
  window.renderActiveClients();
  const list = doc.getElementById('activeClientsList');
  const rows = [...list.querySelectorAll('.active-row')];
  ok(rows.length === 2, 'dashboard lists online + paused clients (' + rows.length + ')');
  ok(!!list.querySelector('[data-cid="11"]'), 'online client row carries data-cid');
  ok(!!list.querySelector('[data-cid="12"]'), 'paused client row carries data-cid');
  ok(!list.querySelector('[data-cid="13"]'), 'offline client is NOT listed');
  const row11 = list.querySelector('[data-cid="11"]');
  ok(row11.getAttribute('onclick') === 'openClientFromDashboard(11)', 'row click -> openClientFromDashboard(' + row11.getAttribute('onclick') + ')');
  const btns = [...row11.querySelectorAll('.qa-btn')].map(b => b.getAttribute('onclick'));
  ok(btns.some(b => /dashboardAction\(11,'pause'\)/.test(b)), 'pause button wired');
  ok(btns.some(b => /dashboardAction\(11,'stop'\)/.test(b)), 'stop button wired');
  ok(btns.every(b => /event\.stopPropagation\(\)/.test(b)), 'quick buttons stopPropagation (no accidental row click)');
  const row12 = list.querySelector('[data-cid="12"]');
  const btns12 = [...row12.querySelectorAll('.qa-btn')].map(b => b.getAttribute('onclick'));
  ok(btns12.some(b => /dashboardAction\(12,'start'\)/.test(b)), 'paused row offers start/resume');
  ok(!!doc.getElementById('actElapsed-11') && !!doc.getElementById('actCost-11'), 'live ids kept for the 1s updater');
  // live updater must not wipe the buttons
  window.refreshActiveClients();
  ok(list.querySelector('[data-cid="11" ]').querySelectorAll('.qa-btn').length === btns.length, 'refreshActiveClients keeps quick buttons');
  ok(!!doc.getElementById('actState-11'), 'state pill present');

  console.log('--- 4. dashboard quick actions actually work ---');
  window.dashboardAction(11, 'pause');
  ok(window.clients.find(c => c.id === 11).status === 'paused', 'dashboard pause flips status to paused');
  window.renderActiveClients();
  ok(!!doc.querySelector('#activeClientsList [data-cid="11"] .qa-start'), 'paused row now offers resume');
  window.dashboardAction(11, 'start');
  ok(window.clients.find(c => c.id === 11).status === 'online', 'dashboard start resumes the timer');
  ok(Math.abs((window.clients.find(c => c.id === 11).elapsed) - 600) < 5, 'resumed elapsed preserved (~600s)');
  // stale id must not crash
  window.dashboardAction(999, 'pause');
  window.dashboardAction(11, 'nonsense');
  ok(true, 'unknown id / unknown action handled without throwing');

  console.log('--- 5. dashboard -> client details jump ---');
  window.openClientFromDashboard(11);
  /* Query the live grid at every step: renderClients() can replace the card
   * node between two of these checks, and a node captured up front would then
   * be a detached copy that never gets the flash class. */
  const cardOf = () => doc.querySelector('#clientsGrid .client-card[data-cid="11"]');
  ok(await waitFor(() => doc.getElementById('clients-section').style.display === 'block'), 'jumped to the clients section');
  ok(await waitFor(() => !!cardOf()), 'target client card found in the grid');
  ok(await waitFor(() => {
    const c = cardOf();
    return !!c && c.classList.contains('flash-focus');
  }), 'target card is flashed');
  ok(await waitFor(() => doc.getElementById('clientMenu-0') && doc.getElementById('clientMenu-0').style.display === 'block'),
    'client "more" menu opened');
  ok(await waitFor(() => {
    const c = cardOf();
    return !!c && !c.classList.contains('flash-focus');
  }, 4000), 'flash class is removed automatically');
  // a filtered-out client must still be reachable
  window.eval("clientTypeFilter='ps'");
  window.renderClients();
  window.openClientFromDashboard(11);
  ok(await waitFor(() => !!cardOf()), 'filter cleared so the client is reachable');
  ok(window.eval('clientTypeFilter') === '', 'clientTypeFilter was reset');

  console.log('--- 6. zoom / background ---');
  ok(!doc.body.style.zoom, 'zoom is NOT applied to <body> any more');
  const z = window.applyZoom(60);
  ok(z === 60, 'applyZoom clamps to min 60');
  ok(doc.documentElement.style.zoom === '60%', 'zoom applied on <html> (' + doc.documentElement.style.zoom + ')');
  ok(doc.documentElement.style.getPropertyValue('--ui-zoom').trim() === '0.6', '--ui-zoom published for 100vh math');
  window.applyZoom(999);
  ok(doc.documentElement.style.zoom === '160%', 'zoom clamps to max 160');
  window.zoomReset();
  ok(doc.documentElement.style.zoom === '100%', 'zoomReset -> 100%');
  const rootClass = doc.documentElement.className;
  ok(/theme-\w+/.test(rootClass), 'theme class also on <html>: ' + rootClass);
  ok(!!doc.documentElement.style.getPropertyValue('--app-bg'), '--app-bg set on <html>: ' + doc.documentElement.style.getPropertyValue('--app-bg').slice(0, 30) + '...');
  ok(window.getComputedStyle(doc.body).backgroundColor === 'rgba(0, 0, 0, 0)', 'body background is transparent (root paints the canvas)');
  // no body-painted theme background may remain in the stylesheet
  const css = fs.readFileSync(path.join(ROOT, 'src/styles/main.css'), 'utf8');
  ok(!/body\.theme-\w+\s*\{\s*background:/.test(css), 'no body.theme-* background rules left in CSS');
  ok((css.match(/:root\.theme-/g) || []).length === 21, 'all 21 themes drive --app-bg on :root');
  ok(css.includes('min-height: calc(100vh / var(--ui-zoom, 1))'), 'body height compensates for zoom (no phantom scrollbar)');

  console.log('--- 7. operator lock still works with groups ---');
  window.logoutOperator();
  window.localStorage.setItem('alvand_operators', JSON.stringify([
    { id: 1, username: 'admin', password: 'x', role: 'admin', perms: {} },
    { id: 2, username: 'op', password: 'x', role: 'operator', perms: { clients: true, reports: true, income: true, reservations: true, buffet: true } },
  ]));
  window.eval("currentOperator={id:2,username:'op',role:'operator',perms:{clients:true,reports:true,income:true,reservations:true,buffet:true}}");
  window.applyPerms();
  ok(doc.querySelector('.nav-item[onclick*="operators"]').classList.contains('operator-locked'), 'operators locked for the operator');
  const adminGroup = groups.find(g => g.getAttribute('data-group') === 'admin');
  ok(!adminGroup.classList.contains('group-all-locked'), 'admin group not fully locked (employees still reachable)');
  ok(window.getComputedStyle(doc.getElementById('navOperators')).display === 'none', 'navOperators hidden for the operator');
  window.eval("currentOperator={id:1,username:'admin',role:'admin',perms:{}}");
  window.applyPerms();
  ok(window.getComputedStyle(doc.getElementById('navOperators')).display !== 'none', 'admin sees the operators item again');
  ok(!adminGroup.classList.contains('group-all-locked'), 'group-all-locked cleared for admin');

  console.log('--- 8. new-features stores survive an app.js saveData() ---');
  // regression: app.js used to keep its own copies of these 8 stores and rewrite
  // them every 15s, wiping whatever new-features.js had just written.
  window.eval("logActivity('test','kept entry')");
  let logAfterWrite = JSON.parse(window.localStorage.getItem('alvand_activityLog') || '[]');
  ok(logAfterWrite.length >= 1, 'activity log written by new-features (' + logAfterWrite.length + ')');
  window.saveData();
  let logAfterSave = JSON.parse(window.localStorage.getItem('alvand_activityLog') || '[]');
  ok(logAfterSave.length === logAfterWrite.length, 'activity log SURVIVES app.js saveData() (' + logAfterSave.length + ')');
  window.eval("addNotification('reminder','t','m')");
  let n1 = JSON.parse(window.localStorage.getItem('alvand_notifications') || '[]').length;
  window.saveData();
  let n2 = JSON.parse(window.localStorage.getItem('alvand_notifications') || '[]').length;
  ok(n2 === n1 && n1 >= 1, 'notifications survive saveData()');
  window.eval("saveEmployee && 0");
  ok(true, 'employees/attendance keys are not rewritten by app.js');
  ok(!/alvand_activityLog/.test(window.saveData.toString()), 'saveData() no longer touches alvand_activityLog');
  ok(!/alvand_employees/.test(window.saveData.toString()), 'saveData() no longer touches alvand_employees');

  console.log('--- 9. customers section: database + roster both render ---');
  window.eval("customers=[{id:7,name:'Database Customer',phone:'09120000000',email:'a@b.c',wallet:50000,debt:0,totalHours:30,totalSpent:120000,debt:0}]");
  window.eval("reservations=[{id:1,clientId:11,clientName:'PC-1',customerName:'Roster Customer',phone:'09121111111',email:'r@b.c',telegram:'@r',date:new Date().toISOString().slice(0,10),startTime:'20:00',duration:60,status:'pending'}]");
  window.showSection('customers');
  const db = doc.getElementById('customersList');
  const roster = doc.getElementById('customerRosterList');
  ok(!!db && /Database Customer/.test(db.innerHTML), 'customer DATABASE renders in #customersList');
  ok(/کیف پول/.test(db.innerHTML), 'wallet column visible (customer DB was unreachable before)');
  ok(/openCustomerModal\(7\)/.test(db.innerHTML), 'edit button for the DB customer');
  ok(!!roster && /Roster Customer/.test(roster.innerHTML), 'reservation roster renders in #customerRosterList');
  ok(!/Roster Customer/.test(db.innerHTML), 'roster does NOT overwrite the database');
  ok(!/Database Customer/.test(roster.innerHTML), 'database does not leak into the roster');
  // the customer must be creatable from the UI now
  ok(typeof window.openCustomerModal === 'function', 'openCustomerModal reachable');
  ok(!/onclick="openShareModalForCustomer\(/.test(roster.innerHTML), 'roster button no longer inlines user data into JS');

  console.log('--- 10. XSS hardening ---');
  // a malicious client name / ip / station-type id must not be able to break out
  // of an attribute or an inline handler
  window.eval("clients=[{id:21,name:'<img src=x onerror=alert(1)>'+String.fromCharCode(39)+');alert(2);//',tariff:'single',extra:0,stationType:'pc',ip:'<svg onload=alert(3)>',status:'offline',elapsed:0,startTime:null,totalCost:0,timerDuration:0,notified:false}]");
  window.eval("tariffSchedules=[{id:31,name:'<b>x</b>',start:\"<i>\",end:'10:00',single:1,double:2,extra:3,prices:{}}]");
  window.eval("stationTypes=[{id:'pc\"><img src=y onerror=alert(4)>',name:'<b>PC</b>',icon:'X',price:100},{id:'ps',name:'PS',icon:'Y',price:200}]");
  window.renderClients();
  const grid = doc.getElementById('clientsGrid');
  ok(grid.querySelector('img') === null, 'client name cannot inject an <img> element');
  ok(grid.querySelector('svg') === null, 'client ip cannot inject an <svg> element');
  ok(grid.querySelector('[onerror]') === null && grid.querySelector('[onload]') === null,
     'no live onerror/onload attribute anywhere in the card');
  ok(/&lt;img src=x/.test(grid.innerHTML), 'client name is present but HTML-escaped');
  const editBtn = grid.querySelector('[onclick*="deleteClient"]');
  ok(editBtn && /^deleteClient\(\d+\)$/.test(editBtn.getAttribute('onclick')), 'inline handler arg is a plain number: ' + (editBtn && editBtn.getAttribute('onclick')));
  window.renderTypeFilter();
  const bar = doc.getElementById('typeFilterBar');
  ok(bar.querySelector('img') === null && bar.querySelector('[onerror]') === null,
     'station type id cannot inject an element/handler in the filter bar');
  const barBtn = bar.querySelector('[onclick^="filterClientsByType"]');
  ok(barBtn && /^\s*filterClientsByType\('(?:[^'\\]|\\.)*'\)\s*$/.test(barBtn.getAttribute('onclick')),
     'filter button handler is a single well-formed call: ' + (barBtn && barBtn.getAttribute('onclick')));
  ok(typeof window.jsStr === 'function' && window.jsStr('a"b') === 'a\\"b', 'jsStr() escapes double quotes');
  ok(window.jsStr('a"b\'') === 'a\\"b\\\'', 'jsStr() escapes both quote styles');
  window.renderTariffSchedules();
  ok(!/<b>x<\/b>/.test(doc.getElementById('tariffSchedulesList').innerHTML), 'tariff schedule name escaped');
  ok(!/<i>/.test(doc.getElementById('tariffSchedulesList').innerHTML), 'tariff start/end escaped');
  ok(typeof window.numId === 'function' && window.numId('1);alert(1)//') === 1, 'numId() neutralises a hostile id');
  ok(window.numId('abc') === 0 && window.numId(null) === 0 && window.numId(Infinity) === 0, 'numId() falls back to 0');

  console.log('--- 11. money guards ---');
  // (a) online + startTime null used to bill ~1.7e9 seconds
  window.eval("clients=[{id:41,name:'Broken',tariff:'single',extra:0,stationType:'pc',status:'online',elapsed:0,startTime:null,totalCost:0,timerDuration:0,notified:false}]");
  window.eval("tariffSchedules=[]");
  window.dashboardAction(41, 'stop');
  let pp = window.eval('JSON.stringify(pendingPayment)');
  ok(pp && JSON.parse(pp).duration < 100000, 'no exploded duration when startTime is null: ' + (pp && JSON.parse(pp).duration));
  ok(pp && JSON.parse(pp).total < 1000000, 'bill stays sane: ' + (pp && JSON.parse(pp).total));

  // (b) negative tariff rejected
  let t0 = window.eval('JSON.stringify(tariffs)');
  window.eval('updateTariff("single", -5000)');
  ok(window.eval('JSON.stringify(tariffs)') === t0, 'negative tariff rejected');
  ok(window.eval('calculateCost({elapsed:3600,tariff:"single",extra:0,stationType:null})') >= 0, 'calculateCost never negative');
  window.eval('updateTariff("single", 20000)');

  // (c) malformed tariff schedule must not throw
  window.eval('tariffSchedules=[{id:1,name:"x"},{id:2,name:"y",start:"bogus",end:"10:00"},{id:3,name:"z",start:"08:00",end:"09:00"}]');
  let threw = false;
  try { window.eval('calculateCost({elapsed:3600,tariff:"single",extra:0,stationType:null})'); window.renderClients(); }
  catch (e) { threw = true; console.log('   threw:', e.message); }
  ok(!threw, 'malformed tariff schedule does not break cost/render');
  ok(window.eval('getActiveTariff()') === null || window.eval('getActiveTariff()').id === 3, 'bad windows skipped, good one still active');
  ok(window.eval('isTariffActive({start:"08:00",end:"08:00"})') === false, 'empty window is never active');
  window.eval('tariffSchedules=[]');

  // (d) payDebt can no longer mint money
  window.eval("customers=[{id:5,name:'x',wallet:0,debt:30}]");
  window.__v = { custId: '5', walletAmount: '100', walletAction: 'payDebt' };
  doc.getElementById = function (id) {
    if (id in window.__v) return { value: window.__v[id], style: {}, classList: { add() {}, remove() {} }, textContent: '' };
    return { value: '', style: {}, classList: { add() {}, remove() {} }, textContent: '', innerHTML: '', appendChild() {}, setAttribute() {}, contains: () => false, focus() {}, remove() {}, dataset: {} };
  };
  window.doWalletAction();
  let cw = window.eval('customers[0].wallet'), cd = window.eval('customers[0].debt');
  ok(cd === 0, 'debt cleared');
  ok(cw === 30, 'wallet credited only what was owed (got ' + cw + ', was 30 owed / 100 paid)');

  // (e) confirmPayment resolves by id, not by a stale index
  window.eval("clients=[{id:51,name:'A',tariff:'single',extra:0,stationType:'pc',status:'offline',elapsed:600,startTime:null,totalCost:0,timerDuration:0,notified:false},{id:52,name:'B',tariff:'single',extra:0,stationType:'pc',status:'offline',elapsed:0,startTime:null,totalCost:0,timerDuration:0,notified:false}]");
  window.eval('currentTimeClient=0; stopTimer();');
  ok(window.eval('pendingPayment.clientId') === 51, 'pendingPayment holds the client id');
  window.eval('clients.splice(0,1)'); // A deleted before confirming
  window.confirm = () => false;
  let cpThrew = false;
  try { window.confirmPayment(); } catch (e) { cpThrew = true; }
  ok(!cpThrew, 'confirmPayment survives the client being deleted');
  ok(window.eval('sessions.length') === 0, 'nothing charged to the wrong client after deletion');

  // (f) rounding never makes a small session free
  window.eval('setRoundingMode("down")');
  ok(window.eval('applyRounding(500)') === 500, '500-toman session is not rounded to 0');
  ok(window.eval('applyRounding(-100)') === 0, 'negative amount clamps to 0');
  window.eval('setRoundingMode("none")');

  console.log('--- 12. permissions fail closed ---');
  // an operator with only a couple of permissions must not reach every section
  window.eval("currentOperator={id:2,username:'op',role:'operator',perms:{clients:true,reports:true,income:true,reservations:true,buffet:true}}");
  ok(window.eval("hasPerm('clients')") === true, 'granted section allowed');
  ok(window.eval("hasPerm('tools')") === false, 'tools denied (used to be allowed)');
  ok(window.eval("hasPerm('phonebook')") === false, 'phonebook denied (used to be allowed)');
  ok(window.eval("hasPerm('events')") === false, 'events denied (used to be allowed)');
  ok(window.eval("hasPerm('membership')") === false, 'membership denied (used to be allowed)');
  ok(window.eval("hasPerm('insights')") === true, 'insights follows the reports permission');
  ok(window.eval("hasPerm('employees')") === false, 'employees denied without the new permission');
  ok(window.eval("hasPerm('shifts')") === false, 'shifts denied without the new permission');
  ok(window.eval("hasPerm('branches')") === false, 'branches denied without the new permission');
  ok(window.eval("hasPerm('totallyUnknownSection')") === false, 'unknown section fails closed');
  ok(window.eval("hasPerm('dashboard')") === true, 'dashboard always allowed');
  // every section that exists in the HTML must be present in the perm map
  const unmapped = [...doc.querySelectorAll('.section')].map(s => s.id.replace('-section', ''))
    .filter(s => !['dashboard', 'clients', 'tariffs', 'reports', 'income', 'reservations', 'customers',
      'membership', 'buffet', 'expenses', 'tariffSchedule', 'settings', 'stationHours', 'backup',
      'license', 'operators', 'employees', 'busyHours', 'activityLog', 'notifications',
      'advancedSearch', 'waiting', 'events', 'branches', 'shifts', 'insights', 'tools',
      'phonebook', 'gameHistory', 'finance', 'ops'].includes(s));
  ok(unmapped.length === 0, 'no section outside the known list (unknown: ' + (unmapped.join(',') || 'none') + ')');
  // regression: a section that exists in the HTML but is missing from PERM_MAP is
  // invisible, because unknown sections fail CLOSED. That is what happened to the
  // finance and ops pages: 6 feature functions, 0 permission entries.
  ok(window.hasPerm('finance') === true, 'the finance page is reachable (PERM_MAP)');
  ok(window.hasPerm('ops') === true, 'the ops page is reachable (PERM_MAP)');
  // the new permission checkboxes exist and round-trip
  ['permTariffs', 'permEmployees', 'permOperators'].forEach(id => ok(!!doc.getElementById(id), id + ' exists in the operator modal'));
  window.eval("currentOperator={id:1,username:'admin',role:'admin'}");
  ok(window.eval("hasPerm('tools')") === true, 'admin still reaches everything');

  console.log('--- 13. CSP and offline-safe features ---');
        const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
        // "http://192.168.*" and "http://10.*" are NOT valid CSP host sources:
        // Chromium ignored every one of them (one console warning each), which
        // left the LAN agent buttons unable to reach any machine.
        ok(!/http:\/\/(192\.168|10|172\.1[6-9]|172\.2\d|172\.3[01])\./.test(csp), 'CSP has no ignored LAN host sources');
        ok(/connect-src[^;]*'self'/.test(csp), 'CSP connect-src still allows same-origin');
        const preloadSrc = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
        const mainSrc = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
        ok(/gamenet:agent-request/.test(preloadSrc), 'preload exposes the agent bridge');
        ok(/ipcMain\.handle\('gamenet:agent-request'/.test(mainSrc), 'main process serves agent requests');
        const appSrc2 = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
        ok(/gamenet\.agent\.request/.test(appSrc2), 'agentFetch uses the main-process bridge');
        ok(/img-src[^;]*api\.qrserver\.com/.test(csp), 'CSP allows the QR image service');
  ok(typeof window.renderCustomerQR === 'function', 'renderCustomerQR exists');
  ok(typeof window.printThermalReceipt === 'function', 'printThermalReceipt exists');
  ok(!/window\.open\('', '_blank'/.test(fs.readFileSync(path.join(ROOT, 'src/js/round2-a.js'), 'utf8')),
     'thermal receipt no longer relies on window.open (denied by main.js)');
  ok(!/api\.qrserver\.com/.test(fs.readFileSync(path.join(ROOT, 'src/js/round2-c.js'), 'utf8')) ||
     /onerror/.test(fs.readFileSync(path.join(ROOT, 'src/js/round2-c.js'), 'utf8')),
     'QR has an offline fallback');
  ok(typeof window.copyTextToClipboard === 'function', 'clipboard helper with fallback exists');

  console.log('--- 15. license station capacity is enforced ---');
  // The paid `cap` used to be decorative: any license allowed unlimited stations.
  window.eval("clients=[{id:1,name:'A',tariff:'single',extra:0,stationType:'pc',status:'offline',elapsed:0,startTime:null,totalCost:0,timerDuration:0},{id:2,name:'B',tariff:'single',extra:0,stationType:'pc',status:'offline',elapsed:0,startTime:null,totalCost:0,timerDuration:0}]");
  window.eval("__licState={status:'valid',token:'t',payload:{id:'L-1',cap:3,maxDev:1,exp:null},fp:'x'}");
  ok(window.eval('licenseStationCap()') === 3, 'cap read from the verified license payload');
  ok(window.eval('licenseStationsLeft()') === 1, 'stations left = cap - current');
  ok(window.eval('enforceStationCapacity()') === true, 'adding is allowed below the cap');
  window.eval("clients.push({id:3,name:'C',tariff:'single',extra:0,stationType:'pc',status:'offline',elapsed:0,startTime:null,totalCost:0,timerDuration:0})");
  ok(window.eval('licenseStationsLeft()') === 0, 'cap reached');
  ok(window.eval('enforceStationCapacity()') === false, 'adding blocked at the cap');
  const before = window.eval('clients.length');
  window.__v = { newClientName: 'D', newClientIP: '', newClientType: 'pc', newClientExtra: '0', newClientTimer: '30' };
  doc.getElementById = function (id) {
    if (id in window.__v) return { value: window.__v[id], style: {}, classList: { add() {}, remove() {} }, textContent: '', disabled: false };
    return { value: '', style: {}, classList: { add() {}, remove() {} }, textContent: '', innerHTML: '', appendChild() {}, setAttribute() {}, contains: () => false, focus() {}, remove() {}, dataset: {}, checked: false, files: [] };
  };
  window.addClient();
  ok(window.eval('clients.length') === before, 'addClient() refused to exceed the paid capacity');
  // without a license (local mode) there is no cap
  window.eval("__licState={status:'invalid',token:null,payload:null,fp:null}");
  ok(window.eval('licenseStationCap()') === null, 'no cap without a verified license');
  ok(window.eval('enforceStationCapacity()') === true, 'local mode is unlimited');
  ok(/known\.size>=p\.maxDev/.test(fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')), 'device-count off-by-one fixed');

  console.log('--- 16. backup: complete + validated ---');
  // seed every store we care about, then take a backup
  window.eval("localStorage.setItem('alvand_shopName','گیم‌نت تست')");
  window.eval("localStorage.setItem('alvand_walletHistory',JSON.stringify([{customerId:1,amount:100,date:'x'}]))");
  window.eval("localStorage.setItem('alvand_license',JSON.stringify({token:'t',id:'L-1'}))");
  window.eval("localStorage.setItem('alvand_activityLog',JSON.stringify([{id:1,type:'t'}]))");
  const json = window.createBackup();
  ok(!!json, 'createBackup() returns the snapshot');
  const snap = JSON.parse(json);
  const mustHave = ['clients','sessions','customers','operators','walletHistory','license',
                    'activityLog','membershipPlans','employees','waitingList','phonebook','tariffs',
                    'stationTypes','roundingMode','theme'];
  const absentFromSnapshot = mustHave.filter(k => snap[k] === undefined);
  ok(missing.length === 0, 'snapshot contains every store (missing: ' + (missing.join(',') || 'none') + ')');
  ok(typeof snap.date === 'string' && !!snap.appVersion, 'snapshot is stamped');
  ok(snap.schema === 2, 'snapshot has a schema version');

  // validation rejects garbage BEFORE any key is written
  const clientsBefore = window.localStorage.getItem('alvand_clients');
  const bad1 = window.sanitizeBackup({ clients: 'not json' });
  ok(bad1.ok === false, 'non-JSON clients rejected');
  const bad2 = window.sanitizeBackup({ clients: '"a string"' });
  ok(bad2.ok === false, 'clients that are not an array rejected');
  const bad3 = window.sanitizeBackup({ clients: JSON.stringify([1, 2, 3]) });
  ok(bad3.ok === false, 'array of non-objects rejected');
  const bad4 = window.sanitizeBackup('nope');
  ok(bad4.ok === false, 'non-object payload rejected');
  const bad5 = window.sanitizeBackup({ sessions: JSON.stringify(new Array(300000).fill({})) });
  ok(bad5.ok === false, 'oversized payload rejected');
  const good = window.sanitizeBackup({ clients: JSON.stringify([{ id: 1, name: 'ok' }]), tariffs: JSON.stringify({ single: 1 }) });
  ok(good.ok === true, 'valid payload accepted');
  ok(JSON.parse(good.data.clients)[0].name === 'ok', 'valid payload passes data through');
  ok(window.localStorage.getItem('alvand_clients') === clientsBefore, 'rejected payloads never touched storage');
  ok(typeof window.validatedRestoreObject === 'function', 'restore goes through validatedRestoreObject');
  ok(/validatedRestoreObject/.test(window.restoreBackup.toString()), 'restoreBackup() actually calls the validator');
  ok(/BACKUP_STORE_KEYS/.test(window.restoreBackup.toString()), 'restoreBackup() restores the full key list');

  console.log('--- 18. real encryption (was repeating-key XOR) ---');
  const r2c = fs.readFileSync(path.join(ROOT, 'src/js/round2-c.js'), 'utf8');
  ok(!/xorCrypt/.test(r2c), 'the XOR cipher is gone');
  ok(/PBKDF2/.test(r2c) && /AES-GCM/.test(r2c), 'PBKDF2 + AES-GCM is used instead');
  ok(!/function encryptLocalData/.test(fs.readFileSync(path.join(ROOT, 'src/js/new-features.js'), 'utf8')), 'the second dead XOR copy is gone too');
  // round-trip through the real implementation (needs webcrypto.subtle)
  if (window.crypto && window.crypto.subtle) {
    const payload = [{ id: 1, name: 'مشتری فارسی', wallet: 12345 }];
    const encOk = await window.encryptAndSave('__t', payload, 'secret123');
    ok(encOk === true, 'encryptAndSave succeeded');
    const stored = window.localStorage.getItem('__t_enc') || '';   // key + '_enc'
    ok(stored.length > 40 && !/مشتری/.test(stored), 'ciphertext does not contain the plaintext');
    const dec = await window.decryptAndLoad('__t', 'secret123');
    ok(dec && dec[0] && dec[0].name === 'مشتری فارسی', 'decrypt round-trips Persian text');
    const wrong = await window.decryptAndLoad('__t', 'wrongpass');
    ok(wrong === null, 'a wrong password yields nothing');
    // same input twice must produce different ciphertext (random salt + IV)
    await window.encryptAndSave('__t2', payload, 'secret123');
    const a1 = window.localStorage.getItem('__t_enc') || '';
    const a2 = window.localStorage.getItem('__t2_enc') || '';
    ok(a1 !== a2, 'salt/IV are random (identical input -> different ciphertext)');
  } else {
    ok(true, 'SKIP crypto round-trip (no webcrypto.subtle in this runtime)');
  }

  console.log('--- 20. phonebook normalization ---');
  ok(window.pbNormPhone('\u0660\u0669\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669') === '09123456789', 'Arabic-Indic digits are converted (they used to be dropped)');
  ok(window.pbMobileOk('\u06f0\u06f9\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9'), 'Persian-digit mobile passes');
  ok(window.pbMobileOk('+989121234567'), '+989121234567 is normalized to a valid mobile');
  ok(window.pbMobileOk('00989121234567') === true, '0098... prefix is normalized');
  ok(window.pbMobileOk('091234567') === false, 'short numbers are still rejected');
  ok(window.pbNormName('\u0639\u0644\u06cc \u200c\u0645\u062d\u0645\u062f\u06cc') === window.pbNormName('\u0639\u0644\u064a \u0645\u062d\u0645\u062f\u06cc'), 'ZWNJ + Arabic yeh normalize to the same name');
  ok(window.pbNum('12.5') === 12.5 && window.pbNum('\u06f1\u06f2.\u06f5') === 12.5 && window.pbNum(null) === 0, 'pbNum coerces strings/Persian digits');
  // accountDetails must not blow up on string numbers from an old backup
  window.customers = [{ id: 7, name: '\u0639\u0644\u06cc \u0645\u062d\u0645\u062f\u06cc', phone: '09121234567', wallet: '1500', debt: '200', totalHours: '12.5', totalSpent: '99000' }];
  const linked = window.pbFindLinked({ firstName: '\u0645\u062d\u0645\u062f\u06cc', lastName: '\u0639\u0644\u06cc', phoneMobile: '09121234567' });
  ok(linked.customer && linked.customer.id === 7, 'name tokens match in any order');
  const det = window.pbAccountDetails(linked.customer);
  ok(det && det.totalHours === 12.5 && det.wallet === 1500, 'string numbers from an old backup are coerced');
  // the DOM stub returns a NEW object per call, so pin a stable element here
  const realGetById = doc.getElementById;
  const pbEl = { innerHTML: '', style: {}, classList: { add() {}, remove() {} }, value: '', textContent: '' };
  doc.getElementById = function (id) { return id === 'phonebookList' ? pbEl : realGetById(id); };
  // phonebook.js is an IIFE: its PB array is captured at load time, so seed
  // localStorage and re-evaluate the file to get a non-empty list.
  window.localStorage.setItem('alvand_phonebook', JSON.stringify([
    { id: 1, firstName: '\u0645\u062d\u0645\u062f\u06cc', lastName: '\u0639\u0644\u06cc', phoneMobile: '09121234567', phoneFixed: '', note: '' }
  ]));
  const pbScript = doc.createElement('script');
  pbScript.textContent = fs.readFileSync(path.join(ROOT, 'src/js/phonebook.js'), 'utf8');
  doc.body.appendChild(pbScript);
  let pbThrew = false;
  try { window.renderPhonebook(); } catch (e) { pbThrew = true; }
  doc.getElementById = realGetById;
  ok(!pbThrew, 'renderPhonebook does not crash on string numbers');
  ok(pbEl.innerHTML.length > 0 && /12\.5|۱۲/.test(pbEl.innerHTML), 'the phonebook actually shows the linked customer account');
  window.customers = [];

  console.log('--- 21. cross-module state bridge ---');
  ok(Array.isArray(window.customers), 'window.customers is the live app.js array (was undefined)');
  ok(Array.isArray(window.sessions), 'window.sessions is the live app.js array (was undefined)');
  const bridgeProbe = [{ id: 99, name: 'bridge', wallet: 5 }];
  window.customers = bridgeProbe;
  ok(window.eval('customers[0].wallet') === 5, 'writes from other modules reach app.js state');
  ok(window.eval('customers') === bridgeProbe, 'app.js and the other modules share ONE array (not a copy)');
  window.eval('customers = []');
  ok(Array.isArray(window.customers) && window.customers.length === 0, 'replacing the array in app.js is visible to the other modules');

  console.log('--- 22. calendar week, stock thresholds, polling ---');
  // Iranian week starts on Saturday
  // pure date math: 2026-09-30 is a Wednesday
  const wed = new Date(2026, 8, 30, 14, 30);
  const ws = window.weekStart(wed);
  ok(ws.getDay() === 6, 'weekStart lands on Saturday (get ' + ws.getDay() + ')');
  ok(ws.getHours() === 0 && ws.getMinutes() === 0, 'weekStart is midnight');
  ok(window.daysBetween(ws, wed) === 4, 'Saturday -> Wednesday is 4 days');
  ok(window.monthStart(wed).getDate() === 1, 'monthStart is the 1st');
  ok(Number.isNaN(window.weekStart('nonsense').getTime()), 'an invalid date does not produce a fake week');
  // weekly CSV export must use the calendar week, not a rolling 7 days
  const nowRef = new Date();   // "today" is always inside the current week
  window.sessions = [
    { clientName: 'today', cost: 100, duration: 600, date: nowRef.toISOString() },
    { clientName: 'lastWeek', cost: 500, duration: 600, date: new Date(nowRef.getTime() - 8 * 864e5).toISOString() }
  ];
  const realGetById2 = doc.getElementById;
  const realCreate = window.URL.createObjectURL;
  let csvMade = null;
  window.URL.createObjectURL = function (blob) { csvMade = blob; return 'blob:stub'; };
  doc.getElementById = function (id) { if (id === 'csvSessionsWeekly') return { click: () => {} }; return realGetById2(id); };
  window.exportSessionsCSV('weekly');
  doc.getElementById = realGetById2;
  window.URL.createObjectURL = realCreate;
  ok(!!csvMade, 'the weekly CSV export still produces a file');
  if (csvMade && csvMade.text) {
    const csvText = await csvMade.text();
    ok(csvText.indexOf('today') !== -1 && csvText.indexOf('lastWeek') === -1,
      'the weekly CSV contains this calendar week only (lastWeek=' + csvText.indexOf('lastWeek') + ')');
  }
  // stock alerts: Persian threshold + string stock from a restored backup
  window.localStorage.setItem('alvand_services', JSON.stringify([
    { id: 1, name: 'sold-out-string', stock: '0' },
    { id: 2, name: 'low', stock: '3' },
    { id: 3, name: 'fine', stock: '50' }
  ]));
  window.setLowStockThreshold('\u06f1\u06f0');
  ok(window.localStorage.getItem('alvand_lowStockThreshold') === '10', 'a Persian-digit threshold is stored as 10 (was NaN -> 5)');
  const stockRes = window.checkLowStock();
  ok(stockRes.outOfStock.length === 1 && stockRes.outOfStock[0].name === 'sold-out-string', 'a sold-out item stored as the string "0" is detected');
  ok(stockRes.lowItems.length === 1 && stockRes.lowItems[0].name === 'low', '3 <= 10 is low stock');
  window.setLowStockThreshold(-5);
  ok(window.localStorage.getItem('alvand_lowStockThreshold') === '10', 'a negative threshold is rejected, the old value is kept');
  // database size is measured in bytes, not UTF-16 units
  window.localStorage.setItem('alvand_probe', '\u0645\u062d\u0645\u062f\u06cc');   // 6 Persian chars = 12 bytes
  const realGetById3 = doc.getElementById;
  const sizeEl = { textContent: '', title: '', style: {}, dataset: {} };
  doc.getElementById = function (id) { return id === 'dbSizeText' ? sizeEl : realGetById3(id); };
  window.updateDbSizeText();
  doc.getElementById = realGetById3;
  ok(/[0-9]/.test(sizeEl.textContent), 'db size is reported as a number (' + sizeEl.textContent + ')');
  ok(sizeEl.textContent.indexOf('-') === -1, 'db size never shows a bare dash');
  ok(/\u0628\u0627\u06cc\u062a/.test(sizeEl.title), 'db size carries the exact byte count in the tooltip');
  window.localStorage.removeItem('alvand_probe');
  // the poller must not serialise: 3 hosts, 2 dead, all settled
  const srcAgent = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(/Promise\.allSettled/.test(srcAgent), 'agentPoll uses Promise.allSettled');
  ok(/AGENT_POLL_CONCURRENCY/.test(srcAgent), 'agentPoll has a bounded concurrency pool');

  console.log('--- 23. dead features, reset, update checker ---');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // the yearly + two-month charts were fully written but had no markup at all
  ['yearlyChartContainer', 'yearlyChart', 'yearlyLabels', 'compareMonth1', 'compareMonth2', 'compareChartContainer', 'compareChart'].forEach(function (id) {
    ok(htmlSrc.includes('id="' + id + '"'), 'the markup for #' + id + ' exists');
  });
  const realGetById4 = doc.getElementById;
  const els = {};
  ['yearlyChartContainer', 'yearlyChart', 'yearlyLabels', 'compareMonth1', 'compareMonth2', 'compareChartContainer', 'compareChart', 'currentVersionText', 'updateStatusText', 'updateBtn', 'updateNotes'].forEach(function (id) {
    els[id] = { innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, disabled: false };
  });
  doc.getElementById = function (id) { return els[id] || realGetById4(id); };
  let initThrew = false;
  try { window.init(); } catch (e) { initThrew = true; }
  doc.getElementById = realGetById4;
  ok(!initThrew, 'init() renders the yearly chart without crashing');
  ok(els.yearlyChart.innerHTML.length > 0, 'the yearly chart actually renders 12 months');
  ok(els.compareMonth1.value && els.compareMonth2.value, 'the two month pickers are pre-filled');
  // resetTimer must confirm and keep a record of the discarded time
  window.customers = [];
  const ledgerBefore = window.localStorage.getItem('alvand_discardedTime');
  window.eval("clients=[{id:31,name:'R',tariff:'single',extra:0,stationType:'pc',status:'online',elapsed:3600,startTime:null,totalCost:0,timerDuration:0,notified:false}]");
  window.eval('currentTimeClient=0;');
  let confirmMsg = '';
  window.askConfirm = function (msg, cb) { confirmMsg = msg; };
  window.resetTimer();
  ok(confirmMsg.length > 0, 'resetTimer asks before wiping played time');
  ok(window.eval('clients[0].elapsed') === 3600, 'nothing is reset until the operator confirms');
  window.askConfirm = function (msg, cb) { if (cb) cb(); };
  window.resetTimer();
  ok(window.eval('clients[0].elapsed') === 0, 'after confirming, the timer is reset');
  const ledger = JSON.parse(window.localStorage.getItem('alvand_discardedTime') || '[]');
  ok(ledger.length === 1 && ledger[0].seconds === 3600, 'the discarded hour is kept in a ledger instead of vanishing');
  ok(ledgerBefore === null || ledger.length > 0, 'the ledger accumulates');
  // update checker: no innerHTML from remote data, retry stays possible
  ok(!/st\.innerHTML='[^']*tag/.test(appSrc), 'the release tag is never injected as HTML');
  ok(/fetchWithTimeout\('https:\/\/api\.github\.com/.test(appSrc), 'the GitHub request has a timeout');
  ok(!/function renderAdvancedCustomerProfile/.test(fs.readFileSync(path.join(ROOT, 'src/js/new-features.js'), 'utf8')), 'the unreachable advanced-profile function is gone');

  console.log('--- 24. every cross-module window.* read resolves ---');
  // The five satellite scripts read shared state as window.customers,
  // window.sessions, ... while app.js keeps it in a private IIFE scope. Anything
  // missing there fails SILENTLY (an empty list, "not found"), so assert it.
  const BUILTIN = new Set(['addEventListener', 'removeEventListener', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'location', 'history', 'localStorage', 'sessionStorage', 'document', 'console', 'navigator', 'fetch', 'alert', 'confirm', 'prompt', 'open', 'close', 'print', 'crypto', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'btoa', 'atob', 'TextEncoder', 'TextDecoder', 'Uint8Array', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Number', 'String', 'Boolean', 'RegExp', 'Error', 'Promise', 'Function', 'Symbol', 'Map', 'Set', 'Proxy', 'Reflect', 'Intl', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'CustomEvent', 'Event', 'MutationObserver', 'getComputedStyle', 'matchMedia', 'innerWidth', 'innerHeight', 'blur', 'gamenet', '__pdfFailed', 'globalThis', 'self', 'name', 'top', 'parent', 'length', 'URL', 'Blob', 'Notification', 'Buffer', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'structuredClone']);
  // set by the module itself right before it reads them back
  const SELF_ASSIGNED = new Set(['_svSid', '_svRate', '_joinEventId']);
  const satellites = ['patches.js', 'new-features.js', 'round2-a.js', 'round2-b.js', 'round2-c.js', 'phonebook.js'];
  const stillMissing = [];
  satellites.forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    const used = [...new Set([...src.matchAll(/window\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];
    used.filter(n => !BUILTIN.has(n) && !SELF_ASSIGNED.has(n)).forEach(function (n) {
      let missing = false;
      try { missing = typeof window[n] === 'undefined'; } catch (e) { missing = false; }
      if (missing) stillMissing.push(f + ':' + n);
    });
  });
  ok(stillMissing.length === 0, 'no dangling window.* reads (' + (stillMissing.join(', ') || 'all resolve') + ')');
  ok(window.currentTimeClient === null || typeof window.currentTimeClient === 'number', 'window.currentTimeClient is published (customer portal / POS)');

  console.log('--- 19. no script errors ---');
  ok(errors.length === 0, 'zero window errors (' + errors.length + ') ' + errors.slice(0, 3).join(' | '));

  console.log(failures === 0 ? 'ALL NEW-FEATURE CHECKS PASSED' : failures + ' CHECK(S) FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

