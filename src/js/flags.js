/* Gamenet Manager Pro - resource failure flags (loaded FIRST in <head>)
 *
 * The vendor/CDN <script> tags used to carry inline onerror="..." attributes.
 * With script-src-attr 'unsafe-inline' removed from the CSP those attributes
 * can never run, so the flags (window.__pdfFailed / window.__fbFailed) were
 * never set. This file installs ONE capture-phase error listener instead:
 * resource load errors do not bubble, but a capture listener on window sees
 * them with event.target set to the failed element.
 *
 * No inline attributes are used anywhere in this file (CSP-safe).
 */
(function () {
  'use strict';
  try {
    window.addEventListener('error', function (e) {
      try {
        var t = e && e.target;
        if (!t || !t.tagName || String(t.tagName).toUpperCase() !== 'SCRIPT') return;
        var src = t.getAttribute('src') || '';
        if (src.indexOf('html2pdf') !== -1) window.__pdfFailed = true;
        if (src.indexOf('firebase') !== -1) window.__fbFailed = true;
      } catch (_) { /* never break page load on a probe error */ }
    }, true);
  } catch (_) { /* very old engines: flags just stay unset */ }
})();
