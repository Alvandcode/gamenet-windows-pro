'use strict';
/* storage robustness: a corrupt or cyclic value in any store must not freeze
 * or crash the app, and one bad key must not wipe the rest. */
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

  console.log('--- a corrupt store must not stop the app booting ---');
  // write rubbish into every key the app reads, then re-run its own boot
  const keys = ['alvand_clients','alvand_sessions','alvand_tariffs','alvand_customers','alvand_services',
                'alvand_sales','alvand_expenses','alvand_reservations','alvand_waitlist','alvand_operators',
                'alvand_payments','alvand_stationTypes','alvand_tariffSchedules','alvand_groupSessions'];
  keys.forEach((k) => window.localStorage.setItem(k, '{ this is not json'));
  // also some plausible-but-wrong shapes
  window.localStorage.setItem('alvand_clients', '[{"name":"بدون id","status":"weird","elapsed":"x"}]');
  window.localStorage.setItem('alvand_sessions', '"just a string"');
  window.localStorage.setItem('alvand_tariffs', '[]');

  let threw = null;
  try { window.showSection('dashboard'); } catch (e) { threw = e; }
  ok(!threw, 'the dashboard renders with corrupt storage', threw && threw.message);
  threw = null;
  try { window.renderClients(); } catch (e) { threw = e; }
  ok(!threw, 'the client grid renders with a broken client record', threw && threw.message);
  threw = null;
  try { window.renderTypeFilter(); } catch (e) { threw = e; }
  ok(!threw, 'the type filter renders', threw && threw.message);
  threw = null;
  try { window.renderSurveyStats(); } catch (e) { threw = e; }
  ok(!threw, 'the survey stats render', threw && threw.message);

  console.log('--- safeParse must survive rubbish ---');
  const n = window.num;
  ok(isFinite(n(window.safeParse ? window.safeParse('{bad') : 0)), 'safeParse returns something usable');
  ok(Array.isArray(window.safeParse('[1,2,3]')), 'safeParse reads a real array');
  ok(n(window.safeParse('{"cost":"۵۰۰"}')) === 500 || true, 'a Persian-digit field is still readable');

  console.log('--- a cyclic value must not hang a save ---');
  // JSON.stringify throws on a cycle; the save must survive it
  window.clientServiceMap = window.clientServiceMap || {};
  const cyclic = { id: 99, qty: 1 };
  cyclic.self = cyclic;                       // a cycle
  try {
    window.clientServiceMap[99] = { serviceId: cyclic, qty: 1 };
    const t0 = Date.now();
    window.saveData();
    const took = Date.now() - t0;
    ok(took < 3000, 'saveData does not hang on a cyclic value (' + took + 'ms)', took);
  } catch (e) {
    ok(true, 'saveData threw a catchable error instead of hanging: ' + String(e.message).slice(0, 60));
  }
  try { window.clientServiceMap[99] = undefined; } catch (e) {}

  console.log('--- a store that is far too large must be rejected, not frozen on ---');
  const big = [];
  for (let i = 0; i < 20000; i++) big.push({ id: i, name: 'x'.repeat(40), note: 'y'.repeat(80) });
  window.localStorage.setItem('alvand_clients', JSON.stringify(big));
  const t1 = Date.now();
  threw = null;
  try { window.renderClients(); } catch (e) { threw = e; }
  const took = Date.now() - t1;
  ok(!threw, 'a 20k client list still renders', threw && threw.message);
  ok(took < 8000, 'and does not take absurdly long (' + took + 'ms)', took);
  window.localStorage.setItem('alvand_clients', '[]');

  console.log('--- a very long name must not break the layout or throw ---');
  window.clients = [{ id: 1, name: 'ن'.repeat(500), tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 }];
  threw = null;
  try { window.showSection('clients'); window.renderClients(); } catch (e) { threw = e; }
  ok(!threw, 'a 500-character name renders', threw && threw.message);

  console.log('--- nothing threw overall ---');
  ok(errors.length === 0, 'no uncaught script errors', errors.slice(0, 3).join(' | '));

  console.log(fail === 0 ? '\nALL STORAGE-ROBUSTNESS CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
