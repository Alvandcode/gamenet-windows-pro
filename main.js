/**
 * Gamenet Manager Pro - Electron Main Process (hardened)
 *
 * Fixes vs original main.js:
 * - devTools disabled in production (only with --dev / NODE_ENV=development)
 * - sandbox + contextIsolation + no nodeIntegration + preload bridge
 * - single-instance lock (prevents double timers / double writes)
 * - window bounds persistence
 * - default menu removed in production
 * - navigation / new-window locked (external links -> system browser)
 * - permission hardening (only notifications allowed)
 * - atomic file backup IPC (renderer data mirrored to userData, not only LocalStorage)
 * - icon fallback (icon.ico -> logo.ico -> none)
 */
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const dns = require('dns');
const net = require('net');
const { fileURLToPath } = require('url');
const { execFileSync } = require('child_process');

const APP_INDEX_PATH = path.resolve(__dirname, 'index.html');

// Only the app's own document may be navigated to. A crafted file:// link used
// to be able to load any local HTML page while the preload bridge was attached.
function isOwnDocument(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'file:') return false;
    return path.resolve(fileURLToPath(u)) === APP_INDEX_PATH;
  } catch { return false; }
}

// SMS gateways are user-configurable, but the IPC bridge must not become a
// general-purpose HTTP proxy or an SSRF primitive for cloud metadata/localhost.
// A hostname-only check was bypassable with IPv6 literals and DNS rebinding, so
// the hostname is resolved once and the actual address used for the request is
// checked. Private, loopback, link-local, CGNAT, multicast and documentation
// ranges are all rejected.
function ipv4ToInt(ip) {
  return ip.split('.').reduce((n, o) => ((n << 8) + (Number(o) & 255)) >>> 0, 0);
}
function inV4(ip, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}
function isPrivateAddress(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) {
    return ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
      '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
      '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
      '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4']
      .some((cidr) => {
        const [base, bits] = cidr.split('/');
        return inV4(ip, base, Number(bits));
      });
  }
  if (fam === 6) {
    const low = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (low === '::' || low === '::1') return true;
    // IPv4-mapped addresses (::ffff:127.0.0.1) are checked as IPv4
    const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd)/.test(low) || /^fe[89ab]/.test(low) || /^ff/.test(low) ||
      /^2001:db8:/.test(low) || /^::ffff:/.test(low);
  }
  return true;
}
function hostIsBlocked(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'metadata.google.internal' || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (net.isIP(h)) return isPrivateAddress(h);
  return false;
}
function smsDestinationAllowed(u) {
  return !hostIsBlocked(u.hostname);
}
async function resolvePublicIp(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (hostIsBlocked(h)) throw new Error('destination is not allowed');
  if (net.isIP(h)) return h;
  const list = await dns.promises.lookup(h, { all: true, verbatim: true });
  if (!list.length) throw new Error('destination did not resolve');
  for (const rec of list) {
    if (isPrivateAddress(rec.address)) throw new Error('destination resolves to a private address');
  }
  return list[0].address;
}

