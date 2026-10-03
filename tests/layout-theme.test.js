'use strict';
/* Three things were asked for, and each one had a way of silently failing.

1. The Telegram backup is gone. It could never work: no field anywhere took a
   bot token or a chat id, and the send path asked for window.gamenet.sms.send,
   which did not exist because preload.js nested sms inside the backup object.
   Every press returned {ok:false, error:'no-ipc'} without saying so.

2. Text must follow the theme. The light themes had no dark text, because the
   app overrode inline whites by attribute-matching four exact rgba values and
   the pages wrote other shades. Now they use --th-text, which both themes
   define.

3. Independent cards sit side by side. The failure mode here is a grid inside a
   grid: the outer one sizes against a single child and collapses to one column,
   which looks exactly like the grid not being applied at all.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'src/styles/main.css'), 'utf8');
const preload = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  PASS ' + l); } else { fail++; console.log('  FAIL ' + l + (e !== undefined ? ' -> ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  const dom = new JSDOM(html, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
  const { window } = dom; const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.fetch = () => Promise.reject(new Error('offline'));
  window.confirm = () => true;
  for (const f of ['config.js','security.js','license-pubkey.js','license.js','storage.js','app.js',
    'patches.js','jalali.js','zoom.js','new-features.js','round2-a.js','round2-b.js','round2-c.js',
    'phonebook.js','ops.js','finance.js','group-play.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await sleep(1500);

  console.log('--- the telegram backup is gone ---');
  ['buildTelegramBackup', 'sendTelegramBackup', 'checkTelegramBackup', 'saveTgBackupConfig',
   'renderTgBackup', 'saveTgBackupEnabled'].forEach((fn) => {
    ok(typeof window[fn] !== 'function', fn + ' no longer exists');
  });
  ok(html.indexOf('tgBackupContent') < 0, 'the empty container div is gone');
  ok(html.indexOf('بکاپ خودکار به تلگرام') < 0, 'the empty telegram card is gone');
  const allJs = fs.readdirSync(path.join(ROOT, 'src/js'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n');
  ok(allJs.indexOf('alvand_tgBackup') < 0, 'and its config key is unused anywhere');
  ok(allJs.indexOf('api.telegram.org/bot') < 0, 'and no bot api call is left behind');

  console.log('--- what the backup card says instead ---');
  const bk = doc.getElementById('backup-section');
  const bkText = bk.textContent.replace(/\s+/g, ' ');
  ok(/نگهداری نسخهٔ پشتیبان/.test(bkText), 'the backup section has a real card');
  ok(!/تلگرام/.test(bkText), 'and no telegram claim left in it',
     (bkText.match(/.{0,50}تلگرام.{0,50}/) || [''])[0]);

  console.log('--- the preload bridge is reachable ---');
  // sms and agent used to be inside backup, so window.gamenet.sms was undefined
  const smsAtTop = /\n\s{2}sms:\s*\{/.test(preload);
  ok(smsAtTop, 'sms sits directly under gamenet, not inside backup');
  const backupBlock = (preload.match(/backup:\s*\{[\s\S]*?\n\s{2}\},/) || [''])[0];
  ok(backupBlock.indexOf('sms') < 0, 'and not inside the backup object', backupBlock.slice(0, 80));
  ok(/agent:\s*\{/.test(preload), 'agent is there too');

  console.log('--- theme text variables exist for both kinds of theme ---');
  ok(/--th-text\s*:/.test(css), '--th-text is defined');
  ok(/--th-text-2\s*:/.test(css), '--th-text-2 is defined');
  ok(/--th-text-3\s*:/.test(css), '--th-text-3 is defined');
  // match the :root that actually holds the variables, not the first one in the file
  const rootBlocks = (css.match(/:root\s*\{[\s\S]*?\}/g) || []);
  const rootBlock = rootBlocks.find((b) => /--th-text\s*:/.test(b)) || '';
  ok(/--th-text\s*:\s*rgba\(255/.test(rootBlock),
     'the default is light, for the dark themes',
     (rootBlock.match(/--th-text\s*:[^;]+/) || [''])[0]);
  const light = css.match(/body\.theme-roshan,\s*body\.theme-arctic\s*\{[\s\S]*?\}/);
  ok(!!light, 'the light themes are covered');
  if (light) {
    ok(/--th-text\s*:\s*#/.test(light[0]), 'and they get a dark ink', (light[0].match(/--th-text\s*:[^;]+/) || [''])[0]);
    ok(!/--th-text\s*:\s*rgba\(255/.test(light[0]), 'not another translucent white');
  }

  console.log('--- the pages use the variables, not hardcoded whites ---');
  const sec = html.slice(html.indexOf('id="about-section"'), html.indexOf('id="license-section"'));
  ok(/var\(--th-text\)/.test(sec), 'the about page uses --th-text');
  ok(/rgba\(255,\s*255,\s*255/.test(sec) === false, 'and no inline white is left in it',
     (sec.match(/rgba\(255[^)]*\)/g) || []).join(','));
  ok(/var\(--th-link\)/.test(sec), 'links use --th-link');

  console.log('--- the card grids ---');
  ok(/\.compact-cards\s*\{[^}]*display:\s*grid/.test(css), 'compact-cards is a grid');
  ok(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(300px,\s*1fr\)\)/.test(css),
     'with a sensible minimum column width');
  ok(/\.compact-cards\s*>\s*\.glass\s*\{[^}]*margin-bottom:\s*0/.test(css),
     'the cards drop the margin the grid replaces');
  ok(/@media[^{]*max-width:\s*700px[^}]*\{[^}]*\.compact-cards[^}]*1fr/.test(css),
     'and collapse to one column on a narrow screen');

  const total = (html.match(/<div class="compact-cards">/g) || []).length;
  ok(total >= 8, 'the layout sweep covered several sections', String(total));

  console.log('--- no nested grid, which is what silently collapses one to a column ---');
  // A grid inside a grid is the failure mode: the outer one sizes against a
  // single child, so it reports two extra zero-width tracks and everything
  // stacks anyway - which looks exactly like the rule not applying.
  let nested = 0;
  const r2 = /<div class="compact-cards">\s*<div class="compact-cards">/g;
  let hit = null;
  while ((hit = r2.exec(html)) !== null) nested++;
  ok(nested === 0, 'no grid directly inside another', String(nested));

  console.log('--- the grids sit in different sections ---');
  const secsWithGrid = new Set();
  for (const mm of html.matchAll(/<div class="compact-cards">/g)) {
    const before = html.slice(0, mm.index);
    const ids = before.match(/id="([\w-]+-section)"/g) || [];
    if (ids.length) secsWithGrid.add(ids[ids.length - 1]);
  }
  ok(secsWithGrid.size >= 6, 'the grid is used across many sections',
     secsWithGrid.size + ' sections');

  console.log('--- the three cards from the screenshot are in one row ---');
  const st = html.indexOf('id="settings-section"');
  const settings = html.slice(st, html.indexOf('id="membership-section"') > 0
    ? html.indexOf('id="membership-section"') : st + 12000);
  ok(/compact-cards[\s\S]{0,400}آپدیت برنامه/.test(settings), 'update is in a grid');
  ok(/compact-cards[\s\S]{0,3000}بکاپ خودکار زمان‌بندی‌شده/.test(settings),
     'scheduled backup is in the same grid');
  ok(/compact-cards[\s\S]{0,6000}دسترسی سریع/.test(settings), 'quick access is in it too');

  console.log('--- the panel colours are per theme, not one hard-coded navy ---');
  ok(/--panel-bg\s*:/.test(css), '--panel-bg exists');
  ok(/--panel-border\s*:/.test(css), '--panel-border exists');
  ok(/--panel-text\s*:/.test(css), '--panel-text exists');
  ok(/--panel-text-2\s*:/.test(css), '--panel-text-2 exists');
  ok(/--panel-hover\s*:/.test(css), '--panel-hover exists');
  // the old fixed navy must be gone from both places it lived
  ok(html.indexOf('rgba(20,18,48') < 0, 'the hard-coded navy panel is gone from index.html');
  ok(css.indexOf('rgba(20,18,48') < 0, 'and from main.css');
  // Every theme declares a background; the panel is derived from it, so a new
  // theme gets a matching panel without anyone writing a rule for it.
  const themeNames = (css.match(/:root\.theme-([\w-]+)\s*\{/g) || [])
    .map((x) => x.replace(/:root\.theme-/, '').replace(/\s*\{/, ''));
  ok(themeNames.length === 21, 'all 21 themes still declare a background', themeNames.length + '');

  ok(/--panel-bg\s*:\s*color-mix/.test(css),
     'the panel background is derived from the theme colour, not a fixed navy',
     (css.match(/--panel-bg\s*:[^;]+/) || [''])[0]);
  ok((css.match(/color-mix/g) || []).length >= 4,
     'both the panel and its second shade are derived',
     (css.match(/color-mix/g) || []).length + '');

  // the light themes have to say so explicitly: dark ink on a pale panel is not
  // something a formula should be trusted with
  // Anchor on the exact selector AND require the panel variables inside it. The
  // theme-text block uses the same selector and comes first, and
  // body.theme-roshan .settings-sub-item mentions --panel-text without declaring
  // anything: matching either of those finds a rule that is not the panel.
  const lightRule = (css.match(/body\.theme-roshan,\s*body\.theme-arctic\s*\{[^}]*--panel-text[^}]*\}/) || [''])[0];
  ok(!!lightRule, 'the light themes have their own panel rule', lightRule.slice(0, 40));
  if (lightRule && lightRule.length > 1) {
    const d = lightRule;
    const pt = (d.match(/--panel-text\s*:[^;]+/) || [''])[0];
    const pb = (d.match(/--panel-bg\s*:[^;]+/) || [''])[0];
    ok(/#/.test(pt.replace(/^[^#]*#/, '#')), 'roshan panel text is a dark hex', pt);
    ok(/color-mix/.test(pb), 'and the background is derived, not hard-coded', pb);
    ok(/--panel-bg-2\s*:/.test(d), 'a second shade for the inputs and buttons');
    // a light theme has to ask the browser for a light menu, or the native
    // select popup is drawn dark whatever the option colours say
    ok(/color-scheme\s*:\s*light/.test(d), 'and it asks for a light native menu');
    // dark ink, and it must not be white
    const hex = (pt.match(/#([0-9a-f]{6})/i) || [])[1];
    if (hex) {
      const r = parseInt(hex.slice(0, 2), 16), g2 = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      ok(r + g2 + b < 330, 'and it really is dark', 'rgb(' + [r, g2, b].join(',') + ')');
    }
  }

  // Every theme declares one solid colour of its own, and the panels are mixed
  // from that. --app-bg is a gradient, so it can never be the source of a solid
  // panel colour no matter what the comment says.
  const themesWithoutTint = themeNames.filter((t) => {
    const block = (css.match(new RegExp(':root\\.theme-' + t + '\\s*\\{[^}]*\\}')) || [''])[0];
    return !/--tint\s*:/.test(block);
  });
  ok(themesWithoutTint.length === 0,
     'every theme declares a solid --tint for its panels to come from',
     themesWithoutTint.join(',') || 'all ' + themeNames.length);
  const rootPanelDecl = (css.match(/:root\s*\{[^}]*--panel-bg[^}]*\}/) || [''])[0];
  ok(/--panel-bg\s*:[^;]*var\(--tint\)/.test(rootPanelDecl),
     'the panel is mixed from that colour, per theme',
     (rootPanelDecl.match(/--panel-bg\s*:[^;]+/) || [''])[0]);
  ok(!/--panel-bg\s*:[^;]*#141230/.test(css), 'and no fixed navy is hiding in it');
  const rootPanel = (css.match(/:root\s*\{[^}]*--panel-bg[^}]*\}/) || [''])[0];
  ok(/--panel-text\s*:\s*rgba\(255/.test(rootPanel),
     'the default panel text is light, for the dark themes',
     (rootPanel.match(/--panel-text\s*:[^;]+/) || [''])[0]);

console.log('--- the dropdown uses the variables, not its own colours ---');
  const dropCss = (css.match(/\.gp-drop-panel\s*\{[^}]*\}/) || [''])[0];
  ok(/var\(--panel-bg\)/.test(dropCss), '.gp-drop-panel uses --panel-bg', dropCss.slice(0, 80));
  ok(/var\(--panel-text\)/.test(dropCss), 'and --panel-text');
  ok(/rgba\(255/.test(dropCss) === false, 'with no colour of its own left');

  console.log('--- the picker reads the register, not the session list ---');
  const gp = fs.readFileSync(path.join(ROOT, 'src/js/group-play.js'), 'utf8');
  ok(/function allMembers\(\)/.test(gp), 'there is a register reader');
  ok(/window\.gpAllMembers/.test(gp), 'and it is exposed');
  ok(/function nameOf\(/.test(gp), 'and a helper that names an id from either store');
  const iAll = gp.indexOf('function allMembers');
  const dropFn = gp.slice(gp.indexOf('function dropList'), gp.indexOf('function dropList') + 420);
  ok(/allMembers|pickerOptions/.test(dropFn), 'dropList no longer reads allClients()',
     dropFn.replace(/\s+/g, ' ').slice(0, 90));
  ok(/allClients/.test(dropFn) === false, 'not the session list', dropFn.replace(/\s+/g, ' ').slice(0, 90));
  const selFn = gp.slice(gp.indexOf('function selected'), gp.indexOf('function selected') + 700);
  ok(/allMembers/.test(selFn), 'selected() prunes against the register');
  ok(/allClients/.test(selFn), 'and also drops whoever is mid-session');

  console.log('--- in a live page: the register is what gets listed ---');
  window.customers = [
    { id: 21, name: 'زهرا ثبت‌شده', phone: '09120000021', wallet: 0, debt: 0, totalHours: 2, totalSpent: 60000 },
    { id: 22, name: 'بهرام ثبت‌شده', phone: '09120000022', wallet: 0, debt: 0, totalHours: 3, totalSpent: 90000 },
  ];
  window.clients = [
    { id: 99, name: 'فقط کارت بازی', status: 'offline', elapsed: 0, startTime: null, totalCost: 0 },
  ];
  window.gpRenderPicker();
  window.gpDropRender();
  await sleep(200);
  const listed = Array.prototype.map.call(
    doc.querySelectorAll('#gpDropList .gp-drop-row-name'), (e) => e.textContent.trim());
  ok(listed.length === 2, 'the dropdown lists two', listed.join(' / '));
  ok(/زهرا ثبت‌شده/.test(listed.join('|')) && /بهرام ثبت‌شده/.test(listed.join('|')),
     'the registered customers', listed.join(' / '));
  ok(!/فقط کارت بازی/.test(listed.join('|')),
     'and not the person who only has a session card', listed.join(' / '));
  ok(/09120000021/.test(doc.getElementById('gpDropList').textContent),
     'the phone is shown too, so someone can be found by number');
  window.customers = [];
  window.clients = [];

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nLAYOUT AND THEME CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });