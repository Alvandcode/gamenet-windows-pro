'use strict';
/* sendBulkSms() advanced its queue with p.then(...) and no catch. A rejected
 * request - a timeout, a dropped connection, a provider error - escaped as an
 * unhandled rejection, the "next" callback never ran, and the bulk send stopped
 * for good while the shop was still looking at "sending...".
 *
 * The same number written three different ways was also messaged three times.
 *
 * Reloading the module re-reads the phonebook and the SMS panel config and drops
 * any stub on window, so every case reloads and then re-arms. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };

const FIVE = [
  { id: 1, firstName: 'یک',  lastName: 'الف', phoneMobile: '09120000001' },
  { id: 2, firstName: 'دو',  lastName: 'ب',   phoneMobile: '09120000002' },
  { id: 3, firstName: 'سه',  lastName: 'ج',   phoneMobile: '09120000003' },
  { id: 4, firstName: 'چهار', lastName: 'د',  phoneMobile: '09120000004' },
  { id: 5, firstName: 'پنج', lastName: 'ه',   phoneMobile: '09120000005' },
];

(async function () {
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom; const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.confirm = () => true; window.print = () => {};
  window.fetch = () => Promise.reject(new Error('offline'));

  for (const f of ['config.js','security.js','license-pubkey.js','license.js','storage.js','app.js',
    'patches.js','jalali.js','zoom.js','new-features.js','round2-a.js','round2-b.js','round2-c.js',
    'phonebook.js','ops.js','finance.js','group-play.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await sleep(1500);

  const composer = doc.getElementById('smsComposer');
  ok(!!composer, 'the composer exists');
  composer.value = 'سلام {نام}';

  /* Set up one case: write the phonebook and the panel config, reload the
   * module so it reads them, then install the sender it will actually use. */
  async function scenario(contacts, sender) {
    window.localStorage.setItem('alvand_phonebook', JSON.stringify(contacts));
    window.localStorage.setItem('alvand_smsConfig', JSON.stringify({
      enabled: true, provider: 'kavenegar', token: 'test-token', sender: '10004346',
    }));
    window.localStorage.setItem('alvand_smsLog', '[]');
    const b = doc.createElement('script');
    b.textContent = fs.readFileSync(path.join(ROOT, 'src/js/phonebook.js'), 'utf8');
    doc.body.appendChild(b);
    await sleep(400);
    window.buildSmsRequest = function (c, to, text) {
      return { url: 'https://sms.test/send', method: 'POST', headers: {}, body: to + '|' + text };
    };
    window.gamenet = window.gamenet || {};
    window.gamenet.sms = { send: sender };
    window.renderSmsLog = function () {};
    window.sendBulkSms();
    await sleep(6000);
    return JSON.parse(window.localStorage.getItem('alvand_smsLog') || '[]');
  }

  console.log('--- every request rejects: the send must still finish ---');
  let rows = await scenario(FIVE, function () { return Promise.reject(new Error('network down')); });
  console.log('  logged: ' + rows.length);
  ok(rows.length === 5, 'all five recipients were attempted', rows.length);
  ok(rows.every((r) => r.ok === false), 'and every one is recorded as a failure');
  ok(rows.some((r) => /network down/.test(String(r.detail))), 'with the reason kept', rows[0] && rows[0].detail);

  console.log('--- half succeed, half fail ---');
  let n = 0;
  rows = await scenario(FIVE, function () {
    n++;
    return n % 2 === 1 ? Promise.resolve({ ok: true, status: 200 }) : Promise.reject(new Error('boom'));
  });
  console.log('  logged: ' + rows.length + '  ok: ' + rows.filter((r) => r.ok).length);
  ok(rows.length === 5, 'all five were attempted even though half failed', rows.length);
  ok(rows.filter((r) => r.ok).length === 3, 'three succeeded', rows.filter((r) => r.ok).length);
  ok(rows.filter((r) => !r.ok).length === 2, 'two failed and are recorded as failures', rows.filter((r) => !r.ok).length);

  console.log('--- one number written three ways is messaged once ---');
  rows = await scenario([
    { id: 1, firstName: 'الف', lastName: 'یک', phoneMobile: '09120000009' },
    { id: 2, firstName: 'ب',  lastName: 'دو',  phoneMobile: '0912 000 0009' },
    { id: 3, firstName: 'ج',  lastName: 'سه', phoneMobile: '+989120000009' },
  ], function () { return Promise.resolve({ ok: true, status: 200 }); });
  console.log('  logged: ' + rows.length);
  ok(rows.length === 1, 'one number is messaged once, not three times', rows.length);

  console.log('--- different numbers are still all sent ---');
  rows = await scenario([
    { id: 1, firstName: 'الف', lastName: 'یک', phoneMobile: '09120000009' },
    { id: 2, firstName: 'ب',  lastName: 'دو', phoneMobile: '09120000010' },
    { id: 3, firstName: 'ج',  lastName: 'سه', phoneMobile: '09120000011' },
  ], function () { return Promise.resolve({ ok: true, status: 200 }); });
  ok(rows.length === 3, 'three different numbers get three messages', rows.length);

  console.log('--- the {name} placeholder is filled per recipient ---');
  rows = await scenario(FIVE, function (req) { return Promise.resolve({ ok: true, status: 200 }); });
  ok(rows.every((r) => r.text && r.text.indexOf('{نام}') === -1), 'no message still contains the placeholder');
  const names = rows.map((r) => r.name);
  ok(new Set(names).size === 5, 'each message used that recipient\'s name', names.join(', '));

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nALL BULK-SMS CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
