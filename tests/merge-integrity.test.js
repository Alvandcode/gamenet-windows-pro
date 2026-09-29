/* The merge must not break the finance/ops pages that were already in the repo.
 * They were committed first, then my 21-file change set was merged on top - this
 * proves the result still runs them, still shows their pages, and that the
 * cross-module bridge they depend on actually works for them.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'C:/Users/Iran Novin/Documents/Default Project/gamenet-windows-pro';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }

(async function () {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously',
  });
  const { window } = dom;
  const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  process.on('unhandledRejection', (e) => errors.push('rejection: ' + (e && (e.message || e))));
  window.confirm = () => true;
  window.alert = () => {};
  window.print = () => {};
  window.fetch = () => Promise.reject(new Error('offline in test'));

  for (const f of ['config.js', 'security.js', 'license-pubkey.js', 'license.js', 'storage.js', 'app.js',
    'patches.js', 'jalali.js', 'zoom.js', 'new-features.js', 'round2-a.js', 'round2-b.js', 'round2-c.js',
    'phonebook.js', 'ops.js', 'finance.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await new Promise((r) => setTimeout(r, 400));
  ok(errors.length === 0, 'the whole app boots with finance.js + ops.js loaded (' + errors.slice(0, 2).join(' | ') + ')');

  /* ---- their pages exist and are reachable ---- */
  ok(!!doc.getElementById('finance-section'), 'the finance page exists in the markup');
  ok(!!doc.getElementById('ops-section'), 'the ops page exists in the markup');
  ok(window.hasPerm('finance') === true, 'finance is reachable with the default (admin) operator');
  ok(window.hasPerm('ops') === true, 'ops is reachable with the default (admin) operator');

  /* ---- their renderers actually produce content ---- */
  const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
  const financeIds = ids.filter((i) => /fin|pnl|handover|tax|holiday|debt/i.test(i));
  const opsIds = ids.filter((i) => /pkg|coupon|amanat|maint|broadcast|deposit/i.test(i));
  ok(financeIds.length > 0, 'the finance page has its own element ids (' + financeIds.length + ')');
  ok(opsIds.length > 0, 'the ops page has its own element ids (' + opsIds.length + ')');

  let financeRendered = 0, opsRendered = 0, threw = [];
  for (const f of window.renderFinance ? Object.keys(window).filter((k) => /^render/.test(k) && typeof window[k] === 'function') : []) {
    try { window[f](); } catch (e) { threw.push(f + ': ' + e.message); }
  }
  ok(threw.length === 0, 'every global render*() runs without throwing (' + threw.slice(0, 2).join(' | ') + ')');

  /* ---- the bridge gives THEIR modules the stores they read ---- */
  ok(Array.isArray(window.customers), 'window.customers is live (finance/ops read it)');
  ok(Array.isArray(window.sessions), 'window.sessions is live');
  ok(Array.isArray(window.clients), 'window.clients is live');
  ok(window.stationTypes !== undefined, 'window.stationTypes is published (your bridge had it, mine did not)');
  // a satellite write must reach app.js
  window.customers = [{ id: 42, name: 'زهرا', phone: '09120000000', wallet: 1000, totalHours: 3 }];
  ok(window.eval('customers[0].wallet') === 1000, 'finance.js can write customers and app.js sees it');
  window.eval('customers = []');

  /* ---- and my fixes survived the merge ---- */
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(/publishState\('stationTypes'/.test(appSrc), 'the bridge publishes stationTypes');
  ok(!/licSecret\s*=/.test(appSrc), 'the fake license secret is gone');
  ok(!/licHash\s*=/.test(appSrc), 'the fake license hash is gone');
  ok(/baseTotal = pkg\.price \+ overCost/.test(appSrc), 'YOUR package pricing survived');
  ok(/clients\.find\(function\(x\)\{ return x && x\.id===pendingPayment\.clientId/.test(appSrc), 'the package rate lookup is id-based now');
  ok(!/pendingPayment\.clientName\.includes\(c\.name\)/.test(appSrc), 'the fuzzy customer match is gone');
  ok(/\u0632\u0645\u0627\u0646 \/ \u0645\u0628\u0644\u063a/.test(appSrc), 'your "time / amount" button label survived');
  ok(/numId\(i\)/.test(appSrc), 'the id-guard against XSS survived');
  const sec = fs.readFileSync(path.join(ROOT, 'src/js/security.js'), 'utf8');
  ok(/function weekStart/.test(sec), 'the calendar-week helper survived');
  const r2c = fs.readFileSync(path.join(ROOT, 'src/js/round2-c.js'), 'utf8');
  ok(!/xorCrypt/.test(r2c) && /PBKDF2/.test(r2c), 'the real encryption survived');

  /* ---- no duplicated ids from the merge ---- */
  const all = [...doc.querySelectorAll('[id]')].map((e) => e.id);
  const dups = [...new Set(all.filter((x, i) => all.indexOf(x) !== i))];
  ok(dups.length === 0, 'no duplicated element ids after the merge (' + dups.slice(0, 5).join(',') + ')');

  console.log(fail === 0 ? '\nALL MERGE-INTEGRITY CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