// Stable hardware fingerprint for license binding.
//
// Must survive the things that legitimately change on a customer's PC:
//   - plugging/unplugging a USB Wi-Fi dongle or a docking station
//   - enabling/disabling the built-in adapter
//   - renaming the machine
//   - a virtual adapter (Hyper-V / VPN / WSL) coming and going
// The old version hashed EVERY non-internal MAC plus the hostname, so any of
// the above bricked the license and the owner had to call the seller.
// Now: the sorted set of permanent-looking MACs is reduced to a single stable
// "primary" adapter, and the hostname is dropped. If nothing qualifies we fall
// back to the previous scheme so binding still works at all.
const TRANSIENT_MAC_PREFIXES = ['00:05:69', '00:0c:29', '00:1c:42', '00:15:5d', '00:50:56', '02:42:ac', '0a:00:27', '00:16:3e', '00:1b:78', '08:00:27'];
function isTransientMac(mac) {
  const m = String(mac).toLowerCase();
  if (m.startsWith('00:00:00')) return true;
  return TRANSIENT_MAC_PREFIXES.some((p) => m.startsWith(p)); // hyper-v / vmware / virtualbox / docker
}
function permanentMacs() {
  const out = [];
  try {
    const ifs = os.networkInterfaces() || {};
    for (const name of Object.keys(ifs)) {
      for (const nic of ifs[name] || []) {
        if (!nic || !nic.mac || nic.internal) continue;
        const mac = nic.mac.toLowerCase();
        if (mac === '00:00:00:00:00:00' || isTransientMac(mac)) continue;
        out.push(mac);
      }
    }
  } catch { /* ignore */ }
  return [...new Set(out)].sort();
}
function legacyDeviceFingerprint() {
  try {
    const macs = permanentMacs();
    let user = '';
    try { user = (os.userInfo() || {}).username || ''; } catch { /* ignore */ }
    let cpu = '';
    try { cpu = ((os.cpus() || [])[0] || {}).model || ''; } catch { /* ignore */ }
    let stable = 'none';
    if (macs.length) stable = macs[0];
    else stable = [os.platform(), os.arch(), user, cpu].join('|');
    const raw = [stable, os.platform(), os.arch()].join('|');
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  } catch { return ''; }
}
/* Windows MachineGuid survives NIC changes and is not controlled by the MAC
 * ordering. It is used for new fingerprints; legacyDeviceFingerprint() exists
 * only to migrate licenses issued by older builds. */
function windowsMachineGuid() {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', ['query', 'HKLM\SOFTWARE\Microsoft\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8', timeout: 1500, windowsHide: true,
    });
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/);
    return m ? m[1].toLowerCase() : '';
  } catch { return ''; }
}
function deviceFingerprint() {
  try {
    const guid = windowsMachineGuid();
    if (guid) {
      const raw = ['guid', guid, os.platform(), os.arch()].join('|');
      return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
    }
    return legacyDeviceFingerprint();
  } catch {
    return '';
  }
}

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

// Single instance - prevents double timers / double writes to the same storage
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  // keep loading: the remaining top-level work is IPC + window creation only
}

// Stable taskbar identity: the installer shortcut and the running app must
// share one AppUserModelId (same as electron-builder appId), otherwise Windows
// shows a second/default icon once the app is pinned to the taskbar.
//
// The id is new on purpose. The shell caches a taskbar icon per AppUserModelId
// and never re-reads it, so every shop that ran an older build has "no icon"
// cached against the previous id and would keep the blank-page icon forever.
try { app.setAppUserModelId('com.alvand.gamenet.pro'); } catch { /* ignore */ }

let mainWindow = null;

/* The shell - not Electron - decides the taskbar icon, and it reads it from the
 * filesystem. A path inside app.asar does not exist for it, so the ico is also
 * shipped unpacked next to the exe (extraResources in package.json) and that
 * copy is preferred here. */
function resolveIcon() {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(path.dirname(process.execPath || ''), 'icon.ico'),
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(__dirname, 'assets', 'logo.ico'),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined;
}

/* Give the shell a shortcut whose icon it can resolve. Without one it has only
 * the exe to work from, and a portable copy or a direct launch gives it nothing
 * useful. Writing it here means the taskbar icon is right however the shop
 * started the app. Uses PowerShell's WScript.Shell because Node cannot write
 * .lnk files. */
