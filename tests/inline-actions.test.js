/* Inline action layer tests: the CSP has no script-src-attr anymore, so EVERY
 * inline event attribute must be converted to data-on* by inline-actions.js
 * and every handler body must be parseable by the restricted evaluator.
 *
 * This boots the whole app in jsdom (same harness as ux.test.js), renders every
 * section, then:
 *   1. asserts no live inline handler attribute survives anywhere,
 *   2. asserts every data-on* body parses (dynamic templates included),
 *   3. runs real clicks through the delegation (nav, group toggle, quick
 *      actions + stopPropagation semantics),
 *   4. asserts the evaluator fails closed on unknown/blocked code.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = 0;
const ok = (c, m, extra) => { if (c) console.log('  PASS ' + m); else { failures++; console.error('  FAIL ' + m + (extra !== undefined ? ' -> ' + extra : '')); } };
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
      window.print = () => {};
      if (!window.crypto || !window.crypto.subtle) {
        try { Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto }); } catch (e) {}
      }
      window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.message || e.error)));
    },
  });
  const { window } = dom;
  const doc = window.document;
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));

  const warned = [];
  const origWarn = window.console.warn;
  window.console.warn = function (...a) { warned.push(a.map(String).join(' ').slice(0, 160)); try { origWarn.apply(window.console, a); } catch (_) {} };

  window.localStorage.setItem('alvand_clients', JSON.stringify([
    { id: 11, name: 'PC-1', tariff: 'single', extra: 0, extraSeconds: 0, stationType: 'pc', ip: '', status: 'online', elapsed: 600, startTime: Date.now() - 600000, totalCost: 0, timerDuration: 30, notified: false },
    { id: 12, name: 'PC-2', tariff: 'single', extra: 0, extraSeconds: 0, stationType: 'ps', ip: '', status: 'offline', elapsed: 0, startTime: null, totalCost: 0, timerDuration: 0, notified: false },
  ]));

  for (const f of ['src/js/inline-actions.js', 'src/js/config.js', 'src/js/security.js', 'src/js/license-pubkey.js', 'src/js/license.js',
    'src/js/storage.js', 'src/js/app.js', 'src/js/patches.js', 'src/js/jalali.js', 'src/js/zoom.js', 'src/js/new-features.js',
    'src/js/round2-a.js', 'src/js/round2-b.js', 'src/js/round2-c.js', 'src/js/phonebook.js', 'src/js/ops.js', 'src/js/finance.js', 'src/js/group-play.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    doc.body.appendChild(s);
  }
  await sleep(1800);

  ok(typeof window.__inlineActions === 'object' && typeof window.__inlineActions.parse === 'function',
    'inline-actions exposed its test hooks');

  console.log('--- 1. no live inline handler attribute anywhere ---');
  const live = doc.querySelectorAll('[onclick],[onchange],[oninput],[onkeydown],[onerror],[onload]');
  ok(live.length === 0, 'all inline handler attributes were converted (' + live.length + ' left)');

  console.log('--- 2. every section renders and every handler parses ---');
  const names = ['dashboard','clients','tariffs','reports','income','reservations','customers','membership',
    'buffet','expenses','tariffSchedule','settings','stationHours','backup','license','operators',
    'employees','busyHours','activityLog','notifications','advancedSearch','waiting','events',
    'branches','shifts','insights','tools','phonebook','gameHistory'];
  const renderErrs = [];
  for (const n of names) {
    try { window.showSection(n); } catch (e) { renderErrs.push(n + ': ' + e.message); }
  }
  await sleep(700); // let MutationObserver conversions settle
  ok(renderErrs.length === 0, 'every section renders', renderErrs.join(' | '));

  const ia = window.__inlineActions;
  const sel = '[data-onclick],[data-onchange],[data-oninput],[data-onkeydown],[data-onerror],[data-onload]';
  const nodes = [...doc.querySelectorAll(sel)];
  const badBodies = [];
  const seen = new Set();
  for (const el of nodes) {
    for (const attr of ['data-onclick','data-onchange','data-oninput','data-onkeydown','data-onerror','data-onload']) {
      const body = el.getAttribute(attr);
      if (!body || seen.has(body)) continue;
      seen.add(body);
      try { ia.parse(body); } catch (e) { badBodies.push(body.slice(0, 90) + ' :: ' + e.message); }
    }
  }
  ok(nodes.length >= 100, 'handler elements harvested: ' + nodes.length);
  ok(badBodies.length === 0, 'every rendered handler body parses in the restricted evaluator',
     badBodies.slice(0, 5).join(' || '));

  console.log('--- 3. delegation: real clicks run the right code ---');
  // settings group head: onclick="toggleNavGroup('settings')"
  const setHead = doc.getElementById('navSettings');
  const setGroup = setHead.closest('.nav-group');
  const wasOpen = setGroup.classList.contains('open');
  setHead.click();
  await sleep(50);
  ok(setGroup.classList.contains('open') === !wasOpen, 'clicking the settings head toggles the group through delegation');
  // a nav item navigates
  const before = doc.querySelectorAll('.section:not([style*="display: none"])').length;
  const navReports = [...doc.querySelectorAll('.nav-item[data-onclick]')].find(n => /showSection\('reports'/.test(n.getAttribute('data-onclick')));
  ok(!!navReports, 'a nav item targets the reports section');
  navReports.click();
  await sleep(50);
  ok(doc.getElementById('reports-section').style.display !== 'none', 'nav click activated the reports section');
  ok(before >= 0, 'sections visible count sane');

  // dashboard quick actions: stopPropagation must stop the ROW handler
  window.showSection('dashboard');
  await sleep(200);
  const list = doc.getElementById('activeClientsList');
  const row11 = list.querySelector('[data-cid="11"]');
  ok(!!row11, 'online client row exists on the dashboard');
  let opened = 0;
  const origOpen = window.openClientFromDashboard;
  window.openClientFromDashboard = function () { opened++; return origOpen ? origOpen.apply(this, arguments) : undefined; };
  // the dashboard re-renders every second: always take a FRESH node reference
  const qaNow = () => doc.querySelector('#activeClientsList [data-cid="11"] .qa-btn');
  ok(!!qaNow(), 'quick action button exists');
  qaNow().click();
  await sleep(50);
  ok(opened === 0, 'qa button stopPropagation prevented the row handler (' + opened + ')');
  const rowNow = doc.querySelector('#activeClientsList [data-cid="11"]');
  rowNow.click();
  await sleep(50);
  ok(opened === 1, 'clicking the row itself opens the client (' + opened + ')');
  window.openClientFromDashboard = origOpen;

  console.log('--- 4. the evaluator fails closed ---');
  let threw = false;
  try { ia.run(doc.body, 'definitelyNotAGlobalFn()'); } catch (e) { threw = true; }
  ok(!threw, 'unknown function does not throw out of the runner');
  ok(warned.some(w => w.indexOf('inline action failed') >= 0), 'the failure was reported via console.warn');
  let called = 0;
  window.__probeTarget = function () { called++; };
  ia.run(doc.body, '__probeTarget()');
  ok(called === 1, 'a real global call still works through run()');
  called = 0;
  ia.run(doc.body, 'this.constructor.constructor("__probeTarget")()');
  ok(called === 0, 'constructor traversal is blocked');
  ia.run(doc.body, 'eval("__probeTarget()")');
  ok(called === 0, 'eval is blocked');
  ia.run(doc.body, 'document.body="__probeTarget"');
  ok(called === 0 && doc.body !== '__probeTarget', 'document.body cannot be overwritten');
  const host = doc.createElement('div');
  ia.run(host, "this.__marker='ok'");
  ok(host.__marker === 'ok', 'assignment on this works');
  ia.run(host, 'this.__stop=true; this.__stop2=(1+2)');
  ok(host.__stop === true && host.__stop2 === 3, 'multi-statement body executes');
  called = 0;
  window.__cbTarget = function (v) { called += (v || 0); return v; };
  ia.run(doc.body, 'setTimeout(()=>__cbTarget(7),10)');
  await sleep(120);
  ok(called === 7, 'arrow functions work through the evaluator (called=' + called + ')');
  called = 0;
  let objCalls = 0;
  window.__cbTarget = function (v) { if (v && typeof v === 'object') { objCalls++; return v; } called += (v || 0); return v; };
  ia.run(doc.body, '__cbTarget({a: (1+1), b: (true?2:3)})');
  ok(objCalls === 1, 'object argument accepted');

  console.log('--- 5. CSP is strict ---');
  const meta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  ok(!!meta, 'CSP meta exists');
  ok(meta && meta.getAttribute('content').indexOf('script-src-attr') === -1, 'CSP has no script-src-attr');
  ok(meta && !/script-src[^;]*'unsafe-inline'/.test(meta.getAttribute('content')), 'CSP has no inline script source');
  ok(errors.length === 0, 'no uncaught page errors during the whole boot', errors.slice(0, 3).join(' | '));

  if (failures) { console.error('INLINE-ACTIONS TESTS FAILED: ' + failures); process.exit(1); }
  console.log('INLINE-ACTIONS TESTS PASSED');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
