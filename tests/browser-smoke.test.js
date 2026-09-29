/* Real-browser smoke test: loads index.html in headless Chrome/Edge with the real
 * renderer scripts, then asserts the app boots without a single uncaught error
 * and that every section renders. This is the test that would have caught the
 * missing element ids, the renderCustomers shadowing and the zoom seam.
 *
 * Needs Chrome or Edge; SKIPS (exit 0) when none is installed so the pipeline
 * stays green on machines without a browser.
 *
 *   node tests/browser-smoke.test.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!exe) {
  console.log('  SKIP no Chrome/Edge found - browser smoke test not run');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gamenet-smoke-'));
const probeSrc = fs.readFileSync(path.join(__dirname, 'browser-smoke-probe.js'), 'utf8');
fs.writeFileSync(path.join(tmp, 'probe.js'), probeSrc, 'utf8');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// load the probe BEFORE the app scripts so its error/unhandledrejection
// listeners are the first ones registered
html = html.replace(/<script src="src\/js\/config\.js"><\/script>/, '<script src="probe.js"></script>\n<script src="src/js/config.js"></script>');
fs.writeFileSync(path.join(tmp, 'index.html'), html, 'utf8');
fs.cpSync(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'assets'))) fs.cpSync(path.join(ROOT, 'assets'), path.join(tmp, 'assets'), { recursive: true });

const res = spawnSync(exe, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--disable-background-networking', '--disable-sync', '--disable-extensions',
  '--virtual-time-budget=8000', '--user-data-dir=' + path.join(tmp, 'prof'),
  '--dump-dom', 'file:///' + path.join(tmp, 'index.html').replace(/\\/g, '/'),
], { encoding: 'utf8', maxBuffer: 96 * 1024 * 1024, timeout: 180000 });

const out = res.stdout || '';
const m = out.match(/<div id="__probe_result">([\s\S]*?)<\/div>/);
let failures = 0;
const ok = (c, msg, extra) => {
  if (c) console.log('  PASS ' + msg);
  else { failures++; console.error('  FAIL ' + msg + (extra ? ' -> ' + extra : '')); }
};
if (!m) {
  console.error('  FAIL the probe never produced a result (browser did not run the page?)');
  console.error('  exit=' + res.status + ' stderr=' + String(res.stderr || '').slice(0, 400));
  process.exit(1);
}
let data;
try {
  data = JSON.parse(m[1]
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
} catch (e) {
  console.error('  FAIL probe result was not valid JSON: ' + m[1].slice(0, 300));
  process.exit(1);
}

console.log('[gamenet] browser smoke test (' + path.basename(exe) + ')');
for (const k of Object.keys(data.checks || {})) {
  ok(data.checks[k] === true, 'check: ' + k, typeof data.checks[k] === 'string' ? data.checks[k] : JSON.stringify(data.checks[k]));
}
ok(Array.isArray(data.errs) && data.errs.length === 0, 'no uncaught errors at boot', (data.errs || []).slice(0, 3).join(' | '));
ok((data.sectionErrs || []).length === 0, 'every section renders without throwing', (data.sectionErrs || []).slice(0, 3).join(' | '));
ok((data.unreachable || []).length === 0, 'every section is reachable from the sidebar', (data.unreachable || []).join(','));
ok((data.dupIds || []).length === 0, 'no duplicate element ids', (data.dupIds || []).join(','));
ok((data.badHandlers || []).length === 0, 'no inline handler inlines user data', (data.badHandlers || []).join(' | '));
ok((data.missingIds || []).length === 0, 'no missing element ids', (data.missingIds || []).join(','));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
console.log(failures === 0 ? 'BROWSER SMOKE PASSED' : failures + ' BROWSER CHECK(S) FAILED');
process.exit(failures ? 1 : 0);
