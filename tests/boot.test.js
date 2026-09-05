/* Boot test: run renderer scripts in a stubbed browser env, ensure no top-level crash. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
function load(f) { return fs.readFileSync(path.join(ROOT, f), 'utf-8'); }

// minimal browser stubs (richer than bare minimum: app touches body/storage/network at load)
const store = {};
const sandbox = {
  console: { ...console, warn: () => {}, error: () => {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener: () => {},
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  document: {
    readyState: 'complete',
    body: { className: '', classList: { add: () => {}, remove: () => {} }, style: {} },
    addEventListener: () => {},
    querySelector: () => null,
    getElementById: () => ({ textContent: '', innerHTML: '', style: {}, classList: { add: () => {}, remove: () => {} }, value: '', checked: false, files: [], addEventListener: () => {}, appendChild: () => {} }),
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, click: () => {}, setAttribute: () => {} }),
  },
  window: {},
  navigator: { onLine: true },
  fetch: () => Promise.reject(new Error('offline in test')),
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  Notification: function () {},
  crypto: require('crypto').webcrypto,
  TextEncoder,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  PASS ' + msg);
  else { failures++; console.error('  FAIL ' + msg); }
}
for (const f of ['src/js/config.js', 'src/js/security.js', 'src/js/license-pubkey.js', 'src/js/license.js', 'src/js/storage.js', 'src/js/app.js', 'src/js/patches.js']) {
  try {
    vm.runInContext(load(f), sandbox, { filename: f });
    console.log('  LOADED ' + f);
  } catch (e) {
    failures++;
    console.error('  LOAD FAIL ' + f + ': ' + String(e.stack).split('\n').slice(0, 4).join(' | '));
  }
}
try {
  check(typeof sandbox.safeParse === 'function', 'safeParse exposed');
  check(typeof sandbox.escapeHtml === 'function', 'escapeHtml exposed');
  check(sandbox.escapeHtml('<b>"x"</b>') === '&lt;b&gt;&quot;x&quot;&lt;/b&gt;', 'escapeHtml works');
  check(sandbox.safeParse('{bad', 'FB') === 'FB', 'safeParse never throws');
  check(typeof sandbox.saveData === 'function', 'saveData exists');
  check(typeof sandbox.renderClients === 'function', 'renderClients exists');
  check(typeof sandbox.doLogin === 'function', 'doLogin exists (patched)');
  check(typeof sandbox.calculateCost === 'function', 'calculateCost exists');
  check(typeof sandbox.secureRandomId === 'function', 'secureRandomId exists');
  const id = sandbox.secureRandomId('DEV', 6, 4);
  check(/^DEV-[A-Z2-9]{6}-[A-Z0-9]{4}$/.test(id), 'secureRandomId format: ' + id);
  // calculateCost sanity: 1h @15000 = 15000
  sandbox.tariffs = { single: 15000, double: 25000, extra: 8000 };
  const cost = vm.runInContext('calculateCost({elapsed:3600, tariff:"single", extra:0})', sandbox);
  check(cost === 15000, 'calculateCost 1h single = 15000 (got ' + cost + ')');
  // corrupt storage must not crash reload
  sandbox.localStorage.setItem('alvand_clients', '{corrupt!!!');
  const parsed = vm.runInContext('safeParse(localStorage.getItem("alvand_clients"), [])', sandbox);
  check(Array.isArray(parsed) && parsed.length === 0, 'corrupt localStorage falls back safely');
} catch (e) {
  failures++;
  console.error('  CHECK ERROR: ' + e.stack);
}
console.log(failures === 0 ? 'BOOT TEST PASSED' : failures + ' BOOT TEST(S) FAILED');
process.exit(failures ? 1 : 0);
