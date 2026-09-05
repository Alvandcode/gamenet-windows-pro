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

// Stable hardware fingerprint for license binding (MACs + host + user + cpu).
// Not secret, just stable: copying a license file to another PC won't activate.
function deviceFingerprint() {
  try {
    const macs = [];
    try {
      const ifs = os.networkInterfaces() || {};
      for (const name of Object.keys(ifs)) {
        for (const nic of ifs[name] || []) {
          if (nic && nic.mac && nic.mac !== '00:00:00:00:00:00' && !nic.internal) macs.push(nic.mac.toLowerCase());
        }
      }
    } catch { /* ignore */ }
    macs.sort();
    let user = '';
    try { user = (os.userInfo() || {}).username || ''; } catch { /* ignore */ }
    let cpu = '';
    try { cpu = ((os.cpus() || [])[0] || {}).model || ''; } catch { /* ignore */ }
    const raw = [os.hostname(), user, os.platform(), os.arch(), cpu, macs.join(',')].join('|');
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
}

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
    if (typeof s.width === 'number' && typeof s.height === 'number') return s;
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
      const target = backupFilePath(name || ('gamenet-backup-' + new Date().toISOString().slice(0, 10)));
      const tmp = target + '.tmp';
      fs.writeFileSync(tmp, data, 'utf-8');
      fs.renameSync(tmp, target);
      // keep only last 14 files
      try {
        const files = fs.readdirSync(backupDir())
          .filter((f) => f.endsWith('.json'))
          .map((f) => ({ f, t: fs.statSync(path.join(backupDir(), f)).mtimeMs }))
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (['https:', 'http:', 'mailto:'].includes(u.protocol)) {
        shell.openExternal(url).catch(() => {});
      }
    } catch { /* ignore */ }
    return { action: 'deny' };
  });

  // Least privilege: deny camera/mic/geolocation, allow notifications (timer alarms)
  try {
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'notifications') return callback(true);
      return callback(false);
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
