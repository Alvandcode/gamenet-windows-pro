'use strict';
/* The about page has to answer a customer's questions without guessing:
 * what the app is, who it is for, where the free download is, how to reach the
 * maker, and which version is running.
 *
 * The version matters most. It is what a customer quotes when asking for
 * support, and a wrong one costs a round trip. The PDF report sheet once
 * shipped stamped v1.10.2 while the app was on 1.10.6 because the string sat
 * in the markup, so this checks the page reads the running build instead.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

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

  console.log('--- the page exists ---');
  const sec = doc.getElementById('about-section');
  ok(!!sec, 'there is an about section');
  ok(sec.className.indexOf('section') >= 0, 'and it is a regular section, so showSection can reach it');
  ok(sec.style.display === 'none', 'it starts hidden like the others');

  console.log('--- it can be opened ---');
  ok(typeof window.showSection === 'function', 'showSection exists');
  ok(typeof window.renderAbout === 'function', 'renderAbout exists');
  window.showSection('about');
  await sleep(250);
  ok(sec.style.display === 'block', 'showSection("about") reveals it');
  ok(doc.querySelectorAll('#about-section').length === 1, 'and it is the only section showing');

  console.log('--- the version comes from the build, not the markup ---');
  const shown = doc.getElementById('aboutVersionText').textContent;
  const running = String(window.APP_VERSION);
  ok(/\d+\.\d+\.\d+/.test(running), 'the build reports a real version', running);
  ok(shown.indexOf(running) >= 0, 'the page shows the running version', shown + ' vs ' + running);
  // the hardcoded default that used to sit in the markup must be gone
  ok(!/1\.8\.0/.test(shown), 'no stale hardcoded version is shown', shown);
  /* The page must carry no version typed into the source, or it drifts from the
   * build exactly like the PDF sheet did. Read the file for that: the live DOM
   * legitimately holds the version renderAbout() has just written. */
  const srcFile = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcSection = srcFile.slice(srcFile.indexOf('id="about-section"'),
                                   srcFile.indexOf('id="license-section"'));
  const literals = srcSection.match(/\bv?\d+\.\d+\.\d+\b/g) || [];
  ok(literals.length === 0, 'the page source carries no version literal, so it cannot go stale',
     literals.join(','));
  const old = doc.getElementById('currentVersionText');
  ok(!old || old.textContent === running, 'and the older version spot was kept in step',
     old ? old.textContent : 'not present');

  console.log('--- what it says ---');
  const text = sec.textContent.replace(/\s+/g, ' ').trim();
  ok(text.length > 900, 'it is a real page, not a stub', text.length + ' chars');
  ['این برنامه چیست', 'برای چه کسب', 'گیم'].forEach((t) => {
    ok(text.indexOf(t) >= 0, 'it explains "' + t + '"');
  });
  ok(/گیم.?نت/.test(text), 'it says what kind of place the app is for');
  ok(/بوفه/.test(text) || /کافه/.test(text), 'and lists the other kinds of business');
  ok(/نسخهٔ رایگان/.test(text), 'it has a free-download block');
  ok(/خرید لایسنس/.test(text), 'it says where to buy a licence');
  ok(/پشتیبانی/.test(text), 'and how to get support');
  ok(/سازنده/.test(text), 'and how to reach the maker');
  ok(/پشتیبان.?گیری/.test(text), 'and tells the customer to take a backup before asking for help');

  console.log('--- the links ---');
  const links = Array.prototype.map.call(sec.querySelectorAll('a'), (a) => a.getAttribute('href') || '');
  ok(links.length >= 3, 'it has several links', links.length + ' links');
  ok(links.some((h) => /github\.com\/Alvandcode\/gamenet-windows-pro\/releases/.test(h)),
     'one goes to the releases page for the free download', links.join(' | '));
  ok(links.some((h) => /^https:\/\/github\.com\/Alvandcode\/gamenet-windows-pro$/.test(h)),
     'one goes to the project page');
  // the same URL the licence error already sends customers to, so there is one
  // address to keep current rather than two that drift apart
  const licUrl = (appjs.match(/href="(https:\/\/github\.com\/Alvandcode[^"]*)"/) || [])[1];
  ok(!!licUrl, 'the licence error has an official url', licUrl || 'none');
  ok(links.indexOf(licUrl) >= 0, 'and the about page uses the very same one', links.join(' | '));
  // external links must not hand the opener to the target
  Array.prototype.forEach.call(sec.querySelectorAll('a[target="_blank"]'), (a) => {
    ok((a.getAttribute('rel') || '').indexOf('noopener') >= 0,
       'external links carry rel=noopener', a.getAttribute('href'));
  });

  console.log('--- the prices are the app own ---');
  ok(/۱,۰۰۰,۰۰۰/.test(text), 'it states the base licence price', '1,000,000');
  ok(/۲۰۰,۰۰۰/.test(text), 'and the per-device price');
  ok(/فقط توسط سازنده/.test(text), 'and that only the maker issues licences');

  console.log('--- every operator can open it ---');
  ok(/about:\s*true/.test(appjs),
     'PERM_MAP lets everyone through, so the nav entry is not dead');

  console.log('--- it is reachable from the nav ---');
  const nav = doc.querySelector('.nav-item[onclick*="about"]');
  ok(!!nav, 'there is a sidebar entry');
  ok(nav && /درباره/.test(nav.textContent), 'and it is labelled');

  console.log('--- nothing threw ---');
  ok(errors.length === 0, 'no script errors', errors.slice(0, 2).join(' | '));

  console.log(fail === 0 ? '\nABOUT PAGE CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });