'use strict';
/* Smoke-test the PACKAGED app (dist/win-unpacked), not the source tree.
 * This is what a customer actually installs, so the checks must run against
 * the real exe and the real asar. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const ROOT = 'C:/Users/Iran Novin/Documents/Default Project/gamenet-windows-pro';
const EXE = path.join(ROOT, 'dist/win-unpacked/Gamenet Manager Pro.exe');
const PROFILE = path.join(os.tmpdir(), 'opencode', 'pkg-profile');
const PORT = 9355;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e ? ' -> ' + e : '')); } };

(async function () {
  ok(fs.existsSync(EXE), 'the packaged exe exists', EXE);
  if (!fs.existsSync(EXE)) process.exit(1);
  if (fs.existsSync(PROFILE)) fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });

  const child = spawn(EXE, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
  const procOut = [];
  child.stdout.on('data', (d) => procOut.push(d.toString()));
  child.stderr.on('data', (d) => procOut.push(d.toString()));

  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(500);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
    } catch (e) { /* not up */ }
  }
  ok(!!page, 'the packaged app opened a window');
  if (!page) { console.log(procOut.join('').slice(0, 800)); child.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (method, params) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.text || ''));
  };
  await send('Log.enable'); await send('Runtime.enable'); await send('Page.enable');

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text };
    return r.result.value;
  };
  let ready = '';
  for (let i = 0; i < 40 && ready !== 'complete'; i++) { ready = await evaluate('document.readyState'); if (ready !== 'complete') await sleep(400); }
  ok(ready === 'complete', 'the packaged renderer finished loading', ready);
  await sleep(1500);

  console.log('--- the packaged app is the 1.9.0 build, not a stale copy ---');
  const v = JSON.parse(await evaluate(`JSON.stringify({
    pkg: (window.APP_VERSION||'?'),
    shown: (document.body.innerText.match(/نسخه\\s*([0-9.]+)/)||[])[1] || '?',
    bridge: typeof window.gamenet === 'object'
  })`));
  ok(v.pkg === '1.9.0', 'APP_VERSION inside the package is 1.9.0', v.pkg);
  ok(v.shown === '1.9.0', 'the UI shows 1.9.0', v.shown);
  ok(v.bridge === true, 'the preload bridge is present');

  console.log('--- features that were broken before are in the package ---');
  const mods = await evaluate(`JSON.stringify([
    ['app','currentBranchId'],['ops','getPackages'],['finance','computePNL'],
    ['round2-b','branchStats'],['round2-a','openSurveyModal'],['round2-c','encryptAndSave'],
    ['phonebook','pbNormPhone'],['patches','doLogin']
  ].map(([f,k]) => f + ':' + k + '=' + (typeof window[k] !== 'undefined' ? 'ok':'MISSING')))`);
  ok(!/MISSING/.test(mods), 'merged modules are inside the package', mods.replace(/","/g, '" ').slice(0, 200));

  const csp = await evaluate(`(document.querySelector('meta[http-equiv="Content-Security-Policy"]')||{}).content || ''`);
  ok(!/http:\/\/(192\.168|10|172\.1[6-9])\./.test(String(csp)), 'the fixed CSP shipped in the package');

  const agent = await evaluate(`typeof window.gamenet.agent.request === 'function'`);
  ok(agent === true, 'the agent bridge is exposed in the package');

  console.log('--- and it really works against a live agent ---');
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, path: req.url })); });
  await new Promise((r) => server.listen(48721, '0.0.0.0', r));
  const r1 = await evaluate(`(async()=>{try{return JSON.stringify(await window.gamenet.agent.request('127.0.0.1','/status?token=x'))}catch(e){return 'ERR '+e.message}})()`);
  ok(/"ok":true/.test(String(r1)), 'a real agent call succeeds from the packaged app', String(r1).slice(0, 100));
  const r2 = await evaluate(`(async()=>JSON.stringify(await window.gamenet.agent.request('example.com','/status')))()`);
  ok(/"bad ip"/.test(String(r2)), 'non-IP host still rejected in the package', String(r2).slice(0, 80));
  server.close();

  const cspErrs = errors.filter((e) => /Content Security Policy/.test(e));
  ok(cspErrs.length === 0, 'no CSP warnings in the packaged app', cspErrs.length + '');
  const other = errors.filter((e) => !/Content Security Policy/.test(e) && !/config\.local\.json|_RESET|_TIMED_OUT|net::ERR_/.test(e));
  ok(other.length === 0, 'no other console errors in the packaged app', other.slice(0, 2).join(' | ').slice(0, 140));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/IRANNO~1/AppData/Local/Temp/opencode/packaged-shot.png', Buffer.from(shot.data, 'base64'));
  console.log('  screenshot: C:/Users/IRANNO~1/AppData/Local/Temp/opencode/packaged-shot.png');

  ws.close(); child.kill(); await sleep(700);
  console.log('\n' + (fail === 0 ? 'PACKAGED APP VERIFIED (' + pass + ' checks)' : fail + ' PACKAGED CHECK(S) FAILED (' + pass + ' passed)'));
  process.exit(fail === 0 ? 0 : 1);
})();
