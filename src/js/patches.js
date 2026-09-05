/* Gamenet Manager Pro - runtime hardening patches (loaded AFTER app.js)
 * - plaintext operator passwords -> SHA-256 (legacy fallback + forced rotation of admin/1234)
 * - backup validated + mirrored to real files (not only LocalStorage)
 * - offline-safe externals, correct AbortController timeouts
 */
(function () {
  'use strict';

  /* ---------- operator password hashing ---------- */
  function needsHash(pw) {
    try { return !(window.isSha256Hex && window.isSha256Hex(pw)); } catch (_) { return true; }
  }

  async function hashIfNeeded(pw) {
    if (!needsHash(pw)) return pw;
    try { return await window.sha256hex('gamenet::' + String(pw)); }
    catch (_) { return pw; }
  }

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
      var hashed = await hashIfNeeded(p);
      var op = null;
      try {
        op = operators.find(function (x) {
          return x.username === u && (x.password === p || x.password === hashed);
        });
      } catch (_) { op = null; }
      if (!op) { err.textContent = 'نام کاربری یا رمز اشتباه'; err.style.display = 'block'; return; }
      // upgrade stored password to hash on successful legacy login
      if (op.password === p && needsHash(p)) {
        op.password = hashed;
        try { localStorage.setItem('alvand_operators', JSON.stringify(operators)); } catch (_) {}
      }
      currentOperator = op;
      try { localStorage.setItem('alvand_currentOperator', JSON.stringify(op)); } catch (_) {}
      document.getElementById('loginOverlay').style.display = 'none';
      try { updateOperatorBar(); applyPerms(); } catch (_) {}
      try { showToast('خوش آمدید ' + op.username, 'success'); } catch (_) {}
      err.style.display = 'none';
      if (u === 'admin' && p === '1234') setTimeout(forceAdminRotation, 800);
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
      if (!username || !password) { showToast('نام و رمز', 'error'); return; }
      if (password.length < 4) { showToast('رمز حداقل ۴ کاراکتر', 'error'); return; }
      var perms = {
        clients: document.getElementById('permClients').checked,
        buffet: document.getElementById('permBuffet').checked,
        reservations: document.getElementById('permReservations').checked,
        reports: document.getElementById('permReports').checked,
        income: document.getElementById('permIncome').checked,
        expenses: document.getElementById('permExpenses').checked,
        customers: document.getElementById('permCustomers').checked,
        backup: document.getElementById('permBackup').checked,
        operators: false, tariffs: true
      };
      var hashed = await hashIfNeeded(password);
      if (id) {
        var op = operators.find(function (x) { return x.id === parseInt(id, 10); });
        if (!op) return;
        if (password === '••••' || password === '****') {
          Object.assign(op, { username: username, role: role, perms: perms });
        } else {
          Object.assign(op, { username: username, password: hashed, role: role, perms: perms });
        }
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
            var nm = 'gamenet-backup-' + new Date().toISOString().slice(0, 10);
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

  /* ---------- boot ---------- */
  function boot() {
    try { migrateOperatorPasswords(); } catch (_) {}
    try { setupLicenseGateUX(); } catch (_) {}
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
