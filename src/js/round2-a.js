/* Round2-A: CSV export, thermal print, waiting list, loyalty, survey */
(function(){
'use strict';
var esc = window.escapeHtml || function(v){ return String(v == null ? '' : v); };
function toast(m, t){ if (window.showToast) window.showToast(m, t); }
function logAct(ty, d){ if (window.logActivity) window.logActivity(ty, d); }
function sp(k, fb){ try { if (window.safeParse) return window.safeParse(localStorage.getItem(k)) || fb; } catch(e){} return fb; }

/* ---- 1. CSV export ---- */
function dlCSV(name, rows){
  var csv = rows.map(function(r){ return r.join(','); }).join('\n');
  var blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function sessionsFiltered(type){
  var now = new Date();
  var ss = window.sessions || [];
  if (type === 'daily') return {list: ss.filter(function(s){ return new Date(s.date).toDateString() === now.toDateString(); }), tag: 'daily'};
  if (type === 'weekly'){ var w = new Date(now - 7*864e5); return {list: ss.filter(function(s){ return new Date(s.date) >= w; }), tag: 'weekly'}; }
  var m = new Date(now - 30*864e5); return {list: ss.filter(function(s){ return new Date(s.date) >= m; }), tag: 'monthly'};
}
window.exportSessionsCSV = function(type){
  var r = sessionsFiltered(type);
  var rows = [['کلاینت','تعرفه','مدت (دقیقه)','هزینه (تومان)','تاریخ']];
  r.list.forEach(function(s){
    rows.push([s.clientName, s.tariff==='single'?'تک نفره':'دو نفره', Math.round(s.duration/60), s.cost, new Date(s.date).toLocaleDateString('fa-IR')]);
  });
  dlCSV('gamenet-' + r.tag + '.csv', rows);
  logAct('export','CSV sessions '+r.tag); toast('فایل CSV دانلود شد','success');
};
window.exportExpensesCSV = function(){
  var ex = sp('alvand_expenses', []);
  var rows = [['عنوان','مبلغ (تومان)','تاریخ']];
  ex.forEach(function(e){ rows.push([e.title||'', e.amount||0, new Date(e.date).toLocaleDateString('fa-IR')]); });
  dlCSV('gamenet-expenses.csv', rows);
  logAct('export','CSV expenses'); toast('فایل CSV دانلود شد','success');
};
window.exportCustomersCSV = function(){
  var cs = window.customers || [];
  var rows = [['نام','تلفن','کیف پول','ساعت','هزینه']];
  cs.forEach(function(c){ rows.push([c.name, c.phone||'', c.wallet||0, Math.round(c.totalHours||0), c.totalSpent||0]); });
  dlCSV('gamenet-customers.csv', rows);
  logAct('export','CSV customers'); toast('فایل CSV دانلود شد','success');
};

/* ---- 2. thermal receipt ---- */
window.printThermalReceipt = function(d){
  d = d || {};
  var shop = localStorage.getItem('alvand_shopName') || 'گیم‌نت';
  var no = 'R' + Date.now().toString().slice(-6);
  var now = new Date();
  var h = '<html><head><style>@page{size:80mm auto;margin:2mm}body{font-family:monospace;font-size:12px;direction:rtl;text-align:center}</style></head><body>';
  h += '<h3>' + shop + '</h3><hr>';
  h += '<p>رسید ' + no + '</p>';
  h += '<p>' + now.toLocaleDateString('fa-IR') + ' ' + now.toLocaleTimeString('fa-IR') + '</p>';
  h += '<p>کلاینت: ' + (d.clientName||'-') + '</p>';
  h += '<p>مدت: ' + Math.round((d.duration||0)/60) + ' دقیقه</p>';
  h += '<h3>' + (d.cost||0).toLocaleString() + ' تومان</h3>';
  h += '<p>با تشکر از حضور شما</p></body></html>';
  var w = window.open('', '_blank', 'width=300,height=600');
  if (w){ w.document.write(h); w.document.close(); setTimeout(function(){ w.print(); }, 500); }
  else toast('پاپ‌آپ بلاک شده است','error');
  logAct('print','receipt ' + (d.clientName||''));
};
window.setShopInfo = function(){
  var n = prompt('نام مغازه:', localStorage.getItem('alvand_shopName') || '');
  if (n !== null) localStorage.setItem('alvand_shopName', n);
  toast('ذخیره شد','success');
};

/* ---- 3. waiting list ---- */
var WL = sp('alvand_waitingList', []);
function saveWL(){ try{ localStorage.setItem('alvand_waitingList', JSON.stringify(WL)); }catch(e){} }
window.addToWaitingList = function(name, phone, stype, notes){
  WL.push({id: Date.now(), name: name, phone: phone||'', stype: stype||'pc', notes: notes||'', date: new Date().toISOString(), status: 'waiting'});
  saveWL(); logAct('waiting','add '+name); toast(name+' به لیست اضافه شد','success');
  window.updateWaitingBadge();
};
window.removeFromWaitingList = function(id){
  WL = WL.filter(function(x){ return x.id !== id; });
  saveWL(); window.renderWaitingList(); window.updateWaitingBadge();
};
window.completeWaitingItem = function(id){
  var it = WL.find(function(x){ return x.id === id; });
  if (it) it.status = 'completed';
  saveWL(); window.renderWaitingList(); window.updateWaitingBadge();
};
window.updateWaitingBadge = function(){
  var n = WL.filter(function(x){ return x.status === 'waiting'; }).length;
  var b = document.getElementById('waitingBadge');
  if (b){ b.textContent = n; b.style.display = n > 0 ? 'inline-block' : 'none'; }
};
window.renderWaitingList = function(){
  var c = document.getElementById('waitingListContent');
  if (!c) return;
  var w = WL.filter(function(x){ return x.status === 'waiting'; });
  if (!w.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5)">لیست انتظار خالی است</p>'; return; }
  c.innerHTML = w.map(function(it, i){
    var mins = Math.round((Date.now() - new Date(it.date).getTime())/60000);
    return '<div class="glass" style="padding:12px;margin-bottom:8px"><b>'+(i+1)+'. '+esc(it.name)+'</b> <span style="color:rgba(255,255,255,0.5)">'+esc(it.phone||'')+' | '+mins+' دقیقه</span><div style="margin-top:6px"><button class="glass-btn glass-btn-success" onclick="completeWaitingItem('+it.id+')">انجام شد</button> <button class="glass-btn glass-btn-danger" onclick="removeFromWaitingList('+it.id+')">حذف</button></div></div>';
  }).join('');
};
window.openWaitingListModal = function(){
  var n = document.getElementById('wlName'); if (n) n.value = '';
  var p = document.getElementById('wlPhone'); if (p) p.value = '';
  var m = document.getElementById('waitingListModal'); if (m) m.classList.add('show');
};
window.saveWaitingListItem = function(){
  var n = document.getElementById('wlName');
  var name = n ? n.value.trim() : '';
  if (!name){ toast('نام الزامی است','error'); return; }
  var p = document.getElementById('wlPhone');
  window.addToWaitingList(name, p ? p.value.trim() : '', 'pc', '');
  var m = document.getElementById('waitingListModal'); if (m) m.classList.remove('show');
  window.renderWaitingList();
};

/* ---- 4. loyalty points ---- */
var LP = sp('alvand_loyaltyPoints', {});
function saveLP(){ try{ localStorage.setItem('alvand_loyaltyPoints', JSON.stringify(LP)); }catch(e){} }
window.addLoyaltyPoints = function(cid, pts, reason){
  var cur = LP[cid] || {total:0, history:[]};
  cur.total += pts;
  cur.history.unshift({points: pts, reason: reason||'', date: new Date().toISOString()});
  LP[cid] = cur; saveLP();
};
window.redeemLoyaltyPoints = function(cid, pts){
  var cur = LP[cid];
  if (!cur || cur.total < pts){ toast('امتیاز کافی نیست','error'); return false; }
  cur.total -= pts;
  cur.history.unshift({points: -pts, reason: 'بازخرید', date: new Date().toISOString()});
  LP[cid] = cur; saveLP(); logAct('loyalty','redeem '+pts); return true;
};
window.getLoyaltyPoints = function(cid){ var c = LP[cid] || {total:0}; return c.total||0; };
window.renderLoyaltyPoints = function(cid){
  var c = document.getElementById('loyaltyPointsContent');
  if (!c) return;
  var cur = LP[cid] || {total:0, history:[]};
  c.innerHTML = '<div class="glass" style="padding:16px;text-align:center"><p>امتیاز فعلی: <b>'+cur.total+'</b></p></div>' +
    (cur.history||[]).slice(0,20).map(function(h){ return '<div style="font-size:.85rem;border-bottom:1px solid rgba(255,255,255,0.08);padding:4px 0">'+esc(h.reason)+' : '+(h.points>0?'+':'')+h.points+'</div>'; }).join('');
};

/* ---- 5. survey ---- */
var SV = sp('alvand_surveys', []);
function saveSV(){ try{ localStorage.setItem('alvand_surveys', JSON.stringify(SV)); }catch(e){} }
window.openSurveyModal = function(sid){
  window._svSid = sid; window._svRate = 0;
  var m = document.getElementById('surveyModal'); if (m) m.classList.add('show');
};
window.setSurveyRating = function(r){
  window._svRate = r;
  var stars = document.querySelectorAll('#surveyStars .star');
  stars.forEach(function(s, i){ if (i < r) s.classList.add('active'); else s.classList.remove('active'); });
};
window.submitSurveyForm = function(){
  var r = window._svRate || 0;
  if (!r){ toast('لطفا ستاره انتخاب کنید','error'); return; }
  var fb = document.getElementById('surveyFeedback');
  SV.push({id: Date.now(), rating: r, feedback: fb ? fb.value.trim() : '', date: new Date().toISOString()});
  saveSV(); logAct('survey','rating '+r);
  var m = document.getElementById('surveyModal'); if (m) m.classList.remove('show');
  toast('ممنون از نظر شما','success'); window.renderSurveyStats();
};
window.renderSurveyStats = function(){
  var c = document.getElementById('surveyStatsContent');
  if (!c) return;
  if (!SV.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5)">نظرسنجی ثبت نشده</p>'; return; }
  var avg = SV.reduce(function(s,x){ return s+x.rating; },0)/SV.length;
  c.innerHTML = '<div style="text-align:center"><p style="font-size:2rem">میانگین '+avg.toFixed(1)+'</p><p>'+SV.length+' نظر</p></div>';
};
})();
