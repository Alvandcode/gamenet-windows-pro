/* Gamenet Manager Pro - app config (loaded first) */
(function () {
  'use strict';
  // Single source of truth for version. Release workflow derives tags from package.json,
  // renderer reads this to compare with GitHub releases.
  window.APP_VERSION = '1.8.1';

  // Firebase is OPTIONAL. Original code shipped a hardcoded apiKey in index.html.
  // Now: empty by default (local mode). To enable online license sync, copy
  // config.example.json -> config.local.json (gitignored) and fill your keys.
  window.APP_CONFIG = window.APP_CONFIG || {
    firebase: {
      apiKey: '',
      authDomain: '',
      databaseURL: '',
      projectId: '',
      appId: ''
    }
  };

  // Try to load local operator config without ever crashing boot.
  try {
    fetch('config.local.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.firebase && j.firebase.apiKey) {
          window.APP_CONFIG.firebase = j.firebase;
          try {
            if (typeof window.ensureFirebase === 'function') window.ensureFirebase();
            if (typeof window.updateFirebaseStatus === 'function') window.updateFirebaseStatus();
          } catch (_) {}
        }
      })
      .catch(function () {});
  } catch (_) {}
})();
