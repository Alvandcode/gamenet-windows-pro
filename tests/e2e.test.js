// End-to-end behavior in a REAL DOM (JSDOM): boot, typing, delete flow, billing cycle.
// Catches what vm-stub tests cannot: missing elements, render crashes, focus loss.
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
      window.confirmCalls = [];
      window.confirm = (m) => { window.confirmCalls.push(m); return true; };
      if (!window.crypto || !window.crypto.subtle) {
        try { Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto }); } catch (e) {}
      }
      window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.message || e.error)));
    },
  });
  const { window } = dom;
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));

  // seed shop data BEFORE scripts run
  window.localStorage.setItem('alvand_clients', JSON.stringify([
    { id: 1, name: 'PC1', tariff: 'single', extra: 0, extraSeconds: 0, stationType: 'pc', ip: '', status: 'offline', elapsed: 0, startTime: null, totalCost: 0, timerDuration: 0, notified: false },
    { id: 2, name: 'PS1', tariff: 'single', extra: 0, extraSeconds: 0, stationType: 'pc', ip: '', status: 'offline', elapsed: 0, startTime: null, totalCost: 0, timerDuration: 0, notified: false },
  ]));

  // inject app scripts in real order (CSP is not enforced by jsdom; CDN tags never fetched)
  for (const f of ['src/js/config.js', 'src/js/security.js', 'src/js/license-pubkey.js', 'src/js/license.js', 'src/js/storage.js', 'src/js/app.js', 'src/js/patches.js']) {
    const s = window.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    window.document.body.appendChild(s);
  }
  const cs = (el) => window.getComputedStyle(el).display;

  // A. boot: gates locked on first paint
  ok(window.document.getElementById('licenseOverlay').classList.contains('show'), 'license gate up after boot');
  ok(cs(window.document.getElementById('loginOverlay')) !== 'none', 'login gate visible after boot');

  // B. TYPING in the tariff boxes (the reported bug)
  window.showSection('tariffs');
  const nameBox = window.document.getElementById('newTypeName');
  const priceBox = window.document.getElementById('newTypePrice');
  nameBox.focus();
  ok(window.document.activeElement === nameBox, 'name box focusable');
  nameBox.value = 'VR-Test';
  priceBox.value = '30000';
  ok(nameBox.value === 'VR-Test' && priceBox.value === '30000', 'typing sticks in both boxes');
  // key events are not swallowed
  let kd = false;
  nameBox.addEventListener('keydown', () => { kd = true; }, { once: true });
  nameBox.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
  ok(kd === true, 'keydown reaches the input');

  // C. delete a preset type WITHOUT any native dialog, then type again
  const before = window.eval('stationTypes.length');
  window.deleteStationType('ps');
  ok(window.confirmCalls.length === 0, 'no native confirm used (in-app modal instead)');
  ok(window.document.getElementById('confirmModal').classList.contains('show'), 'in-app confirm opens');
  const yesBtns = [...window.document.querySelectorAll('#confirmModal button')];
  yesBtns[0].click();
  ok(window.eval('stationTypes.length') === before - 1, 'preset type deleted');
  ok(!window.eval(`stationTypes.some(t=>t.id==='ps')`), 'right one deleted');
  nameBox.focus();
  ok(window.document.activeElement === nameBox, 'still focusable after delete');
  nameBox.value = 'AfterDelete';
  ok(nameBox.value === 'AfterDelete', 'still typeable after delete');

  // D. add flow end-to-end
  nameBox.value = 'VR-New'; priceBox.value = '45000';
  window.addStationType();
  ok(window.eval(`stationTypes.some(t=>t.name==='VR-New'&&t.price===45000)`), 'new type added with price');
  ok(window.document.getElementById('stationTypesGrid').innerHTML.includes('VR-New'), 'grid re-rendered');

  // E. mid-game extra stepper + pro-rata billing through real renders
  window.showSection('clients');
  window.eval('currentTimeClient=0; startTimer();');
  await sleep(2100);
  window.eval('changeClientExtra(0,1)');
  await sleep(2100);
  const cost = window.eval('calculateCost(clients[0])');
  const xs = window.eval('clients[0].extraSeconds');
  ok(xs >= 1 && xs <= 3, 'extra seconds accumulate while running (got ' + xs + ')');
  ok(cost > 0, 'live cost computes (got ' + cost + ')');
  const gridHtml = window.document.getElementById('clientsGrid').innerHTML;
  ok(gridHtml.includes('+1 نفر'), 'stepper badge shows in card');

  // F. full checkout cycle
  window.eval('stopTimer()');
  ok(window.document.getElementById('paymentModal').classList.contains('show'), 'payment modal opens');
  window.eval('confirmPayment()');
  await sleep(900); // share modal timeout inside confirmPayment
  const sess = window.eval('sessions');
  ok(sess.length === 1 && sess[0].cost > 0, 'session recorded with cost ' + (sess[0] && sess[0].cost));
  ok(window.eval(`clients[0].status`) === 'offline' && window.eval(`clients[0].extraSeconds`) === 0, 'client reset after payment');

  // G. no runtime errors anywhere
  const realErrors = errors.filter((e) => !/offline-test/.test(e));
  ok(realErrors.length === 0, 'zero window errors (' + realErrors.length + ')');
  if (realErrors.length) console.log(realErrors.slice(0, 5));

  console.log(failures === 0 ? 'E2E TESTS PASSED' : failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
