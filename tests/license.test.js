/* License tests: RSA sign/verify roundtrip, tamper, foreign key, legacy refusal, expiry.
 * Uses the REAL src/js/license.js in a stubbed browser env (Node webcrypto as subtle).
 * Needs NO private.key (ephemeral keys) -> safe on CI. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function ok(c, m) { if (c) console.log('  PASS ' + m); else { failures++; console.error('  FAIL ' + m); } }

const webcrypto = require('crypto').webcrypto;
const sandbox = {
  console: { ...console, warn: () => {}, error: () => {} },
  setTimeout, clearTimeout,
  window: {},
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  TextEncoder, TextDecoder,
};
sandbox.window = sandbox;
sandbox.window.crypto = webcrypto;
sandbox.window.ALVAND_LICENSE_PUBKEY_SPKI_B64 = 'unused-in-these-tests';
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/license-pubkey.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/license.js'), 'utf8'), sandbox);
const LV = sandbox.LicVerify;

ok(typeof LV.verifyWithKey === 'function', 'LicVerify exposed');
ok(typeof sandbox.ALVAND_LICENSE_PUBKEY_SPKI_B64 === 'string' && sandbox.ALVAND_LICENSE_PUBKEY_SPKI_B64.length > 200, 'shipped public key present');

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function spkiB64(key) {
  return key.export({ type: 'spki', format: 'der' }).toString('base64');
}

(async function () {
  // ephemeral seller key (test-only, never shipped)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubB64 = spkiB64(publicKey);

  const payload = { v: 1, id: 'L-TEST-0001', customer: 'تست', phone: '09', cap: 5, months: 12, exp: Date.now() + 86400000, maxDev: 5, iat: Date.now() };
  const canon = LV.canonPayload(payload);
  ok(canon === '{"v":1,"id":"L-TEST-0001","customer":"تست","phone":"09","cap":5,"months":12,"exp":' + payload.exp + ',"maxDev":5,"iat":' + payload.iat + '}', 'canonical payload byte-stable (fa text)');
  const sig = crypto.sign('sha256', Buffer.from(canon, 'utf8'), { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });
  const token = 'ALV2.' + b64url(Buffer.from(canon, 'utf8')) + '.' + b64url(sig);

  // 1. genuine verifies through the REAL app verifier
  const r1 = await LV.verifyWithKey(pubB64, token);
  ok(r1.ok === true && r1.payload.id === 'L-TEST-0001', 'genuine token verifies (app code path)');

  // 2. whitespace grouping (copy/paste UX) still verifies
  const r1b = await LV.verifyWithKey(pubB64, token.replace(/(.{64})/g, '$1 '));
  ok(r1b.ok === true, 'spaced token verifies');

  // 3. tampered capacity rejected
  const evil = { ...payload, cap: 99 };
  const evilCanon = LV.canonPayload(evil);
  const tampered = 'ALV2.' + b64url(Buffer.from(evilCanon, 'utf8')) + '.' + token.split('.')[2];
  const r2 = await LV.verifyWithKey(pubB64, tampered);
  ok(r2.ok === false, 'tampered capacity rejected');

  // 4. foreign key rejected
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const r3 = await LV.verifyWithKey(spkiB64(other.publicKey), token);
  ok(r3.ok === false, 'foreign-key signature rejected');

  // 5. legacy ALV- refused with migration message
  const r4 = LV.parseToken('ALV-003-12-ABCD-EFGH');
  ok(r4.structural === false && /ALV2/.test(r4.error), 'legacy ALV- refused (' + r4.error.slice(0, 40) + '…)');

  // 6. malformed refused
  ok(LV.parseToken('hello').structural === false, 'garbage refused');
  ok(LV.parseToken('ALV2.broken').structural === false, 'truncated refused');

  // 7. expiry helpers
  ok(LV.isExpired({ exp: Date.now() - 1000 }) === true, 'expired detected');
  ok(LV.isExpired({ exp: null }) === false, 'lifetime never expires');
  ok(LV.isExpired({ exp: Date.now() + 86400000 }) === false, 'future valid');
  ok(typeof LV.daysLeft({ exp: Date.now() + 86400000 }) === 'number', 'daysLeft number');

  console.log(failures === 0 ? 'LICENSE TESTS PASSED' : failures + ' FAILED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
