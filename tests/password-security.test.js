/* Operator password security: PBKDF2+salt, no lockout, weak defaults.
 *
 * The gaps this closes, all measured before the change:
 *   - the stored hash was a BARE sha256('gamenet::' + password): unsalted and
 *     fast, so "1234" is a constant and a 4-digit password has 10^4 candidates
 *   - the login form accepted unlimited guesses
 *   - the editor accepted any 4 characters
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('crypto');

const ROOT = 'C:/Users/Iran Novin/Documents/Default Project/gamenet-windows-pro';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously',
  });
  const { window } = dom;
  const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  const warns = [];
  window.console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
  window.__warns = warns;
  window.fetch = () => Promise.reject(new Error('offline'));
  window.confirm = () => true;
  if (!window.crypto || !window.crypto.subtle) {
    try { Object.defineProperty(window, 'crypto', { value: webcrypto }); } catch (e) {}
  }
  for (const f of ['config.js', 'security.js', 'license-pubkey.js', 'license.js', 'storage.js', 'app.js',
    'patches.js', 'jalali.js', 'zoom.js', 'new-features.js', 'round2-a.js', 'round2-b.js', 'round2-c.js',
    'phonebook.js', 'ops.js', 'finance.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await sleep(2000);          // patches.js migrates 1200ms after load
  return { window, doc, errors };
}

(async function () {
  console.log('--- 1. the stored secret is PBKDF2 with a salt ---');
  let { window, doc, errors } = await boot();
  const store = () => JSON.parse(window.localStorage.getItem('alvand_operators') || '[]');
  let ops = store();
  ok(ops.length === 1, 'the seeded operator is persisted: ' + ops.length);
  const stored = ops[0].password;
  ok(/^pbkdf2\$\d+\$/.test(stored), 'stored as pbkdf2$<iters>$<salt>$<hash>: ' + stored.slice(0, 26) + '...');
  const parts = stored.split('$');
  ok(parts.length === 4, 'four fields');
  ok(parseInt(parts[1], 10) >= 100000, 'iterations >= 100k (got ' + parts[1] + ')');
  ok(atob(parts[2]).length === 16, 'a 16-byte random salt is stored');
  ok(atob(parts[3]).length === 32, 'a 32-byte derived key is stored');
  ok(!/^[0-9a-f]{64}$/i.test(stored), 'the old bare sha256 hex is gone');
  ok(stored.indexOf('1234') === -1, 'the password is not readable from the record');

  console.log('--- 2. login still works for the existing password ---');
  const fill = (u, p) => { doc.getElementById('loginUser').value = u; doc.getElementById('loginPass').value = p; };
  fill('admin', '1234');
  await window.doLogin();
  await sleep(700);
  ok(!!window.eval('currentOperator'), 'login with the original password succeeds (no lockout for upgraders)');

  console.log('--- 3. a wrong password is still rejected ---');
  window.eval('currentOperator=null; localStorage.removeItem("alvand_currentOperator")');
  fill('admin', 'nope-not-it');
  await window.doLogin();
  await sleep(400);
  ok(window.eval('currentOperator') === null, 'wrong password is rejected');

  console.log('--- 4. brute force is now throttled ---');
  let lastMsg = '';
  for (let i = 0; i < 8; i++) {
    fill('admin', 'guess-' + i);
    await window.doLogin();
    await sleep(60);
    lastMsg = doc.getElementById('loginError').textContent;
    if (/(\u0635\u0628\u0631|\u062f\u0642\u06cc\u0642\u0647|\u062b\u0627\u0646\u06cc\u0647)/.test(lastMsg)) break;
  }
  ok(/(\u0635\u0628\u0631|\u062f\u0642\u06cc\u0642\u0647|\u062b\u0627\u0646\u06cc\u0647)/.test(lastMsg), 'after a few misses the login refuses: "' + lastMsg.slice(0, 60) + '"');
  const left = window.loginLockRemaining('admin');
  ok(left > 0, 'a lock is in place for ' + Math.round(left / 1000) + 's');
  // even the CORRECT password is refused while locked - that is the point
  fill('admin', '1234');
  await window.doLogin();
  await sleep(120);
  ok(window.eval('currentOperator') === null, 'the correct password is refused while locked (no offline oracle)');
  // clear the lock for the rest of the test
  window.localStorage.removeItem('alvand_loginLock');
  ok(window.loginLockRemaining('admin') === 0, 'the lock is cleared');

  console.log('--- 5. a successful login upgrades a legacy record ---');
  const legacy = await window.sha256hex('gamenet::' + 'legacy-pass');
  window.eval("operators=[{id:9,username:'old',password:" + JSON.stringify(legacy) + ",role:'admin',perms:{}}]");
  window.localStorage.setItem('alvand_operators', JSON.stringify(window.eval('operators')));
  fill('old', 'legacy-pass');
  await window.doLogin();
  await sleep(700);
  const upgraded = JSON.parse(window.localStorage.getItem('alvand_operators'))[0].password;
  ok(/^pbkdf2\$/.test(upgraded), 'the legacy sha256 record was rewritten as PBKDF2 on login');
  ok(await window.verifyPassword(upgraded, 'legacy-pass'), 'and the password still verifies');
  ok((await window.verifyPassword(upgraded, 'other-pass')) === false, 'a wrong password does not verify');

  console.log('--- 6. plaintext records are accepted once, then upgraded ---');
  window.localStorage.removeItem('alvand_loginLock');
  window.eval("operators=[{id:10,username:'legacyPlain',password:'plaintextPw1',role:'admin',perms:{}}]");
  window.localStorage.setItem('alvand_operators', JSON.stringify(window.eval('operators')));
  fill('legacyPlain', 'plaintextPw1');
  await window.doLogin();
  await sleep(700);
  const up2 = JSON.parse(window.localStorage.getItem('alvand_operators'))[0].password;
  ok(/^pbkdf2\$/.test(up2), 'a plaintext password still logs in and is upgraded');
  ok(up2 !== 'plaintextPw1', 'the plaintext is gone from storage');

  console.log('--- 7. the editor enforces a real minimum and hashes ---');
  window.localStorage.removeItem('alvand_loginLock');
  // NOTE: a "your default password is still active" timer opens the operator
  // modal (and therefore resets the form) ~1.5s after boot, so the fields are
  // filled immediately before each save rather than once up front.
  const fillOperatorForm = (id, user, pass) => {
    doc.getElementById('opId').value = id;
    doc.getElementById('opUser').value = user;
    doc.getElementById('opRole').value = 'operator';
    doc.getElementById('opPass').value = pass;
    ['permClients', 'permBuffet', 'permReservations', 'permReports', 'permIncome', 'permExpenses', 'permCustomers', 'permBackup', 'permTariffs', 'permEmployees', 'permOperators']
      .forEach((i) => { const e = doc.getElementById(i); if (e) e.checked = false; });
  };
  const before = JSON.parse(window.localStorage.getItem('alvand_operators')).length;
  window.eval("currentOperator={id:10,username:'boss',role:'admin',perms:{}}");
  fillOperatorForm('', 'shorty', 'abc');
  await window.saveOperator();
  await sleep(500);
  ok(JSON.parse(window.localStorage.getItem('alvand_operators')).length === before, 'a 3-character password is rejected');
  fillOperatorForm('', 'shorty', 'goodpassword1');
  await window.saveOperator();
  await sleep(700);
  const created = JSON.parse(window.localStorage.getItem('alvand_operators')).find((o) => o.username === 'shorty');
  ok(!!created, 'a strong password creates the operator');
  ok(created && /^pbkdf2\$/.test(created.password), 'and it is stored hashed, not in plaintext');
  ok(created && created.password !== 'goodpassword1', 'the typed password is not readable in storage');
  ok(await window.verifyPassword(created.password, 'goodpassword1'), 'the new operator password verifies');

  console.log('--- 8. editing without typing a password keeps the old one ---');
  window.eval("currentOperator=" + JSON.stringify({ id: created.id, username: 'boss', role: 'admin', perms: {} }) + ";");
  window.editOperator(created.id);
  ok(doc.getElementById('opPass').value === '', 'the password field is blank when editing (the hash is never shown)');
  ok(/بدون تغییر/.test(doc.getElementById('opPass').placeholder || ''), 'and it says an empty field keeps the password');
  doc.getElementById('opUser').value = 'shorty-renamed';
  doc.getElementById('opRole').value = 'operator';
  await window.saveOperator();
  await sleep(700);
  const edited = JSON.parse(window.localStorage.getItem('alvand_operators')).find((o) => o.id === created.id);
  ok(edited && edited.username === 'shorty-renamed', 'the username change was saved');
  ok(edited && edited.password === created.password, 'the password was NOT overwritten with a hash of the hash');
  ok(await window.verifyPassword(edited.password, 'goodpassword1'), 'the original password still works after the rename');

  console.log('--- 9. the new operator can log in ---');
  window.localStorage.removeItem('alvand_loginLock');
  window.eval('currentOperator=null; localStorage.removeItem("alvand_currentOperator")');
  fill('shorty-renamed', 'goodpassword1');
  await window.doLogin();
  await sleep(700);
  ok(!!window.eval('currentOperator'), 'the newly created operator can log in');

  ok(errors.length === 0, 'no script errors during the whole run (' + errors.slice(0, 2).join(' | ') + ')');
  console.log(fail === 0 ? '\nALL PASSWORD-SECURITY CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
