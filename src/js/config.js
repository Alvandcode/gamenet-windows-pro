/* Gamenet Manager Pro - app config (loaded first) */
(function () {
  'use strict';
  // Single source of truth for version. The release workflow derives tags from
  // package.json; this file and app.js both read the same value.
  window.APP_VERSION = '1.10.4';

  // Firebase is OPTIONAL. The original shipped a hardcoded apiKey in index.html.
  // Now: empty by default (local mode = no online license sync, no revoke check).
  // To enable it, copy config.example.json -> config.local.json next to
  // index.html (it is gitignored AND must be listed in build.files).
  window.APP_CONFIG = window.APP_CONFIG || {
    firebase: {
      apiKey: '',
      authDomain: '',
      databaseURL: '',
      projectId: '',
      appId: ''
    }
  };

  /* The old code fetched('config.local.json') from a file:// page. Chromium
     blocks XHR/fetch on file:// sub-resources (CORS: origin is "null"), so the
     config NEVER loaded and the documented Firebase setup was impossible.
     XHR is not blocked the same way for file://, so try XHR first and fall back
     to fetch. If neither works we say so explicitly instead of silently
     pretending the online features exist. */
  function applyConfig(j) {
    if (!j || !j.firebase || !j.firebase.apiKey) return false;
    window.APP_CONFIG.firebase = j.firebase;
    window.__configLoaded = true;
    return true;
  }
  function afterConfig() {
    if (!window.__configLoaded) return;
    try { if (typeof window.ensureFirebase === 'function') window.ensureFirebase(); } catch (_) {}
    try { if (typeof window.updateFirebaseStatus === 'function') window.updateFirebaseStatus(); } catch (_) {}
    // The deferred CDN tag (firebase-*-compat.js) may only have executed after
    // this callback: retry once it is there, otherwise firebaseReady stays false
    // for the whole session and every online check silently no-ops.
    try {
      if (typeof window.ensureFirebase === 'function' && !window.__fbReady) {
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          try { if (window.ensureFirebase()) { window.__fbReady = true; clearInterval(iv); } } catch (_) {}
          if (tries > 40) clearInterval(iv);
        }, 250);
      }
    } catch (_) {}
    try { if (typeof window.updateFirebaseStatus === 'function') window.updateFirebaseStatus(); } catch (_) {}
  }
  function markUnavailable() {
    if (window.__configLoaded) return;
    window.__configLoadFailed = true;
    try {
      var el = document.getElementById('firebaseStatus');
      if (el) { el.textContent = 'حالت محلی (تنظیمات سرور یافت نشد)'; el.style.color = '#f59e0b'; }
    } catch (_) {}
  }
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'config.local.json?t=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { if (applyConfig(JSON.parse(xhr.responseText))) { afterConfig(); return; } } catch (_) {}
      }
      markUnavailable();
    };
    xhr.onerror = function () {
      // XHR also blocked -> try fetch, then give up cleanly
      try {
        fetch('config.local.json', { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (applyConfig(j)) afterConfig(); else markUnavailable(); })
          .catch(markUnavailable);
      } catch (_) { markUnavailable(); }
    };
    xhr.send(null);
  } catch (_) {
    markUnavailable();
  }
})();
