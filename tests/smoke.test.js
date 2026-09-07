/* Smoke tests - plain node, no dependencies. Run: npm test / npm run validate */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;

function ok(cond, msg) {
  if (cond) {
    console.log('  PASS ' + msg);
  } else {
    failures++;
    console.error('  FAIL ' + msg);
  }
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf-8');
}

console.log('[gamenet] smoke tests');

// 1. structure
for (const f of [
  'main.js', 'preload.js', 'index.html', 'package.json',
  'src/js/config.js', 'src/js/security.js', 'src/js/storage.js',
  'src/js/app.js', 'src/js/patches.js', 'src/styles/main.css',
  'config.example.json', '.gitignore', 'LICENSE',
  'assets/icon.ico',
  '.github/workflows/build-windows.yml',
]) {
  ok(fs.existsSync(path.join(ROOT, f)), 'exists: ' + f);
}

// 1b. icon is a real ICO file (not a renamed png/txt) with a 256px entry (electron-builder requires it)
try {
  const ico = fs.readFileSync(path.join(ROOT, 'assets/icon.ico'));
  const count = ico.readUInt16LE(4);
  let maxSize = 0;
  for (let i = 0; i < count; i++) {
    const w = ico[6 + i * 16] || 256;
    if (w > maxSize) maxSize = w;
  }
  ok(ico.length > 1000 && ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0, 'assets/icon.ico is a valid ICO (' + ico.length + ' bytes)');
  ok(maxSize >= 256, 'assets/icon.ico has 256px entry (max ' + maxSize + 'px)');
} catch (e) {
  ok(false, 'assets/icon.ico readable: ' + e.message);
}

// 2. package.json
try {
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.version === '1.8.1', 'package version is 1.8.1 (got ' + pkg.version + ')');
  const files = JSON.stringify(pkg.build && pkg.build.files || []);
  ok(files.includes('src/**/*'), 'electron-builder includes src/**');
  ok(files.includes('preload.js'), 'electron-builder includes preload.js');
  ok(files.includes('assets/**/*'), 'electron-builder includes assets/**');
  ok(pkg.license === 'MIT', 'license field MIT');
  ok(!JSON.stringify(pkg).includes('AIzaSy'), 'no hardcoded firebase key in package.json');
} catch (e) {
  ok(false, 'package.json parses: ' + e.message);
}

// 3. main.js hardening
try {
  const m = read('main.js');
  ok(!/devTools:\s*true/.test(m), 'main.js has no unconditional devTools:true');
  ok(m.includes('sandbox: true'), 'main.js sandbox:true');
  ok(m.includes('contextIsolation: true'), 'main.js contextIsolation:true');
  ok(m.includes('nodeIntegration: false'), 'main.js nodeIntegration:false');
  ok(m.includes('requestSingleInstanceLock'), 'main.js single-instance lock');
  ok(m.includes('preload.js'), 'main.js uses preload');
  ok(m.includes('removeMenu'), 'main.js removes menu in prod');
  ok(m.includes('setWindowOpenHandler'), 'main.js locks new windows');
  ok(m.includes('gamenet:backup-write'), 'main.js backup IPC exists');
} catch (e) {
  ok(false, 'main.js readable: ' + e.message);
}

// 4. preload
try {
  const p = read('preload.js');
  ok(p.includes('contextBridge'), 'preload uses contextBridge');
  ok(p.includes('gamenet'), 'preload exposes gamenet API');
} catch (e) {
  ok(false, 'preload readable: ' + e.message);
}

// 5. index.html shell
try {
  const h = read('index.html');
  ok(h.includes('Content-Security-Policy'), 'index.html has CSP meta');
  // Fail-closed boot: gates visible on first paint, gating runs before any render.
  ok(/id="licenseOverlay"[^>]*\bshow\b/.test(h), 'license gate visible by default');
  ok(!/id="loginOverlay"[^>]*display\s*:\s*none/.test(h), 'login gate visible by default');
  const initBody = (function () {
    const src = read('src/js/app.js');
    const i = src.indexOf('function init() {');
    return i >= 0 ? src.slice(i, i + 2600) : '';
  })();
  // gates first, heavy renders deferred (lazy boot) — both orders are fail-closed
  ok(initBody.indexOf('checkLogin();') !== -1 && initBody.indexOf('checkLogin();') < initBody.indexOf('updateStats();'), 'init locks (login) before rendering');
  ok(initBody.indexOf('initLicenseGate();') !== -1 && initBody.indexOf('initLicenseGate();') < initBody.indexOf('updateStats();'), 'init locks (license) before rendering');
  ok(initBody.includes('renderClients, renderReservations'), 'heavy renders deferred past first paint');
  // NOTE: script-src MUST keep 'unsafe-inline': the app uses ~160 inline onclick
  // handlers; without it every button silently dies (no error in UI, only console).
  // XSS is still covered by escapeHtml on all user content (see app.js checks).
  ok(/script-src[^;]*'unsafe-inline'/.test(h), 'CSP allows the app inline handlers');
  ok(h.includes('src/js/app.js'), 'index.html loads src/js/app.js');
  ok(h.includes('src/styles/main.css'), 'index.html loads main.css');
  ok(h.includes('src/js/security.js'), 'index.html loads security.js');
  ok(h.includes('src/js/patches.js'), 'index.html loads patches.js last');
  ok(!h.includes('AIzaSy'), 'index.html has no hardcoded firebase key');
  const bigInline = (h.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g) || [])
    .some((b) => b.length > 50000);
  ok(!bigInline, 'index.html has no giant inline script (modularized)');
  ok(h.length < 120000, 'index.html shell is slim (<120KB, got ' + h.length + ')');
} catch (e) {
  ok(false, 'index.html readable: ' + e.message);
}

// 6. app.js patches applied
try {
  const a = read('src/js/app.js');
  const s = read('src/js/security.js');
  ok(s.includes('hardenNativeDialogs') && s.includes('__focusSafe'), 'native dialogs focus-safe (typing survives confirm/prompt)');
  ok(a.includes('safeParse('), 'app.js uses safeParse (corrupt-JSON safe)');
  ok(a.includes('escapeHtml('), 'app.js uses escapeHtml (XSS)');
  ok(!a.includes('رمز: ${op.password}'), 'app.js no longer renders operator passwords');
  ok(a.includes('secureRandomId'), 'app.js uses secureRandomId for device id');
  ok(a.includes('_lastPersist'), 'app.js throttles disk writes (no save-every-second)');
  ok(!a.includes('AIzaSyDEe0'), 'app.js has no hardcoded firebase apiKey');
  ok(a.includes('ensureFirebase'), 'app.js lazy firebase init');
} catch (e) {
  ok(false, 'app.js readable: ' + e.message);
}

// 7. css + config
try {
  const css = read('src/styles/main.css');
  ok(css.length > 5000, 'main.css non-empty (' + css.length + ' chars)');
  ok(css.includes('--active-accent'), 'main.css defines --active-accent var');
  ok(css.includes('.client-card-active'), 'main.css styles active client cards');
  ok(css.includes('.active-pill') && css.includes('.active-row'), 'main.css styles active pill + dashboard rows');
  const ex = read('config.example.json');
  ok(ex.includes('PUT_YOUR'), 'config.example.json uses placeholders');
  ok(!fs.existsSync(path.join(ROOT, 'config.local.json')), 'config.local.json NOT committed (gitignored secret)');
} catch (e) {
  ok(false, 'css/config readable: ' + e.message);
}

// 7b. admin credentials + theme accents
try {
  const h2 = read('index.html');
  ok(h2.includes('adminCredCard') && h2.includes('changeAdminCredentials'), 'settings has admin credential card');
  const a3 = read('src/js/app.js');
  ok(a3.includes('function changeAdminCredentials') && a3.includes('function syncAdminCredCard') && a3.includes('function getAdminOp'), 'admin credential functions exist');
  ok(a3.includes('sha256hex') && a3.includes('gamenet::'), 'admin password is hashed (not plaintext)');
  const accents = (a3.match(/accent:'#[0-9a-fA-F]{6}'/g) || []).length;
  ok(accents >= 21, 'all 21 themes have accent colors (found ' + accents + ')');
  ok(a3.includes("id:'roshan'"), 'light theme exists');
  const css2 = read('src/styles/main.css');
  ok(css2.includes('body.theme-roshan'), 'light theme styles exist');
  ok(css2.includes('#ffd700'), 'gold theme is really gold');
  ok(a3.includes('client-card-active') && a3.includes('active-row') && a3.includes('getThemeAccent'), 'active-card accent wiring exists');
} catch (e) {
  ok(false, 'features readable: ' + e.message);
}

// 7c. tariff simplification + pro-rata extras
try {
  const h3 = read('index.html');
  ok(!h3.includes('id="newClientTariff"'), 'tariff select removed from add-client modal');
  ok(!h3.includes('>دو نفره</h3>'), 'double tariff card removed from tariffs page');
  ok(h3.includes('id="tariffSingle"') && h3.includes('id="tariffDouble"'), 'base prices kept (collapsed details)');
  const a4 = read('src/js/app.js');
  ok(a4.includes('function changeClientExtra'), 'mid-game extra stepper exists');
  ok(a4.includes('extraSeconds'), 'pro-rata extra accounting exists');
  ok(!/rate \+= \(client\.extra \|\| 0\) \* getExtraRate\(\)/.test(a4), 'old full-duration extra billing gone');
} catch (e) {
  ok(false, 'tariff features readable: ' + e.message);
}

// 7d. fast boot + lite mode + db tools
try {
  const h4 = read('index.html');
  ok(h4.includes('media="print"'), 'fonts stylesheet non-blocking');
  ok(h4.includes('liteModeToggle') && h4.includes('setLiteMode'), 'lite mode toggle exists');
  ok(h4.includes('dbSizeText') && h4.includes('pruneOldSessions'), 'db tools UI exists');
  const a5 = read('src/js/app.js');
  const initSrc = a5.slice(a5.indexOf('function init() {'), a5.indexOf('function init() {') + 2600);
  ok(initSrc.indexOf('checkLogin();') < initSrc.indexOf('renderWeeklyChart();'), 'boot still locks first');
  ok(initSrc.includes('renderClients, renderReservations'), 'heavy renders deferred');
  ok(!/^\s*renderClients\(\);/m.test(initSrc.split('setTimeout(function(){')[0]), 'no eager heavy render before defer');
  ok(a5.includes('function setLiteMode') && a5.includes('function pruneOldSessions') && a5.includes('function getDbSizeText'), 'lite + prune functions exist');
  const css3 = read('src/styles/main.css');
  ok(css3.includes('body.lite'), 'lite mode styles exist');
} catch (e) {
  ok(false, 'perf features readable: ' + e.message);
}

// 8b. signed-license system
try {
  ok(fs.existsSync(path.join(ROOT, 'src/js/license-pubkey.js')), 'exists: src/js/license-pubkey.js');
  ok(fs.existsSync(path.join(ROOT, 'src/js/license.js')), 'exists: src/js/license.js');
  ok(fs.existsSync(path.join(ROOT, 'license-tools/gen-license.js')), 'exists: license-tools/gen-license.js');
  ok(fs.existsSync(path.join(ROOT, 'license-tools/gen-license.bat')), 'exists: license-tools/gen-license.bat');
  ok(fs.existsSync(path.join(ROOT, 'database.rules.json')), 'exists: database.rules.json');
  const h = read('index.html');
  ok(h.includes('src/js/license.js'), 'index.html loads license.js before app.js');
  ok(h.indexOf('<script src="src/js/license.js"') < h.indexOf('<script src="src/js/app.js"'), 'license.js order correct');
  const a2 = read('src/js/app.js');
  ok(a2.includes('verifyLicenseToken'), 'app.js verifies RSA signatures');
  ok(!a2.includes('licHash(licSecret()'), 'app.js no longer accepts symmetric-checksum keys');
  ok(a2.includes('ALV2'), 'app.js knows ALV2 format');
  const gi = read('.gitignore');
  ok(gi.includes('license-tools/private.key'), '.gitignore covers seller private key');
  const pkg2 = JSON.parse(read('package.json'));
  const fl = JSON.stringify(pkg2.build.files);
  ok(!fl.includes('license-tools'), 'seller tool NOT packaged into customer app');
  ok(!fl.includes('private'), 'no private key in packaged files');
  const idx = read('index.html');
  ok(!idx.includes('private.key'), 'index.html never references seller private key');
} catch (e) {
  ok(false, 'license system files: ' + e.message);
}

// 9. workflow hygiene
try {
  const w = read('.github/workflows/build-windows.yml');
  ok(w.includes('npm ci'), 'workflow uses npm ci');
  ok(w.includes("cache: 'npm'") || w.includes('cache: "npm"'), 'workflow caches npm');
  ok(!w.includes('v1.8.${{'), 'workflow no longer hardcodes v1.8 tag mismatch');
  ok(w.includes("refs/tags/v"), 'workflow releases on tags only');
} catch (e) {
  ok(false, 'workflow readable: ' + e.message);
}

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