function ensureStartMenuShortcut(iconPath) {
  if (!iconPath) return;
  let exePath;
  try { exePath = process.execPath; } catch { return; }
  try {
    if (process.env.PORTABLE_EXECUTABLE_DIR) return; // portable: no Start Menu entry
  } catch { /* ignore */ }
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows',
    'Start Menu', 'Programs', 'Gamenet Manager Pro.lnk');
  const ps = [
    '$sh = New-Object -ComObject WScript.Shell',
    '$l = $sh.CreateShortcut(' + JSON.stringify(lnk) + ')',
    '$l.TargetPath = ' + JSON.stringify(exePath),
    '$l.WorkingDirectory = ' + JSON.stringify(path.dirname(exePath)),
    '$l.IconLocation = ' + JSON.stringify(iconPath + ',0'),
    "$l.Description = 'Gamenet Manager Pro'",
    '$l.Save()',
  ].join('; ');
  try {
    const { spawnSync } = require('child_process');
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 15000, windowsHide: true });
  } catch { /* a missing shortcut is cosmetic; never block startup on it */ }
}

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  const fallback = { width: 1280, height: 800 };
  try {
    const raw = fs.readFileSync(stateFile(), 'utf-8');
    const s = JSON.parse(raw);
    if (typeof s.width === 'number' && typeof s.height === 'number') {
      const out = { width: Math.max(900, Math.min(10000, Math.round(s.width))),
                   height: Math.max(600, Math.min(10000, Math.round(s.height))) };
      // A window remembered on a monitor that is now unplugged would open
      // off-screen with no way to reach it.
      if (typeof s.x === 'number' && typeof s.y === 'number') {
        const { screen } = require('electron');
        const vis = screen.getAllDisplays().some((d) => {
          const w = d.workArea;
          return s.x < w.x + w.width - 60 && s.x + out.width > w.x + 60 &&
                 s.y < w.y + w.height - 40 && s.y + 60 > w.y;
        });
        if (vis) { out.x = Math.round(s.x); out.y = Math.round(s.y); }
      }
      return out;
    }
  } catch { /* first run or corrupt -> fallback */ }
  return fallback;
}

function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    const tmp = stateFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(bounds), 'utf-8');
    fs.renameSync(tmp, stateFile());
  } catch { /* never crash shutdown because of state save */ }
}

function backupDir() {
  return path.join(app.getPath('userData'), 'backups');
}

function backupFilePath(name) {
  const safe = String(name || 'gamenet-backup').replace(/[^a-zA-Z0-9-_.]/g, '_').slice(0, 80);
  return path.join(backupDir(), safe.endsWith('.json') ? safe : safe + '.json');
}

