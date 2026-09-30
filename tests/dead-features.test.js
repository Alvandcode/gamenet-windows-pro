/* The two "dead feature" gaps:
 *  - switchBranch() wrote a branch id that nothing read, so the selector looked
 *    like it split the books per branch while every session/expense landed in one
 *    pile. New records now carry branchId and the card shows the real numbers.
 *  - the whole survey flow (modal, 5 stars, submit, stats) existed but nothing in
 *    the app could open it, so no survey could ever be recorded.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'dangerously',
  });
  const { window } = dom;
  const doc = window.document;
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message || String(e.error)));
  window.fetch = () => Promise.reject(new Error('offline'));
  window.confirm = () => true;
  window.print = () => {};
  for (const f of ['config.js', 'security.js', 'license-pubkey.js', 'license.js', 'storage.js', 'app.js',
    'patches.js', 'jalali.js', 'zoom.js', 'new-features.js', 'round2-a.js', 'round2-b.js', 'round2-c.js',
    'phonebook.js', 'ops.js', 'finance.js']) {
    const s = doc.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, 'src/js/' + f), 'utf8');
    doc.body.appendChild(s);
  }
  await sleep(400);

  console.log('--- 1. a branch id is published and readable ---');
  ok(typeof window.currentBranchId === 'function', 'window.currentBranchId() exists');
  ok(window.currentBranchId() === '1', 'the default branch is 1');
  window.localStorage.setItem('alvand_currentBranch', '77');
  ok(window.currentBranchId() === '77', 'it follows the selection');
  ok(window.branchIdOf({ branchId: '77' }) === '77', 'a tagged record reports its own branch');
  ok(window.branchIdOf({}) === '1', 'a record from before branching belongs to the main branch');
  ok(window.branchIdOf(null) === '1', 'and so does a missing one');

  console.log('--- 2. new records are stamped ---');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(/sessions\.push\(\{\s*branchId: currentBranchId\(\)/.test(appSrc), 'sessions carry the branch');
  ok(/expenses\.push\(\{id:Date\.now\(\), title,amount,category,date, branchId:currentBranchId\(\)\}\)/.test(appSrc), 'expenses carry the branch');
  ok(/sales\.push\(\{[^}]*branchId:currentBranchId\(\)/.test(appSrc), 'buffet sales carry the branch');

  console.log('--- 3. the branch card shows REAL per-branch numbers ---');
  window.localStorage.setItem('alvand_currentBranch', '1');
  window.eval("sessions=[{clientName:'A',cost:100000,date:'2026-09-01',branchId:'1'},{clientName:'B',cost:250000,date:'2026-09-02',branchId:'77'},{clientName:'C',cost:50000,date:'2026-09-03'}]");
  window.eval("expenses=[{id:1,title:'x',amount:30000,date:'2026-09-01',branchId:'77'}]");
  window.eval("sales=[{name:'s',price:10000,qty:2,cost:1,date:'2026-09-02',branchId:'77'}]");
  const stats = window.branchStats();
  const b1 = stats.find((s) => String(s.id) === '1');
  const b77 = stats.find((s) => String(s.id) === '77');
  ok(!!b1 && b1.sessions === 2, 'branch 1 has 2 sessions (one untagged counts as main)');
  ok(!!b77 && b77.sessions === 1, 'branch 77 has 1 session');
  ok(b1 && b1.income === 150000, 'branch 1 income = 100000 + 50000 (got ' + (b1 && b1.income) + ')');
  ok(b77 && b77.income === 250000, 'branch 77 income = 250000');
  ok(b77 && b77.sales === 20000, 'branch 77 buffet sales = 20000');
  ok(b77 && b77.expense === 30000, 'branch 77 expense = 30000');
  ok(b1 && b1.expense === 0, 'branch 1 has no expenses');

  const list = doc.getElementById('branchesList');
  ok(!!list, 'the branch list element exists');
  window.localStorage.setItem('alvand_branches', JSON.stringify([
    { id: 1, name: 'شعبه اصلی', address: '', active: true },
    { id: 77, name: 'شعبه غرب', address: '', active: true },
  ]));
  // the module caches BR, so re-evaluate the module with the new list
  const rb = doc.createElement('script');
  rb.textContent = fs.readFileSync(path.join(ROOT, 'src/js/round2-b.js'), 'utf8');
  doc.body.appendChild(rb);
  await sleep(200);
  window.renderBranches();
  ok(list.innerHTML.length > 0, 'the branch card rendered');
  ok(list.innerHTML.indexOf('\u0634\u0639\u0628\u0647 \u063a\u0631\u0628') !== -1, 'the second branch is listed by name');
  // the card renders with fa-IR digits, so compare after normalising
  const normDigits = (t) => t.replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[,\u066c]/g, '');
  const cardText = normDigits(list.innerHTML.replace(/<[^>]*>/g, ' '));
  ok(cardText.indexOf('250000') !== -1, 'branch 77 game income 250000 is shown on the card');
  ok(cardText.indexOf('150000') !== -1, 'branch 1 game income 150000 is shown on the card');
  ok(cardText.indexOf('20000') !== -1, 'branch 77 buffet 20000 is shown on its own line');
  ok(cardText.indexOf('30000') !== -1, 'branch 77 expense 30000 is shown');
  ok(list.innerHTML.indexOf('شعبه فعال') !== -1, 'the active branch is marked');
  ok(list.innerHTML.indexOf('خالص') !== -1, 'the card explains that old records stay in the main branch');
  ok(list.innerHTML.indexOf('ثبت با این شعبه') !== -1, 'the inactive branch offers the switch');

  console.log('--- 4. switching does not reload the page away ---');
  let reloaded = false;
  const origReload = window.location.reload;
  try { window.location.reload = () => { reloaded = true; }; } catch (e) {}
  window.switchBranch(77);
  await sleep(150);
  ok(reloaded === false, 'switchBranch no longer calls location.reload()');
  ok(window.localStorage.getItem('alvand_currentBranch') === '77', 'the selection is stored');
  window.switchBranch(1);
  await sleep(100);

  console.log('--- 5. the survey can finally be reached ---');
  const btn = doc.querySelector('button[onclick="openSurveyModal()"]');
  ok(!!btn, 'a button opens the survey modal');
  const modal = doc.getElementById('surveyModal');
  ok(!!modal, 'the survey modal exists');
  modal.classList.remove('show');
  window.localStorage.removeItem('alvand_surveys');
  window.openSurveyModal();
  ok(modal.classList.contains('show'), 'clicking it opens the modal');
  ok(doc.querySelectorAll('#surveyStars .star').length === 5, 'five stars are there');
  doc.querySelectorAll('#surveyStars .star')[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(80);
  ok(window._svRate === 4, 'clicking a star records the rating');
  doc.getElementById('surveyFeedback').value = 'خیلی خوب بود';
  await window.submitSurveyForm();
  await sleep(150);
  const surveys = JSON.parse(window.localStorage.getItem('alvand_surveys') || '[]');
  ok(surveys.length === 1, 'the survey was stored');
  ok(surveys[0] && surveys[0].rating === 4, 'with the right rating');
  ok(surveys[0] && surveys[0].feedback === '\u062e\u06cc\u0644\u06cc \u062e\u0648\u0628 \u0628\u0648\u062f', 'and the text');
  ok(!modal.classList.contains('show'), 'the modal closed after submitting');
  const statsBox = doc.getElementById('surveyStatsContent');
  ok(statsBox && statsBox.innerHTML.indexOf('4') !== -1, 'the stats box reflects the new survey');
  // the stats render must not crash on the empty state either
  window.localStorage.removeItem('alvand_surveys');
  window.renderSurveyStats();
  ok(statsBox.innerHTML.length > 0, 'the empty state renders instead of crashing');

  // ---- 6. PDF export and fonts must work with no internet ----
  console.log('--- 6. offline PDF export ---');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const appSrcPdf = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

  const vendor = path.join(ROOT, 'assets', 'vendor', 'html2pdf.bundle.min.js');
  ok(fs.existsSync(vendor), 'html2pdf is vendored inside the app');
  ok(!/cdnjs\.cloudflare\.com[^"']*html2pdf/.test(html), 'index.html does not load html2pdf from a CDN');
  ok(/assets\/vendor\/html2pdf\.bundle\.min\.js/.test(html), 'index.html loads the local copy');

  const fontCssPath = path.join(ROOT, 'assets', 'fonts', 'vazirmatn.css');
  ok(fs.existsSync(fontCssPath), 'the Persian font css is local');
  const fontCss = fs.readFileSync(fontCssPath, 'utf8');
  ok(!/https:\/\/fonts\.(googleapis|gstatic)/.test(fontCss), 'the local font css points at no remote host');
  const faces = (fontCss.match(/@font-face/g) || []).length;
  ok(faces >= 5, 'the local font css declares the weights (' + faces + ' faces)');
  const refs = [...fontCss.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  ok(refs.length > 0 && refs.every((f) => fs.existsSync(path.join(ROOT, 'assets', 'fonts', f))),
     'every referenced font file is on disk (' + refs.length + ' files)');
  ok(!/fonts\.googleapis\.com\/css2\?family=Vazirmatn/.test(html), 'index.html does not load the font from Google Fonts');
  ok(/assets\/fonts\/vazirmatn\.css/.test(html), 'index.html loads the local font css');
  // the old tag used media="print" + onload, so an offline shop skipped it entirely
  const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '');
  ok(!/media="print"[^>]*Vazirmatn/.test(htmlNoComments) && !/Vazirmatn[^>]*media="print"/.test(htmlNoComments),
     'the font stylesheet is not deferred behind an onload handler');

  console.log('--- 7. the PDF template is laid out, not parked off-screen ---');
  const wrap = doc.getElementById('pdfPrintWrap');
  const tpl = doc.getElementById('pdfTemplate');
  ok(!!wrap && !!tpl, 'the pdf wrapper and template exist');
  const wrapStyle = wrap.getAttribute('style') || '';
  const tplStyle = tpl.getAttribute('style') || '';
  // html2canvas draws the element where it is: at left:-9999px inside a
  // collapsed 0-height wrapper the capture was an empty page (a 3KB PDF of
  // nothing), which is exactly the blank report people were seeing.
  ok(!/left:\s*-9999px/.test(tplStyle), 'the template is not parked at left:-9999px');
  const tplWidth = parseInt((tplStyle.match(/width:\s*(\d+)px/) || [])[1] || '0', 10);
  ok(tplWidth > 0 && tplWidth <= 718, 'the template fits the printable A4 width (' + tplWidth + ' <= 718)');
  ok(/box-sizing:\s*border-box/.test(tplStyle), 'padding is inside the width, not added to it');
  ok(/function withPdfTemplateVisible/.test(appSrcPdf), 'the export reveals the template before rendering');
  ok(/function renderPdfBlob/.test(appSrcPdf), 'both the blob and the download use one render path');
  ok(/the report has no content/.test(appSrcPdf), 'an empty report is refused instead of saved blank');
  ok(/window\.APP_VERSION/.test(appSrcPdf) && /pdfVersionText/.test(appSrcPdf), 'the PDF footer reads the real version');
  ok(!/v1\.8\.0/.test(html), 'no stale hardcoded version is left in the template');

  ok(errors.length === 0, 'no script errors (' + errors.slice(0, 2).join(' | ') + ')');
  console.log(fail === 0 ? '\nALL DEAD-FEATURE CHECKS PASSED (' + pass + ')' : '\n' + fail + ' FAILED (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL crashed: ' + e.stack); process.exit(1); });
