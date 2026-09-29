/* Operations: packages, coupons, amanat (deposits), maintenance, broadcast.
   Finance (P&L, handover, tax, holidays, debt reminders, telegram backup) lives in finance.js */
(function(){
'use strict';
var esc = window.escapeHtml || function(v){ return String(v == null ? '' : v); };
function toast(m, t){ if (window.showToast) window.showToast(m, t); }
function logAct(ty, d){ if (window.logActivity) window.logActivity(ty, d); }
function sp(k, fb){ try { if (window.safeParse) return window.safeParse(localStorage.getItem(k)) || fb; } catch(e){} return fb; }
function sv(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

var PKG = sp('alvand_packages', []);
var CPN = sp('alvand_coupons', []);
var AMN = sp('alvand_amanats', []);
var MNT = sp('alvand_maintenance', []);
function savePkg(){ sv('alvand_packages', PKG); }
function saveCpn(){ sv('alvand_coupons', CPN); }
function saveAmn(){ sv('alvand_amanats', AMN); }
function saveMnt(){ sv('alvand_maintenance', MNT); }
function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; }
function num(id){ var el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; }

/* ================= PACKAGES ================= */
function pkgServicesText(p){
  var svc = window.services || [];
  return (p.items || []).map(function(it){
    var s = svc.find(function(x){ return x.id === it.serviceId; });
    return (s ? s.name : '?') + '×' + it.qty;
  }).join('، ') || '-';
}
window.renderPackages = function(){
  var c = document.getElementById('packagesList');
  if (!c) return;
  if (!PKG.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);">پکیجی ثبت نشده</p>'; return; }
  c.innerHTML = PKG.map(function(p){
    return '<div class="glass" style="padding:14px;margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px;">'
      + '<div><h4 style="font-weight:800;">' + esc(p.name) + '</h4>'
      + '<p style="font-size:0.8rem;color:rgba(255,255,255,0.6);">⏱️ ' + p.minutes + ' دقیقه | 🍿 ' + esc(pkgServicesText(p)) + '</p>'
      + '<p style="font-size:0.9rem;color:#22c55e;font-weight:800;">' + (p.price || 0).toLocaleString() + ' تومان</p></div>'
      + '<div style="display:flex;gap:6px;">'
      + '<button class="glass-btn" style="padding:6px 10px;font-size:0.75rem;" onclick="editPackage(' + p.id + ')">✏️</button>'
      + '<button class="glass-btn glass-btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="deletePackage(' + p.id + ')">🗑️</button>'
      + '</div></div></div>';
  }).join('');
};
window.openPackageModal = function(){
  var el;
  el = document.getElementById('pkgId'); if (el) el.value = '';
  el = document.getElementById('pkgName'); if (el) el.value = '';
  el = document.getElementById('pkgMinutes'); if (el) el.value = '120';
  el = document.getElementById('pkgPrice'); if (el) el.value = '';
  var box = document.getElementById('pkgItems');
  if (box){
    var svc = window.services || [];
    box.innerHTML = svc.length ? svc.map(function(s){
      return '<label style="display:flex;gap:6px;align-items:center;font-size:0.8rem;"><input type="checkbox" data-sid="' + s.id + '"> ' + esc(s.name) + ' (' + s.price.toLocaleString() + ')</label>';
    }).join('') : '<p style="font-size:0.8rem;color:gray;">خدمتی نیست</p>';
  }
  var m = document.getElementById('packageModal'); if (m) m.classList.add('show');
};
window.editPackage = function(id){
  var p = PKG.find(function(x){ return x.id === id; });
  if (!p) return;
  window.openPackageModal();
  var el;
  el = document.getElementById('pkgId'); if (el) el.value = p.id;
  el = document.getElementById('pkgName'); if (el) el.value = p.name;
  el = document.getElementById('pkgMinutes'); if (el) el.value = p.minutes;
  el = document.getElementById('pkgPrice'); if (el) el.value = p.price || '';
  var box = document.getElementById('pkgItems');
  if (box){
    var ids = {};
    (p.items || []).forEach(function(it){ ids[it.serviceId] = it.qty; });
    box.querySelectorAll('input[data-sid]').forEach(function(inp){
      if (ids[parseInt(inp.dataset.sid)]) inp.checked = true;
    });
  }
};
window.savePackage = function(){
  var id = val('pkgId');
  var name = val('pkgName');
  var minutes = num('pkgMinutes');
  var price = num('pkgPrice');
  if (!name || !minutes){ toast('نام و دقیقه الزامی است','error'); return; }
  var items = [];
  var box = document.getElementById('pkgItems');
  if (box) box.querySelectorAll('input[data-sid]:checked').forEach(function(inp){
    items.push({serviceId:parseInt(inp.dataset.sid), qty:1});
  });
  if (id){
    var p = PKG.find(function(x){ return x.id === parseInt(id); });
    if (p) Object.assign(p, {name:name, minutes:minutes, price:price, items:items});
  } else {
    PKG.push({id:Date.now(), name:name, minutes:minutes, price:price, items:items});
  }
  savePkg();
  var m = document.getElementById('packageModal'); if (m) m.classList.remove('show');
  window.renderPackages();
  logAct('package', 'ذخیره پکیج: ' + name);
  toast('پکیج ذخیره شد','success');
};
window.deletePackage = function(id){
  if (!confirm('حذف شود؟')) return;
  PKG = PKG.filter(function(x){ return x.id !== id; });
  savePkg(); window.renderPackages();
};
window.applyPackageToClient = function(){
  var ps = document.getElementById('pkgSelect');
  var cs = document.getElementById('pkgClientSelect');
  if (!ps || !ps.value || !cs || cs.value === ''){ toast('پکیج و کلاینت را انتخاب کن','error'); return; }
  var p = PKG.find(function(x){ return x.id === parseInt(ps.value); });
  var idx = parseInt(cs.value);
  var c = (window.clients || [])[idx];
  if (!p || !c){ toast('پیدا نشد','error'); return; }
  var svc = window.services || [];
  for (var k = 0; k < (p.items || []).length; k++){
    var s = svc.find(function(x){ return x.id === p.items[k].serviceId; });
    if (!s || (s.stock || 0) < p.items[k].qty){ toast('موجودی ' + (s ? s.name : '?') + ' کافی نیست','error'); return; }
  }
  if (c.status === 'online') c.timerDuration = (c.timerDuration || 0) + p.minutes;
  else c.timerDuration = p.minutes;
  c.timerDurationSec = c.timerDuration * 60;
  c.notified = false;
  c.activePackage = {name:p.name, price:p.price || 0, minutes:p.minutes};
  var map = window.clientServiceMap || {};
  var arr = map[c.id] || [];
  (p.items || []).forEach(function(it){
    var ex = arr.find(function(x){ return x.serviceId === it.serviceId; });
    if (ex) ex.qty += it.qty; else arr.push({serviceId:it.serviceId, qty:it.qty});
  });
  map[c.id] = arr;
  try{
    if (window.saveClientServiceMap) saveClientServiceMap();
    if (window.saveData) saveData();
    if (window.renderClients) renderClients();
  }catch(e){}
  logAct('package', 'اجرای پکیج ' + p.name + ' روی ' + c.name);
  toast('پکیج ' + p.name + ' فعال شد','success');
};

/* ================= COUPONS ================= */
window.validateCoupon = function(code){
  code = String(code || '').trim().toUpperCase();
  if (!code) return {ok:false, error:'کد را وارد کن'};
  var c = CPN.find(function(x){ return String(x.code || '').toUpperCase() === code; });
  if (!c) return {ok:false, error:'کد معتبر نیست'};
  if (c.active === false) return {ok:false, error:'کد غیرفعال است'};
  if (c.expires){
    var end = new Date(c.expires + 'T23:59:59');
    if (end < new Date()) return {ok:false, error:'کد منقضی شده'};
  }
  if ((c.maxUses || 0) > 0 && (c.used || 0) >= c.maxUses) return {ok:false, error:'سقف استفاده تمام شده'};
  return {ok:true, coupon:c};
};
window.couponDiscount = function(coupon, baseTotal){
  baseTotal = baseTotal || 0;
  if (!coupon) return 0;
  if (coupon.type === 'percent') return Math.round(baseTotal * (coupon.value || 0) / 100);
  return Math.min(coupon.value || 0, baseTotal);
};
window.useCoupon = function(code){
  var r = window.validateCoupon(code);
  if (!r.ok) return r;
  r.coupon.used = (r.coupon.used || 0) + 1;
  saveCpn();
  return {ok:true, coupon:r.coupon};
};
window.applyCoupon = function(){
  if (!window.pendingPayment){ toast('سشنی در حال تسویه نیست','error'); return; }
  var inp = document.getElementById('couponInput');
  var code = inp ? inp.value.trim() : '';
  var r = window.validateCoupon(code);
  if (!r.ok){ toast(r.error,'error'); return; }
  var base = window.pendingPayment.baseTotal || window.pendingPayment.total;
  var amt = window.couponDiscount(r.coupon, base);
  window.pendingPayment.couponCode = r.coupon.code;
  window.refreshPayTotal();
  toast('کوپن اعمال شد: -' + amt.toLocaleString(),'success');
};
window.clearCoupon = function(){
  if (window.pendingPayment) window.pendingPayment.couponCode = '';
  var inp = document.getElementById('couponInput'); if (inp) inp.value = '';
  window.refreshPayTotal();
};
window.refreshPayTotal = function(){
  var pp = window.pendingPayment;
  if (!pp) return;
  var base = pp.baseTotal || pp.total;
  var line = document.getElementById('couponLine');
  var disc = 0;
  if (pp.couponCode){
    var r = window.validateCoupon(pp.couponCode);
    if (r.ok) disc = window.couponDiscount(r.coupon, base);
    else pp.couponCode = '';
  }
  if (line){
    line.style.display = disc > 0 ? 'flex' : 'none';
    line.innerHTML = '<span>کوپن ' + esc(pp.couponCode || '') + ':</span><span style="font-weight:800;color:#22c55e;">-' + disc.toLocaleString() + '</span>';
  }
  var el = document.getElementById('payTotal');
  if (el) el.textContent = (base - disc).toLocaleString() + ' تومان';
};
window.renderCoupons = function(){
  var c = document.getElementById('couponsList');
  if (!c) return;
  if (!CPN.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);">کوپنی ثبت نشده</p>'; return; }
  c.innerHTML = CPN.map(function(x){
    var left = (x.maxUses || 0) > 0 ? Math.max(0, x.maxUses - (x.used || 0)) + ' مانده' : 'نامحدود';
    return '<div class="glass" style="padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
      + '<div><b style="font-family:monospace;direction:ltr;">' + esc(x.code) + '</b> '
      + '<span style="font-size:0.75rem;color:#22c55e;">' + (x.type === 'percent' ? x.value + '%': (x.value || 0).toLocaleString() + ' تومان') + '</span><br>'
      + '<span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">' + left + (x.expires ? ' | تا ' + esc(x.expires) : '') + (x.active === false ? ' | غیرفعال' : '') + '</span></div>'
      + '<div style="display:flex;gap:6px;">'
      + '<button class="glass-btn" style="padding:6px 10px;font-size:0.75rem;" onclick="editCoupon(' + x.id + ')">✏️</button>'
      + '<button class="glass-btn glass-btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="deleteCoupon(' + x.id + ')">🗑️</button>'
      + '</div></div>';
  }).join('');
};
window.openCouponModal = function(){
  var el;
  el = document.getElementById('cpnId'); if (el) el.value = '';
  el = document.getElementById('cpnCode'); if (el) el.value = '';
  el = document.getElementById('cpnType'); if (el) el.value = 'percent';
  el = document.getElementById('cpnValue'); if (el) el.value = '10';
  el = document.getElementById('cpnMax'); if (el) el.value = '0';
  el = document.getElementById('cpnExp'); if (el) el.value = '';
  el = document.getElementById('cpnActive'); if (el) el.checked = true;
  var m = document.getElementById('couponModal'); if (m) m.classList.add('show');
};
window.editCoupon = function(id){
  var x = CPN.find(function(a){ return a.id === id; });
  if (!x) return;
  window.openCouponModal();
  var el;
  el = document.getElementById('cpnId'); if (el) el.value = x.id;
  el = document.getElementById('cpnCode'); if (el) el.value = x.code;
  el = document.getElementById('cpnType'); if (el) el.value = x.type;
  el = document.getElementById('cpnValue'); if (el) el.value = x.value;
  el = document.getElementById('cpnMax'); if (el) el.value = x.maxUses || 0;
  el = document.getElementById('cpnExp'); if (el) el.value = x.expires || '';
  el = document.getElementById('cpnActive'); if (el) el.checked = x.active !== false;
};
window.saveCoupon = function(){
  var id = val('cpnId');
  var code = val('cpnCode').toUpperCase().replace(/\s+/g, '');
  var type = val('cpnType') || 'percent';
  var value = num('cpnValue');
  var maxUses = num('cpnMax');
  var expires = val('cpnExp');
  var ael = document.getElementById('cpnActive');
  var active = ael ? ael.checked : true;
  if (!code || !value){ toast('کد و مقدار الزامی است','error'); return; }
  if (type === 'percent' && (value <= 0 || value > 100)){ toast('درصد بین ۱ تا ۱۰۰','error'); return; }
  var dup = CPN.find(function(x){ return String(x.code).toUpperCase() === code && String(x.id) !== String(id); });
  if (dup){ toast('این کد تکراری است','error'); return; }
  if (id){
    var x = CPN.find(function(a){ return a.id === parseInt(id); });
    if (x) Object.assign(x, {code:code, type:type, value:value, maxUses:maxUses, expires:expires, active:active});
  } else {
    CPN.push({id:Date.now(), code:code, type:type, value:value, maxUses:maxUses, used:0, expires:expires, active:active});
  }
  saveCpn();
  var m = document.getElementById('couponModal'); if (m) m.classList.remove('show');
  window.renderCoupons();
  logAct('coupon', 'ذخیره کوپن: ' + code);
  toast('کوپن ذخیره شد','success');
};
window.deleteCoupon = function(id){
  if (!confirm('حذف شود؟')) return;
  CPN = CPN.filter(function(x){ return x.id !== id; });
  saveCpn(); window.renderCoupons();
};

/* ================= AMANAT (deposits) ================= */
window.renderAmanats = function(){
  var c = document.getElementById('amanatsList');
  if (!c) return;
  var open = AMN.filter(function(x){ return x.status !== 'returned'; });
  var done = AMN.filter(function(x){ return x.status === 'returned'; }).slice(-5).reverse();
  if (!open.length && !done.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);">امانتی ثبت نشده</p>'; return; }
  var h = '';
  if (open.length){
    h += '<h4 style="margin-bottom:8px;">📦 نزد ما (' + open.length + ')</h4>';
    h += open.map(function(x){
      return '<div class="glass" style="padding:12px;margin-bottom:8px;border-left:3px solid #f59e0b;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
        + '<div><b>' + esc(x.item) + '</b><br><span style="font-size:0.8rem;color:rgba(255,255,255,0.6);">👤 ' + esc(x.owner) + (x.phone ? ' | 📞 ' + esc(x.phone) : '') + ' | 📅 ' + esc(x.dateIn || '') + '</span>'
        + (x.note ? '<br><span style="font-size:0.75rem;color:rgba(255,255,255,0.4);">' + esc(x.note) + '</span>' : '') + '</div>'
        + '<div style="display:flex;gap:6px;">'
        + '<button class="glass-btn glass-btn-success" style="padding:6px 10px;font-size:0.75rem;" onclick="returnAmanat(' + x.id + ')">↩️ عودت</button>'
        + '<button class="glass-btn glass-btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="deleteAmanat(' + x.id + ')">🗑️</button>'
        + '</div></div></div>';
    }).join('');
  }
  if (done.length){
    h += '<h4 style="margin:12px 0 8px;">✅ عودت داده شده</h4>';
    h += done.map(function(x){
      return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.8rem;opacity:0.6;">' + esc(x.item) + ' ← ' + esc(x.owner) + '</div>';
    }).join('');
  }
  c.innerHTML = h;
};
window.openAmanatModal = function(){
  var el;
  el = document.getElementById('amnId'); if (el) el.value = '';
  el = document.getElementById('amnOwner'); if (el) el.value = '';
  el = document.getElementById('amnPhone'); if (el) el.value = '';
  el = document.getElementById('amnItem'); if (el) el.value = '';
  el = document.getElementById('amnNote'); if (el) el.value = '';
  var m = document.getElementById('amanatModal'); if (m) m.classList.add('show');
};
window.saveAmanat = function(){
  var owner = val('amnOwner'), item = val('amnItem');
  if (!owner || !item){ toast('نام مالک و وسیله الزامی است','error'); return; }
  var phone = val('amnPhone'), note = val('amnNote');
  var today = new Date().toISOString().slice(0, 10);
  AMN.unshift({id:Date.now(), owner:owner, phone:phone, item:item, note:note, dateIn:today, dateOut:'', status:'kept'});
  saveAmn();
  var m = document.getElementById('amanatModal'); if (m) m.classList.remove('show');
  window.renderAmanats();
  logAct('amanat', 'ثبت امانت: ' + item + ' (' + owner + ')');
  toast('امانت ثبت شد','success');
};
window.returnAmanat = function(id){
  var x = AMN.find(function(a){ return a.id === id; });
  if (!x) return;
  x.status = 'returned';
  x.dateOut = new Date().toISOString().slice(0, 10);
  saveAmn(); window.renderAmanats();
  logAct('amanat', 'عودت: ' + x.item);
  toast('عودت ثبت شد','success');
};
window.deleteAmanat = function(id){
  if (!confirm('حذف شود؟')) return;
  AMN = AMN.filter(function(x){ return x.id !== id; });
  saveAmn(); window.renderAmanats();
};

/* ================= MAINTENANCE ================= */
window.renderMaintenance = function(){
  var c = document.getElementById('maintenanceList');
  if (!c) return;
  var open = MNT.filter(function(x){ return x.status !== 'done'; });
  var costOpen = open.reduce(function(s, x){ return s + (x.cost || 0); }, 0);
  var h = '<div class="glass" style="padding:12px;margin-bottom:10px;display:flex;justify-content:space-around;text-align:center;">'
    + '<div><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">باز</p><b style="color:#f59e0b;">' + open.length + '</b></div>'
    + '<div><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">هزینه باز</p><b>' + costOpen.toLocaleString() + '</b></div>'
    + '<div><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">کل رکورد</p><b>' + MNT.length + '</b></div></div>';
  if (!MNT.length){ c.innerHTML = h + '<p style="text-align:center;color:rgba(255,255,255,0.5);">رکوردی نیست</p>'; return; }
  h += MNT.slice(0, 30).map(function(x){
    var cl = (window.clients || []).find(function(a){ return a.id === x.clientId; });
    var done = x.status === 'done';
    return '<div class="glass" style="padding:12px;margin-bottom:8px;opacity:' + (done ? '0.6' : '1') + ';border-left:3px solid ' + (done ? '#22c55e' : '#ef4444') + ';">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
      + '<div><b>' + esc(x.title) + '</b><br><span style="font-size:0.8rem;color:rgba(255,255,255,0.6);">🖥️ ' + esc(cl ? cl.name : '-') + ' | 📅 ' + esc(x.date || '') + (x.cost ? ' | 💰 ' + x.cost.toLocaleString() : '') + '</span>'
      + (x.note ? '<br><span style="font-size:0.75rem;color:rgba(255,255,255,0.4);">' + esc(x.note) + '</span>' : '') + '</div>'
      + '<div style="display:flex;gap:6px;">'
      + (!done ? '<button class="glass-btn glass-btn-success" style="padding:6px 10px;font-size:0.75rem;" onclick="doneMaintenance(' + x.id + ')">✓ انجام شد</button>' : '')
      + '<button class="glass-btn glass-btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="deleteMaintenance(' + x.id + ')">🗑️</button>'
      + '</div></div></div>';
  }).join('');
  c.innerHTML = h;
};
window.openMaintenanceModal = function(){
  var sel = document.getElementById('mntClient');
  if (sel) sel.innerHTML = '<option value="">--</option>' + (window.clients || []).map(function(c){ return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
  var el;
  el = document.getElementById('mntTitle'); if (el) el.value = '';
  el = document.getElementById('mntCost'); if (el) el.value = '';
  el = document.getElementById('mntNote'); if (el) el.value = '';
  var m = document.getElementById('maintenanceModal'); if (m) m.classList.add('show');
};
window.saveMaintenance = function(){
  var title = val('mntTitle');
  if (!title){ toast('عنوان خرابی الزامی است','error'); return; }
  var sel = document.getElementById('mntClient');
  MNT.unshift({id:Date.now(), clientId: sel && sel.value ? parseInt(sel.value) : null,
    title:title, cost:num('mntCost'), note:val('mntNote'),
    date:new Date().toISOString().slice(0, 10), status:'open'});
  saveMnt();
  var m = document.getElementById('maintenanceModal'); if (m) m.classList.remove('show');
  window.renderMaintenance();
  logAct('maintenance', 'ثبت خرابی: ' + title);
  toast('ثبت شد','success');
};
window.doneMaintenance = function(id){
  var x = MNT.find(function(a){ return a.id === id; });
  if (!x) return;
  x.status = 'done';
  saveMnt(); window.renderMaintenance();
  toast('انجام شد','success');
};
window.deleteMaintenance = function(id){
  if (!confirm('حذف شود؟')) return;
  MNT = MNT.filter(function(x){ return x.id !== id; });
  saveMnt(); window.renderMaintenance();
};

/* ================= BROADCAST ================= */
window.broadcastAll = function(){
  var inp = document.getElementById('broadcastMsg');
  var msg = inp ? inp.value.trim() : '';
  if (!msg){ toast('متن پیام را بنویس','error'); if (inp) inp.focus(); return; }
  var targets = (window.clients || []).filter(function(c){ return c.ip; });
  if (!targets.length){ toast('دستگاهی با IP نیست','error'); return; }
  if (!window.agentFetch){ toast('ایجنت در دسترس نیست','error'); return; }
  toast('در حال ارسال به ' + targets.length + ' دستگاه...','success');
  logAct('broadcast', 'اعلام همگانی به ' + targets.length + ' دستگاه');
  var i = 0, ok = 0;
  (function next(){
    if (i >= targets.length){ toast('تمام شد: ' + ok + ' موفق از ' + targets.length, ok === targets.length ? 'success' : 'warning'); return; }
    var c = targets[i++];
    window.agentFetch(c.ip, '/warn?msg=' + encodeURIComponent(msg))
      .then(function(){ ok++; setTimeout(next, 400); })
      .catch(function(){ setTimeout(next, 400); });
  })();
};
})();
