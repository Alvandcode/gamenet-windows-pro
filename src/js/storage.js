/* Gamenet Manager Pro - safe storage layer (loaded BEFORE app.js) */
(function () {
  'use strict';

  var PREFIX = 'alvand_';
  var fileMirrorTimer = null;
  var lastMirrorPayload = '';

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return raw;
    } catch (_) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return true;
    } catch (err) {
      try {
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
          console.error('[gamenet] LocalStorage quota exceeded. Take a file backup now.');
          try { emergencyMirror(); } catch (_) {}
          if (typeof window.showToast === 'function') {
            window.showToast('⚠️ حافظه مرورگر پر شد! بکاپ فایل بگیرید.', 'error');
          }
        }
      } catch (_) {}
      return false;
    }
  }

  /**
   * Queue a mirror of the full DB to userData/backups via preload IPC.
   * Fixes: "backup stored inside the same LocalStorage it backs up".
   * Throttled: at most once per 5s, payload-deduplicated.
   */
  function queueFileMirror() {
    try {
      if (!window.gamenet || !window.gamenet.backup) return; // browser mode: localStorage only
      if (fileMirrorTimer) return;
      fileMirrorTimer = setTimeout(function () {
        fileMirrorTimer = null;
        try { emergencyMirror(true); } catch (_) {}
      }, 5000);
    } catch (_) {}
  }

  function collectDump() {
    var dump = { date: new Date().toISOString(), version: window.APP_VERSION || '1.8.1' };
    try {
      var keys = ['clients', 'tariffs', 'sessions', 'reservations', 'services', 'expenses',
        'tariffSchedules', 'sales', 'clientServiceMap', 'stationTypes', 'payments',
        'customers', 'operators', 'walletHistory', 'license', 'allLicenses',
        'theme', 'alarmSound', 'alarmRepeat', 'rounding', 'lang', 'backupDay', 'backupTime'];
      for (var i = 0; i < keys.length; i++) {
        try { dump[keys[i]] = localStorage.getItem(PREFIX + keys[i]); } catch (_) {}
      }
    } catch (_) {}
    return dump;
  }

  function emergencyMirror(quiet) {
    try {
      if (!window.gamenet || !window.gamenet.backup) return;
      var payload = JSON.stringify(collectDump());
      if (payload === lastMirrorPayload) return; // unchanged
      lastMirrorPayload = payload;
      var name = 'gamenet-auto-' + new Date().toISOString().slice(0, 10);
      window.gamenet.backup.write(name, payload).then(function (res) {
        if (!res || !res.ok) {
          lastMirrorPayload = ''; // retry next time
          if (!quiet) console.warn('[gamenet] file mirror failed', res);
        }
      }).catch(function () { lastMirrorPayload = ''; });
    } catch (_) {}
  }

  // Wrap native setItem once: every successful write schedules a throttled file mirror.
  // Keeps all legacy call sites working with zero edits.
  try {
    var origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      var r;
      try {
        r = origSetItem.call(this, k, v);
      } catch (err) {
        if (k && String(k).indexOf(PREFIX) === 0) {
          try { emergencyMirror(); } catch (_) {}
        }
        throw err;
      }
      try {
        if (k && String(k).indexOf(PREFIX) === 0) queueFileMirror();
      } catch (_) {}
      return r;
    };
  } catch (_) {}

  window.GamenetStore = {
    getRaw: lsGet,
    setRaw: lsSet,
    getJSON: function (key, fallback) {
      var raw = lsGet(key, null);
      if (raw === null) return fallback;
      var parsed = window.safeParse ? window.safeParse(raw, fallback) : null;
      return parsed === null || parsed === undefined ? fallback : parsed;
    },
    queueFileMirror: queueFileMirror,
    flushFileMirror: function () { try { emergencyMirror(); } catch (_) {} },
  };
})();
