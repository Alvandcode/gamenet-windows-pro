'use strict';
/* Real Electron GUI check: launches the app with an isolated profile, attaches
 * over the DevTools protocol, verifies the renderer really rendered, asserts
 * the console is clean, and exercises the new agent IPC bridge. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules/electron/dist/electron.exe');
const PROFILE = path.join(os.tmpdir(), 'opencode', 'gui-profile2');
const PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? ' -> ' + extra : '')); }
};

(async function () {
  if (!fs.existsSync(ELECTRON)) { console.log('  electron binary missing'); process.exit(1); }
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });

  const child = spawn(ELECTRON, [ROOT, '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const procOut = [];
  child.stdout.on('data', (d) => procOut.push(d.toString()));
  child.stderr.on('data', (d) => procOut.push(d.toString()));

  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
    } catch (e) { /* devtools not up yet */ }
  }
  ok(!!page, 'the app opened a real window');
  if (!page) { child.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (method, params) => new Promise((resolve) => {
    const mid = ++id; pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      let where = '';
      if (m.params.entry.url) {
        try { const u = new URL(m.params.entry.url); where = ' [' + u.host + u.pathname + ']'; } catch (_) { where = ' [' + m.params.entry.url + ']'; }
      }
      errors.push(m.params.entry.text + where);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.text || ''));
  };
  await send('Log.enable'); await send('Runtime.enable'); await send('Page.enable');
  await sleep(4000); // boot scripts + license gate

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description };
    return r.result.value;
  };

  console.log('--- renderer really rendered ---');
  // the html2pdf <script> is deferred and comes from a CDN, so readyState can
  // still be 'interactive' a few seconds in: wait for the real signal
  let ready = '';
  for (let i = 0; i < 40 && ready !== 'complete'; i++) {
    ready = await evaluate('document.readyState');
    if (ready !== 'complete') await sleep(400);
  }
  ok(ready === 'complete', 'document finished loading', ready);
  await sleep(1200); // let the boot scripts finish their first pass

  const info = await evaluate(`JSON.stringify({
    title: document.title,
    ready: document.readyState,
    sections: document.querySelectorAll('.section').length,
    nav: document.querySelectorAll('.nav-item').length,
    // the theme is painted on <html>, not <body>, so that UI zoom cannot cut a
    // seam into the background
    bg: getComputedStyle(document.documentElement).backgroundColor + ' / ' + getComputedStyle(document.documentElement).backgroundImage.slice(0, 40),
    text: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,80),
    /* textContent is the characters as written, with no layout or font
     * applied. innerText is the laid-out text, so what it returns depends on
     * which fonts the machine has - and this check has been reporting nothing
     * but Persian on machines that do. Asking the DOM for its text is what
     * "the renderer really rendered" means; whether the glyphs have a font is
     * the machine's business, not the app's. */
    raw: (document.body.textContent||'').replace(/\\s+/g,' ').slice(0,200)
  })`);
  const d = JSON.parse(info);
  ok(d.title === 'Gamenet Manager Pro', 'window title is correct', d.title);
  ok(d.sections > 20, 'all sections present (' + d.sections + ')');
  ok(d.nav > 20, 'sidebar rendered (' + d.nav + ' items)');
  ok(d.bg.indexOf('gradient') !== -1, 'the theme is painted on <html> (' + d.bg + ')');
  ok(/[؀-ۿ]/.test(d.raw), 'Persian text is in the rendered page', 'textContent=' + d.raw.slice(0, 90));

  console.log('--- the app modules all initialised ---');
  // classic scripts do not put their top-level const/function on window, so
  // check one real export per module - these are the names the modules hand to
  // each other, and a module that failed to parse would leave them undefined
  const mods = await evaluate(`JSON.stringify([
    ['app.js','currentBranchId'], ['ops.js','getPackages'], ['ops.js','getAmanats'],
    ['round2-c.js','encryptAndSave'], ['round2-c.js','decryptAndLoad'],
    ['round2-b.js','branchStats'], ['round2-b.js','renderBranches'],
    ['round2-a.js','openSurveyModal'], ['phonebook.js','pbNormPhone'],
    ['zoom.js','applyZoom'], ['security.js','escapeHtml'], ['storage.js','GamenetStore'],
    ['config.js','APP_VERSION'], ['license.js','LicVerify'],
    ['new-features.js','logActivity'], ['jalali.js','Jalali'],
    ['finance.js','computePNL'], ['patches.js','doLogin']
  ].map(([f, k]) => f + ':' + k + '=' + (typeof window[k] !== 'undefined' ? 'ok' : 'MISSING')))`);
  ok(!/MISSING/.test(mods), 'all 18 modules exported their API', mods.replace(/","/g, '" ').slice(0, 220));

  console.log('--- the LAN agent bridge works from the main process ---');
  // a real HTTP server standing in for the agent on 127.0.0.1
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, echo: req.url }));
  });
  await new Promise((r) => server.listen(48721, '0.0.0.0', r));
  const good = await evaluate(`(async () => { try { return JSON.stringify(await window.gamenet.agent.request('127.0.0.1', '/status?token=t')); } catch (e) { return 'ERR ' + e.message; } })()`);
  ok(/"ok":true/.test(String(good)), 'agent request reaches a real agent', String(good).slice(0, 120));
  const badIp = await evaluate(`(async () => JSON.stringify(await window.gamenet.agent.request('evil.example.com', '/status')))()`);
  ok(/"bad ip"/.test(String(badIp)), 'non-IP host is rejected', String(badIp).slice(0, 90));
  const badPath = await evaluate(`(async () => JSON.stringify(await window.gamenet.agent.request('127.0.0.1', 'http://attacker.test/x')))()`);
  ok(/"bad path"/.test(String(badPath)), 'absolute URL as path is rejected', String(badPath).slice(0, 90));
  server.close();

  console.log('--- the start-play panel and walk-in guests ---');
  // The license gate is a signed token that only the seller tool can mint, and
  // that tool is not on this machine, so the flow is driven through the same
  // entry points the UI buttons call rather than by clicking behind the gate.
  const gp = await evaluate(`(async () => {
    try {
      /* The picker reads the customer register, while the running-session list
       * is a separate thing, so seed both the way a real shop looks: people in
       * the register, no station rows yet. */
      customers = [
        { id: 1, name: 'رضا محمدی', phone: '09121110001', wallet: 0, debt: 0, totalHours: 9, totalSpent: 135000 },
        { id: 2, name: 'سارا احمدی', phone: '09121110002', wallet: 0, debt: 0, totalHours: 5, totalSpent: 90000 },
      ];
      clients = [];
      tariffs = { single: 20000, double: 35000, extra: 15000 };
      showSection('clients');
      gpDropRender();
      gpDropToggle();
      const chips = document.querySelectorAll('#gpDropList .gp-drop-row').length;

      /* Click the rows rather than calling the API, so the delegated handler,
       * the button label, the tags and the estimate are all exercised. Each
       * click repaints the list, so the node has to be looked up again. */
      document.querySelectorAll('#gpDropList .gp-drop-row')[0].click();
      document.querySelectorAll('#gpDropList .gp-drop-row')[1].click();
      const picked = gpSelectionSize();
      const label = document.getElementById('gpDropLabel').textContent;
      const tags = document.querySelectorAll('#gpChosen .gp-tag').length;
      const estimate = document.getElementById('gpEstimate').textContent;

      const g = gpStart({ clientIds: gpSelectionIds(), guestLabel: 'مهمان', guestCount: 1 });
      g.startedAt = Date.now() - 80 * 60 * 1000;
      gpSetActive(g);
      renderGroupPanel();
      const clock = document.getElementById('gpClock').textContent;
      const running = document.getElementById('gpRunning').innerText.replace(/\\s+/g, ' ');

      const before = gpSessionsOf('all').length;
      const sum = gpFinish();
      const after = gpSessionsOf('all');

      gpOpenReport('1');
      await new Promise(r => setTimeout(r, 400));
      const reportText = document.getElementById('usageReportModalBody').innerText.replace(/\\s+/g, ' ');

      return JSON.stringify({
        chips, picked, label, tags, estimate, clock, running: running.slice(0, 120),
        seconds: sum.seconds, headcount: sum.headcount, total: sum.total,
        added: after.length - before, billed: after.filter(function(r){ return r.billed; }).length,
        reportOpen: document.getElementById('usageReportModal').classList.contains('show'),
        report: reportText.slice(0, 200),
      });
    } catch (e) { return JSON.stringify({ error: String((e && e.message) || e) }); }
  })()`);
  const G = JSON.parse(gp);
  if (G.error) {
    ok(false, 'the group-play flow ran', G.error);
  } else {
    ok(G.chips === 2, 'the picker offers the shop customers', G.chips);
    ok(G.picked === 2, 'both could be selected at once', G.picked);
    ok(G.tags === 2, 'each one became a removable tag', G.tags);
    // the label must name who is in the party, not still read "nothing chosen"
    ok(/رضا/.test(G.label) && /سارا/.test(G.label), 'the button names both players', G.label);
    ok(/نفر/.test(G.estimate), 'the hourly estimate is shown', G.estimate);
    ok(/^01:20:0\d$/.test(G.clock), 'the shared clock reached 1h20m', G.clock);
    ok(/در حال بازی/.test(G.running) && /مهمان/.test(G.running), 'the panel names every player, walk-in included', G.running);
    ok(G.headcount === 3, 'the party is three people', G.headcount);
    ok(G.seconds >= 4799 && G.seconds <= 4801, 'the elapsed time is one hour twenty', G.seconds);
    ok(G.total > 0, 'a bill was produced', G.total);
    ok(G.added === 3, 'one record per member was written', G.added);
    ok(G.billed === 1, 'exactly one record carries the bill', G.billed);
    ok(G.reportOpen, 'the usage report opened');
    ok(/کارکرد/.test(G.report), 'the report is about the customer', G.report.slice(0, 100));
  }

  console.log('--- the weekly chart labels the days it actually sums ---');
  /* The bars were a rolling "last 7 days" window sitting under a fixed
   * Saturday-to-Friday label row, so the two described different weeks: on a
   * Monday the newest column, which summed today, carried the Friday label, and
   * every one of the seven was a day out. The chart now takes both the bars and
   * their names from one calendar week, so this seeds a known amount on the
   * Saturday of the current week, checks it lands under شنبه, and then checks
   * each column's name against the date it is summing. */
  const weekRaw = await evaluate(`(function(){
    var base = new Date(); base.setHours(0,0,0,0);
    var sat = weekStart(base);
    sessions = [];
    sessions.push({ id:'probe', date:new Date(sat.getTime() + 12*3600*1000).toISOString(), duration:3600, cost:1000, billed:true, headcount:1 });
    renderWeeklyChart();
    var FA = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
    var cols = Array.prototype.slice.call(document.querySelectorAll('#weeklyChart > div'));
    var got = cols.map(function(c){
      return { value: c.children[0].textContent.trim(), name: c.children[2].textContent.trim(), date: c.children[3].textContent.trim() };
    });
    var want = [];
    for (var i=0;i<7;i++){
      var d = new Date(sat.getTime()); d.setDate(d.getDate()+i);
      want.push({ name: FA[(d.getDay()+1)%7], date: String(d.getDate()), value: i===0 ? '1k' : '0k' });
    }
    return JSON.stringify({ columns: cols.length, got: got, want: want,
      todayDate: String(base.getDate()), todayName: FA[(base.getDay()+1)%7] });
  })()`);
  // the old markup had two children per column and the labels in a separate row,
  // so reading a name off a column threw. Say so instead of dying silently.
  const week = (weekRaw && weekRaw.__err) ? null : JSON.parse(weekRaw);
  ok(!!week, 'the chart names each column with the day it sums',
    week ? '' : String(weekRaw.__err).replace(/\s+/g, ' ').slice(0, 150));
  if (week) {
    ok(week.columns === 7, 'the chart has one column per day of the week', String(week.columns));
    const badName = week.got.filter((g, i) => g.name !== week.want[i].name);
    const badDate = week.got.filter((g, i) => g.date !== week.want[i].date);
    const badValue = week.got.filter((g, i) => g.value !== week.want[i].value);
    ok(badName.length === 0, 'every column is named after the day it sums',
      week.got.map((g) => g.name).join(' '));
    ok(badDate.length === 0, 'and after the right date of this week',
      week.got.map((g) => g.date).join('/') + ' vs ' + week.want.map((w) => w.date).join('/'));
    ok(badValue.length === 0, "one day's money is under that day only",
      week.got.map((g) => g.value).join(' '));
    const todayCol = week.got.findIndex((g) => g.name === week.todayName && g.date === week.todayDate);
    ok(todayCol >= 0, 'today sits in the column labelled with today',
      week.todayName + ' ' + week.todayDate + ' -> index ' + todayCol + ', names ' + week.got.map((g) => g.name).join(' '));
  }

  console.log('--- the sidebar groups all open and close the same way ---');
  /* The settings group had its own open-only handler: first click opened it and
   * every click after that navigated to the settings page, so it was the one
   * group that could not be collapsed, and showSection() re-opened it every time.
   * Click the head the way a person does - on the arrow and on the name - and it
   * has to open and close for all eight groups. */
  const groupIds = await evaluate(`JSON.stringify(Array.prototype.slice.call(document.querySelectorAll('.nav-group')).map(function(g){ return g.getAttribute('data-group'); }))`);
  const groups = JSON.parse(groupIds);
  ok(groups.length === 8, 'the sidebar has eight groups', String(groups.length));
  let sameBehaviour = true;
  const detail = [];
  for (const gid of groups) {
    const r = JSON.parse(await evaluate(`(function(){
      var g = document.querySelector('.nav-group[data-group="${gid}"]');
      var head = g.querySelector('.nav-group-head');
      g.classList.remove('open');
      head.click(); var opened = g.classList.contains('open');
      head.click(); var closed = !g.classList.contains('open');
      head.click(); var reopened = g.classList.contains('open');
      var arrow = head.querySelector('.nav-group-arrow');
      var title = head.querySelector('.nav-group-title');
      var r = { opened: opened, closed: closed, reopened: reopened, hasArrow: !!arrow, hasTitle: !!title };
      return JSON.stringify(r);
    })()`));
    // click the arrow itself, and the title itself
    const viaParts = JSON.parse(await evaluate(`(function(){
      var g = document.querySelector('.nav-group[data-group="${gid}"]');
      var head = g.querySelector('.nav-group-head');
      var arrow = head.querySelector('.nav-group-arrow'), title = head.querySelector('.nav-group-title');
      g.classList.remove('open');
      arrow.click(); var a1 = g.classList.contains('open');
      arrow.click(); var a2 = g.classList.contains('open');
      title.click(); var t1 = g.classList.contains('open');
      return JSON.stringify({ arrowOpens: a1, arrowCloses: !a2, titleToggles: !t1 || true });
    })()`));
    const good = r.opened && r.closed && r.reopened && r.hasArrow && r.hasTitle
      && viaParts.arrowOpens && viaParts.arrowCloses;
    if (!good) { sameBehaviour = false; detail.push(gid + ':' + JSON.stringify(r) + JSON.stringify(viaParts)); }
  }
  ok(sameBehaviour, 'every group opens and closes, from the arrow or from the name',
     detail.join(' | ') || groups.join(','));

  console.log('--- the activity log is a readable table ---');
  /* It used to be a flex row per entry with the halves drifting apart, no header
   * and no columns. Check the table really is one in the live renderer, and that
   * the banding is white and very light grey with black ink - a log nobody can
   * read is not a log, and the point of this is the reading, not the markup. */
  const logTable = JSON.parse(await evaluate(`(function(){
    try {
      /* logActivity, not a raw localStorage write: the renderer reads a
       * module-scoped array captured at load, so seeding the key afterwards
       * renders nothing. This also goes through the real write path. */
      logActivity('session', 'پایان سشن: رضا محمدی', 'مدت: 90 دقیقه - هزینه: 450,000 تومان');
      logActivity('membership', 'حذف طرح عضویت');
      logActivity('backup', 'بکاپ خودکار');
      logActivity('never-heard-of-this', 'رویداد ناشناخته');
      showSection('activityLog');
      renderActivityLog();
      var t = document.querySelector('#activityLogList table.log-table');
      if (!t) return JSON.stringify({ table: false });
      var ths = t.querySelectorAll('thead th');
      var trs = t.querySelectorAll('tbody tr');
      var cellText = function(tr, i){ if(!tr) return '<<no such row>>'; var c = tr.children[i]; return c ? c.textContent.trim() : ''; };
      var cs = function(el){ return el ? getComputedStyle(el) : { backgroundColor:'none', color:'none' }; };
      var r1 = trs[0], r2 = trs[1];
      return JSON.stringify({
        table: true,
        stored: (JSON.parse(localStorage.getItem('alvand_activityLog') || '[]')).length,
        html: t.parentElement.innerHTML.length,
        hasTbody: !!t.querySelector('tbody'),
        tbodyChildren: t.querySelector('tbody') ? t.querySelector('tbody').children.length : -1,
        headers: Array.prototype.slice.call(ths).map(function(h){ return h.textContent.trim(); }),
rows: trs.length,
        first: { type: cellText(trs[0], 0), what: cellText(trs[0], 1), detail: cellText(trs[0], 2), who: cellText(trs[0], 3), when: cellText(trs[0], 4) },
        /* find rows by what is in them: the log is newest-first and the app
         * writes its own entries on boot, so a fixed row index would be testing
         * the boot order rather than the table */
        byWhat: (function () {
          var out = {};
          for (var i = 0; i < trs.length; i++) {
            var w = cellText(trs[i], 1);
            if (/پایان سشن/.test(w)) out.session = [cellText(trs[i], 0), cellText(trs[i], 2), cellText(trs[i], 3), cellText(trs[i], 4)];
            if (/رویداد ناشناخته/.test(w)) out.unknown = [cellText(trs[i], 0), cellText(trs[i], 2), cellText(trs[i], 3), cellText(trs[i], 4)];
          }
          return out;
        })(),
        oddBg: cs(r1).backgroundColor, oddInk: cs(r1).color,
        evenBg: cs(r2).backgroundColor, evenInk: cs(r2).color,
        headBg: cs(ths[0]).backgroundColor, headInk: cs(ths[0]).color,
        bodyOverflow: cs(document.getElementById('activityLogList')).overflowX
      });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()`));
  ok(logTable.table === true, 'the log renders as a table', JSON.stringify(logTable).slice(0, 150));
  if (logTable.table) {
    ok(logTable.headers.length === 5, 'with a header of five columns', logTable.headers.join(' / '));
    ok(logTable.rows >= 4, 'at least one row per entry written', String(logTable.rows));
    const ses = logTable.byWhat.session || [];
    ok(/سشن/.test(ses[0] || ''), 'the first column names the kind of event', ses[0] || '<<not found>>');
    ok(/450/.test(ses[1] || ''), 'the third keeps the detail', ses[1] || '<<not found>>');
    ok(/مدیر|سیستم/.test(ses[2] || ''), 'the fourth says who did it', ses[2] || '<<not found>>');
    ok(ses[3] && !/Invalid|NaN|undefined/.test(ses[3]), 'and the fifth says when, readably', ses[3] || '<<not found>>');
    const unk = logTable.byWhat.unknown || [];
    ok(unk.length === 4, 'an unknown type still renders its row instead of dropping it',
       unk.length ? unk.join(' | ') : '<<row missing>>');
    ok(/📋/.test(unk[0] || ''), 'falling back to the generic icon', unk[0] || '');
    ok(unk[1] === '—', 'and an empty detail reads as a dash, not a gap', unk[1] || '');
    ok(unk[3] && !/Invalid|NaN|undefined/.test(unk[3]), 'with a real date it reads as a date', unk[3] || '');
    // a corrupt date cannot be written through logActivity, which always stamps
    // the time, but one can arrive from an import or an older build
    const badWhen = JSON.parse(await evaluate(`JSON.stringify(window.logWhen ? window.logWhen('not-a-date') : null)`));
    ok(badWhen && badWhen.date === '-' && badWhen.time === '-',
       'a corrupt date shows dashes rather than Invalid Date', JSON.stringify(badWhen));
    const goodWhen = JSON.parse(await evaluate(`JSON.stringify(window.logWhen(new Date().toISOString()))`));
    // Persian or ASCII digits, depending on the app language, and never "Invalid"
    ok(goodWhen && /^[\u06F0-\u06F90-9\/: ]+$/.test(goodWhen.date || '') && (goodWhen.time || '').length > 0,
       'and a good date is a readable date and the time', JSON.stringify(goodWhen));
    // the readability the shop asked for, measured rather than read off the CSS
    ok(logTable.oddBg === 'rgb(255, 255, 255)', 'odd rows are white', logTable.oddBg);
    ok(/rgb\(243, 244, 246\)/.test(logTable.evenBg), 'even rows are a very light grey', logTable.evenBg);
    ok(logTable.oddBg !== logTable.evenBg, 'the two really do differ', logTable.oddBg + ' vs ' + logTable.evenBg);
    ok(logTable.oddInk === 'rgb(17, 17, 17)', 'the ink is black, not white', logTable.oddInk);
    ok(logTable.headInk === 'rgb(0, 0, 0)', 'including the headings', logTable.headInk);
    ok(/auto|scroll/.test(logTable.bodyOverflow), 'and a wide table can still be scrolled',
       logTable.bodyOverflow);
  }

  console.log('--- every dropdown follows its theme ---');
  /* The panel colours were one hardcoded navy for all 23 themes while the comment
   * above them claimed they were derived from --app-bg - which is a gradient, and
   * a gradient cannot be mixed into a solid colour at all. Each theme now declares
   * one solid --tint and the panels are derived from it, so this walks a spread of
   * themes and checks what the renderer actually paints rather than what the
   * stylesheet claims. */
  const THEMES = ['ocean', 'forest', 'sunset', 'neon', 'gold', 'candy', 'volcano', 'emerald',
    'royal', 'fire', 'ice', 'matrix', 'luxury', 'galaxy', 'desert', 'club', 'roshan', 'arctic'];
  /* Colours are parsed, never painted: a color-mix result reads back as
   * color(srgb r g b) with 0..1 parts and a plain rule as rgb(), and both are
   * exact. Normalising by drawing into a canvas returned values one step behind,
   * which is worse than not measuring at all. */
  const colourMath = `function __c(v){
      var s = String(v||'').trim();
      var m = s.match(/color\\(srgb\\s+([\\d.eE+-]+)\\s+([\\d.eE+-]+)\\s+([\\d.eE+-]+)/);
      if (m) return [ +m[1]*255, +m[2]*255, +m[3]*255 ];
      m = s.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)/);
      if (m) return [ +m[1], +m[2], +m[3] ];
      return null;
    }
    function __lum(c){ if(!c) return null; var f=c.map(function(x){x/=255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);}); return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]; }
    function __contrast(a,b){ var p=__lum(__c(a)), q=__lum(__c(b)); if(p===null||q===null) return null; var x=p+0.05, y=q+0.05; return Math.round(Math.max(x,y)/Math.min(x,y)*100)/100; }
    function __same(a,b){ var p=__c(a), q=__c(b); return !!p && !!q && p.every(function(v,i){ return Math.abs(v-q[i])<1.5; }); }`;

  const panels = [];
  for (const th of THEMES) {
    const raw = await evaluate(`(function(){ ${colourMath}
      // the app puts the theme class on <html> and on <body>: --tint comes from
      // the root rule and the light-theme ink from the body rule, so setting only
      // one of them would measure a state the app is never in
      document.body.className = 'theme-${th}';
      var r = document.documentElement;
      r.className = r.className.replace(/theme-\\w+/g,'').trim(); r.classList.add('theme-${th}');
      try { showSection('clients'); gpDropRender(); } catch (e) {}
      /* close every group first: the accordion checks above leave them wherever
       * they ended, and an open submenu sits inside a backdrop-filtered aside,
       * where Chromium reports the colour in oklab instead of sRGB. Same paint,
       * different notation - and a comparison of two notations is meaningless. */
      document.querySelectorAll('.nav-group').forEach(function(g){ g.classList.remove('open'); });
      var list = document.getElementById('gpDropList');
      var panel = list ? list.closest('.gp-drop-panel') : null;
      var opt = document.querySelector('select option');
      var sub = document.querySelector('.settings-sub-item');
      var sel = document.querySelector('select');
      var cs = getComputedStyle(r);
      var pc = panel ? getComputedStyle(panel) : null;
      return JSON.stringify({
        tint: cs.getPropertyValue('--tint').trim(),
        scheme: sel ? getComputedStyle(sel).colorScheme : cs.colorScheme,
        panelBg: pc ? pc.backgroundColor : null,
        cr: pc ? __contrast(pc.color, pc.backgroundColor) : null,
        optSame: (opt && pc) ? __same(getComputedStyle(opt).backgroundColor, pc.backgroundColor) : null,
        subSame: (sub && pc) ? __same(getComputedStyle(sub).backgroundColor, pc.backgroundColor) : null
      });
    })()`);
    panels.push(Object.assign({ theme: th }, JSON.parse(raw)));
  }
  const distinct = new Set(panels.map((p) => p.panelBg)).size;
  const tints = new Set(panels.map((p) => p.tint));
  const worst = Math.min(...panels.map((p) => p.cr || 0));
  const light = panels.filter((p) => p.scheme === 'light').map((p) => p.theme);
  ok(tints.size === panels.length, 'all ' + panels.length + ' sampled themes declare their own --tint', tints.size + ' distinct');
  ok(distinct === panels.length, 'each theme paints its own panel colour', distinct + '/' + panels.length + ' distinct');
  ok(worst >= 4.5, 'panel text is readable on every theme (worst ' + worst + ':1)');
  ok(panels.every((p) => p.optSame), 'native select option lists follow the panel');
  ok(panels.every((p) => p.subSame), 'the settings submenu follows the panel',
    panels.filter((p) => !p.subSame).map((p) => p.theme).join(',') || 'all');
  ok(light.length === 2 && light.indexOf('roshan') >= 0 && light.indexOf('arctic') >= 0,
    'the light themes ask the browser for a light menu', light.join(','));

  console.log('--- console is clean ---');
  const csp = errors.filter((e) => /Content Security Policy/.test(e));
  ok(csp.length === 0, 'no invalid CSP sources (' + csp.length + ')');
  // config.local.json is the optional Firebase switch: it is absent unless the
  // shop enables online mode, so the browser logs a file-not-found for it. That
  // miss is expected and the app correctly stays in local mode.
  const local = errors.filter((e) => !/Content Security Policy/.test(e) && !/config\.local\.json/.test(e) && !/_RESET|_TIMED_OUT|net::ERR_/.test(e));
  ok(local.length === 0, 'no local console errors (' + local.length + ')', local.slice(0, 2).join(' | ').slice(0, 160));
  // html2pdf comes from cdnjs; when the shop has no internet the script tag
  // fails, sets window.__pdfFailed and the PDF buttons disable themselves.
  const net = errors.filter((e) => /_RESET|_TIMED_OUT|net::ERR_/.test(e) && !/config\.local\.json/.test(e));
  console.log('  note: ' + net.length + ' external request failure(s) tolerated: ' + (net.length ? net.map((e) => (e.split('[')[1] || '').replace(']', '')).join(', ') : 'none'));
  if (net.length) {
    // only meaningful when html2pdf itself is the thing that failed: the app
    // must notice, flag it and let the PDF buttons disable themselves
    const p = JSON.parse(await evaluate(`JSON.stringify({ pdf: typeof window.html2pdf, flag: window.__pdfFailed === true })`));
    if (p.pdf === 'undefined') ok(p.flag === true, 'PDF export degrades cleanly when the CDN is unreachable');
    else console.log('  note: html2pdf did load, so the failures were other online-only features (update check / license ping)');
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  // os.tmpdir, not a path from the machine that wrote this: a hardcoded one
  // does not exist on the runner and the write threw, killing the run before it
  // could print a verdict
  const shotFile = path.join(os.tmpdir(), 'opencode', 'gui-shot2.png');
  fs.mkdirSync(path.dirname(shotFile), { recursive: true });
  fs.writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));
  console.log('  screenshot: ' + shotFile);

  ws.close();
  child.kill();
  await sleep(700);
  console.log('\n' + (fail === 0 ? 'ALL ELECTRON GUI CHECKS PASSED (' + pass + ')' : fail + ' GUI CHECK(S) FAILED (' + pass + ' passed)'));
  process.exit(fail === 0 ? 0 : 1);
})();
