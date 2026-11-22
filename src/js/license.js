/* Gamenet Manager Pro - signed-license verification (loaded AFTER license-pubkey.js, BEFORE app.js)
 *
 * Token format:  ALV2.<base64url(payload)>.<base64url(RSA-2048 signature)>
 * Payload (canonical order): {"v":1,"id":..,"customer":..,"phone":..,"cap":N,"months":N,"exp":ms|null,"maxDev":N,"iat":ms}
 * Only the SELLER can sign (private key lives in license-tools/, never shipped).
 * The app ships ONLY the public key -> anyone can verify, nobody can forge.
 */
(function () {
  'use strict';

  function b64urlToBytes(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToText(bytes) {
    try { return new TextDecoder().decode(bytes); }
    catch (_) {
      var s = '';
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return decodeURIComponent(escape(s));
    }
  }

  function canonPayload(p) {
    return '{"v":1'
      + ',"id":' + JSON.stringify(p.id)
      + ',"customer":' + JSON.stringify(p.customer)
      + ',"phone":' + JSON.stringify(p.phone)
      + ',"cap":' + JSON.stringify(p.cap)
      + ',"months":' + JSON.stringify(p.months)
      + ',"exp":' + JSON.stringify(p.exp)
      + ',"maxDev":' + JSON.stringify(p.maxDev)
      + ',"iat":' + JSON.stringify(p.iat)
      + '}';
  }

  /** Structural parse only (NO signature check). Use verifyWithKey for trust. */
  function parseToken(token) {
    var t = String(token || '').replace(/\s/g, '');
    if (/^ALV-\d{3}-\d{2}-/i.test(t)) {
      return { format: 'legacy', structural: false, valid: false,
        error: 'این لایسنس قدیمی (ALV-...) دیگر قبول نیست چون جعلش ساده بود. از فروشنده لایسنس جدید (ALV2) بگیر.' };
    }
    var m = t.match(/^ALV2\.([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)$/);
    if (!m) {
      return { format: 'unknown', structural: false, valid: false,
        error: 'فرمت لایسنس اشتباهه. کلید باید با ALV2 شروع شود.' };
    }
    var payload;
    try {
      payload = JSON.parse(bytesToText(b64urlToBytes(m[1])));
    } catch (_) {
      return { format: 'alv2', structural: false, valid: false, error: 'بدنه لایسنس خراب است.' };
    }
    if (!payload || payload.v !== 1 || typeof payload.id !== 'string' || !payload.id) {
      return { format: 'alv2', structural: false, valid: false, error: 'ساختار لایسنس نامعتبر است.' };
    }
    var cap = parseInt(payload.cap, 10), maxDev = parseInt(payload.maxDev, 10);
    if (!(cap >= 1 && cap <= 99) || !(maxDev >= 1 && maxDev <= 99)) {
      return { format: 'alv2', structural: false, valid: false, error: 'ظرفیت لایسنس نامعتبر است.' };
    }
    if (payload.exp !== null && !(typeof payload.exp === 'number' && payload.exp > 0)) {
      return { format: 'alv2', structural: false, valid: false, error: 'تاریخ انقضای لایسنس نامعتبر است.' };
    }
    return { format: 'alv2', structural: true, valid: true, payload: payload, payloadB64: m[1], sigB64: m[2] };
  }

  function getSubtle() {
    try {
      if (window.crypto && window.crypto.subtle) return window.crypto.subtle;
    } catch (_) {}
    return null;
  }

  // Stored public key is standard base64 (not url-safe); decode helper:
  function b64ToBytes(s) {
    s = String(s).replace(/\s/g, '');
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function importPubKeyB64(spkiB64) {
    var subtle = getSubtle();
    if (!subtle) return Promise.reject(new Error('no-subtle'));
    return subtle.importKey('spki', b64ToBytes(spkiB64),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }

  function verifyWithKey(spkiB64, token) {
    var p = parseToken(token);
    if (!p.structural) return Promise.resolve({ ok: false, error: p.error });
    var subtle = getSubtle();
    if (!subtle) return Promise.resolve({ ok: false, error: 'محیط تأیید امضا پشتیبانی نمی‌شود' });
    return importPubKeyB64(spkiB64).then(function (key) {
      var data = new TextEncoder().encode(canonPayload(p.payload));
      return subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64urlToBytes(p.sigB64), data);
    }).then(function (ok) {
      if (!ok) return { ok: false, error: 'امضا معتبر نیست — لایسنس جعلی یا دست‌کاری‌شده است.' };
      return { ok: true, payload: p.payload };
    }).catch(function (e) {
      return { ok: false, error: 'خطا در تأیید امضا: ' + String((e && e.message) || e) };
    });
  }

  /* Trusted verification lives in this closure, not in window.__licState.
     A console user can still write __licState, but isLicenseValid() only
     accepts a token whose RSA signature was verified here. */
  var trusted = { token: null, payload: null };
  function markTrusted(token, payload) { trusted = { token: String(token || ''), payload: payload || null }; }
  /* Only a token whose RSA signature actually verifies may become trusted.
     The old API exposed markTrusted() directly, so a console user could
     accept a forged token/payload pair and isLicenseValid() would trust it. */
  async function acceptVerified(token) {
    var r = await verifyLicenseToken(token);
    if (!r || !r.ok) return false;
    if (isExpired(r.payload)) return false;
    markTrusted(token, r.payload);
    return true;
  }
  function clearTrusted() { trusted = { token: null, payload: null }; }
  function isTrusted(token) {
    return !!(trusted.token && token && String(trusted.token) === String(token) && trusted.payload);
  }
  function trustedPayload(token) { return isTrusted(token) ? trusted.payload : null; }
  function verifyLicenseToken(token) {
    return verifyWithKey(window.ALVAND_LICENSE_PUBKEY_SPKI_B64, token);
  }

  function isExpired(payload, nowMs) {
    var now = nowMs || Date.now();
    return !!(payload && payload.exp && now > payload.exp);
  }

  /* A signed expiry is only as good as the clock. Remember the highest time
   * this installation has ever seen and refuse a large step backwards (the
   * classic "set the calendar to 2019" bypass). Six hours allows DST fixes and
   * timezone changes without punishing an honest machine. */
  var CLOCK_KEY = 'alvand_licenseClock';
  var mainClockTampered = false;
  function setMainClockTampered(v) { mainClockTampered = !!v; }
  function clockTampered(nowMs) {
    if (mainClockTampered) return true;
    var now = nowMs || Date.now();
    try {
      var last = parseInt(localStorage.getItem(CLOCK_KEY) || '0', 10) || 0;
      if (last > 0 && now < last - 6 * 3600 * 1000) return true;
      if (!last || now > last) localStorage.setItem(CLOCK_KEY, String(now));
    } catch (_) { /* no localStorage (tests/private mode) */ }
    return false;
  }

  function daysLeft(payload, nowMs) {
    if (!payload || !payload.exp) return null; // lifetime
    var ms = payload.exp - (nowMs || Date.now());
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  // Verified-state cache. Runtime checks are SYNC and read this; it is filled
  // by async verification at boot and at activation (see app.js initLicenseGate/activateLicense).
  window.__licState = window.__licState || { status: 'unknown', token: null, payload: null, fp: null };

  window.LicVerify = {
    parseToken: parseToken,
    canonPayload: canonPayload,
    verifyWithKey: verifyWithKey,
    verifyLicenseToken: verifyLicenseToken,
    accept: acceptVerified,
    isTrusted: isTrusted,
    trustedPayload: trustedPayload,
    clearTrusted: clearTrusted,
    isExpired: isExpired,
    clockTampered: clockTampered,
    setMainClockTampered: setMainClockTampered,
    daysLeft: daysLeft,
  };
})();
