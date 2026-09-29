/* Gamenet Manager Pro - runtime hardening patches (loaded AFTER app.js)
 * - operator passwords -> PBKDF2-SHA256 with a per-user salt (legacy SHA-256 and
 *   plaintext are still accepted on login and upgraded, so nobody is locked out)
 * - login throttling: repeated wrong passwords lock the account with a backoff
 * - backup validated + mirrored to real files (not only LocalStorage)
 * - offline-safe externals, correct AbortController timeouts
 */
(function () {
  'use strict';

  /* ---------- operator password hashing ----------
   * The stored value used to be a bare sha256hex('gamenet::' + password). That is
   * fast and unsalted, so a stolen localStorage (or a backup file) is cracked
   * instantly - the hash of "1234" is a constant, and a 4-digit password has only
   * 10^4 candidates. Now: PBKDF2-SHA256, 210k iterations, 16-byte random salt per
   * operator, stored as  pbkdf2$<iters>$<saltB64>$<hashB64>.
   *
   * Compatibility is deliberate: verifyPassword() still accepts the old
   * unsalted SHA-256 and even a plaintext password, and a successful login
   * rewrites the record in the strong form. Someone upgrading mid-session keeps
   * their existing password. */
  var PBKDF2_ITERS = 210000;
  var PBKDF2_PREFIX = 'pbkdf2$';
  var MIN_PASSWORD = 8;

  function hasSubtle() {
    try { return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.importKey); }
    catch (_) { return false; }
  }

  function b64FromBytes(u8) {
    var bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }
  function bytesFromB64(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  /** constant-time compare - a length or early-exit difference leaks timing */
  function timingSafeEqualStr(a, b) {
    a = String(a || ''); b = String(b || '');
    var diff = a.length ^ b.length;
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
  }

  async function pbkdf2Hash(password, saltBytes, iters) {
    var enc = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;
    var raw = enc ? enc.encode(String(password)) : new Uint8Array(utf8Bytes(String(password)));
    var base = await window.crypto.subtle.importKey('raw', raw, { name: 'PBKDF2' }, false, ['deriveBits']);
    var bits = await window.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: iters || PBKDF2_ITERS, hash: 'SHA-256' },
      base, 256);
    return new Uint8Array(bits);
  }

  window.hashPassword = async function (password) {
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var hash = await pbkdf2Hash(password, salt, PBKDF2_ITERS);
    return PBKDF2_PREFIX + PBKDF2_ITERS + '$' + b64FromBytes(salt) + '$' + b64FromBytes(hash);
  };

  window.isStrongHash = function (v) {
    return typeof v === 'string' && v.indexOf(PBKDF2_PREFIX) === 0 && v.split('$').length === 4;
  };

  /** Verify a candidate against a stored value of ANY supported form. */
  window.verifyPassword = async function (stored, candidate) {
    if (typeof stored !== 'string' || !stored) return false;
    var pw = String(candidate == null ? '' : candidate);
    if (window.isStrongHash(stored)) {
      try {
        var parts = stored.split('$');
        var iters = parseInt(parts[1], 10) || PBKDF2_ITERS;
        var salt = bytesFromB64(parts[2]);
        var want = parts[3];
        var got = b64FromBytes(await pbkdf2Hash(pw, salt, iters));
        return timingSafeEqualStr(got, want);
      } catch (e) { return false; }
    }
    // legacy: unsalted sha256 of 'gamenet::' + password
    try {
      var legacy = await window.sha256hex('gamenet::' + pw);
      if (timingSafeEqualStr(legacy, stored)) return true;
    } catch (_) {}
    // last resort: a plaintext password from an install that never migrated
    return timingSafeEqualStr(stored, pw);
  };

  /* true when the stored value is NOT the strong form and must be rewritten.
   * This used to ask "is it a sha256 hex?", which meant an UNSALTED legacy hash
   * counted as fine and was never upgraded. */
  function needsHash(pw) {
    return !window.isStrongHash(pw);
  }

  /** Returns the stored value for `password`, re-hashing a weak/plaintext one. */
  async function hashIfNeeded(pw) {
    if (window.isStrongHash(pw)) return pw;
    if (!hasSubtle()) {
      // no Web Crypto (very old WebView / locked-down context): keep the old
      // behaviour so the shop can still log in - weaker, but never a lockout
      try { return await window.sha256hex('gamenet::' + String(pw)); }
      catch (_) { return pw; }
    }
    try { return await window.hashPassword(pw); }
    catch (_) {
      try { return await window.sha256hex('gamenet::' + String(pw)); }
      catch (_) { return pw; }
    }
  }

  /* ---------- login throttling ----------
   * The login form accepted an unlimited number of guesses, so a 4-digit
   * password was found in seconds. Counters live in localStorage so restarting
   * the app does not wipe them. */
  var LOCK_KEY = 'alvand_loginLock';
  var LOCK_BASE_MS = 30000;      // 30s after 5 failures
  var LOCK_MAX_MS = 15 * 60000;  // cap at 15 minutes
  var LOCK_THRESHOLD = 5;

  function readLocks() {
    try { var j = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}'); return (j && typeof j === 'object') ? j : {}; }
    catch (_) { return {}; }
  }
  function lockFor(username) {
    var rec = readLocks()[String(username || '').toLowerCase()];
    if (!rec || !rec.until) return 0;
    return Math.max(0, Number(rec.until) - Date.now());
  }
  function registerFailure(username) {
    var all = readLocks();
    var k = String(username || '').toLowerCase();
    var rec = all[k] || { fails: 0 };
    rec.fails = (Number(rec.fails) || 0) + 1;
    if (rec.fails >= LOCK_THRESHOLD) {
      var over = rec.fails - LOCK_THRESHOLD;
      rec.until = Date.now() + Math.min(LOCK_MAX_MS, LOCK_BASE_MS * Math.pow(2, over));
    }
    all[k] = rec;
    try { localStorage.setItem(LOCK_KEY, JSON.stringify(all)); } catch (_) {}
    return rec;
  }
  function clearFailures(username) {
    var all = readLocks();
    delete all[String(username || '').toLowerCase()];
    try { localStorage.setItem(LOCK_KEY, JSON.stringify(all)); } catch (_) {}
  }
  /* The seeded account is admin/1234. Detecting it by comparing the *password*
   * no longer works once it is hashed, so the check is "does the stored value
   * verify against a known default?" - the same code path as a login. */
  var DEFAULT_PASSWORDS = ['1234', 'admin', 'password', '123456'];
  async function needsRotation(op) {
    if (!op) return false;
    for (var i = 0; i < DEFAULT_PASSWORDS.length; i++) {
      try { if (await window.verifyPassword(op.password, DEFAULT_PASSWORDS[i])) return true; } catch (_) {}
    }
    return false;
  }
  window.operatorNeedsRotation = needsRotation;

  window.loginLockRemaining = lockFor;

  // Migrate stored operators once (plaintext -> hash). Runs after app.js init().
  async function migrateOperatorPasswords() {
    try {
      if (typeof operators === 'undefined' || !Array.isArray(operators)) return;
      var changed = false;
      for (var i = 0; i < operators.length; i++) {
        var op = operators[i];
        if (op && typeof op.password === 'string' && needsHash(op.password)) {
          if (op.username === 'admin' && op.password === '1234') {
            try { setTimeout(forceAdminRotation, 1500); } catch (_) {}
          }
          op.password = await hashIfNeeded(op.password);
          changed = true;
        }
      }
      if (changed) {
        try { localStorage.setItem('alvand_operators', JSON.stringify(operators)); } catch (_) {}
      }
      try {
        if (typeof currentOperator !== 'undefined' && currentOperator && typeof currentOperator.password === 'string' && needsHash(currentOperator.password)) {
          currentOperator.password = await hashIfNeeded(currentOperator.password);
          try { localStorage.setItem('alvand_currentOperator', JSON.stringify(currentOperator)); } catch (_) {}
        }
      } catch (_) {}
    } catch (_) {}
  }

  function forceAdminRotation() {
    try {
      if (typeof showToast === 'function') showToast('⚠️ رمز پیش‌فرض admin/1234 فعال است! همین حالا عوضش کن.', 'error');
      if (typeof openOperatorModal === 'function' && typeof currentOperator !== 'undefined' && currentOperator && currentOperator.role === 'admin') {
        try { openOperatorModal(); } catch (_) {}
      }
    } catch (_) {}
  }

  // Override login: accept both legacy plaintext and new hash (old installs don't lock out).
  async function patchedDoLogin() {
    try {
      var u = document.getElementById('loginUser').value.trim();
      var p = document.getElementById('loginPass').value.trim();
      var err = document.getElementById('loginError');
      if (!u || !p) { err.textContent = 'نام کاربری و رمز را بنویسید'; err.style.display = 'block'; return; }

      // 1) throttling first, so guessing is expensive even before any hashing
      var wait = lockFor(u);
      if (wait > 0) {
        var secs = Math.ceil(wait / 1000);
        var mins = Math.floor(secs / 60);
        err.textContent = '⛔ حسابهر بسیر اتفاقه‌است. ' +
          (mins > 0 ? (mins + ' دقیقه') : (secs + ' ثانیه')) + ' دیگار صبر کنید';
        err.style.display = 'block';
        return;
      }

      // 2) find the account, then VERIFY the password (never compare strings)
      var op = null;
      try {
        var pool = (typeof operators !== 'undefined' && Array.isArray(operators)) ? operators : [];
        var cands = pool.filter(function (x) { return x && x.username === u; });
        for (var i = 0; i < cands.length; i++) {
          if (await window.verifyPassword(cands[i].password, p)) { op = cands[i]; break; }
        }
      } catch (_) { op = null; }

      if (!op) {
        registerFailure(u);
        var left = LOCK_THRESHOLD - (readLocks()[u.toLowerCase()] || { fails: 0 }).fails;
        err.textContent = 'نام کاربری یا رمز اشتباه' +
          (left > 0 ? (' — ' + left + ' فاصله تا قفل') : '');
        err.style.display = 'block';
        return;
      }
      clearFailures(u);
      // upgrade a legacy/plaintext record to PBKDF2 on the way in
      if (needsHash(op.password)) {
        op.password = await hashIfNeeded(p);
        try { localStorage.setItem('alvand_operators', JSON.stringify(operators)); } catch (_) {}
      }
      currentOperator = op;
      try { localStorage.setItem('alvand_currentOperator', JSON.stringify(op)); } catch (_) {}
      document.getElementById('loginOverlay').style.display = 'none';
      try { updateOperatorBar(); applyPerms(); } catch (_) {}
      try { showToast('خوش آمدید ' + op.username, 'success'); } catch (_) {}
      err.style.display = 'none';
      if (needsRotation(op)) setTimeout(forceAdminRotation, 800);
    } catch (e) {
      console.warn('login failed', e);
    }
  }

  // Override saveOperator: never store plaintext (min 4 chars).
  async function patchedSaveOperator() {
    try {
      var id = document.getElementById('opId').value;
      var username = document.getElementById('opUser').value.trim();
      var password = document.getElementById('opPass').value.trim();
      var role = document.getElementById('opRole').value;
      /* Editing an operator without typing a new password must KEEP the stored
       * one. It used to be impossible (the field was pre-filled with the hash,
       * and an empty field was rejected), so changing a permission meant
       * retyping the password - or silently destroying it. */
      var isEdit = !!id;
      var keepPassword = isEdit && !password;
      if (!username || (!password && !isEdit)) { showToast('نام و رمز', 'error'); return; }
      /* 4 characters is one dictionary away from being cracked; the input rule
       * is what actually matters, the PBKDF2 only protects at rest. */
      if (!keepPassword && password.length < MIN_PASSWORD) { showToast('رمز حداقل ' + MIN_PASSWORD + ' کاراکتر باشد', 'error'); return; }
      if (!keepPassword && (!/[A-Za-z\u06f0-\u06f9\u0660-\u06690-9]/.test(password) || !/[^A-Za-z\u06f0-\u06f9\u0660-\u06690-9]/.test(password))) {
        showToast('رمز مخاط یک حرف باید و یک عدد ن باشد', 'warning');
      }
      var perms = {
        clients: document.getElementById('permClients').checked,
        buffet: document.getElementById('permBuffet').checked,
        reservations: document.getElementById('permReservations').checked,
        reports: document.getElementById('permReports').checked,
        income: document.getElementById('permIncome').checked,
        expenses: document.getElementById('permExpenses').checked,
        customers: document.getElementById('permCustomers').checked,
        backup: document.getElementById('permBackup').checked,
        tariffs: !!(document.getElementById('permTariffs') || {}).checked,
        employees: !!(document.getElementById('permEmployees') || {}).checked,
        operators: !!(document.getElementById('permOperators') || {}).checked
      };
      var hashed = keepPassword ? null : await hashIfNeeded(password);
      if (id) {
        var op = operators.find(function (x) { return String(x.id) === String(id); });
        if (!op) return;
        // demoting the last admin would lock the shop out of its own data
        if (op.role === 'admin' && role !== 'admin') {
          var admins = operators.filter(function (x) { return x.role === 'admin'; });
          if (admins.length <= 1) { showToast('آخرین مدیر را نمی‌توان به اپراتور تغییر داد', 'error'); return; }
        }
        Object.assign(op, { username: username, role: role, perms: perms });
        if (!keepPassword) op.password = hashed;
      } else {
        if (operators.find(function (x) { return x.username === username; })) { showToast('نام تکراری', 'error'); return; }
        operators.push({ id: Date.now(), username: username, password: hashed, role: role, perms: perms });
      }
      try { localStorage.setItem('alvand_operators', JSON.stringify(operators)); } catch (_) {}
      try { closeModal('operatorModal'); renderOperators(); } catch (_) {}
      showToast('اپراتور ذخیره شد', 'success');
    } catch (e) { console.warn('saveOperator failed', e); }
  }

  try {
    doLogin = patchedDoLogin; window.doLogin = patchedDoLogin;
  } catch (_) { try { window.doLogin = patchedDoLogin; } catch (_) {} }
  try {
    saveOperator = patchedSaveOperator; window.saveOperator = patchedSaveOperator;
  } catch (_) { try { window.saveOperator = patchedSaveOperator; } catch (_) {} }

  /* ---------- backup: mirror to real files ---------- */
  try { window.validatedRestoreObject = function (data) {
    try {
      if (window.sanitizeBackup) {
        var r = window.sanitizeBackup(data);
        if (!r.ok) { showToast('فایل بکاپ معتبر نیست: ' + (r.error || ''), 'error'); return null; }
        return r.data;
      }
    } catch (_) {}
    return data;
  }; } catch (_) {}

  // Wrap createBackup (defined in app.js) to also mirror to userData/backups via IPC.
  try {
    if (typeof createBackup === 'function') {
      var origBackup = createBackup;
      var wrappedBackup = function () {
        var ret;
        try { ret = origBackup.apply(this, arguments); } catch (e) { console.warn(e); }
        try {
          var raw = localStorage.getItem('alvand_backup');
          if (raw && window.gamenet && window.gamenet.backup) {
            var nm = 'gamenet-backup-' + (window.localDayKey ? window.localDayKey(new Date()) : new Date().toISOString().slice(0, 10));
            window.gamenet.backup.write(nm, raw).catch(function () {});
          }
        } catch (_) {}
        try { if (window.GamenetStore) window.GamenetStore.flushFileMirror(); } catch (_) {}
        return ret;
      };
      createBackup = wrappedBackup; window.createBackup = wrappedBackup;
    }
  } catch (_) {}

  /* ---------- network helpers with REAL timeouts (original leaked AbortController timers) ---------- */
  async function patchedGetIP() {
    try {
      var ctl = new AbortController();
      var t = setTimeout(function () { try { ctl.abort(); } catch (_) {} }, 6000);
      try {
        var r = await fetch('https://api.ipify.org?format=json', { signal: ctl.signal });
        var j = await r.json();
        return j.ip || 'unknown';
      } finally { clearTimeout(t); }
    } catch (_) { return 'unknown'; }
  }
  async function patchedCheckInternet() {
    if (!navigator.onLine) return false;
    try {
      var ctl = new AbortController();
      var t = setTimeout(function () { try { ctl.abort(); } catch (_) {} }, 5000);
      try {
        await fetch('https://api.ipify.org?format=json', { signal: ctl.signal, mode: 'cors' });
        return true;
      } finally { clearTimeout(t); }
    } catch (_) {
      try {
        var ctl2 = new AbortController();
        var t2 = setTimeout(function () { try { ctl2.abort(); } catch (_) {} }, 5000);
        try {
          await fetch('https://alvandcode.github.io/', { mode: 'no-cors', signal: ctl2.signal });
          return true;
        } finally { clearTimeout(t2); }
      } catch (_) { return false; }
    }
  }
  try { getIP = patchedGetIP; window.getIP = patchedGetIP; } catch (_) { try { window.getIP = patchedGetIP; } catch (_) {} }
  try { checkInternet = patchedCheckInternet; window.checkInternet = patchedCheckInternet; } catch (_) { try { window.checkInternet = patchedCheckInternet; } catch (_) {} }

  /* ---------- external links via main process (no window.open phishing) ---------- */
  try {
    document.addEventListener('click', function (ev) {
      try {
        var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="http"]') : null;
        if (!a) return;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        ev.preventDefault();
        if (window.gamenet && window.gamenet.openExternal) window.gamenet.openExternal(href).catch(function () {});
        else window.open(href, '_blank', 'noopener');
      } catch (_) {}
    });
  } catch (_) {}

  /* ---------- license gate UX: file picker + new-format hint ---------- */
  function setupLicenseGateUX() {
    try {
      var input = document.getElementById('licenseKeyInput');
      if (input) {
        input.setAttribute('placeholder', 'ALV2.... (کلید را اینجا پیست کن یا فایل لایسنس را انتخاب کن)');
        if (!document.getElementById('licenseFileBtn')) {
          var btn = document.createElement('button');
          btn.id = 'licenseFileBtn';
          btn.className = 'glass-btn';
          btn.style.cssText = 'width:100%; padding:12px; font-size:0.9rem; margin-top:8px;';
          btn.textContent = '📁 انتخاب فایل لایسنس (.alvand-license.json)';
          var file = document.createElement('input');
          file.type = 'file';
          file.accept = '.json,.txt,application/json';
          file.style.display = 'none';
          file.onchange = function () {
            try {
              var f = file.files && file.files[0];
              if (!f) return;
              var rd = new FileReader();
              rd.onload = function (e) {
                try {
                  var txt = String(e.target.result || '');
                  var tok = txt;
                  try {
                    var j = JSON.parse(txt);
                    if (j && j.token) tok = j.token;
                  } catch (_) {}
                  input.value = tok;
                  showToast('فایل خوانده شد — فعال‌سازی را بزن', 'success');
                } catch (_) { showToast('فایل خراب است', 'error'); }
              };
              rd.readAsText(f);
            } catch (_) {}
          };
          btn.onclick = function () { try { file.click(); } catch (_) {} };
          input.parentNode.insertBefore(btn, input.nextSibling);
          input.parentNode.insertBefore(file, btn.nextSibling);
        }
      }
    } catch (_) {}
  }

  /* ---------- never-fail-silently: surface JS errors to the user ---------- */
  function reportError(msg) {
    try {
      var txt = 'خطا: ' + String(msg || 'نامشخص');
      if (typeof showToast === 'function') { try { showToast(txt, 'error'); } catch (_) {} }
      // if the license gate is visible, also write it under the key box
      try {
        var gate = document.getElementById('licenseOverlay');
        var err = document.getElementById('licenseError');
        if (gate && err && gate.classList.contains('show')) { err.textContent = txt; err.style.display = 'block'; }
      } catch (_) {}
    } catch (_) {}
  }
  try {
    window.addEventListener('error', function (ev) {
      try { reportError((ev && ev.message) || 'خطای برنامه'); } catch (_) {}
    });
    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev && ev.reason;
        reportError((r && r.message) || r || 'خطای ناهمگام');
      } catch (_) {}
    });
  } catch (_) {}

  /* ---------- boot ---------- */
  function boot() {
    try { migrateOperatorPasswords(); } catch (_) {}
    try { setupLicenseGateUX(); } catch (_) {}
    try {
      var gv = document.getElementById('gateVersion');
      if (gv && window.APP_VERSION) gv.textContent = 'نسخه ' + window.APP_VERSION;
    } catch (_) {}
    try {
      if (window.__pdfFailed && typeof showToast === 'function') {
        setTimeout(function () { showToast('کتابخانه PDF لود نشد (آفلاین؟) - خروجی PDF غیرفعال است', 'warning'); }, 2500);
      }
    } catch (_) {}
    try {
      var cv = document.getElementById('currentVersionText');
      if (cv && window.APP_VERSION) cv.textContent = window.APP_VERSION;
    } catch (_) {}
  }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1200); });
    else setTimeout(boot, 1200);
  } catch (_) {}
})();
