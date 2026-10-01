/* ==========================================================================
   Group play + walk-in guests  (v1.10.0)
   --------------------------------------------------------------------------
   The app could only track time for people who already existed in the client
   list, and only one person at a time. A shop also serves people who have no
   account yet, and a party of two or three often shares one machine and one
   bill.

   This module adds:
     - a "start play" panel that takes one OR MANY existing clients, plus any
       number of walk-in guests under a free-text label;
     - one shared timer for the whole party, billed once on one invoice;
     - the elapsed time credited to EVERY member, so the per-customer report
       can say who played, on which date, for how long, and what they paid;
     - a usage report per customer: today, per-date detail, totals, and a list
       of the dates on which they did NOT play.

   Membership rule requested by the shop owner: a membership plan is only spent
   when the person's own single/double tariff matches how many people actually
   played. Someone on a single plan who played in a group is billed normally,
   and a two-person plan holder playing alone is billed normally too.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__groupPlayInstalled) return;
  window.__groupPlayInstalled = true;

  const SESSION_KEY = 'alvand_groupSessions';
  const GUESTS_KEY = 'alvand_walkInGuests';

  /* ---------- storage ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '[]'); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function guestBook() {
    try { return JSON.parse(localStorage.getItem(GUESTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveGuests(list) {
    try { localStorage.setItem(GUESTS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  window.gpLoad = load; window.gpSave = save;
  window.gpGuestBook = guestBook; window.gpSaveGuests = saveGuests;

  /* ---------- live state accessors ----------
     app.js keeps `clients` in a module-scoped `let` and republishes it through
     publishState, so it must be read through window at the moment of use.
     Caching the array in a local would hand us a stale copy as soon as the
     app re-assigned it. */
  function allClients() {
    const w = (typeof window !== 'undefined') ? window : {};
    if (Array.isArray(w.clients)) return w.clients;
    if (Array.isArray(w.getClients)) { try { return w.getClients() || []; } catch (e) {} }
    return [];
  }
  function tariffTable() {
    const w = (typeof window !== 'undefined') ? window : {};
    return (w.tariffs && typeof w.tariffs === 'object') ? w.tariffs : {};
  }
  window.gpAllClients = allClients;

  /* ---------- helpers ---------- */
  const esc = (s) => (typeof escapeHtml === 'function')
    ? escapeHtml(String(s == null ? '' : s))
    : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* security.js already exports num(), which also reads Persian and
   * Arabic-Indic digits. The local Number() helper here shadowed it, so a cost
   * or a duration stored as "۲۰٬۰۰۰" silently became 0 and the report showed
   * nothing. Use the shared one, with a plain fallback for safety. */
  const num = (typeof window !== 'undefined' && typeof window.num === 'function')
    ? function (v, d) { return window.num(v, d); }
    : function (v, d) { const n = Number(v); return isFinite(n) ? n : (d || 0); };
  const uid = () => 'gp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  /* Local date, not UTC. toISOString() would put a shop in Tehran on the
   * previous day, so "today" in the report would disagree with the till. */
  function faDate(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.getFullYear() + '/' + pad(dt.getMonth() + 1) + '/' + pad(dt.getDate());
  }
  /* Parse "2026/09/30" back into a local date. Splitting it by hand and
   * trusting the result is how "2026/01/01" (month 0) showed up as a day the
   * customer had never played. */
  function parseFaDate(s) {
    const bits = String(s == null ? '' : s).split('/');
    if (bits.length !== 3) return null;
    const y = Number(bits[0]), m = Number(bits[1]), d = Number(bits[2]);
    if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return new Date(y, m - 1, d);
  }
  function faTime(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    return pad(dt.getHours()) + ':' + pad(dt.getMinutes());
  }
  function hhmmss(sec) {
    sec = Math.max(0, Math.floor(num(sec)));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  window.gpFaDate = faDate; window.gpParseFaDate = parseFaDate;
  window.gpFaTime = faTime; window.gpHhmmss = hhmmss;

  /* The running party. Kept in localStorage so closing the app mid-session
   * does not lose the money. */
  function active() {
    try { return JSON.parse(localStorage.getItem('alvand_groupActive') || 'null'); } catch (e) { return null; }
  }
  function setActive(v) {
    try {
      if (v) localStorage.setItem('alvand_groupActive', JSON.stringify(v));
      else localStorage.removeItem('alvand_groupActive');
    } catch (e) {}
  }
  window.gpActive = active; window.gpSetActive = setActive;

  function elapsedOf(g) {
    if (!g) return 0;
    const base = num(g.elapsedBase);
    if (g.running && num(g.startedAt) > 0) return base + Math.floor((Date.now() - g.startedAt) / 1000);
    return base;
  }
  window.gpElapsed = elapsedOf;

  /* ---------- pricing ----------
     The party is billed as one unit: one person uses the single rate, two use
     the double rate, and everyone beyond the second is billed as an extra
     person - the same arithmetic the app already uses for "نفر اضافه". */
  function quote(headcount) {
    const n = Math.max(1, Math.floor(num(headcount, 1)));
    const rateOf = (tariffType, stationType) => {
      if (typeof getTariffForClient === 'function') {
        return num(getTariffForClient({ tariff: tariffType, stationType: stationType || null }), 0);
      }
      const t = tariffTable();
      return num(tariffType === 'single' ? t.single : t.double, 0);
    };
    const extraRate = (typeof getExtraRate === 'function') ? num(getExtraRate(), 0) : 0;
    const base = n === 1 ? rateOf('single', null) : rateOf('double', null);
    const extras = Math.max(0, n - 2);
    const perHour = base + extras * extraRate;
    return { headcount: n, perHour: perHour, base: base, extras: extras, extraRate: extraRate };
  }
  window.gpQuote = quote;

  function costFor(headcount, seconds) {
    const q = quote(headcount);
    const hours = Math.max(0, num(seconds)) / 3600;
    let raw = Math.round(hours * q.perHour);
    if (typeof applyRounding === 'function') raw = applyRounding(raw);
    return Math.max(0, num(raw));
  }
  window.gpCostFor = costFor;

  /* ---------- membership rule ----------
     Spend the plan only when the person's own tariff matches how many people
     actually played: a single-plan holder in a group, or a two-person plan
     holder alone, pays the normal rate and their plan is left untouched. */
  function planApplies(member, headcount) {
    const n = Math.max(1, Math.floor(num(headcount, 1)));
    const t = (member && member.tariff === 'double') ? 'double' : 'single';
    if (n === 1) return t === 'single';
    return t === 'double' && n === 2;
  }
  window.gpPlanApplies = planApplies;

  /* ---------- start / stop ---------- */
  function start(opts) {
    const members = [];
    (opts.clientIds || []).forEach((id) => {
      const c = allClients().find((x) => String(x.id) === String(id));
      if (!c) return;
      if (c.status === 'online') { showToast(c.name + ' هم‌اکنون در حال بازی است', 'warning'); return; }
      members.push({
        kind: 'client', id: c.id, name: c.name, tariff: c.tariff || 'single',
        stationType: c.stationType || null, typeLabel: '',
      });
    });
    const guestLabel = (opts.guestLabel || '').trim();
    if (guestLabel) {
      const count = Math.max(1, Math.floor(num(opts.guestCount, 1)));
      for (let i = 0; i < count; i++) {
        members.push({
          kind: 'guest', id: null,
          name: count > 1 ? guestLabel + ' ' + (i + 1) : guestLabel,
          tariff: (members.length + i) === 0 ? 'single' : 'double',
          stationType: opts.stationType || null, typeLabel: '',
        });
      }
    }
    if (!members.length) { showToast('حداقل یک نفر را انتخاب کنید', 'error'); return null; }

    // mark the real clients as playing so the rest of the app agrees
    members.forEach((m) => {
      if (m.kind !== 'client') return;
      const c = allClients().find((x) => String(x.id) === String(m.id));
      if (!c) return;
      c.status = 'online';
      c.startTime = Date.now();
      c.elapsed = 0;
      c._lastElapsed = null;
      c.notified = false;
    });

    const g = {
      id: uid(),
      members: members,
      guestLabel: guestLabel,
      stationType: opts.stationType || null,
      startedAt: Date.now(),
      elapsedBase: 0,
      running: true,
      paymentMethod: 'cash',
    };
    setActive(g);
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    renderGroupPanel();
    showToast('بازی شروع شد (' + members.length + ' نفر)', 'success');
    return g;
  }
  window.gpStart = start;

  function pause() {
    const g = active();
    if (!g || !g.running) return;
    g.elapsedBase = elapsedOf(g);
    g.running = false;
    g.startedAt = 0;
    setActive(g);
    renderGroupPanel();
  }
  window.gpPause = pause;

  function resume() {
    const g = active();
    if (!g || g.running) return;
    g.running = true;
    g.startedAt = Date.now();
    setActive(g);
    renderGroupPanel();
  }
  window.gpResume = resume;

  function abort() {
    const g = active();
    if (!g) return;
    g.members.forEach((m) => {
      if (m.kind !== 'client') return;
      const c = allClients().find((x) => String(x.id) === String(m.id));
      if (c) { c.status = 'offline'; c.startTime = null; c.elapsed = 0; c._lastElapsed = null; }
    });
    setActive(null);
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }
    renderGroupPanel();
  }
  window.gpAbort = abort;

  /* ---------- finishing: one invoice, time credited to everyone ---------- */
  function finish() {
    const g = active();
    if (!g) { showToast('بازی فعالی وجود ندارد', 'error'); return null; }
    const seconds = elapsedOf(g);
    const headcount = g.members.length;
    const total = costFor(headcount, seconds);
    const endedAt = Date.now();

    // one session record per member: the shop needs per-person history, and
    // the bill is attached to the payer only so the income total stays right
    const payer = g.payerKind === 'guest' ? null : (g.payerId != null ? g.payerId : (g.members[0].kind === 'client' ? g.members[0].id : null));
    const method = g.paymentMethod || 'cash';

    const list = load();
    const nowIso = new Date(endedAt).toISOString();
    g.members.forEach((m, idx) => {
      const isPayer = m.kind === 'client' ? String(m.id) === String(payer) : (idx === 0 && payer === null);
      list.push({
        id: uid(),
        groupId: g.id,
        date: nowIso,
        startedAt: g.startedAt || endedAt - seconds * 1000,
        endedAt: endedAt,
        duration: seconds,
        cost: isPayer ? total : 0,
        billed: isPayer,
        memberKind: m.kind,
        clientId: m.kind === 'client' ? m.id : null,
        clientName: m.name,
        memberName: m.name,
        headcount: headcount,
        tariff: m.tariff || 'single',
        stationType: m.stationType || null,
        stationTypeName: (typeof getStationType === 'function' && m.stationType) ? (getStationType(m.stationType) || {}).name || '' : '',
        paymentMethod: isPayer ? method : null,
        branchId: (typeof currentBranchId === 'function') ? currentBranchId() : '1',
      });
    });
    save(list);

    // remember walk-in labels so they can be reused
    if (g.guestLabel) {
      const book = guestBook();
      if (!book.some((x) => x.label === g.guestLabel)) {
        book.push({ label: g.guestLabel, lastSeen: nowIso });
        saveGuests(book.slice(-60));
      }
    }

    /* The bill has to reach the real ledger the rest of the app reads. Writing
     * only to alvand_groupSessions left the party's money out of the daily
     * income, the monthly chart, the branch card and the year total - the shop
     * saw the money arrive in the till and nowhere else. One record on the
     * payer carries the whole amount, so the total is counted once. */
    try {
      if (typeof sessions !== 'undefined' && Array.isArray(sessions)) {
        const payerName = (g.members.find(function (m) {
          return m.kind === 'client' ? String(m.id) === String(payer) : false;
        }) || g.members[0] || {}).name || '';
        sessions.push({
          id: uid(),
          groupId: g.id,
          branchId: (typeof currentBranchId === 'function') ? currentBranchId() : '1',
          clientId: payer,
          clientName: payerName,
          duration: seconds,
          cost: total,
          gameCost: total,
          buffetCost: 0,
          tariff: (g.members.find(function (m) { return m.kind === 'client' && String(m.id) === String(payer); }) || {}).tariff || 'double',
          extra: 0,
          extraSeconds: 0,
          stationType: g.stationType || null,
          stationTypeName: '',
          date: nowIso,
          timerDuration: 0,
          paymentMethod: method,
          services: [],
          headcount: headcount,
          groupPlay: true,
        });
      }
    } catch (e) { console.warn('[gamenet] could not write the group session to the ledger', e); }

    // payment goes to the cash/card ledger once, for the whole party
    if (total > 0) {
      try {
        const payments = JSON.parse(localStorage.getItem('alvand_payments') || '[]');
        const payerName = (g.members.find((m) => (m.kind === 'client' ? String(m.id) === String(payer) : false)) || g.members[0] || {}).name || '';
        if (method === 'split') {
          payments.push({ amount: Math.round(total / 2), method: 'cash', date: nowIso, clientName: payerName });
          payments.push({ amount: total - Math.round(total / 2), method: 'card', date: nowIso, clientName: payerName });
        } else {
          payments.push({ amount: total, method: method, date: nowIso, clientName: payerName });
        }
        localStorage.setItem('alvand_payments', JSON.stringify(payments));
      } catch (e) {}
    }

    // clients: clear the playing state, add to their own total, spend the plan
    // only where the tariff matches the party size
    g.members.forEach((m) => {
      if (m.kind !== 'client') return;
      const c = allClients().find((x) => String(x.id) === String(m.id));
      if (!c) return;
      c.status = 'offline';
      c.startTime = null;
      c.elapsed = 0;
      c.extraSeconds = 0;
      c._lastElapsed = null;
      c.notified = false;
      const isPayer = String(c.id) === String(payer);
      c.totalCost = num(c.totalCost) + (isPayer ? total : 0);
      if (isPayer && planApplies(m, headcount) && typeof window.deductMembershipHours === 'function') {
        try { window.deductMembershipHours(c.id, seconds / 3600); } catch (e) {}
      }
    });
    if (typeof saveData === 'function') { try { saveData(); } catch (e) {} }

    setActive(null);
    renderGroupPanel();
    if (typeof renderClients === 'function') { try { renderClients(); } catch (e) {} }

    const summary = { group: g, seconds: seconds, total: total, headcount: headcount, payer: payer, method: method, records: g.members.length };
    showToast('بازی پایان یافت - ' + total.toLocaleString('fa-IR') + ' تومان', 'success');
    return summary;
  }
  window.gpFinish = finish;

  /* ---------- the usage report ---------- */
  /* Read BOTH stores. A party is recorded in alvand_groupSessions (one row per
   * person) and a single-player session is recorded in alvand_sessions (one row
   * on the payer). Reading only the group store meant a customer who had
   * played all year through the ordinary cards showed an empty report. */
  function normalise(row, from) {
    if (!row) return null;
    const memberKind = row.memberKind || (from === 'group' ? 'client' : 'client');
    return {
      id: row.id,
      groupId: row.groupId || null,
      date: row.date,
      startedAt: row.startedAt || null,
      endedAt: row.endedAt || null,
      duration: num(row.duration),
      cost: num(row.cost),
      billed: row.billed !== undefined ? !!row.billed : num(row.cost) > 0,
      memberKind: memberKind,
      clientId: row.clientId === undefined ? null : row.clientId,
      clientName: row.clientName || row.memberName || '',
      memberName: row.memberName || row.clientName || '',
      headcount: num(row.headcount, 1) || 1,
      tariff: row.tariff || 'single',
      stationType: row.stationType || null,
      stationTypeName: row.stationTypeName || '',
      paymentMethod: row.paymentMethod || null,
      branchId: (typeof window.branchIdOf === 'function') ? window.branchIdOf(row) : (row.branchId || '1'),
      from: from,
    };
  }

  function allRows() {
    const out = [];
    load().forEach(function (r) { const n = normalise(r, 'group'); if (n) out.push(n); });
    // the ordinary ledger, minus the single billed row a party also wrote there
    const groups = {};
    load().forEach(function (r) { if (r.groupId) groups[String(r.groupId)] = true; });
    if (typeof sessions !== 'undefined' && Array.isArray(sessions)) {
      sessions.forEach(function (r) {
        if (r && r.groupId && groups[String(r.groupId)]) return;   // already counted
        const n = normalise(r, 'ledger');
        if (n) out.push(n);
      });
    }
    return out;
  }
  window.gpAllRows = allRows;

  function sessionsOf(key) {
    // key: client id, 'guest:<label>' or 'all'
    const list = allRows();
    if (key === 'all') return list;
    if (typeof key === 'string' && key.indexOf('guest:') === 0) {
      const label = key.slice(6);
      return list.filter((r) => r.memberKind === 'guest' && r.clientName === label);
    }
    return list.filter((r) => r.memberKind === 'client' && String(r.clientId) === String(key));
  }
  window.gpSessionsOf = sessionsOf;

  function report(key) {
    const rows = sessionsOf(key).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const todayKey = faDate(new Date());
    const byDay = {};
    rows.forEach((r) => {
      const d = faDate(new Date(r.date));
      if (!byDay[d]) byDay[d] = { date: d, seconds: 0, visits: 0, paid: 0, sessions: [] };
      const b = byDay[d];
      b.seconds += num(r.duration);
      b.visits += 1;
      b.paid += num(r.cost);
      b.sessions.push(r);
    });
    const days = Object.keys(byDay).sort().reverse();
    const todaySeconds = byDay[todayKey] ? byDay[todayKey].seconds : 0;
    const totalSeconds = rows.reduce((s, r) => s + num(r.duration), 0);
    const totalPaid = rows.reduce((s, r) => s + num(r.cost), 0);
    // the days between the first and last visit on which they did NOT play
    const absent = [];
    if (days.length) {
      const first = parseFaDate(days[days.length - 1]);
      const last = parseFaDate(days[0]);
      if (first && last) {
        const have = {};
        days.forEach((d) => { have[d] = true; });
        // walk the calendar day by day, in local time
        for (let d = new Date(first.getTime()); d <= last; d.setDate(d.getDate() + 1)) {
          const key2 = faDate(d);
          if (!have[key2]) absent.push(key2);
        }
      }
    }
    return {
      key: key, rows: rows, days: days, byDay: byDay, today: todaySeconds,
      totalSeconds: totalSeconds, totalPaid: totalPaid, absent: absent,
      visits: rows.length,
    };
  }
  window.gpReport = report;

  /* ---------- UI ---------- */
  /* The selection lives in a module variable, not in the DOM: the picker is
   * re-rendered whenever the client list changes (boot, add, delete, filter)
   * and the ticks the shop made must survive that. */
  const selection = { ids: [] };
  // Expose it read-only. A plain assignment replaces the reference, and the
  // module would then keep mutating an object nobody else can see - which is
  // exactly how a selection can silently go empty.
  try {
    Object.defineProperty(window, '__gpSelection', {
      configurable: true, enumerable: false,
      get: function () { return selection; },
      set: function (v) {
        if (v && Array.isArray(v.ids)) selection.ids = v.ids;
      },
    });
  } catch (e) { window.__gpSelection = selection; }
  window.gpSelection = function () { return selection; };
  window.gpSelectionSize = function () { return selection.ids.length; };
  window.gpSelectionIds = function () { return selection.ids.slice(); };

  function pickerOptions() {
    const sel = allClients().filter((c) => c.status !== 'online');
    const book = guestBook();
    return { sel: sel, book: book };
  }

  function renderPicker() {
    const box = document.getElementById('gpPicker');
    if (!box) return;
    const { sel, book } = pickerOptions();
    const term = (document.getElementById('gpSearch') || {}).value || '';
    const q = term.trim().toLowerCase();
    const list = q ? sel.filter((c) => String(c.name).toLowerCase().indexOf(q) !== -1) : sel;
    let html = '';
    if (!list.length) {
      html = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;padding:12px">کلاینتی برای نمایش نیست</p>';
    } else {
      html = list.map((c) => {
        const st = (typeof getStationType === 'function') ? getStationType(c.stationType) : null;
        const t = st ? st.icon + ' ' + st.name : (c.tariff === 'single' ? 'تک نفره' : 'دو نفره');
        const on = selection.ids.some((id) => String(id) === String(c.id)) ? ' checked' : '';
        return '<label class="gp-chip" data-gp-opt="' + esc(c.id) + '">'
          + '<input type="checkbox" onchange="gpTogglePick(this)" value="' + esc(c.id) + '"' + on + '>'
          + '<span class="gp-chip-name">' + esc(c.name) + '</span>'
          + '<span class="gp-chip-meta">' + esc(t) + '</span></label>';
      }).join('');
    }
    box.innerHTML = html;
    const dl = document.getElementById('gpGuestLabels');
    if (dl) {
      dl.innerHTML = book.length
        ? book.map((b) => '<option value="' + esc(b.label) + '">' + esc(b.label) + '</option>').join('')
        : '';
    }
    updateEstimate();
  }
  window.gpRenderPicker = renderPicker;

  function selected() {
    // drop anyone who is now playing or no longer exists. Must read the live
    // list: reading the module-scoped `clients` here emptied the selection on
    // every tick, because the app owns that variable.
    const live = new Set(allClients().filter((c) => c.status !== 'online').map((c) => String(c.id)));
    selection.ids = selection.ids.filter((id) => live.has(String(id)));
    return selection;
  }
  window.gpTogglePick = function (input) {
    if (!input) return;
    const id = input.value;
    const at = selection.ids.findIndex((x) => String(x) === String(id));
    if (input.checked) { if (at < 0) selection.ids.push(id); }
    else if (at >= 0) selection.ids.splice(at, 1);
    updateEstimate();
  };
  window.gpSearch = function () { renderPicker(); };

  function guestCount() {
    return Math.max(0, Math.floor(num((document.getElementById('gpGuestCount') || {}).value, 0)));
  }
  function updateEstimate() {
    const el = document.getElementById('gpEstimate');
    if (!el) return;
    const n = selected().ids.length + guestCount();
    if (!n) { el.textContent = 'هنوز کسی انتخاب نشده'; return; }
    const q = quote(n);
    el.innerHTML = n + ' نفر · حدود ' + q.perHour.toLocaleString('fa-IR') + ' تومان در ساعت'
      + (q.extras ? ' (' + q.extras + ' نفر اضافه)' : '')
      + ' · هزینه در پایان محاسبه می‌شود';
  }
  window.gpUpdateEstimate = updateEstimate;

  function renderGroupPanel() {
    const box = document.getElementById('gpRunning');
    if (!box) return;
    const g = active();
    if (!g) {
      box.style.display = 'none';
      const p = document.getElementById('gpSetup');
      if (p) p.style.display = '';
      return;
    }
    box.style.display = '';
    const p = document.getElementById('gpSetup');
    if (p) p.style.display = 'none';
    const secs = elapsedOf(g);
    const total = costFor(g.members.length, secs);
    const names = g.members.map((m) => (m.kind === 'guest' ? '👤 ' : '') + esc(m.name)).join(' · ');
    const byClient = g.members.filter((m) => m.kind === 'client').length;
    box.innerHTML =
      '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">'
      + '<div><div style="font-size:0.75rem;color:rgba(255,255,255,0.55)">در حال بازی</div>'
      + '<div style="font-size:1.5rem;font-weight:900;color:#22c55e" id="gpClock">' + hhmmss(secs) + '</div>'
      + '<div style="font-size:0.85rem">' + names + '</div></div>'
      + '<div style="text-align:left"><div style="font-size:0.75rem;color:rgba(255,255,255,0.55)">مبلغ تا این لحظه</div>'
      + '<div style="font-size:1.3rem;font-weight:900">' + total.toLocaleString('fa-IR') + ' تومان</div>'
      + '<div style="font-size:0.75rem;color:rgba(255,255,255,0.5)">' + g.members.length + ' نفر · پرداخت‌کننده یک نفر</div></div>'
      + '</div>'
      + '<div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; align-items:center">'
      + (g.running
        ? '<button class="glass-btn" onclick="gpPause()">توقف موقت</button>'
        : '<button class="glass-btn glass-btn-success" onclick="gpResume()">ادامه</button>')
      + '<button class="glass-btn glass-btn-success" onclick="gpFinish()">پایان و تسویه</button>'
      + '<button class="glass-btn glass-btn-danger" onclick="if(confirm(\'این بازی لغو شود؟ هیچ مبلغی ثبت نمی‌شود\')) gpAbort()">لغو بدون ثبت</button>'
      + '<select id="gpPayMethod" class="glass-input" style="max-width:150px">'
      + ['cash|نقدی', 'card|کارت', 'online|آنلاین', 'split|ترکیبی'].map((o) => {
          const v = o.split('|')[0], lbl = o.split('|')[1];
          return '<option value="' + v + '"' + ((g.paymentMethod || 'cash') === v ? ' selected' : '') + '>' + lbl + '</option>';
        }).join('')
      + '</select>'
      + (byClient ? '<span style="font-size:0.75rem;color:rgba(255,255,255,0.5)">' + byClient + ' کلاینت ثبت‌شده در فهرست</span>' : '')
      + '</div>';
  }
  window.renderGroupPanel = renderGroupPanel;

  function tick() {
    const g = active();
    if (!g || !g.running) return;
    const c = document.getElementById('gpClock');
    if (c) {
      const secs = elapsedOf(g);
      c.textContent = hhmmss(secs);
      const box = document.getElementById('gpRunning');
      const amount = box && box.querySelector('div[style*="text-align:left"] div:nth-child(2)');
      if (amount) amount.textContent = costFor(g.members.length, secs).toLocaleString('fa-IR') + ' تومان';
    }
  }
  window.gpTick = tick;

  /* the shop name and number the owner typed into "shop info"; the thermal
   * receipt already prints these, so keep one place that reads them */
  function shopInfo() {
    let name = '', phone = '';
    try { name = String(localStorage.getItem('alvand_shopName') || '').trim(); } catch (e) {}
    try { phone = String(localStorage.getItem('alvand_shopPhone') || '').trim(); } catch (e) {}
    return { name: name, phone: phone };
  }

  /* ---------- the report modal ---------- */
  function openReport(key) {
    const r = report(key);
    const isGuest = typeof key === 'string' && key.indexOf('guest:') === 0;
    const title = isGuest ? 'کارکرد ' + key.slice(6) : (function () {
      const c = allClients().find((x) => String(x.id) === String(key));
      return 'کارکرد ' + (c ? c.name : 'مشتری');
    })();

    const dayRows = r.days.map((d) => {
      const b = r.byDay[d];
      return '<tr><td>' + d + '</td><td>' + b.visits + '</td><td>' + hhmmss(b.seconds) + '</td><td>' + b.paid.toLocaleString('fa-IR') + '</td></tr>';
    }).join('');

    const detail = r.rows.slice(0, 60).map((s) => {
      const d = new Date(s.date);
      return '<tr><td>' + faDate(d) + '</td><td>' + faTime(d) + '</td><td>' + hhmmss(s.duration) + '</td>'
        + '<td>' + (s.headcount > 1 ? s.headcount + ' نفره' : 'تک') + '</td>'
        + '<td>' + (s.cost ? s.cost.toLocaleString('fa-IR') : '—') + '</td></tr>';
    }).join('');

    const absent = r.absent.length
      ? r.absent.slice(0, 40).map((d) => '<span class="gp-absent">' + d + '</span>').join(' ')
      : '<span style="color:rgba(255,255,255,0.5)">روز بدون بازی در بازهٔ فعالیت ثبت نشده</span>';

    /* a printed page has to say which shop and which customer it belongs to,
     * and the print stylesheet strips the buttons but keeps this block */
    const shop = shopInfo();
    const shopLine = (shop.name || shop.phone)
      ? '<div class="gp-shop-head">'
        + '<div class="gp-shop-name">' + esc(shop.name || 'گیم‌نت') + '</div>'
        + (shop.phone ? '<div class="gp-shop-phone">' + esc(shop.phone) + '</div>' : '')
        + '</div>'
      : '';

    const printedAt = new Date().toLocaleDateString('fa-IR') + ' '
      + new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });

    const html = ''
      + shopLine
      + '<h3 style="margin:0 0 4px">' + esc(title) + '</h3>'
      + '<div class="gp-report-sub">گزارش کارکرد · تاریخ چاپ: ' + esc(printedAt) + '</div>'
      + '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0">'
      + '<div class="gp-stat"><div>امروز</div><b>' + hhmmss(r.today) + '</b></div>'
      + '<div class="gp-stat"><div>مجموع</div><b>' + hhmmss(r.totalSeconds) + '</b></div>'
      + '<div class="gp-stat"><div>پرداختی</div><b>' + r.totalPaid.toLocaleString('fa-IR') + '</b></div>'
      + '</div>'
      + '<div style="font-weight:700;margin:12px 0 6px">خلاصه بر اساس تاریخ</div>'
      + '<div class="gp-scroll" style="max-height:190px;overflow:auto"><table class="gp-table"><thead><tr><th>تاریخ</th><th>دفعات</th><th>مدت</th><th>پرداخت</th></tr></thead><tbody>'
      + (dayRows || '<tr><td colspan="4">هنوز بازی‌ای ثبت نشده</td></tr>') + '</tbody></table></div>'
      + '<div style="font-weight:700;margin:16px 0 6px">جزئیات بازی‌ها</div>'
      + '<div class="gp-scroll" style="max-height:230px;overflow:auto"><table class="gp-table"><thead><tr><th>تاریخ</th><th>ساعت</th><th>مدت</th><th>نوع</th><th>پرداخت</th></tr></thead><tbody>'
      + (detail || '<tr><td colspan="5">رکوردی نیست</td></tr>') + '</tbody></table></div>'
      + '<div style="font-weight:700;margin:16px 0 6px">روزهایی که بازی نکرد</div>'
      + '<div style="font-size:0.78rem;line-height:2.1">' + absent + '</div>';

    openModalWithHtml('usageReportModal', html);
  }
  window.gpOpenReport = openReport;

  function gpSelectAllVisible() {
    const live = allClients().filter((c) => c.status !== 'online');
    const term = ((document.getElementById('gpSearch') || {}).value || '').trim().toLowerCase();
    const list = term ? live.filter((c) => String(c.name).toLowerCase().indexOf(term) !== -1) : live;
    list.forEach((c) => { if (!selection.ids.some((x) => String(x) === String(c.id))) selection.ids.push(c.id); });
    renderPicker();
  }
  window.gpSelectAllVisible = gpSelectAllVisible;

  function gpClearPick() {
    selection.ids.length = 0;
    renderPicker();
  }
  window.gpClearPick = gpClearPick;

  /* Printing must work with no network and must not open a blank page, so the
   * modal is printed through the same revealed off-screen island the PDF export
   * uses, and the browser dialog is what actually saves the file. */
  /* The print path is the native "Save as PDF" dialog, so the report has to be
   * in the document AND the print stylesheet has to show it. Hiding the modal
   * before printing - which is what this used to do - left the printer with an
   * empty page. The modal is left open, marked for printing, and the rest of
   * the UI is hidden by the print stylesheet alone. */
  function gpPrintReport() {
    const modal = document.getElementById('usageReportModal');
    if (!modal) { showToast('گزارشی برای چاپ نیست', 'error'); return; }
    if (!modal.classList.contains('show')) { showToast('اول گزارش کارکرد را باز کنید', 'error'); return; }
    // a light-only print view: same numbers, on white, no dark background and
    // no buttons, so the paper is readable
    if (!document.getElementById('gpPrintStyle')) {
      const st = document.createElement('style');
      st.id = 'gpPrintStyle';
      st.textContent =
        '@media print {' +
        '  body.gp-printing #usageReportModal .gp-shop-head {' +
        '     display: block !important; text-align: center; border-bottom: 2px solid #111 !important;' +
        '     padding-bottom: 8px; margin-bottom: 12px; }' +
        '  body.gp-printing #usageReportModal .gp-shop-name {' +
        '     font-size: 17pt !important; font-weight: 900 !important; margin: 0 0 2px !important; }' +
        '  body.gp-printing #usageReportModal .gp-shop-phone {' +
        '     font-size: 11pt !important; font-weight: 700 !important; direction: ltr !important; }' +
        '  body.gp-printing #usageReportModal .gp-report-sub {' +
        '     font-size: 9pt !important; opacity: 1 !important; margin-bottom: 10px !important; }' +
        '  body.gp-printing #usageReportModal h3 { page-break-after: avoid; }' +
        '  body.gp-printing > *:not(#usageReportModal) { display: none !important; }' +
        '  body.gp-printing #usageReportModal { position: static !important; display: block !important;' +
        '     background: #fff !important; backdrop-filter: none !important; padding: 0 !important; }' +
        '  body.gp-printing #usageReportModal .modal { position: static !important; display: block !important;' +
        '     background: #fff !important; color: #000 !important; max-width: 100% !important;' +
        '     width: 100% !important; max-height: none !important; overflow: visible !important;' +
        '     border: 0 !important; box-shadow: none !important; }' +
        '  body.gp-printing #usageReportModal .modal-close,' +
        '  body.gp-printing #usageReportModal button { display: none !important; }' +
        '  body.gp-printing #usageReportModal * { color: #111 !important; background: transparent !important;' +
        '     border-color: #bbb !important; box-shadow: none !important; text-shadow: none !important;' +
        '     max-height: none !important; overflow: visible !important; }' +
        '  body.gp-printing #usageReportModal table { page-break-inside: auto; }' +
        '  body.gp-printing #usageReportModal tr { page-break-inside: avoid; }' +
        '  body.gp-printing #usageReportModal .gp-scroll { max-height: none !important; overflow: visible !important; }' +
        '}';
      document.head.appendChild(st);
    }
    document.body.classList.add('gp-printing');
    showToast('در پنجرهٔ چاپ، «Save as PDF» را بزنید', 'warning');
    // the print view must stay marked for the whole time the dialog is open,
    // and must come off again afterwards - otherwise the next print, or the
    // screen behind it, is stuck in print mode
    const clear = () => {
      try { document.body.classList.remove('gp-printing'); } catch (e) {}
      try { window.removeEventListener('afterprint', clear); } catch (e) {}
    };
    window.addEventListener('afterprint', clear);
    // let the class apply and the page lay out before the dialog opens
    setTimeout(() => {
      try { window.print(); } catch (e) { showToast('چاپ ممکن نشد', 'error'); clear(); }
    }, 150);
    // if the browser never fires afterprint, do not stay stuck in print mode
    setTimeout(clear, 60000);
  }
  window.gpPrintReport = gpPrintReport;

  function openModalWithHtml(id, html) {
    const m = document.getElementById(id);
    if (!m) return;
    const b = document.getElementById(id + 'Body');
    if (b) b.innerHTML = html;
    m.classList.add('show');
  }
  window.gpOpenModalWithHtml = openModalWithHtml;

  /* ---------- boot ---------- */
  function init() {
    const p = document.getElementById('gpSetup');
    if (p) p.style.display = active() ? 'none' : '';
    renderPicker();
    renderGroupPanel();
    if (typeof window.setInterval === 'function') window.setInterval(tick, 1000);
    // the client list changes when someone is added, deleted, starts or stops,
    // so the picker and the running panel have to follow it
    if (typeof window.renderClients === 'function' && !renderClients.__gpWrapped) {
      const original = window.renderClients;
      const wrapped = function () {
        const out = original.apply(this, arguments);
        try { renderPicker(); renderGroupPanel(); } catch (e) {}
        return out;
      };
      wrapped.__gpWrapped = true;
      window.renderClients = wrapped;
    }
  }
  window.gpInit = init;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
})();
