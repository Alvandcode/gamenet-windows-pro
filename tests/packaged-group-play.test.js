'use strict';
/* The start-play flow inside the PACKAGED app, with the network cut. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const EXE = path.join(ROOT, 'dist/win-unpacked/Gamenet Manager Pro.exe');
const PROFILE = path.join(os.tmpdir(), 'opencode', 'pkg-gp');
const PORT = 9415;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };

(async function () {
  ok(fs.existsSync(EXE), 'the packaged exe exists');
  if (!fs.existsSync(EXE)) process.exit(1);
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });

  const child = spawn(EXE, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); page = l.find((t) => t.type === 'page' && /index\.html/.test(t.url)); } catch (e) {}
  }
  ok(!!page, 'the packaged app opened');
  if (!page) process.exit(1);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method: m, params: p || {} })); });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  await send('Runtime.enable'); await send('Network.enable');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await sleep(5000);

  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text };
    return r.result.value;
  };

  const want = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  console.log('--- the new module is in the package ---');
  const env = JSON.parse(await ev(`JSON.stringify({
    ver: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'),
    gp: typeof window.gpStart,
    panel: !!document.getElementById('gpSetup'),
    picker: !!document.getElementById('gpPicker'),
    guest: !!document.getElementById('gpGuestLabel'),
    report: !!document.getElementById('usageReportModal'),
  })`));
  ok(env.ver === want, 'the packaged app is ' + want, env.ver);
  ok(env.gp === 'function', 'the start-play module loaded');
  ok(env.panel && env.picker, 'the start-play panel is in the package');
  ok(env.guest, 'the "other" field for people with no account is in the package');
  ok(env.report, 'the usage report modal is in the package');

  console.log('--- a party of two plus a walk-in, offline ---');
  const res = await ev(`(async () => {
    try {
      clients = [
        { id: 1, name: 'رضا محمدی', tariff: 'single', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
        { id: 2, name: 'سارا احمدی', tariff: 'double', stationType: 'pc', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 }
      ];
      tariffs = { single: 20000, double: 35000, extra: 15000 };
      showSection('clients'); renderClients(); gpRenderPicker();
      const chips = document.querySelectorAll('#gpPicker .gp-chip').length;
      // the per-client usage button lives on the rendered card, so check it here
      const cardBtn = document.querySelectorAll('#clientsGrid .client-card button[onclick^="gpOpenReport"]').length;
      const b = document.querySelectorAll('#gpPicker input[type=checkbox]');
      b[0].checked = true; b[0].dispatchEvent(new Event('change', {bubbles:true}));
      b[1].checked = true; b[1].dispatchEvent(new Event('change', {bubbles:true}));

      const g = gpStart({ clientIds: gpSelectionIds(), guestLabel: 'مهمان', guestCount: 1 });
      g.startedAt = Date.now() - 3600*1000; gpSetActive(g); renderGroupPanel();
      const clock = document.getElementById('gpClock').textContent;
      const before = gpSessionsOf('all').length;
      const sum = gpFinish();
      const after = gpSessionsOf('all');
      const payments = JSON.parse(localStorage.getItem('alvand_payments')||'[]');
      const rpt = gpReport('1');
      return JSON.stringify({ chips, cardBtn, clock, seconds: sum.seconds, headcount: sum.headcount,
        total: sum.total, added: after.length-before, billed: after.filter(function(x){return x.billed;}).length,
        ledger: payments.length, reportToday: rpt.today, reportTotal: rpt.totalSeconds,
        reportPaid: rpt.totalPaid, status1: clients[0].status, elapsed1: clients[0].elapsed });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()`);
  const R = JSON.parse(String(res));
  if (R.error) { ok(false, 'the flow ran', R.error); }
  else {
    ok(R.chips === 2, 'the picker lists the customers', R.chips);
    ok(R.cardBtn === 2, 'every client card offers a usage report', R.cardBtn);
    ok(/^01:00:0\d$/.test(R.clock), 'the shared clock reached one hour', R.clock);
    ok(R.headcount === 3, 'three people played', R.headcount);
    ok(R.seconds >= 3599 && R.seconds <= 3601, 'one hour was billed', R.seconds);
    ok(R.total > 0, 'a bill was produced', R.total);
    ok(R.added === 3, 'one record per member', R.added);
    ok(R.billed === 1, 'one bill in total', R.billed);
    ok(R.ledger === 1, 'the cash ledger got it exactly once', R.ledger);
    ok(R.reportToday === R.seconds, 'the report credits the hour to today', R.reportToday);
    ok(R.reportTotal === R.seconds, 'and to the overall total', R.reportTotal);
    ok(R.reportPaid === R.total, 'and shows what was paid', R.reportPaid);
    ok(R.status1 === 'offline' && R.elapsed1 === 0, 'the client is free again', R.status1 + '/' + R.elapsed1);
  }

  ws.close(); child.kill(); await sleep(700);
  console.log('\n' + (fail === 0 ? 'PACKAGED GROUP PLAY VERIFIED (' + pass + ' checks)' : fail + ' CHECK(S) FAILED (' + pass + ' passed)'));
  process.exit(fail === 0 ? 0 : 1);
})();
