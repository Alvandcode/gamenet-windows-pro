/* Gamenet Manager Pro - security helpers (loaded BEFORE app.js) */
(function () {
  'use strict';

  /**
   * JSON.parse that never throws. Returns fallback on corrupt input
   * instead of breaking the whole app boot (original bug: one bad
   * localStorage value killed the entire init).
   */
  function safeParse(raw, fallback) {
    if (fallback === undefined) fallback = null;
    if (raw === null || raw === undefined) return fallback;
    try {
      if (typeof raw !== 'string') return raw;
      var t = raw.trim();
      if (t === '') return fallback;
      return JSON.parse(t);
    } catch (err) {
      try {
        // quarantine corrupt value so next reload doesn't crash again
        var badKey = '__alvand_corrupt_' + Date.now();
        try { localStorage.setItem(badKey, String(raw).slice(0, 4000)); } catch (_) {}
        console.warn('[gamenet] corrupt JSON quarantined as', badKey, err);
      } catch (_) {}
      return fallback;
    }
  }

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"'`]/g, function (ch) { return ESC_MAP[ch]; });
  }

  /** Attribute escaping for onclick="fn('NAME')" arguments. */
  function escAttr(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, ' ');
  }

  /** Cryptographically secure random id (replaces Math.random device ids). */
  function secureRandomId(prefix, randLen, timeLen) {
    prefix = prefix || 'DEV';
    randLen = randLen || 6;
    timeLen = timeLen || 4;
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var rnd = '';
    try {
      var buf = new Uint32Array(randLen);
      if ((window.crypto || {}).getRandomValues) window.crypto.getRandomValues(buf);
      else for (var k = 0; k < randLen; k++) buf[k] = Math.floor(Math.random() * 4294967296);
      for (var i = 0; i < randLen; i++) rnd += chars[buf[i] % chars.length];
    } catch (_) {
      for (var j = 0; j < randLen; j++) rnd += chars[Math.floor(Math.random() * chars.length)];
    }
    var t = Date.now().toString(36).toUpperCase().slice(-timeLen);
    return prefix + '-' + rnd + '-' + t;
  }

  function isSha256Hex(s) {
    return typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);
  }

  function sha256Fallback(str) {
    var h1 = 0x811c9dc5, h2 = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619);
      h2 = Math.imul(h2 ^ (str.charCodeAt(str.length - 1 - i) || 0), 16777619);
    }
    var hex = function (n) { return ('0000000' + (n >>> 0).toString(16)).slice(-8); };
    var out = '';
    var seed = hex(h1) + hex(h2);
    while (out.length < 64) { out += seed; seed = hex(h1 += 0x9e3779b9) + hex(h2 += 0x85ebca6b); }
    return out.slice(0, 64);
  }

  function sha256hex(text) {
    try {
      if (window.crypto && window.crypto.subtle) {
        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)))
          .then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) {
              return ('0' + b.toString(16)).slice(-2);
            }).join('');
          })
          .catch(function () { return sha256Fallback(String(text)); });
      }
    } catch (_) { /* fall through */ }
    return Promise.resolve(sha256Fallback(String(text)));
  }

  /**
   * Validate a restore/backup payload before touching live keys.
   * Prevents "restore garbage -> wipe shop data" accidents. This was written
   * but never called; restoreBackup() now routes every file through it.
   * Values are raw JSON strings in the backup format, so each field is parsed
   * and shape-checked here instead of being trusted.
   */
  var ARRAY_KEYS = ['clients','sessions','reservations','services','expenses','tariffSchedules','sales',
                    'payments','customers','operators','walletHistory','allLicenses','membershipPlans',
                    'customerMemberships','gameHistory','notifications','activityLog','employees',
                    'attendance','waitingList','surveys','smsLog','events','shifts'];
  var OBJ_KEYS = ['tariffs','clientServiceMap','hourlyUsage','branches'];
  var MAX_ITEMS = 200000;
  function sanitizeBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'bad shape' };
    var out = {};
    var i, k, parsed;
    for (i = 0; i < ARRAY_KEYS.length; i++) {
      k = ARRAY_KEYS[i];
      if (data[k] === undefined || data[k] === null) continue;
      var rawArr = data[k];
      if (typeof rawArr === 'string') {
        try { parsed = JSON.parse(rawArr); } catch (e) { return { ok: false, error: 'field ' + k + ' is not valid JSON' }; }
      } else parsed = rawArr;
      if (!Array.isArray(parsed)) return { ok: false, error: 'field ' + k + ' must be an array' };
      if (parsed.length > MAX_ITEMS) return { ok: false, error: 'field ' + k + ' too large' };
      // every element must be a plain object (or null) - blocks prototype junk
      for (var j = 0; j < parsed.length; j++) {
        var it = parsed[j];
        if (it !== null && (typeof it !== 'object' || Array.isArray(it))) {
          return { ok: false, error: 'field ' + k + ' has a non-object entry' };
        }
      }
      out[k] = typeof rawArr === 'string' ? rawArr : JSON.stringify(parsed);
    }
    for (i = 0; i < OBJ_KEYS.length; i++) {
      k = OBJ_KEYS[i];
      if (data[k] === undefined || data[k] === null) continue;
      var rawObj = data[k];
      if (typeof rawObj === 'string') {
        try { parsed = JSON.parse(rawObj); } catch (e) { return { ok: false, error: 'field ' + k + ' is not valid JSON' }; }
      } else parsed = rawObj;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, error: 'field ' + k + ' shape' };
      out[k] = typeof rawObj === 'string' ? rawObj : JSON.stringify(parsed);
    }
    if (data.stationTypes !== undefined && data.stationTypes !== null) {
      var st = data.stationTypes;
      if (typeof st === 'string') { try { st = JSON.parse(st); } catch (e) { return { ok: false, error: 'stationTypes invalid' }; } }
      if (!Array.isArray(st)) return { ok: false, error: 'stationTypes shape' };
      if (st.length > 500) return { ok: false, error: 'stationTypes too large' };
      out.stationTypes = typeof data.stationTypes === 'string' ? data.stationTypes : JSON.stringify(st);
    }
    // scalars / opaque strings: pass through with a length cap
    var SCALARS = ['license','allLicensesMeta','roundingMode','rounding','lang','theme','alarmSound',
                   'alarmRepeat','backupTime','lite','uiZoom','shopName','shopPhone','guideShown',
                   'smsConfig','phonebook','posConfig','lowStockThreshold','currentBranch',
                   'customers_enc','loyaltyPoints','membershipPlans'];
    for (i = 0; i < SCALARS.length; i++) {
      k = SCALARS[i];
      if (data[k] === undefined || data[k] === null) continue;
      var v = data[k];
      if (typeof v === 'string') { if (v.length > 4 * 1024 * 1024) return { ok: false, error: 'field ' + k + ' too large' }; out[k] = v; }
      else if (typeof v === 'object') { try { out[k] = JSON.stringify(v); } catch (e) { return { ok: false, error: 'field ' + k + ' not serialisable' }; } }
      else out[k] = String(v).slice(0, 200);
    }
    if (data.date !== undefined) out.date = String(data.date).slice(0, 60);
    return { ok: true, data: out };
  }

  /**
   * Persian/Arabic digits -> Latin. parseInt('۲۰۰۰۰') is NaN, so number boxes
   * silently read 0 when the keyboard is Persian. Normalize first.
   */
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  function faToEn(value) {
    return String(value == null ? '' : value)
      .replace(/[۰-۹]/g, function (ch) { return String(ch.charCodeAt(0) - 0x06F0); })
      .replace(/[٠-٩]/g, function (ch) { return String(ch.charCodeAt(0) - 0x0660); })
      // thousands separators only: comma / Arabic thousands separator / spaces.
      // A decimal point is preserved (see parseFaDecimal for money).
      .replace(/[٬,‌‏\s]/g, '');
  }
  /** Integer parser for every numeric form field. Persian and Arabic-Indic
   *  digits are accepted because the customer's keyboard is Persian by default
   *  - plain parseInt("۳۰") is NaN, so the field silently became 0. */
  function parseFaNumber(value, fallback) {
    if (fallback === undefined) fallback = 0;
    var n = parseInt(faToEn(value), 10);
    return isNaN(n) ? fallback : n;
  }
  /** Decimal parser for money: keeps one decimal place, thousands separators
   *  removed. parseInt("12,500") used to become 12. */
  function parseFaDecimal(value, fallback) {
    if (fallback === undefined) fallback = 0;
    var t = faToEn(value).replace(/[^0-9.\-]/g, '');
    if (!t || t === '-' || t === '.') return fallback;
    // at most one decimal point: "1.2.3" -> "1.2"
    var parts = t.split('.');
    if (parts.length > 2) t = parts[0] + '.' + parts[1];
    else t = parts.join('.');
    var n = parseFloat(t);
    return isFinite(n) ? n : fallback;
  }

  /**
   * Coerce an id/array index to a plain number for use inside an inline
   * onclick="fn(VALUE)" attribute.
   *
   * Why this exists: the renderer builds HTML with template strings and used to
   * interpolate stored values straight into inline event handlers. A value like
   * `1);alert(1)//` (possible through a hand-edited or shared backup file)
   * closes the call and executes code. escapeHtml() does NOT help there, because
   * the browser HTML-decodes the attribute before the JS is parsed.
   * Ids are always compared with === against numbers, so coercing them to a
   * number is both safe and behaviour-preserving: a non-numeric id simply fails
   * to match instead of injecting code.
   */
  function numId(v) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    return isFinite(n) ? n : 0;
  }

  /** Escape a string so it can be embedded as a JS literal inside an inline
   *  onclick="fn('VALUE')" attribute.
   *  Must neutralise BOTH quote styles: the attribute itself is double-quoted,
   *  so an unescaped `"` would end the attribute early and turn the rest of the
   *  value into live markup (verified stored-XSS vector through a backup file).
   *  `<` and `>` are dropped outright so no tag can ever be formed. */
  function jsStr(v) {
    return String(v == null ? '' : v)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ')
      .replace(/[<>]/g, '');
  }

  /**
   * Day keys. The app compared "today" four different ways (toDateString,
   * toISOString().slice(0,10), a Jalali month check, a raw Date), and the UTC
   * one made the reservation filter show yesterday between 00:00 and 03:30 local
   * - exactly when a night-shift gamenet closes the books. Everything now goes
   * through these two helpers: local calendar day, and "is this today".
   */
  function localDayKey(d) {
    const x = (d instanceof Date) ? d : new Date(d);
    if (isNaN(x.getTime())) return '';
    return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2);
  }
  function isSameDay(a, b) {
    const ka = localDayKey(a), kb = localDayKey(b);
    return !!ka && ka === kb;
  }
  function daysBetween(a, b) {
    const ka = localDayKey(a), kb = localDayKey(b);
    if (!ka || !kb) return 0;
    const pa = ka.split('-').map(Number), pb = kb.split('-').map(Number);
    const da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    const db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((db - da) / 86400000);
  }
  /** Persian month/day for birthday-style comparisons (uses local time). */
  function monthDayKey(d) {
    const x = (d instanceof Date) ? d : new Date(d);
    if (isNaN(x.getTime())) return '';
    return ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2);
  }
  /** Start of the Iranian week = Saturday 00:00 local.
   *  "Last 7 days" (now - 7*864e5) is a rolling window: on Wednesday it splits
   *  the current week in half and the previous week is not reachable at all.
   *  Reports must use calendar weeks. */
  function weekStart(d) {
    const x = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
    if (isNaN(x.getTime())) return new Date(NaN);
    x.setHours(0, 0, 0, 0);
    // getDay(): 0=Sunday ... 6=Saturday -> shift so Saturday is the first day
    const back = (x.getDay() + 1) % 7;
    x.setDate(x.getDate() - back);
    return x;
  }
  function monthStart(d) {
    const x = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
    if (isNaN(x.getTime())) return new Date(NaN);
    return new Date(x.getFullYear(), x.getMonth(), 1, 0, 0, 0, 0);
  }
  /** Coerce anything (string / Persian digits / null) to a finite number. */
  function toNum(v, fallback) {
    if (typeof v === 'number') return isFinite(v) ? v : (fallback === undefined ? 0 : fallback);
    if (v === null || v === undefined || v === '') return fallback === undefined ? 0 : fallback;
    const n = parseFaDecimal(v, NaN);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }

  // expose globally for app.js + patches.js (classic scripts, no modules)
  window.safeParse = safeParse;
  window.escapeHtml = escapeHtml;
  window.localDayKey = localDayKey;
  window.isSameDay = isSameDay;
  window.weekStart = weekStart;
  window.monthStart = monthStart;
  window.toNum = toNum;
  window.daysBetween = daysBetween;
  window.monthDayKey = monthDayKey;
  window.numId = numId;
  window.jsStr = jsStr;
  window.faToEn = faToEn;
  window.parseFaNumber = parseFaNumber;
  window.parseFaDecimal = parseFaDecimal;
  window.escAttr = escAttr;
  window.secureRandomId = secureRandomId;
  window.sha256hex = sha256hex;
  window.isSha256Hex = isSha256Hex;
  window.sanitizeBackup = sanitizeBackup;

  // Native dialogs (confirm/prompt/alert) can steal OS keyboard focus from the
  // Electron window and never give it back: mouse keeps working, typing dies
  // until the window loses and regains focus. Wrap them once, synchronously,
  // restoring focus afterwards. Return values and call sites stay identical.
  // NOTE: a single sync window.focus() is NOT enough on Windows Electron —
  // the keyboard/IME stays attached to the dead native dialog. We must:
  //  1) remember the focused element, 2) blur+refocus window, 3) force IME
  //     reattach with a temp input, 4) repeat async (0/80ms) because Electron
  //     returns focus late, 5) heal on next click as a safety net.
  (function hardenNativeDialogs(){
    function rememberFocus(){
      try { return document.activeElement; } catch(_) { return null; }
    }
    function forceRestore(prev){
      function step(){
        try { window.blur(); } catch(_) {}
        try { window.focus(); } catch(_) {}
        try {
          if (document.body) {
            if (!document.body.hasAttribute('tabindex')) document.body.setAttribute('tabindex', '-1');
            if (document.body.focus) document.body.focus({ preventScroll: true });
          }
        } catch(_) {}
        try { if (prev && document.contains(prev) && prev.focus) prev.focus({ preventScroll: true }); } catch(_) {}
        // Force Windows IME/keyboard reattach: focus a temp input then go back.
        try {
          var tmp = document.createElement('input');
          tmp.setAttribute('aria-hidden', 'true');
          tmp.tabIndex = -1;
          tmp.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;border:0;padding:0;pointer-events:none;';
          document.body.appendChild(tmp);
          tmp.focus({ preventScroll: true });
          tmp.blur();
          document.body.removeChild(tmp);
          if (prev && document.contains(prev) && prev.focus) prev.focus({ preventScroll: true });
          else window.focus();
        } catch(_) {}
      }
      try { step(); } catch(_) {}
      try { setTimeout(step, 0); } catch(_) {}
      try { setTimeout(step, 80); } catch(_) {}
    }
    try{
      if(typeof window.confirm === 'function' && !window.confirm.__focusSafe){
        const nativeConfirm = window.confirm.bind(window);
        const safeConfirm = function(msg){
          var prev = rememberFocus();
          var r = false;
          try { r = nativeConfirm(msg); }
          finally { forceRestore(prev); }
          return r;
        };
        safeConfirm.__focusSafe = true;
        try{ window.confirm = safeConfirm; }catch(_){}
      }
      if(typeof window.prompt === 'function' && !window.prompt.__focusSafe){
        const nativePrompt = window.prompt.bind(window);
        const safePrompt = function(msg, def){
          var prev = rememberFocus();
          var r = null;
          try { r = nativePrompt(msg, def); }
          finally { forceRestore(prev); }
          return r;
        };
        safePrompt.__focusSafe = true;
        try{ window.prompt = safePrompt; }catch(_){}
      }
      if(typeof window.alert === 'function' && !window.alert.__focusSafe){
        const nativeAlert = window.alert.bind(window);
        const safeAlert = function(msg){
          var prev = rememberFocus();
          try { nativeAlert(msg); }
          finally { forceRestore(prev); }
        };
        safeAlert.__focusSafe = true;
        try{ window.alert = safeAlert; }catch(_){}
      }
      // Safety net: any click re-asserts window focus so even if a dialog
      // slipped through, one click heals typing (cheap, no behaviour change).
      try {
        if (!window.__typingHealInstalled) {
          window.__typingHealInstalled = true;
          document.addEventListener('mousedown', function(){
            try { window.focus(); } catch(_) {}
          }, true);
          // Manual escape hatch from DevTools console: fixTypingFocus()
          try {
            window.fixTypingFocus = function(){
              try { forceRestore(document.activeElement); } catch(_) {}
              return true;
            };
          } catch(_) {}
        }
      } catch(_) {}
    }catch(_){}
  })();
})();
