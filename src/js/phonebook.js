/* Phonebook + SMS panel.
   - Phonebook entries: first/last name, fixed + mobile (both optional).
   - Account details auto-linked from customers + daily performance.
   - SMS: Kavenegar preset or custom HTTP template; send single/bulk/test with log.
   - Sending goes through main process IPC (no renderer CSP limits); fetch fallback. */
(function(){
'use strict';
var esc = window.escapeHtml || function(v){ return String(v == null ? '' : v); };
function toast(m, t){ if (window.showToast) window.showToast(m, t); }
function logAct(ty, d){ if (window.logActivity) window.logActivity(ty, d); }
function sp(k, fb){ try { if (window.safeParse) return window.safeParse(localStorage.getItem(k)) || fb; } catch(e){} return fb; }
function sv(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

var PB = sp('alvand_phonebook', []);
var SMSCFG = sp('alvand_smsConfig', {provider:'kavenegar', apiKey:'', sender:'', enabled:false, method:'GET', urlTemplate:'', headersJson:''});
var SMSLOG = sp('alvand_smsLog', []);
function savePB(){ sv('alvand_phonebook', PB); }
function saveCfg(){ sv('alvand_smsConfig', SMSCFG); }
function saveLog(){ sv('alvand_smsLog', SMSLOG); }

/* ---------- normalization / matching ---------- */
var FA_D = '۰۱۲۳۴۵۶۷۸۹';
function enDigits(s){ return String(s == null ? '' : s).replace(/[۰-۹]/g, function(c){ return FA_D.indexOf(c); }); }
function normName(s){
  return String(s || '').replace(/[\u200c\u200d]/g, '').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[ة]/g, 'ه').replace(/\s+/g, ' ').trim();
}
function normPhone(s){ return enDigits(s).replace(/[^0-9]/g, ''); }
function last10(p){ p = normPhone(p); return p.length >= 10 ? p.slice(-10) : p; }
function mobileOk(p){ return /^09\d{9}$/.test(normPhone(p)); }
window.pbNormName = normName;
window.pbNormPhone = normPhone;
window.pbMobileOk = mobileOk;

function fullName(e){ return ((e.firstName||'') + ' ' + (e.lastName||'')).trim(); }
function findLinkedCustomer(entry){
  var cs = window.customers || [];
  if (!cs.length) return {customer:null, via:null};
  var fn = normName(fullName(entry));
  var mob = last10(entry.phoneMobile||''), fix = last10(entry.phoneFixed||'');
  var i, c;
  if (fn){
    for (i=0;i<cs.length;i++){ if (cs[i] && normName(cs[i].name) === fn) return {customer:cs[i], via:'name'}; }
  }
  for (i=0;i<cs.length;i++){
    c = cs[i]; if (!c || !c.phone) continue;
    var cp = last10(c.phone);
    if ((mob && cp === mob) || (fix && cp === fix)) return {customer:c, via:'phone'};
  }
  return {customer:null, via:null};
}
window.pbFindLinked = findLinkedCustomer;

function accountDetails(c){
  if (!c) return null;
  var rank = (window.getRank ? window.getRank(c.totalHours||0) : {name:'-', discount:0});
  var membership = null;
  try{ membership = window.getActiveMembership ? getActiveMembership(c.id) : null; }catch(e){}
  var loyalty = 0;
  try{ loyalty = window.getLoyaltyPoints ? getLoyaltyPoints(c.id) : 0; }catch(e){}
  var sessCount = 0;
  try{
    if (window.getCustomerHistory){ sessCount = getCustomerHistory(c.name).length; }
    else if (window.sessions){ sessCount = window.sessions.filter(function(s){ return s.clientName === c.name; }).length; }
  }catch(e){}
  return {wallet:c.wallet||0, debt:c.debt||0, totalHours:c.totalHours||0, totalSpent:c.totalSpent||0,
    rankName:rank.name, discount:rank.discount||0,
    memberName: membership ? membership.planName : '', memberLeft: membership ? Math.max(0, (membership.hoursTotal||0)-(membership.hoursUsed||0)) : 0,
    loyalty:loyalty, sessions:sessCount};
}
window.pbAccountDetails = accountDetails;

/* ---------- phonebook CRUD ---------- */
window.renderPhonebook = function(){
  var c = document.getElementById('phonebookList');
  if (!c) return;
  if (!PB.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">مخاطبی ثبت نشده</p>'; return; }
  c.innerHTML = PB.map(function(e){
    var link = findLinkedCustomer(e);
    var det = link.customer ? accountDetails(link.customer) : null;
    var detHtml = '';
    if (det){
      detHtml = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px;background:rgba(34,197,94,0.06);border-radius:10px;padding:10px;font-size:0.78rem;">'
        + '<div>💳 کیف پول<br><b style="color:' + (det.wallet<0?'#ef4444':'#22c55e') + ';">' + det.wallet.toLocaleString() + '</b></div>'
        + '<div>⏰ ساعت بازی<br><b>' + det.totalHours.toFixed(1) + '</b></div>'
        + '<div>💰 هزینه کل<br><b>' + det.totalSpent.toLocaleString() + '</b></div>'
        + '<div>🏆 رتبه<br><b>' + esc(det.rankName) + '</b></div>'
        + '<div>🎫 عضویت<br><b>' + esc(det.memberName || '-') + '</b></div>'
        + '<div>🎮 سشن‌ها<br><b>' + det.sessions + '</b></div>'
        + (det.debt > 0 ? '<div style="grid-column:1/-1;color:#ef4444;">بدهی: <b>' + det.debt.toLocaleString() + ' تومان</b></div>' : '')
        + '</div>';
    }
    return '<div class="glass" style="padding:14px;margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px;">'
      + '<div><h4 style="font-weight:800;">' + esc(fullName(e) || '-') + ' '
      + (link.customer
          ? '<span style="font-size:0.65rem;padding:2px 8px;border-radius:50px;background:rgba(34,197,94,0.15);color:#22c55e;">متصل به حساب ✅</span>'
          : '<span style="font-size:0.65rem;padding:2px 8px;border-radius:50px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);">بدون تطابق</span>')
      + '</h4>'
      + '<p style="font-size:0.8rem;color:rgba(255,255,255,0.6);">📱 ' + esc(e.phoneMobile || '-') + ' | ☎️ ' + esc(e.phoneFixed || '-') + '</p>'
      + (e.note ? '<p style="font-size:0.75rem;color:rgba(255,255,255,0.4);">' + esc(e.note) + '</p>' : '')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + '<button class="glass-btn" style="padding:6px 10px;font-size:0.75rem;" onclick="sendSmsToEntry(' + e.id + ')">📩 پیامک</button>'
      + '<button class="glass-btn" style="padding:6px 10px;font-size:0.75rem;" onclick="editPhonebookEntry(' + e.id + ')">✏️</button>'
      + '<button class="glass-btn glass-btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="deletePhonebookEntry(' + e.id + ')">🗑️</button>'
      + '</div></div>' + detHtml + '</div>';
  }).join('');
};
window.openPhonebookModal = function(){
  var el;
  el = document.getElementById('pbId'); if (el) el.value = '';
  el = document.getElementById('pbFirst'); if (el) el.value = '';
  el = document.getElementById('pbLast'); if (el) el.value = '';
  el = document.getElementById('pbMobile'); if (el) el.value = '';
  el = document.getElementById('pbFixed'); if (el) el.value = '';
  el = document.getElementById('pbNote'); if (el) el.value = '';
  var m = document.getElementById('phonebookModal'); if (m) m.classList.add('show');
};
window.editPhonebookEntry = function(id){
  var e = PB.find(function(x){ return x.id === id; });
  if (!e) return;
  var el;
  el = document.getElementById('pbId'); if (el) el.value = e.id;
  el = document.getElementById('pbFirst'); if (el) el.value = e.firstName || '';
  el = document.getElementById('pbLast'); if (el) el.value = e.lastName || '';
  el = document.getElementById('pbMobile'); if (el) el.value = e.phoneMobile || '';
  el = document.getElementById('pbFixed'); if (el) el.value = e.phoneFixed || '';
  el = document.getElementById('pbNote'); if (el) el.value = e.note || '';
  var m = document.getElementById('phonebookModal'); if (m) m.classList.add('show');
};
function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; }
window.savePhonebookEntry = function(){
  var id = val('pbId');
  var first = val('pbFirst'), last = val('pbLast');
  var mobile = enDigits(val('pbMobile')).replace(/[^0-9]/g, '');
  var fixed = enDigits(val('pbFixed')).replace(/[^0-9]/g, '');
  var note = val('pbNote');
  if (!first && !last){ toast('نام یا نام خانوادگی الزامی است','error'); return; }
  if (!mobile && !fixed){ toast('حداقل یک شماره تلفن وارد کن','error'); return; }
  if (mobile && !mobileOk(mobile)){ toast('موبایل معتبر نیست (09xxxxxxxxx)','error'); return; }
  if (id){
    var e = PB.find(function(x){ return x.id === parseInt(id); });
    if (e) Object.assign(e, {firstName:first, lastName:last, phoneMobile:mobile, phoneFixed:fixed, note:note});
  } else {
    PB.push({id:Date.now(), firstName:first, lastName:last, phoneMobile:mobile, phoneFixed:fixed, note:note, createdAt:new Date().toISOString()});
  }
  savePB();
  var m = document.getElementById('phonebookModal'); if (m) m.classList.remove('show');
  window.renderPhonebook();
  logAct('phonebook', 'ذخیره مخاطب: ' + first + ' ' + last);
  toast('مخاطب ذخیره شد','success');
};
window.deletePhonebookEntry = function(id){
  if (!confirm('حذف شود؟')) return;
  PB = PB.filter(function(x){ return x.id !== id; });
  savePB(); window.renderPhonebook();
};

/* ---------- SMS config ---------- */
window.renderSmsConfig = function(){
  var c = document.getElementById('smsConfigContent');
  if (!c) return;
  var custom = SMSCFG.provider === 'custom';
  c.innerHTML = '<div class="glass" style="padding:16px;">'
    + '<label style="display:flex;gap:8px;align-items:center;margin-bottom:10px;"><input type="checkbox" id="smsEnabled" ' + (SMSCFG.enabled ? 'checked' : '') + ' onchange="toggleSms(this.checked)"> فعال‌سازی پنل پیامک</label>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'
    + '<div><label style="font-size:0.8rem;">سرویس</label><select id="smsProvider" onchange="changeSmsProvider(this.value)">'
    + '<option value="kavenegar"' + (SMSCFG.provider === 'kavenegar' ? ' selected' : '') + '>کاوه‌نگار (Kavenegar)</option>'
    + '<option value="custom"' + (custom ? ' selected' : '') + '>سفارشی (Custom HTTP)</option>'
    + '</select></div>'
    + '<div><label style="font-size:0.8rem;">کلید API</label><input type="text" id="smsKey" value="' + esc(SMSCFG.apiKey || '') + '" style="text-align:left;direction:ltr;"></div>'
    + '</div>'
    + '<div style="margin-bottom:8px;"><label style="font-size:0.8rem;">شماره فرستنده</label><input type="text" id="smsSender" value="' + esc(SMSCFG.sender || '') + '" style="text-align:left;direction:ltr;"></div>'
    + (custom
      ? '<div style="display:grid;gap:8px;margin-bottom:8px;">'
      + '<div><label style="font-size:0.8rem;">متد</label><select id="smsMethod"><option' + (SMSCFG.method !== 'POST' ? ' selected' : '') + '>GET</option><option' + (SMSCFG.method === 'POST' ? ' selected' : '') + '>POST</option></select></div>'
      + '<div><label style="font-size:0.8rem;">قالب آدرس (متغیرها: {key} {sender} {to} {text})</label><input type="text" id="smsUrl" value="' + esc(SMSCFG.urlTemplate || '') + '" style="text-align:left;direction:ltr;" placeholder="https://...?apikey={key}&to={to}&msg={text}"></div>'
      + '<div><label style="font-size:0.8rem;">هدرها (JSON، اختیاری)</label><input type="text" id="smsHeaders" value="' + esc(SMSCFG.headersJson || '') + '" style="text-align:left;direction:ltr;" placeholder=\'{"X-API-KEY":"..."}\'></div>'
      + '</div>'
      : '<p style="font-size:0.75rem;color:rgba(255,255,255,0.5);margin-bottom:8px;">ارسال مستقیم با API کاوه‌نگار (متد ارسال ساده).</p>')
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    + '<button class="glass-btn glass-btn-success" onclick="saveSmsConfig()">ذخیره</button>'
    + '<input type="text" id="smsTestTo" placeholder="شماره تست (09...)" style="max-width:150px;text-align:left;direction:ltr;">'
    + '<button class="glass-btn" onclick="testSms()">📤 تست ارسال</button>'
    + '</div></div>';
};
window.toggleSms = function(v){
  SMSCFG.enabled = !!v; saveCfg();
  toast(v ? 'پنل پیامک فعال شد' : 'پنل پیامک غیرفعال شد','success');
};
window.changeSmsProvider = function(v){
  SMSCFG.provider = v; saveCfg(); window.renderSmsConfig();
};
window.saveSmsConfig = function(){
  var g = function(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  SMSCFG.provider = g('smsProvider') || 'kavenegar';
  SMSCFG.apiKey = g('smsKey');
  SMSCFG.sender = g('smsSender');
  var en = document.getElementById('smsEnabled');
  SMSCFG.enabled = en ? en.checked : SMSCFG.enabled;
  if (SMSCFG.provider === 'custom'){
    SMSCFG.method = g('smsMethod') || 'GET';
    SMSCFG.urlTemplate = g('smsUrl');
    var hj = g('smsHeaders');
    if (hj){ try{ JSON.parse(hj); }catch(e){ toast('فرمت JSON هدرها اشتباه است','error'); return; } }
    SMSCFG.headersJson = hj;
  }
  saveCfg(); window.renderSmsConfig();
  logAct('sms', 'ذخیره تنظیمات پیامک');
  toast('تنظیمات پیامک ذخیره شد','success');
};

/* ---------- SMS sending ---------- */
function fillTpl(tpl, map){
  return String(tpl).replace(/\{key\}/g, map.key).replace(/\{sender\}/g, map.sender).replace(/\{to\}/g, map.to).replace(/\{text\}/g, map.text);
}
window.buildSmsRequest = function(cfg, to, text){
  cfg = cfg || SMSCFG;
  to = normPhone(to);
  if (!mobileOk(to)) return {error:'شماره موبایل معتبر نیست'};
  if (!cfg.apiKey) return {error:'کلید API تنظیم نشده'};
  var map = {key:cfg.apiKey, sender:cfg.sender || '', to:to, text:text};
  if ((cfg.provider || 'kavenegar') === 'custom'){
    if (!cfg.urlTemplate) return {error:'قالب آدرس تنظیم نشده'};
    var enc = {key:encodeURIComponent(map.key), sender:encodeURIComponent(map.sender), to:encodeURIComponent(map.to), text:encodeURIComponent(map.text)};
    var headers = {};
    try{ headers = cfg.headersJson ? JSON.parse(cfg.headersJson) : {}; }catch(e){ return {error:'فرمت JSON هدرها اشتباه است'}; }
    return {url:fillTpl(cfg.urlTemplate, enc), method:(cfg.method || 'GET').toUpperCase(), headers:headers, body:null};
  }
  var url = 'https://api.kavenegar.com/v1/' + encodeURIComponent(map.key)
    + '/sms/send.json?receptor=' + encodeURIComponent(map.to)
    + '&sender=' + encodeURIComponent(map.sender)
    + '&message=' + encodeURIComponent(map.text);
  return {url:url, method:'GET', headers:{}, body:null};
};
function sendSmsRequest(req){
  if (window.gamenet && window.gamenet.sms && window.gamenet.sms.send){
    return window.gamenet.sms.send(req);
  }
  var ctl = new AbortController();
  var timer = setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, 15000);
  var opts = {method:req.method || 'GET', headers:req.headers || {}, signal:ctl.signal};
  if ((req.method || 'GET').toUpperCase() !== 'GET' && req.body != null){ opts.body = req.body; }
  return fetch(req.url, opts).then(function(r){
    clearTimeout(timer);
    return r.text().then(function(t){ return {ok:r.ok, status:r.status, body:String(t).slice(0,500)}; });
  }).catch(function(e){ clearTimeout(timer); return {ok:false, error:String((e && e.message) || e)}; });
}
window.sendSmsRequest = sendSmsRequest;
function logSms(to, name, text, res){
  SMSLOG.unshift({id:Date.now() + Math.floor(Math.random()*1000), date:new Date().toISOString(),
    to:to, name:name || '', text:String(text).slice(0,160), ok:!!(res && res.ok),
    detail: res ? (res.error || ('status ' + res.status)) : 'unknown'});
  if (SMSLOG.length > 100) SMSLOG = SMSLOG.slice(0, 100);
  saveLog();
  try{ window.renderSmsLog(); }catch(e){}
}
window.sendSmsTo = function(to, name, text){
  to = normPhone(to);
  if (!SMSCFG.enabled){ toast('پنل پیامک غیرفعال است','error'); return Promise.resolve({ok:false, error:'disabled'}); }
  var req = window.buildSmsRequest(SMSCFG, to, text);
  if (req.error){ toast(req.error,'error'); return Promise.resolve({ok:false, error:req.error}); }
  toast('در حال ارسال...','success');
  return sendSmsRequest(req).then(function(res){
    logSms(to, name, text, res);
    if (res && res.ok){ toast('پیامک ارسال شد ✅','success'); logAct('sms', 'ارسال به ' + to); }
    else toast('خطا در ارسال: ' + ((res && res.error) || res.status),'error');
    return res;
  });
};
window.sendSmsToEntry = function(id){
  var e = PB.find(function(x){ return x.id === id; });
  if (!e){ toast('مخاطب پیدا نشد','error'); return; }
  var ta = document.getElementById('smsComposer');
  var text = ta ? ta.value.trim() : '';
  if (!text){ toast('اول متن پیام را بنویس','error'); if (ta) ta.focus(); return; }
  if (!e.phoneMobile){ toast('این مخاطب موبایل ندارد','error'); return; }
  window.sendSmsTo(e.phoneMobile, fullName(e), text.replace(/\{نام\}/g, e.firstName || fullName(e)));
};
window.testSms = function(){
  var el = document.getElementById('smsTestTo');
  var to = el ? el.value.trim() : '';
  if (!to){ toast('شماره تست را وارد کن','error'); if (el) el.focus(); return; }
  window.sendSmsTo(to, 'تست', 'تست پنل پیامک گیم‌نت ✅');
};
window.sendBulkSms = function(){
  var ta = document.getElementById('smsComposer');
  var text = ta ? ta.value.trim() : '';
  if (!text){ toast('اول متن پیام را بنویس','error'); if (ta) ta.focus(); return; }
  var list = PB.filter(function(e){ return e.phoneMobile && mobileOk(e.phoneMobile); });
  if (!list.length){ toast('مخاطبی با موبایل معتبر نیست','error'); return; }
  if (!confirm(list.length + ' پیامک ارسال شود؟')) return;
  toast('ارسال گروهی شروع شد...','success');
  logAct('sms', 'ارسال گروهی به ' + list.length + ' نفر');
  var i = 0, okCount = 0;
  (function next(){
    if (i >= list.length){
      toast('تمام شد: ' + okCount + ' موفق از ' + list.length, okCount === list.length ? 'success' : 'warning');
      return;
    }
    var e = list[i++];
    var msg = text.replace(/\{نام\}/g, e.firstName || fullName(e));
    var req = window.buildSmsRequest(SMSCFG, e.phoneMobile, msg);
    var p = req.error ? Promise.resolve({ok:false, error:req.error}) : sendSmsRequest(req);
    p.then(function(res){
      if (res && res.ok) okCount++;
      logSms(e.phoneMobile, fullName(e), msg, res);
      setTimeout(next, 800);
    });
  })();
};
window.renderSmsLog = function(){
  var c = document.getElementById('smsLogList');
  if (!c) return;
  if (!SMSLOG.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.4);">ارسالی ثبت نشده</p>'; return; }
  c.innerHTML = SMSLOG.slice(0, 20).map(function(l){
    return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.8rem;">'
      + '<span><b>' + esc(l.name || l.to) + '</b> <span style="color:rgba(255,255,255,0.5);">' + esc(l.to) + '</span><br>'
      + '<span style="color:rgba(255,255,255,0.6);">' + esc(l.text) + '</span></span>'
      + '<span style="color:' + (l.ok ? '#22c55e' : '#ef4444') + ';white-space:nowrap;">' + (l.ok ? '✅' : '❌') + '<br>'
      + '<span style="font-size:0.65rem;color:rgba(255,255,255,0.4);">' + new Date(l.date).toLocaleTimeString('fa-IR') + '</span></span></div>';
  }).join('');
};
window.clearSmsLog = function(){
  SMSLOG = []; saveLog(); window.renderSmsLog();
};
})();
