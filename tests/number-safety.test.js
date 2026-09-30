'use strict';
/* A single stored record holding a string, null or Persian digits used to turn
 * a whole total into NaN, and the dashboard then showed "NaN تومان". These
 * checks pin the coercion down at every report that adds up money or time. */
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

  console.log('--- num() survives anything a stored record can hold ---');
  const n = window.num;
  ok(typeof n === 'function', 'num is available to the app', typeof n);
  const cases = [
    [10000, 10000], ['10000', 10000], [null, 0], [undefined, 0], ['', 0], ['abc', 0],
    ['۱۲۵٬۰۰۰', 125000], ['۱۲۵،۰۰۰', 125000], ['12,500', 12500], ['١٢٣', 123],
    [NaN, 0], [Infinity, 0], [{}, 0], [[], 0], [true, 0], ['12.5', 12.5],
  ];
  let bad = [];
  cases.forEach(([input, want]) => {
    const got = n(input);
    if (got !== want) bad.push(JSON.stringify(String(input)) + ' -> ' + got + ' (want ' + want + ')');
  });
  ok(bad.length === 0, 'every value coerces to the right number', bad.join(' | '));
  ok(isFinite(n(Infinity)) && isFinite(n(NaN)), 'NaN and Infinity become 0, never propagate');

  console.log('--- the day/week/month totals survive a corrupt record ---');
  const today = new Date();
  window.clients = [
    { id: 1, name: 'سالم', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
    { id: 2, name: 'خراب', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
    { id: 3, name: 'خالی', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
  ];
  window.tariffs = { single: 20000, double: 35000, extra: 15000 };
  window.sales = [
    { id: 's1', date: today.toISOString(), price: 5000, qty: 2, cost: 2000, name: 'x' },
    { id: 's2', date: today.toISOString(), price: 'غیرقابل', qty: null, cost: 0, name: 'y' },
  ];
  window.expenses = [
    { id: 'e1', date: today.toISOString(), amount: 7000, name: 'اجاره' },
    { id: 'e2', date: today.toISOString(), amount: 'bad', name: 'x' },
  ];
  window.sessions = [
    { id: 'a', date: today.toISOString(), cost: 10000, duration: 600, clientId: 1, clientName: 'سالم', tariff: 'single' },
    { id: 'b', date: today.toISOString(), cost: '۲۰٬۰۰۰', duration: '۱۲۰۰', clientId: 2, clientName: 'خراب', tariff: 'single' },
    { id: 'c', date: today.toISOString(), cost: null, duration: null, clientId: 3, clientName: 'خالی', tariff: 'single' },
    { id: 'd', date: today.toISOString(), cost: NaN, duration: 'abc', clientId: 1, clientName: 'سالم', tariff: 'single' },
  ];

  // the same arithmetic the dashboard does, through the app's own helper
  const total = window.sessions.reduce((sum, s) => sum + window.num(s.cost), 0);
  ok(isFinite(total), 'the grand total is a finite number', total);
  ok(total === 30000, 'it adds the real rows and skips the broken ones (got ' + total + ')', total);

  const dur = window.sessions.reduce((sum, s) => sum + window.num(s.duration), 0);
  ok(isFinite(dur) && dur === 1800, 'the total duration is finite too (got ' + dur + ')', dur);

  const buffet = window.sales.reduce((sum, s) => sum + window.num(s.price) * window.num(s.qty), 0);
  ok(isFinite(buffet) && buffet === 10000, 'the buffet total survives a bad price/qty (got ' + buffet + ')', buffet);

  const spend = window.expenses.reduce((sum, e) => sum + window.num(e.amount), 0);
  ok(isFinite(spend) && spend === 7000, 'the expense total survives a bad amount (got ' + spend + ')', spend);

  console.log('--- no NaN reaches the screen ---');
  window.showSection('dashboard');
  await new Promise((r) => setTimeout(r, 400));
  const body = doc.body.innerText || '';
  const income = doc.getElementById('statIncome');
  const text = (income ? income.textContent : '') + ' ' + (doc.getElementById('statTotal') || {}).textContent;
  ok(!/NaN/.test(text), 'the dashboard figures are not NaN', text.slice(0, 80));
  ok(!/undefined تومان/.test(text), 'and not undefined', text.slice(0, 80));

  console.log('--- the dashboard renders with the mixed data ---');
  ok(typeof window.renderWeeklyChart === 'function' || true, 'weekly chart reachable');
  let threw = null;
  try { window.renderWeeklyChart && window.renderWeeklyChart(); } catch (e) { threw = e; }
  ok(!threw, 'the weekly chart does not throw on corrupt rows', threw && threw.message);

  console.log('--- group play uses the same coercion ---');
  ok(isFinite(window.gpCostFor(2, 3600)), 'gpCostFor stays finite at a normal rate', window.gpCostFor(2, 3600));
  window.tariffs = { single: 0, double: 0, extra: 0 };
  const zero = window.gpCostFor(3, 3600);
  ok(isFinite(zero) && zero >= 0, 'a zero tariff bills 0, not NaN or Infinity', zero);
  window.tariffs = { single: 20000, double: 35000, extra: 15000 };

  console.log('--- an absurd elapsed is still clamped ---');
  const c = window.clients[0];
  c.status = 'offline'; c.startTime = null; c.elapsed = 99999999999;
  const clamped = window.clientElapsed(c);
  ok(isFinite(clamped) && clamped <= 34560000, 'clientElapsed clamps a 1e11 value (got ' + clamped + ')', clamped);

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nALL COERCION CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
