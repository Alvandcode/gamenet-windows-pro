'use strict';
/* stopTimer() guards against a corrupt elapsed with
 *     c.elapsed > before * 1000 + 3600
 * where `before` is already in SECONDS. The *1000 made the guard fire for any
 * session longer than an hour and wiped the real played time, replacing it with
 * the stale stored value - so a long session was silently shortened. */
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
  const toasts = [];
  window.addEventListener('error', (e) => { /* jsdom noise */ });
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

  window.tariffs = { single: 20000, double: 35000, extra: 15000 };
  window.stationTypes = [{ id: 'pc', name: 'PC', icon: 'P' }];
  window.services = [];
  window.clientServiceMap = {};

  const runStop = (elapsedSeconds, startedSecondsAgo) => {
    window.sessions = [];
    window.clients = [{
      id: 1, name: 'بازیکن', tariff: 'single', stationType: 'pc',
      status: 'online',
      startTime: startedSecondsAgo > 0 ? Date.now() - startedSecondsAgo * 1000 : null,
      elapsed: elapsedSeconds, totalCost: 0, extra: 0, extraSeconds: 0,
    }];
    window.currentTimeClient = 0;
    window.stopTimer();
    // pendingPayment is module-scoped, so read the bill off the payment modal
    const durEl = doc.getElementById('payDuration');
    const totEl = doc.getElementById('payTotal');
    const m = durEl ? String(durEl.textContent).match(/(\d+):(\d+):(\d+)/) : null;
    const seconds = m ? (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : null;
    // the modal renders Persian digits, so normalise before reading a number
    const t = totEl ? window.num(String(totEl.textContent).replace(/[^\d٠-٩۰-۹]/g, '')) : null;
    return { duration: seconds, total: t, shown: totEl ? totEl.textContent : '' };
  };

  console.log('--- a normal session must keep its real duration ---');
  let r = runStop(0, 3600);            // started an hour ago, stored 0
  ok(r.duration >= 3599, 'an hour of play is kept (got ' + r.duration + ')', r.duration);
  r = runStop(0, 7200);                // two hours
  ok(r.duration >= 7199, 'two hours of play are kept (got ' + r.duration + ')', r.duration);
  r = runStop(0, 18000);               // five hours - a long session
  ok(r.duration >= 17999, 'a five-hour session is kept (got ' + r.duration + ')', r.duration);

  console.log('--- the cost follows the real time ---');
  r = runStop(0, 7200);
  ok(r.total === 40000, 'two hours at 20000/hour is about 40000 (got ' + r.total + ')', r.total);
  r = runStop(0, 18000);
  ok(r.total === 100000, 'five hours is about 100000 (got ' + r.total + ')', r.total);

  console.log('--- a genuinely corrupt stored value is still contained ---');
  // clientElapsed() has a hard 400-day ceiling, so a 1e11 stored value comes
  // back clamped rather than becoming a 3000-year bill. What matters is that
  // the amount is bounded and the page does not throw.
  r = runStop(99999999999, 600);
  ok(r.duration !== null && r.duration <= 34560000,
     'an absurd stored value is contained, not billed as 3000 years (got ' + r.duration + 's)', r.duration);
  ok(r.total < 34560000 / 3600 * 100000, 'and the bill stays bounded', r.total);

  console.log('--- a negative or NaN stored value must not survive ---');
  r = runStop(-500, 900);
  ok(r.duration === 900, 'a negative stored value is replaced (got ' + r.duration + ')', r.duration);
  r = runStop('abc', 900);
  ok(r.duration === 900, 'a non-numeric stored value is replaced (got ' + r.duration + ')', r.duration);

  console.log('--- the billed amount never goes negative ---');
  [0, 60, 600, 3600].forEach((secs) => {
    const out = runStop(0, secs);
    ok(out.total >= 0, 'a ' + secs + 's session bills a non-negative amount (got ' + out.total + ')', out.total);
  });

  console.log(fail === 0 ? '\nALL TIMER CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
