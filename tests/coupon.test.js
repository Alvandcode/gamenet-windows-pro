'use strict';
/* Coupon accounting: the use counter was never incremented when a coupon was
 * actually applied, so maxUses never ran out, and a percentage coupon larger
 * than the bill produced a negative total. */
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

  console.log('--- the discount itself ---');
  const pct = { type: 'percent', value: 10 };
  ok(window.couponDiscount(pct, 100000) === 10000, 'a 10% coupon on 100000 is 10000', window.couponDiscount(pct, 100000));
  const fixed = { type: 'fixed', value: 5000 };
  ok(window.couponDiscount(fixed, 100000) === 5000, 'a 5000 coupon on 100000 is 5000', window.couponDiscount(fixed, 100000));
  ok(window.couponDiscount(fixed, 3000) === 3000, 'a coupon larger than the bill is capped at the bill', window.couponDiscount(fixed, 3000));
  const big = { type: 'percent', value: 150 };
  ok(window.couponDiscount(big, 100000) <= 100000, 'a 150% coupon cannot exceed the bill', window.couponDiscount(big, 100000));
  ok(window.couponDiscount(null, 100000) === 0, 'no coupon means no discount', window.couponDiscount(null, 100000));
  ok(window.couponDiscount(pct, 0) === 0, 'a zero bill gives a zero discount', window.couponDiscount(pct, 0));

  console.log('--- applying a coupon must consume one use ---');
  const box = doc.getElementById('couponInput');
  ok(!!box, 'the coupon field exists');
  // the shop has no coupon yet, so make one with a ceiling of 3
  const coupons = window.getCoupons();
  coupons.length = 0;
  coupons.push({ id: 'c1', code: 'SAVE10', type: 'percent', value: 10, active: true, used: 0, maxUses: 3 });
  window.pendingPayment = { total: 100000, baseTotal: 100000, couponCode: '' };
  box.value = 'SAVE10';
  window.applyCoupon();
  const used1 = window.getCoupons().find((c) => c.code === 'SAVE10');
  console.log('  after apply: used=' + (used1 && used1.used) + ' of ' + (used1 && used1.maxUses));
  ok(used1 && used1.used === 1, 'applying it counted one use', used1 && used1.used);

  console.log('--- the maxUses ceiling must eventually stop the coupon ---');
  window.pendingPayment = { total: 100000, baseTotal: 100000, couponCode: '' };
  window.applyCoupon();
  window.pendingPayment = { total: 100000, baseTotal: 100000, couponCode: '' };
  window.applyCoupon();
  const usedN = window.getCoupons().find((c) => c.code === 'SAVE10');
  const v = window.validateCoupon('SAVE10');
  console.log('  used=' + (usedN && usedN.used) + '  maxUses=' + (usedN && usedN.maxUses) + '  still valid=' + v.ok);
  ok((usedN.used || 0) <= (usedN.maxUses || 0),
     'the counter never passes the ceiling', usedN && (usedN.used + '/' + usedN.maxUses));
  ok(v.ok === false, 'and once the ceiling is hit the coupon is refused', v.error);
  window.getCoupons().length = 0;

  console.log('--- a percentage coupon bigger than the bill gives 0, not a credit ---');
  window.pendingPayment = { total: 10000, baseTotal: 10000, couponCode: '' };
  window.getCoupons().push({ id: 'huge', code: 'HUGE', type: 'percent', value: 200, active: true, used: 0, maxUses: 0 });
  doc.getElementById('couponInput').value = 'HUGE';
  window.applyCoupon();
  const shown = doc.getElementById('payTotal');
  console.log('  payTotal shows: ' + (shown ? shown.textContent : '?'));
  const asNumber = window.num(String(shown ? shown.textContent : '').replace(/[^\d\u06F0-\u06F9\u0660-\u0669]/g, ''));
  ok(asNumber >= 0, 'the total is not negative (got ' + asNumber + ')', asNumber);
  ok(asNumber === 0, 'and a 200% coupon on 10000 leaves 0', asNumber);

  console.log('--- an expired or inactive coupon is refused ---');
  window.getCoupons().push({ id: 'old', code: 'OLD', type: 'fixed', value: 1000, active: false, used: 0, maxUses: 0 });
  ok(window.validateCoupon('OLD').ok === false, 'an inactive coupon is refused');
  window.getCoupons().push({ id: 'exp', code: 'EXP', type: 'fixed', value: 1000, active: true, used: 0, maxUses: 0, expires: '2000-01-01' });
  ok(window.validateCoupon('EXP').ok === false, 'an expired coupon is refused');
  ok(window.validateCoupon('NOSUCH').ok === false, 'an unknown code is refused');
  ok(window.validateCoupon('').ok === false, 'an empty code is refused');

  console.log('--- an expired date is read in the local calendar, not UTC ---');
  // a coupon that expires today must still work today
  const today = new Date();
  const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  window.getCoupons().push({ id: 'today', code: 'TODAY', type: 'fixed', value: 100, active: true, used: 0, maxUses: 0, expires: iso });
  ok(window.validateCoupon('TODAY').ok === true, 'a coupon expiring today is still valid', iso);

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nALL COUPON CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
