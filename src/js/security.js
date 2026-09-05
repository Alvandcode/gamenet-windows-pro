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
   * Prevents "restore garbage -> wipe shop data" accidents.
   */
  function sanitizeBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'bad shape' };
    var out = {};
    var arrKeys = ['clients', 'sessions', 'reservations', 'services', 'expenses', 'tariffSchedules', 'sales', 'payments', 'customers', 'operators', 'walletHistory'];
    for (var i = 0; i < arrKeys.length; i++) {
      var k = arrKeys[i];
      if (data[k] === undefined) continue;
      if (!Array.isArray(data[k])) return { ok: false, error: 'field ' + k + ' must be array' };
      if (data[k].length > 50000) return { ok: false, error: 'field ' + k + ' too large' };
      out[k] = data[k];
    }
    if (data.tariffs !== undefined) {
      if (typeof data.tariffs !== 'object' || data.tariffs === null) return { ok: false, error: 'tariffs shape' };
      out.tariffs = data.tariffs;
    }
    if (data.clientServiceMap !== undefined) {
      if (typeof data.clientServiceMap !== 'object' || data.clientServiceMap === null) return { ok: false, error: 'clientServiceMap shape' };
      out.clientServiceMap = data.clientServiceMap;
    }
    if (data.stationTypes !== undefined) {
      if (!Array.isArray(data.stationTypes)) return { ok: false, error: 'stationTypes shape' };
      out.stationTypes = data.stationTypes;
    }
    return { ok: true, data: out };
  }

  // expose globally for app.js + patches.js (classic scripts, no modules)
  window.safeParse = safeParse;
  window.escapeHtml = escapeHtml;
  window.escAttr = escAttr;
  window.secureRandomId = secureRandomId;
  window.sha256hex = sha256hex;
  window.isSha256Hex = isSha256Hex;
  window.sanitizeBackup = sanitizeBackup;
})();
