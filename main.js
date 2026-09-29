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
function deviceFingerprint() {
  try {
    const macs = permanentMacs();
    let user = '';
    try { user = (os.userInfo() || {}).username || ''; } catch { /* ignore */ }
    let cpu = '';
    try { cpu = ((os.cpus() || [])[0] || {}).model || ''; } catch { /* ignore */ }
    let stable = 'none';
    if (macs.length) {
      // the lowest permanent MAC survives dongles and VPN adapters appearing
      stable = macs[0];
    } else {
      // no usable NIC: fall back to platform + user + cpu so two PCs on the same
      // shop LAN still differ
      stable = [os.platform(), os.arch(), user, cpu].join('|');
    }
    const raw = [stable, os.platform(), os.arch()].join('|');
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
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
try { app.setAppUserModelId('com.alvand.gamenet.manager'); } catch { /* ignore */ }

let mainWindow = null;

function resolveIcon() {
  const candidates = [
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(__dirname, 'assets', 'logo.ico'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return undefined;
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
      // keep only the last 14 files
      try {
        const files = fs.readdirSync(backupDir())
          .filter((f) => f.endsWith('.json'))
          .map((f) => ({ f, t: (() => { try { return fs.statSync(path.join(backupDir(), f)).mtimeMs; } catch (_) { return 0; } })() }))
          .sort((a, b) => b.t - a.t);
        for (const extra of files.slice(14)) {
          try { fs.unlinkSync(path.join(backupDir(), extra.f)); } catch { /* ignore */ }
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
      const u = new URL(String(opts.url || ''));
      if (!['https:', 'http:'].includes(u.protocol)) throw new Error('blocked protocol');
      const lib = u.protocol === 'https:' ? https : http;
      const method = String(opts.method || 'GET').toUpperCase();
      const headers = (opts.headers && typeof opts.headers === 'object') ? opts.headers : {};
      const body = opts.body != null ? String(opts.body) : null;
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
      if (u.protocol === 'file:') return; // our own index.html
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
      if (u.protocol === 'file:') return;
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