function setupBackupIPC() {
  // Renderer sends full JSON dump -> written atomically to userData/backups/
  // Fixes "backup stored inside the same LocalStorage it backs up".
  ipcMain.handle('gamenet:backup-write', async (_evt, { name, data }) => {
    try {
      if (typeof data !== 'string' || data.length === 0) throw new Error('empty backup');
      if (data.length > 50 * 1024 * 1024) throw new Error('backup too large (>50MB)');
      JSON.parse(data); // validate
      fs.mkdirSync(backupDir(), { recursive: true });
      const target = backupFilePath(name || ('gamenet-backup-' + new Date().toISOString().replace(/[:.]/g, '-')));
      const tmp = target + '.tmp';
      fs.writeFileSync(tmp, data, 'utf-8');
      fs.renameSync(tmp, target);
      /* Retention policy.
         The renderer writes one auto mirror per hour. Keeping only 14 files
         meant ~14 hours of history (and earlier, when it wrote every 5s, only
         minutes). Keep:
           - the newest 48 hourly auto mirrors (~2 days, fine-grained)
           - the newest auto mirror of each of the last 30 days
           - the newest 30 manual/daily backups
         Unknown files are left alone so a user's renamed backup is never
         deleted by the app. */
      try {
        const files = fs.readdirSync(backupDir())
          .filter((f) => f.endsWith('.json'))
          .map((f) => ({ f, t: (() => { try { return fs.statSync(path.join(backupDir(), f)).mtimeMs; } catch (_) { return 0; } })() }))
          .sort((a, b) => b.t - a.t);

        const autos = files.filter((x) => /^gamenet-auto-/.test(x.f));
        const manuals = files.filter((x) => /^gamenet-backup-/.test(x.f));
        const keep = new Set(autos.slice(0, 48).map((x) => x.f));

        const days = new Set();
        for (const x of autos) {
          const m = x.f.match(/^gamenet-auto-(\d{4}-\d{2}-\d{2})/);
          if (!m || days.has(m[1])) continue;
          days.add(m[1]);
          keep.add(x.f);
          if (days.size >= 30) break;
        }
        manuals.slice(0, 30).forEach((x) => keep.add(x.f));

        for (const x of files) {
          if (keep.has(x.f)) continue;
          // only prune files this app created; keep unknown/user files
          if (!/^(gamenet-auto-|gamenet-backup-)/.test(x.f)) continue;
          try { fs.unlinkSync(path.join(backupDir(), x.f)); } catch { /* ignore */ }
        }
      } catch { /* ignore pruning errors */ }
      return { ok: true, path: target };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('gamenet:backup-read', async (_evt, { name } = {}) => {
    try {
      if (name) {
        return { ok: true, data: fs.readFileSync(backupFilePath(name), 'utf-8') };
      }
      const files = fs.readdirSync(backupDir()).filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, t: fs.statSync(path.join(backupDir(), f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      if (!files.length) return { ok: false, error: 'no backup found' };
      return { ok: true, data: fs.readFileSync(path.join(backupDir(), files[0].f), 'utf-8'), name: files[0].f };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('gamenet:get-paths', async () => ({
    ok: true,
    userData: app.getPath('userData'),
    backups: backupDir(),
    version: app.getVersion(),
  }));

  ipcMain.handle('gamenet:device-fingerprint', async () => {
    const fp = deviceFingerprint();
    return fp ? { ok: true, fp } : { ok: false, error: 'unavailable' };
  });
  ipcMain.handle('gamenet:device-fingerprint-legacy', async () => {
    const fp = legacyDeviceFingerprint();
    return fp ? { ok: true, fp } : { ok: false, error: 'unavailable' };
  });

  /* The license clock used to live only in localStorage, so clearing site data
   * (or deleting one key) disabled the "clock moved backwards" check. Mirror
   * the highest timestamp seen into userData; the renderer asks before it
   * trusts a date. The file is intentionally not part of a restore. */
  ipcMain.handle('gamenet:license-clock', async (_evt, nowValue) => {
    try {
      const now = Number(nowValue);
      if (!isFinite(now) || now <= 0) return { ok: false, error: 'bad time' };
      const file = path.join(app.getPath('userData'), 'license-clock.json');
      let last = 0;
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        last = Number(saved && saved.last) || 0;
      } catch { /* first run */ }
      const tolerance = 6 * 60 * 60 * 1000;
      if (last > 0 && now < last - tolerance) return { ok: true, tampered: true, last };
      if (now > last) {
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, JSON.stringify({ last: now }), 'utf8');
        } catch { /* read-only installs still get the in-memory check */ }
      }
      return { ok: true, tampered: false, last: Math.max(last, now) };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('gamenet:open-external', async (_evt, url) => {    try {
      const u = new URL(String(url));
      if (!['https:', 'http:', 'mailto:'].includes(u.protocol)) throw new Error('blocked protocol');
      await shell.openExternal(u.toString());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // SMS panel sending from the main process (no renderer CSP limits).
  ipcMain.handle('gamenet:sms-send', async (_evt, opts = {}) => {
    try {
      const rawUrl = String(opts.url || '');
      if (rawUrl.length > 4096) throw new Error('URL too long');
      const u = new URL(rawUrl);
      if (!['https:', 'http:'].includes(u.protocol)) throw new Error('blocked protocol');
      if (u.username || u.password) throw new Error('credentials in URL are not allowed');
      if (!smsDestinationAllowed(u)) throw new Error('destination is not allowed');
      const resolvedIp = await resolvePublicIp(u.hostname);
      const method = String(opts.method || 'GET').toUpperCase();
      if (!['GET', 'POST'].includes(method)) throw new Error('blocked method');
      const rawHeaders = (opts.headers && typeof opts.headers === 'object') ? opts.headers : {};
      const headers = {};
      let headerCount = 0;
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (++headerCount > 30) throw new Error('too many headers');
        if (!/^[A-Za-z0-9-]+$/.test(k)) throw new Error('invalid header name');
        const hv = String(v == null ? '' : v);
        if (hv.length > 4096 || /[\r\n]/.test(hv)) throw new Error('invalid header value');
        headers[k] = hv;
      }
      const body = opts.body != null ? String(opts.body) : null;
      if (body && body.length > 65536) throw new Error('body too large');
      const lib = u.protocol === 'https:' ? https : http;
      const result = await new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, arg) => { if (settled) return; settled = true; fn(arg); };
        let req;
        try {
          req = lib.request({
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + (u.search || ''),
            method,
            headers,
            timeout: 15000,
            // Use the address we validated, not a second DNS answer that could
            // have been rebound between the check and the request.
            lookup: (_host, _opts, cb) => cb(null, resolvedIp, net.isIP(resolvedIp)),
            servername: u.protocol === 'https:' ? u.hostname : undefined,
          }, (res) => {
            let data = '';
            let aborted = false;
            res.on('data', (chunk) => {
              data += chunk;
              if (data.length > 65536) {
                // The old code called req.destroy() with no error: the promise
                // never settled, so sendBulkSms() froze forever on that entry.
                aborted = true;
                try { req.destroy(); } catch (_) {}
                done(resolve, { ok: false, status: res.statusCode, error: 'response too large (>64KB)' });
              }
            });
            res.on('end', () => {
              if (aborted) return;
              done(resolve, { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: String(data).slice(0, 500) });
            });
            res.on('error', (e) => done(reject, e));
          });
        } catch (e) { done(reject, e); return; }
        req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch (_) {} });
        // a socket that dies without an 'error' must still settle the promise
        req.on('error', (e) => done(reject, e));
        req.on('close', () => done(resolve, { ok: false, error: 'connection closed' }));
        if (body && method !== 'GET') req.write(body);
        req.end();
      });
      return result;
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  /* LAN agent calls (warn / lock / unlock / shutdown / status) go out from the
     main process. The renderer's CSP deliberately does not allow plain http to
     arbitrary LAN addresses - "http://192.168.*" and friends are not valid CSP
     host sources, so Chromium ignored them and every agent button silently
     failed. Doing the request here keeps the strict CSP and still reaches the
     machines on the shop LAN. */
  const AGENT_PORT = 48721;
  ipcMain.handle('gamenet:agent-request', async (_evt, opts = {}) => {
    const ip = String(opts.ip || '').trim();
    const rawPath = String(opts.path || '');
    const agentToken = String(opts.token || '');
    if (agentToken && !/^[A-Za-z0-9_-]{16,128}$/.test(agentToken)) return { ok: false, error: 'bad token' };
    // only a bare IPv4 host and a same-origin-looking path: the renderer must
    // not be able to use this as a general-purpose proxy
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { ok: false, error: 'bad ip' };
    if (ip.split('.').some((o) => Number(o) > 255)) return { ok: false, error: 'bad ip' };
    if (!/^\/[A-Za-z0-9\-._~/?&=%+:@]*$/.test(rawPath) || rawPath.startsWith('//')) {
      return { ok: false, error: 'bad path' };
    }
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, arg) => { if (settled) return; settled = true; fn(arg); };
        let req;
        try {
          req = http.request({ hostname: ip, port: AGENT_PORT, path: rawPath, method: 'GET', timeout: 5000,
            headers: agentToken ? { 'X-Agent-Token': agentToken } : {} }, (res) => {
            let data = '';
            let tooBig = false;
            res.on('data', (chunk) => {
              data += chunk;
              if (data.length > 65536) {
                tooBig = true;
                try { req.destroy(); } catch (_) {}
                done(resolve, { ok: false, error: 'response too large (>64KB)' });
              }
            });
            res.on('end', () => {
              if (tooBig) return;
              let parsed = null;
              try { parsed = JSON.parse(data); } catch (_) { parsed = null; }
              done(resolve, {
                ok: res.statusCode >= 200 && res.statusCode < 300 && !!parsed,
                status: res.statusCode,
                data: parsed,
                error: parsed ? undefined : 'agent returned no JSON',
              });
            });
            res.on('error', (e) => done(reject, e));
          });
        } catch (e) { done(reject, e); return; }
        req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch (_) {} });
        req.on('error', (e) => done(reject, e));
        req.on('close', () => done(resolve, { ok: false, error: 'connection closed' }));
        req.end();
      });
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  /* POS terminal request. The old test/send buttons only showed a success toast
     and wrote 'tested' into localStorage without opening a socket. This is a
     deliberately small HTTP client for the shop LAN: bare IPv4 + a safe path,
     JSON body, no redirects, bounded response. */
  ipcMain.handle('gamenet:pos-request', async (_evt, opts = {}) => {
    try {
      const ip = String(opts.ip || '').trim();
      const port = Number(opts.port || 80);
      const rawPath = String(opts.path || '/charge').trim() || '/charge';
      const amount = Number(opts.amount || 0);
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ip.split('.').some((o) => Number(o) > 255)) return { ok: false, error: 'bad ip' };
      if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'bad port' };
      if (!/^\/[A-Za-z0-9\-._~/?&=%+:@]*$/.test(rawPath) || rawPath.startsWith('//')) return { ok: false, error: 'bad path' };
      if (!isFinite(amount) || amount < 0 || amount > 1e12) return { ok: false, error: 'bad amount' };
      const body = JSON.stringify({ amount: Math.round(amount), source: 'gamenet-manager' });
      const result = await new Promise((resolve, reject) => {
        let settled = false;
        const done = (fn, arg) => { if (settled) return; settled = true; fn(arg); };
        let req;
        try {
          req = http.request({
            hostname: ip, port, path: rawPath, method: 'POST', timeout: 5000,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          }, (res) => {
            let data = '';
            let aborted = false;
            res.on('data', (chunk) => {
              data += chunk;
              if (data.length > 65536) {
                aborted = true;
                try { req.destroy(); } catch (_) {}
                done(resolve, { ok: false, status: res.statusCode, error: 'response too large (>64KB)' });
              }
            });
            res.on('end', () => {
              if (aborted) return;
              let parsed = null;
              try { parsed = JSON.parse(data); } catch (_) { parsed = null; }
              done(resolve, { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed, body: String(data).slice(0, 500) });
            });
            res.on('error', (e) => done(reject, e));
          });
        } catch (e) { done(reject, e); return; }
        req.on('timeout', () => { try { req.destroy(new Error('timeout')); } catch (_) {} });
        req.on('error', (e) => done(reject, e));
        req.on('close', () => done(resolve, { ok: false, error: 'connection closed' }));
        req.write(body);
        req.end();
      });
      return result;
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
}

function createWindow() {
  const saved = loadWindowState();
  const icon = resolveIcon();

  mainWindow = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 800,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Gamenet Manager Pro',
    icon,
    show: false,
    backgroundColor: '#0f0c29',
    autoHideMenuBar: !isDev,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: isDev,
    },
  });

  // Production: no default menu (original had this commented out)
  if (!isDev) {
    try { mainWindow.removeMenu(); } catch { /* ignore */ }
  }

  // Lock navigation to local file only. External links -> system browser.
  // The renderer never navigates: everything is an inline handler. Redirects are
  // locked down too, otherwise a crafted file:// link could bounce the window
  // out to the network.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      if (isOwnDocument(url)) return; // our own index.html
      e.preventDefault();
      if (['https:', 'http:', 'mailto:'].includes(u.protocol)) {
        shell.openExternal(url).catch(() => {});
      }
    } catch {
      e.preventDefault();
    }
  });
  mainWindow.webContents.on('will-redirect', (e, url) => {
    try {
      const u = new URL(url);
      if (isOwnDocument(url)) return;
      e.preventDefault();
      if (['https:', 'http:', 'mailto:'].includes(u.protocol)) {
        shell.openExternal(url).catch(() => {});
      }
    } catch {
      e.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (['https:', 'http:', 'mailto:'].includes(u.protocol)) {
        shell.openExternal(url).catch(() => {});
      }
    } catch { /* ignore */ }
    return { action: 'deny' };
  });

  // Least privilege: deny camera/mic/geolocation, allow notifications (timer
  // alarms) and clipboard writes (copy license / copy report text).
  try {
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'notifications') return callback(true);
      // navigator.clipboard is used by the license panel and the share report;
      // denying it made those buttons fail silently.
      if (permission === 'clipboard-write' || permission === 'clipboard-sanitized-write') return callback(true);
      return callback(false);
    });
    mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) => {
      return permission === 'notifications' ||
             permission === 'clipboard-write' ||
             permission === 'clipboard-sanitized-write';
    });
  } catch { /* older electron: ignore */ }

  // Persist bounds (event-driven, not timers)
  const persist = () => saveWindowState(mainWindow);
  mainWindow.on('resize', persist);
  mainWindow.on('move', persist);
  mainWindow.on('close', persist);

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    try { mainWindow.show(); } catch { /* ignore */ }
    ensureStartMenuShortcut(icon);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupBackupIPC();
  createWindow();
});

app.on('second-instance', () => {
  try {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch { /* ignore */ }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
