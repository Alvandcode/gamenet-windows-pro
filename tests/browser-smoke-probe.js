/* Injected by tests/browser-smoke.test.js */
(function () {
  window.__errs = [];
  window.addEventListener('error', function (e) { window.__errs.push('error: ' + (e.message || e.error)); });
  window.addEventListener('unhandledrejection', function (e) { window.__errs.push('reject: ' + String((e.reason && e.reason.message) || e.reason)); });

  function finish() {
    var out = { errs: window.__errs, checks: {} };
    function chk(name, fn) { try { out.checks[name] = !!fn(); } catch (e) { out.checks[name] = 'threw: ' + e.message; } }

    chk('scriptsRan', function () {
      return typeof window.showSection === 'function' && typeof window.renderClients === 'function';
    });
    chk('navGroups', function () { return document.querySelectorAll('.nav-group').length >= 7; });
    chk('navItems', function () { return document.querySelectorAll('.nav-group-body .nav-item').length >= 20; });

    // every <section> must be reachable from a sidebar entry
    chk('everySectionReachable', function () {
      var reach = {};
      var nodes = document.querySelectorAll('[onclick]');
      for (var i = 0; i < nodes.length; i++) {
        var v = nodes[i].getAttribute('onclick') || '';
        var p = v.indexOf("showSection('");
        if (p < 0) continue;
        var end = v.indexOf("'", p + 13);
        if (end > p) reach[v.slice(p + 13, end)] = 1;
      }
      var secs = document.querySelectorAll('.section');
      var missing = [];
      for (var j = 0; j < secs.length; j++) {
        var name = secs[j].id.replace('-section', '');
        if (!reach[name]) missing.push(name);
      }
      window.__unreachable = missing;
      return missing.length === 0;
    });

    chk('licenseGateVisible', function () {
      var e = document.getElementById('licenseOverlay');
      return !!e && e.classList.contains('show');
    });
    chk('zoomNotOnBody', function () { return document.body.style.zoom === ''; });
    chk('backgroundPaintedByRoot', function () {
      var cs = window.getComputedStyle(document.documentElement);
      var bcs = window.getComputedStyle(document.body);
      return cs.backgroundImage !== 'none' && bcs.backgroundImage === 'none';
    });
    chk('themeClassOnRoot', function () { return /theme-/.test(document.documentElement.className); });
    chk('toastExists', function () { return !!document.getElementById('toast'); });
    chk('noDuplicateIds', function () {
      var seen = {}, dup = [];
      var all = document.querySelectorAll('[id]');
      for (var i = 0; i < all.length; i++) {
        if (seen[all[i].id]) dup.push(all[i].id);
        seen[all[i].id] = 1;
      }
      window.__dupIds = dup;
      return dup.length === 0;
    });
    chk('noInlinedUserDataInHandlers', function () {
      var bad = [];
      var all = document.querySelectorAll('[onclick]');
      for (var i = 0; i < all.length; i++) {
        var v = all[i].getAttribute('onclick') || '';
        if (v.indexOf('openShareModalForCustomer(') >= 0 || v.indexOf('openShareModal(') >= 0) bad.push(v.slice(0, 70));
      }
      window.__badHandlers = bad;
      return bad.length === 0;
    });
    chk('everySectionRenders', function () {
      var errs = [];
      var names = ['dashboard','clients','tariffs','reports','income','reservations','customers','membership',
        'buffet','expenses','tariffSchedule','settings','stationHours','backup','license','operators',
        'employees','busyHours','activityLog','notifications','advancedSearch','waiting','events',
        'branches','shifts','insights','tools','phonebook','gameHistory'];
      for (var i = 0; i < names.length; i++) {
        try { window.showSection(names[i]); } catch (e) { errs.push(names[i] + ': ' + e.message); }
      }
      window.__sectionErrs = errs;
      return errs.length === 0;
    });
    chk('noMissingElementIds', function () {
      var ids = ['clientsGrid','servicesGrid','expensesList','tariffSchedulesList','reservationsList',
        'customersList','customerRosterList','operatorsList','themeGrid','stationTypesGrid',
        'reportContent','activeClientsList','weeklyChart','settingsSubmenu','toast',
        'paymentClientName','payTotal','licenseKeyInput','newClientName'];
      var missing = [];
      for (var i = 0; i < ids.length; i++) if (!document.getElementById(ids[i])) missing.push(ids[i]);
      window.__missingIds = missing;
      return missing.length === 0;
    });
    chk('zoomChangesCleanly', function () {
      window.applyZoom(60);
      var a = document.documentElement.style.zoom;
      window.applyZoom(160);
      var b = document.documentElement.style.zoom;
      window.applyZoom(100);
      return a === '60%' && b === '160%' && document.documentElement.style.zoom === '100%';
    });

    out.dupIds = window.__dupIds || [];
    out.badHandlers = window.__badHandlers || [];
    out.sectionErrs = window.__sectionErrs || [];
    out.missingIds = window.__missingIds || [];
    out.unreachable = window.__unreachable || [];
    var t = document.createElement('div');
    t.id = '__probe_result';
    t.textContent = JSON.stringify(out);
    document.body.appendChild(t);
  }

  if (document.readyState === 'complete') setTimeout(finish, 1200);
  else window.addEventListener('load', function () { setTimeout(finish, 1200); });
})();
