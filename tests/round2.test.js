/* Round2 integration test: load ALL renderer scripts incl. new modules, verify bridge + features. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
function load(f) { return fs.readFileSync(path.join(ROOT, f), 'utf-8'); }

const store = {};
const sandbox = {
  console: { ...console, warn: () => {}, error: () => {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener: () => {},
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  document: {
    readyState: 'complete',
    body: { className: '', classList: { add: () => {}, remove: () => {} }, style: {} },
    addEventListener: () => {},
    querySelector: () => null,
    getElementById: () => ({ textContent: '', innerHTML: '', style: {}, classList: { add: () => {}, remove: () => {} }, value: '', checked: false, files: [], addEventListener: () => {}, appendChild: () => {} }),
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, click: () => {}, setAttribute: () => {} }),
  },
  window: {},
  navigator: { onLine: true },
  fetch: () => Promise.reject(new Error('offline in test')),
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  Notification: function () {},
  crypto: require('crypto').webcrypto,
  TextEncoder,
  Buffer,
  btoa,
  atob,
  prompt: () => null,
  confirm: () => false,
  open: () => null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  PASS ' + msg);
  else { failures++; console.error('  FAIL ' + msg); }
}
const files = ['src/js/config.js', 'src/js/security.js', 'src/js/license-pubkey.js', 'src/js/license.js', 'src/js/storage.js', 'src/js/app.js', 'src/js/patches.js', 'src/js/jalali.js', 'src/js/zoom.js', 'src/js/new-features.js', 'src/js/round2-a.js', 'src/js/round2-b.js', 'src/js/round2-c.js'];
for (const f of files) {
  try {
    vm.runInContext(load(f), sandbox, { filename: f });
    console.log('  LOADED ' + f);
  } catch (e) {
    failures++;
    console.error('  LOAD FAIL ' + f + ': ' + String(e.stack).split('\n').slice(0, 4).join(' | '));
  }
}
try {
  // bridge: live stores visible on window
  check(Array.isArray(sandbox.clients), 'bridge: window.clients is array');
  check(Array.isArray(sandbox.sessions), 'bridge: window.sessions is array');
  check(Array.isArray(sandbox.customers), 'bridge: window.customers is array');
  check(Array.isArray(sandbox.reservations), 'bridge: window.reservations is array');
  // round1 still alive
  check(typeof sandbox.renderMembershipPlans === 'function', 'round1: renderMembershipPlans exists');
  check(typeof sandbox.logActivity === 'function', 'round1: logActivity exists');
  // round2-a
  check(typeof sandbox.exportSessionsCSV === 'function', 'r2a: exportSessionsCSV exists');
  check(typeof sandbox.exportExpensesCSV === 'function', 'r2a: exportExpensesCSV exists');
  check(typeof sandbox.exportCustomersCSV === 'function', 'r2a: exportCustomersCSV exists');
  check(typeof sandbox.printThermalReceipt === 'function', 'r2a: printThermalReceipt exists');
  check(typeof sandbox.renderWaitingList === 'function', 'r2a: renderWaitingList exists');
  check(typeof sandbox.addToWaitingList === 'function', 'r2a: addToWaitingList exists');
  check(typeof sandbox.addLoyaltyPoints === 'function', 'r2a: addLoyaltyPoints exists');
  check(typeof sandbox.getLoyaltyPoints === 'function', 'r2a: getLoyaltyPoints exists');
  check(typeof sandbox.renderSurveyStats === 'function', 'r2a: renderSurveyStats exists');
  // round2-b
  check(typeof sandbox.renderBranches === 'function', 'r2b: renderBranches exists');
  check(typeof sandbox.renderShifts === 'function', 'r2b: renderShifts exists');
  check(typeof sandbox.checkLowStock === 'function', 'r2b: checkLowStock exists');
  check(typeof sandbox.generateMonthlyComparison === 'function', 'r2b: generateMonthlyComparison exists');
  check(typeof sandbox.renderForecast === 'function', 'r2b: renderForecast exists');
  // round2-c
  check(typeof sandbox.renderPOSConfig === 'function', 'r2c: renderPOSConfig exists');
  check(typeof sandbox.renderCustomerQR === 'function', 'r2c: renderCustomerQR exists');
  // share modal helpers (prompt() replacements)
  check(typeof sandbox.copyTextToClipboard === 'function', 'share: copyTextToClipboard exists');
  check(typeof sandbox.openCopyTextModal === 'function', 'share: openCopyTextModal exists');
  check(typeof sandbox.copyFromCopyModal === 'function', 'share: copyFromCopyModal exists');
  check(typeof sandbox.setShopInfo === 'function', 'share: setShopInfo exists');
  check(typeof sandbox.saveShopInfo === 'function', 'share: saveShopInfo exists');
  check(typeof sandbox.saveJoinEvent === 'function', 'share: saveJoinEvent exists');
  // stale-index guards: out-of-range currentTimeClient must never throw
  try {
    vm.runInContext('currentTimeClient=999; updateTimeDisplay(); startTimer(); pauseTimer(); stopTimer(); resetTimer(); addTime(); subTime(); toggleClientTimer(999); pauseClient(999); triggerAlarm(999); extendTimerEnd(); currentTimeClient=null;', sandbox);
    console.log('  PASS guards: stale indexes never throw');
  } catch (e) { failures++; console.error('  FAIL stale-index guard: ' + e.message); }
  // settlement resets timer/extras/buffet for the next customer
  try {
    vm.runInContext(`clients.push({id:101, name:'tset', tariff:'single', extra:2, extraSeconds:100, status:'online', elapsed:3600, timerDuration:60, timerDurationSec:3600, notified:true, startTime:Date.now(), _lastElapsed:3500, _warned5:true});
      clientServiceMap[101]=[{serviceId:1, qty:2}];
      pendingPayment={clientIdx:0, clientId:101, clientName:'tset', duration:3600, gameCost:15000, buffetCost:5000, total:20000, tariff:'single', extra:2, stationType:'pc', services:[{serviceId:1, qty:2}]};
      confirmPayment();`, sandbox);
    const st = vm.runInContext('({status:clients[0].status, elapsed:clients[0].elapsed, extra:clients[0].extra, dur:clients[0].timerDuration, svc:clientServiceMap[101], sess:sessions.length, pp:pendingPayment})', sandbox);
    check(st.status === 'offline', 'settle: status offline');
    check(st.elapsed === 0, 'settle: elapsed reset');
    check(st.extra === 0, 'settle: extras reset');
    check(st.dur === 0, 'settle: timer reset');
    check(st.svc === undefined, 'settle: buffet cleared');
    check(st.sess === 1, 'settle: session recorded');
    check(st.pp === null, 'settle: pendingPayment cleared');
  } catch (e) { failures++; console.error('  FAIL settlement reset: ' + e.stack.split('\n').slice(0,3).join(' | ')); }
  check(typeof sandbox.applyZoom === 'function', 'zoom: applyZoom exists');
  check(typeof sandbox.zoomBy === 'function', 'zoom: zoomBy exists');
  const z0 = vm.runInContext('applyZoom(100)', sandbox);
  check(z0 === 100, 'zoom: apply 100');
  const zHi = vm.runInContext('applyZoom(999)', sandbox);
  check(zHi === 160, 'zoom: clamps to max 160 (got ' + zHi + ')');
  const zLo = vm.runInContext('applyZoom(1)', sandbox);
  check(zLo === 60, 'zoom: clamps to min 60 (got ' + zLo + ')');
  vm.runInContext('applyZoom(120)', sandbox);
  const zGet = vm.runInContext('getZoom()', sandbox);
  check(zGet === 120, 'zoom: persists 120 (got ' + zGet + ')');
  vm.runInContext('applyZoom(100)', sandbox);
  // no-jump live refresh
  check(typeof sandbox.refreshClientCards === 'function', 'live: refreshClientCards exists');
  check(typeof sandbox.refreshActiveClients === 'function', 'live: refreshActiveClients exists');
  check(typeof sandbox.refreshDashboardLive === 'function', 'live: refreshDashboardLive exists');
  check(typeof sandbox.clientSig === 'function', 'live: clientSig exists');
  check(typeof sandbox.toggleClientTimer === 'function', 'card: toggleClientTimer exists');
  check(typeof sandbox.pauseClient === 'function', 'card: pauseClient exists');
  check(typeof sandbox.toggleClientMenu === 'function', 'card: toggleClientMenu exists');
  // share without prompt()
  check(typeof sandbox.copyTextToClipboard === 'function', 'share: copyTextToClipboard exists');
  check(typeof sandbox.openCopyTextModal === 'function', 'share: openCopyTextModal exists');
  check(typeof sandbox.copyFromCopyModal === 'function', 'share: copyFromCopyModal exists');
  check(typeof sandbox.setShopInfo === 'function', 'shop: setShopInfo exists');
  check(typeof sandbox.saveShopInfo === 'function', 'shop: saveShopInfo exists');
  check(typeof sandbox.saveJoinEvent === 'function', 'event: saveJoinEvent exists');
  const noPrompt = vm.runInContext('[copyTextToClipboard,openCopyTextModal,copyFromCopyModal,shareVia,setShopInfo,saveShopInfo,joinEvent,saveJoinEvent].every(f=>!/\\bprompt\\s*\\(/.test(f.toString()))', sandbox);
  check(noPrompt === true, 'share: no prompt() in share/shop/join flows');
  // rubika fully removed from share flow
  const noRubikaFn = vm.runInContext('!/rubika/i.test(shareVia.toString())', sandbox);
  check(noRubikaFn === true, 'share: rubika removed from shareVia');
  const htmlStatic = load('index.html');
  check(!htmlStatic.includes("shareVia('rubika')"), 'share: no rubika button in HTML');
  check(!htmlStatic.includes('rubika://share'), 'share: no rubika intent link in HTML');
  // native print fallback for blank PDFs
  check(typeof sandbox.nativePrintPdf === 'function', 'pdf: nativePrintPdf exists');
  const cssStatic = load('src/styles/main.css');
  check(cssStatic.includes('@media print') && cssStatic.includes('#pdfPrintWrap'), 'pdf: print stylesheet present');
  // surgical refresh must not throw and must not rebuild when nothing changed
  try {
    vm.runInContext('renderClients(); refreshClientCards();', sandbox);
    console.log('  PASS live: refreshClientCards no-op ok');
  } catch (e) { failures++; console.error('  FAIL live refreshClientCards: ' + e.message); }
  try {
    vm.runInContext('renderActiveClients(); refreshActiveClients(); refreshDashboardLive();', sandbox);
    console.log('  PASS live: dashboard refresh no-op ok');
  } catch (e) { failures++; console.error('  FAIL live dashboard refresh: ' + e.message); }
  check(typeof sandbox.Jalali === 'object', 'jalali: Jalali exposed');
  check(typeof sandbox.openDatePicker === 'function', 'jalali: openDatePicker exists');
  check(typeof sandbox.formatDateSmart === 'function', 'jalali: formatDateSmart exists');
  const j1 = vm.runInContext('Jalali.g2j(2024,3,20)', sandbox);
  check(j1.jy === 1403 && j1.jm === 1 && j1.jd === 1, 'jalali: 2024-03-20 = 1403/1/1');
  const j2 = vm.runInContext('Jalali.g2j(2026,9,20)', sandbox);
  check(j2.jy === 1405 && j2.jm === 6 && j2.jd === 29, 'jalali: 2026-09-20 = 1405/6/29');
  const g1 = vm.runInContext('Jalali.j2g(1403,1,1)', sandbox);
  check(g1.gy === 2024 && g1.gm === 3 && g1.gd === 20, 'jalali: 1403/1/1 = 2024-03-20');
  const leap = vm.runInContext('Jalali.isLeap(1403) && !Jalali.isLeap(1404)', sandbox);
  check(leap === true, 'jalali: 1403 leap, 1404 not');
  check(typeof sandbox.renderCustomerPortal === 'function', 'r2c: renderCustomerPortal exists');
  check(typeof sandbox.renderEvents === 'function', 'r2c: renderEvents exists');
  check(typeof sandbox.encryptAndSave === 'function', 'r2c: encryptAndSave exists');
  check(typeof sandbox.decryptAndLoad === 'function', 'r2c: decryptAndLoad exists');
  // behavior: loyalty add/get roundtrip
  vm.runInContext('addLoyaltyPoints(999, 50, "test")', sandbox);
  const pts = vm.runInContext('getLoyaltyPoints(999)', sandbox);
  check(pts === 50, 'loyalty roundtrip = 50 (got ' + pts + ')');
  // behavior: waiting list add + badge path
  vm.runInContext('addToWaitingList("t1", "0911", "pc", "")', sandbox);
  // behavior: encrypt/decrypt roundtrip
  const encOk = vm.runInContext('encryptAndSave("tkey", {a:1}, "secret1")', sandbox);
  const dec = vm.runInContext('decryptAndLoad("tkey", "secret1")', sandbox);
  check(encOk === true && dec && dec.a === 1, 'encrypt/decrypt roundtrip works');
  const decBad = vm.runInContext('decryptAndLoad("tkey", "wrong")', sandbox);
  check(decBad === null, 'wrong password returns null');
  // behavior: renders do not throw on stub DOM
  for (const fn of ['renderWaitingList()', 'renderSurveyStats()', 'renderBranches()', 'renderShifts()', 'renderStockAlerts()', 'generateMonthlyComparison()', 'renderForecast()', 'renderPOSConfig()', 'renderCustomerPortal()', 'renderEvents()', 'renderSecurityPanel()', 'renderMembershipPlans()', 'renderBusyHoursReport()', 'renderActivityLog()', 'renderEmployees()', 'renderNotifications()']) {
    try { vm.runInContext(fn, sandbox); console.log('  PASS render ok: ' + fn); }
    catch (e) { failures++; console.error('  FAIL render crash: ' + fn + ' :: ' + e.message); }
  }
  // i18n coverage: every new Persian UI string must have en+ar entries
  const requiredKeys = ['عضویت','لیست انتظار','رویدادها','شعبه‌ها','شیفت‌ها','تحلیل و پیش‌بینی','ابزارها','بیشتر','پایان','ادامه','توقف موقت','طرح‌های عضویت و اشتراک','طرح جدید','نام طرح','توضیحات','مدیریت کارمندان','کارمند جدید','گزارش حضور و غیاب','نام کامل','تلفن','حقوق (تومان)','سمت','کارمند','تاریخچه بازی','لاگ فعالیت','پاکسازی','جستجوی پیشرفته','رد کردن','افزودن به لیست','نام مشتری','لیست انتظار خالی است','انجام شد','رویدادها و تورنمنت','رویداد جدید','عنوان','تاریخ','ورودی (تومان)','جایزه','رویدادی نیست','بازیکنان:','شرکت در رویداد','مدیریت شعبه‌ها','شعبه جدید','نام شعبه','آدرس','شعبه اصلی','تغییر','برنامه شیفت کارمندان','شیفت جدید','مقایسه این ماه با ماه قبل','پیش‌بینی درآمد','رضایت مشتریان','هشدار موجودی بوفه','آستانه هشدار','این ماه','ماه قبل','سشن','تغییر:','میانگین روزانه','داده‌ای نیست','نظر','تمام شده','کم موجودی','تمام موجودی‌ها کافی است','خروجی CSV (اکسل)','سشن‌های امروز','چاپ رسید حرارتی','دستگاه کارتخوان','بروزرسانی','امنیت و رمزنگاری','امتیاز وفاداری مشتری','انتخاب مشتری...','فعال‌سازی کارتخوان','رمزنگاری بکاپ مشتریان','رمزنگاری','بررسی رمزگشایی','مشتری','دستگاه آزاد','در انتظار','مشغول','آزاد','امتیاز فعلی:','بازخرید','نام الزامی است','دقیقه','بدون IP','نظرت چی بود؟','بیخیال','لغو','نفر','رزرو:','ساعت','متصل','نامشخص','اول ایمیل گیرنده را وارد کن','متن کپی شد','کپی نشد - دستی انتخاب و کپی کن','کپی متن','کپی خودکار ممکن نشد - متن زیر را دستی کپی کن','کپی','مشخصات مغازه','نام مغازه','تلفن مغازه','ثبت‌نام','نام بازیکن','کتابخانه PDF آفلاین در دسترس نیست - چاپ سیستمی','پنجره چاپ باز می‌شود - «ذخیره PDF» را بزن','متن گزارش برای تلگرام و واتساپ باز می‌شود؛ برای ایمیل اول آدرس را وارد کن.'];
  const dictKeys = vm.runInContext('Object.keys(I18N)', sandbox);
  let missing = [];
  for (const k of requiredKeys) {
    const entry = vm.runInContext('I18N[' + JSON.stringify(k) + ']', sandbox);
    if (!entry || !entry.en || !entry.ar) missing.push(k);
  }
  check(missing.length === 0, 'i18n coverage: all ' + requiredKeys.length + ' new keys have en+ar' + (missing.length ? ' MISSING: ' + missing.join(' | ') : ''));
  check(dictKeys.length > 150, 'i18n dict size sane (' + dictKeys.length + ' keys)');
} catch (e) {
  failures++;
  console.error('  CHECK ERROR: ' + e.stack);
}
console.log(failures === 0 ? 'ROUND2 TESTS PASSED' : failures + ' ROUND2 TEST(S) FAILED');
process.exit(failures ? 1 : 0);
