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
    text: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,80)
  })`);
  const d = JSON.parse(info);
  ok(d.title === 'Gamenet Manager Pro', 'window title is correct', d.title);
  ok(d.sections > 20, 'all sections present (' + d.sections + ')');
  ok(d.nav > 20, 'sidebar rendered (' + d.nav + ' items)');
  ok(d.bg.indexOf('gradient') !== -1, 'the theme is painted on <html> (' + d.bg + ')');
  ok(/[؀-ۿ]/.test(d.text), 'Persian text is rendered');

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
