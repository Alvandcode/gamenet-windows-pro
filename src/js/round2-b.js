/* Round2-B: branches, shifts, stock alert, monthly compare, forecast */
(function(){
'use strict';
var esc = window.escapeHtml || function(v){ return String(v == null ? '' : v); };
function toast(m, t){ if (window.showToast) window.showToast(m, t); }
function logAct(ty, d){ if (window.logActivity) window.logActivity(ty, d); }
function sp(k, fb){ try { if (window.safeParse) return window.safeParse(localStorage.getItem(k)) || fb; } catch(e){} return fb; }
function sv(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function getEmp(){ try { return JSON.parse(localStorage.getItem('alvand_employees')||'[]'); } catch(e){ return []; } }

/* ---- 6. branches ---- */
var BR = sp('alvand_branches', [{id:1, name:'شعبه اصلی', address:'', active:true}]);
var curBR = localStorage.getItem('alvand_currentBranch') || '1';
window.addBranch = function(name, addr){
  BR.push({id: Date.now(), name: name, address: addr||'', active: true});
  sv('alvand_branches', BR); logAct('branch','add '+name); toast('شعبه اضافه شد','success'); window.renderBranches();
};
window.deleteBranch = function(id){
  if (id === 1){ toast('شعبه اصلی قابل حذف نیست','error'); return; }
  if (!confirm('حذف شود؟')) return;
  BR = BR.filter(function(x){ return x.id !== id; });
  sv('alvand_branches', BR); window.renderBranches();
};
window.switchBranch = function(id){
  if (String(id) === String(curBR)) { toast('این شعبه فعال است', 'warning'); return; }
  var target = BR.filter(function(b){ return String(b.id) === String(id); })[0];
  if (!confirm('شعبه به «' + ((target && target.name) || id) + '» تغییر کرد؟\n\nسنس‌ها، خریدها و فروش بوفه از این لحظه به این شعبه ثبت می‌شود.')) return;
  try{ localStorage.setItem('alvand_currentBranch', String(id)); }catch(e){}
  curBR = String(id);
  toast('شعبه تغییر کرد', 'success');
  try{ window.renderBranches(); }catch(e){}
  // no full reload: reloading lost the page you were on for what is only a tag
  // on the next record
};

/* Per-branch figures. switchBranch() used to be a label with no numbers behind
 * it, so there was no way to tell whether the shops were actually split. */
window.branchStats = function(){
  var bid = window.branchIdOf || function(r){ return '1'; };
  var byId = {};
  BR.forEach(function(b){ byId[String(b.id)] = {id:b.id, name:b.name, sessions:0, income:0, expense:0, sales:0}; });
  var ensure = function(id){
    var k = String(id == null || id === '' ? '1' : id);
    if (!byId[k]) { byId[k] = {id:k, name:'شعبه ' + k, sessions:0, income:0, expense:0, sales:0}; }
    return byId[k];
  };
  var ss = (typeof sessions !== 'undefined' && Array.isArray(sessions)) ? sessions : [];
  ss.forEach(function(s){ if (!s) return; var r = ensure(bid(s)); r.sessions++; r.income += (Number(s.cost) || 0); });
  var ex = (typeof expenses !== 'undefined' && Array.isArray(expenses)) ? expenses : [];
  ex.forEach(function(e){ if (e) ensure(bid(e)).expense += (Number(e.amount) || 0); });
  var sl = (typeof sales !== 'undefined' && Array.isArray(sales)) ? sales : [];
  sl.forEach(function(s){ if (s) ensure(bid(s)).sales += (Number(s.price) || 0) * (Number(s.qty) || 0); });
  return Object.keys(byId).map(function(k){ return byId[k]; });
};

window.renderBranches = function(){
  var c = document.getElementById('branchesList');
  if (!c) return;
  var stats = window.branchStats ? window.branchStats() : [];
  var stat = {};
  stats.forEach(function(s){ stat[String(s.id)] = s; });
  var fa = function(n){ return (Number(n) || 0).toLocaleString('fa-IR'); };
  c.innerHTML = BR.map(function(b){
    var on = String(b.id) === String(curBR);
    var st = stat[String(b.id)] || {sessions:0, income:0, expense:0, sales:0};
    var total = st.income + st.sales;
    var net = total - st.expense;
    var cell = function(label, value, color){
      return '<div>' + label + ': <b' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</b></div>';
    };
    return '<div class="glass" style="padding:12px;margin-bottom:8px' + (on ? ';border-color:rgba(34,197,94,0.6)' : '') + '">'
      + '<b>' + esc(b.name) + '</b>'
      + (on ? ' <span style="font-size:0.7rem;padding:2px 8px;border-radius:50px;background:rgba(34,197,94,0.2);color:#22c55e">شعبه فعال</span>' : '')
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px;font-size:0.78rem">'
      + cell('سنس‌های ثبت‌شده', st.sessions)
      + cell('درآمد بازی', fa(st.income), '#22c55e')
      + cell('فروش بوفه', fa(st.sales))
      + cell('جمع درآمد', fa(total), '#22c55e')
      + cell('هزینه‌ها', fa(st.expense), '#ef4444')
      + cell('خالص', fa(net), net >= 0 ? '#22c55e' : '#ef4444')
      + '</div>'
      + '<div style="margin-top:8px">'
      + (on ? '' : '<button class="glass-btn" onclick="switchBranch(' + Number(b.id) + ')">ثبت با این شعبه</button> ')
      + (b.id !== 1 ? '<button class="glass-btn glass-btn-danger" onclick="deleteBranch(' + Number(b.id) + ')">حذف</button>' : '')
      + '</div></div>';
  }).join('')
  + '<p style="font-size:0.72rem;color:rgba(255,255,255,0.5);margin-top:8px;line-height:1.9">از این پس هر سانس، هر خرید و هر فروش بوفه برای شعبه فعال ثبت می‌شود. رکوردهای قدیمی که قبل از فعال شدن این قابلیت ثبت شده‌اند، در شعبه اصلی حساب می‌شوند.</p>';
};
window.openBranchModal = function(){
  var n = document.getElementById('branchName'); if (n) n.value = '';
  var a = document.getElementById('branchAddress'); if (a) a.value = '';
  var m = document.getElementById('branchModal'); if (m) m.classList.add('show');
};
window.saveBranchFromModal = function(){
  var n = document.getElementById('branchName');
  var name = n ? n.value.trim() : '';
  if (!name){ toast('نام شعبه الزامی است','error'); return; }
  var a = document.getElementById('branchAddress');
  window.addBranch(name, a ? a.value.trim() : '');
  var m = document.getElementById('branchModal'); if (m) m.classList.remove('show');
};

/* ---- 7. shifts ---- */
var SH = sp('alvand_shifts', []);
window.addShift = function(eid, date, st, en){
  SH.push({id: Date.now(), employeeId: eid, date: date, startTime: st, endTime: en});
  sv('alvand_shifts', SH); logAct('shift','new shift'); window.renderShifts();
};
window.deleteShift = function(id){
  SH = SH.filter(function(x){ return x.id !== id; });
  sv('alvand_shifts', SH); window.renderShifts();
};
function localISO(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function shiftLang(){ try{ return localStorage.getItem('alvand_lang')||'fa'; }catch(e){ return 'fa'; } }
window.renderShifts = function(){
  var c = document.getElementById('shiftsCalendar');
  if (!c) return;
  var lang = shiftLang();
  var now = new Date();
  var ws = new Date(now);
  if (lang==='en') ws.setDate(now.getDate() - ((now.getDay()+6)%7));
  else ws.setDate(now.getDate() - ((now.getDay()+1)%7));
  var days = lang==='fa'
    ? ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه']
    : (lang==='ar' ? ['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
  var h = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">';
  for (var i=0;i<7;i++){
    var d = new Date(ws); d.setDate(ws.getDate()+i);
    var ds = localISO(d);
    var disp = window.formatDateSmart ? formatDateSmart(ds) : ds;
    var list = SH.filter(function(s){ return s.date === ds; });
    var emps = getEmp();
    h += '<div style="background:rgba(255,255,255,.03);border-radius:12px;padding:10px;min-height:90px"><b>'+days[i]+'</b><br><small>'+disp+'</small>';
    list.forEach(function(s){
      var e = emps.find(function(x){ return x.id === s.employeeId; });
      h += '<div style="background:rgba(34,197,94,.1);border-radius:8px;padding:4px;margin-top:4px;font-size:.75rem">'+esc(e?e.name:'?')+'<br>'+s.startTime+'-'+s.endTime+' <button style="color:red;background:none;border:none;cursor:pointer" onclick="deleteShift('+s.id+')">x</button></div>';
    });
    h += '</div>';
  }
  c.innerHTML = h + '</div>';
};
window.openShiftModal = function(){
  var el = document.getElementById('shiftEmployee');
  if (el) el.innerHTML = getEmp().map(function(e){ return '<option value="'+e.id+'">'+esc(e.name)+'</option>'; }).join('');
  var dt = document.getElementById('shiftDate'); if (window.setDatePicker) setDatePicker('shiftDate', new Date());
  var m = document.getElementById('shiftModal'); if (m) m.classList.add('show');
};
window.saveShiftFromModal = function(){
  var e = document.getElementById('shiftEmployee');
  var dt = document.getElementById('shiftDate');
  var isoDate = window.getPickerISO ? getPickerISO('shiftDate') : (dt ? dt.value : '');
  var s = document.getElementById('shiftStart');
  var en = document.getElementById('shiftEnd');
  if (!e || !e.value || !isoDate || !s || !s.value || !en || !en.value){ toast('تمام فیلدها الزامی است','error'); return; }
  window.addShift(parseInt(e.value), isoDate, s.value, en.value);
  var m = document.getElementById('shiftModal'); if (m) m.classList.remove('show');
};

/* ---- 8. stock alert ---- */
function lowStockThreshold(){
  /* parseInt() could not read Persian digits, so a threshold typed as "۵۰"
   * silently became the default 5. Negative and NaN values are rejected too. */
  var raw = null;
  try { raw = localStorage.getItem('alvand_lowStockThreshold'); } catch(e){}
  var th = Math.floor((window.toNum ? window.toNum(raw, 5) : parseInt(raw, 10) || 5));
  if (!isFinite(th) || th < 0) th = 5;
  return th;
}
window.setLowStockThreshold = function(v){
  /* the caller may pass the raw input string, including Persian digits */
  var n = Math.floor((window.toNum ? window.toNum(v, NaN) : parseInt(v, 10)));
  if (!isFinite(n) || n < 0){ toast('آستانه نامعتبر است','error'); return; }
  try{ localStorage.setItem('alvand_lowStockThreshold', String(n)); }catch(e){}
  toast('آستانه هشدار: '+n,'success');
};
window.checkLowStock = function(){
  var th = lowStockThreshold();
  var svc = sp('alvand_services', []);
  /* stock can arrive as a string from a restored backup: "0" !== 0 used to
   * hide a sold-out item from the warning list */
  function stockOf(s){ return Math.max(0, Math.floor(window.toNum ? window.toNum(s && s.stock, 0) : (Number(s && s.stock) || 0))); }
  var out = svc.filter(function(s){ return stockOf(s) === 0; });
  var low = svc.filter(function(s){ var q = stockOf(s); return q > 0 && q <= th; });
  if (out.length || low.length){
    var msg = '';
    if (out.length) msg += 'تمام شده: '+out.map(function(s){return s.name;}).join(',')+' | ';
    if (low.length) msg += 'کم موجودی: '+low.map(function(s){return s.name+'('+stockOf(s)+')';}).join(',');
    toast(msg,'warning');
  }
  return {outOfStock: out, lowItems: low};
};
window.renderStockAlerts = function(){
  var c = document.getElementById('stockAlertsContent');
  if (!c) return;
  var r = window.checkLowStock();
  if (!r.outOfStock.length && !r.lowItems.length){ c.innerHTML = '<p style="text-align:center;color:#22c55e">تمام موجودی‌ها کافی است</p>'; return; }
  c.innerHTML =
    r.outOfStock.map(function(s){ return '<div class="glass" style="padding:8px;margin-bottom:6px;border-left:3px solid #ef4444"><b>'+esc(s.name)+'</b> تمام شده</div>'; }).join('') +
    r.lowItems.map(function(s){ return '<div class="glass" style="padding:8px;margin-bottom:6px;border-left:3px solid #f59e0b"><b>'+esc(s.name)+'</b> موجودی: '+stockOf(s)+'</div>'; }).join('');
};

/* ---- 9. monthly compare ---- */
window.generateMonthlyComparison = function(){
  var ss = window.sessions || [];
  var now = new Date();
  function bucket(m, y){ return ss.filter(function(s){ var d=new Date(s.date); return d.getMonth()===m && d.getFullYear()===y; }); }
  var tm = bucket(now.getMonth(), now.getFullYear());
  var lmD = new Date(now.getFullYear(), now.getMonth()-1, 1);
  var lm = bucket(lmD.getMonth(), lmD.getFullYear());
  /* cost can be a string (restored backup) -> s+x.cost concatenated the sum
   * with a number and produced garbage like "012500". Coerce first. */
  function sum(a){ return a.reduce(function(s,x){ return s + (window.toNum ? window.toNum(x && x.cost, 0) : (Number(x && x.cost) || 0)); },0); }
  var ti = sum(tm), li = sum(lm);
  var chg = li > 0 ? ((ti-li)/li*100).toFixed(1) : '0';
  var c = document.getElementById('monthlyComparisonContent');
  if (!c) return;
  var col = parseFloat(chg) >= 0 ? '#22c55e' : '#ef4444';
  c.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    + '<div class="glass" style="padding:16px"><h4>این ماه</h4><p style="font-size:1.4rem;font-weight:900;color:#22c55e">'+ti.toLocaleString('fa-IR')+'</p><p>'+tm.length+' سشن</p></div>'
    + '<div class="glass" style="padding:16px"><h4>ماه قبل</h4><p style="font-size:1.4rem;font-weight:900">'+li.toLocaleString('fa-IR')+'</p><p>'+lm.length+' سشن</p></div></div>'
    + '<div class="glass" style="padding:16px;margin-top:12px;text-align:center"><p>تغییر: <b style="color:'+col+'">'+chg+'%</b></p></div>';
};

/* ---- 10. forecast ---- */
window.renderForecast = function(){
  var c = document.getElementById('forecastContent');
  if (!c) return;
  var ss = window.sessions || [];
  if (!ss.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5)">داده‌ای نیست</p>'; return; }
  var days = {};
  ss.forEach(function(s){
    var k = window.localDayKey(s.date);
    if (!k) return;                                   // skip broken dates
    days[k] = (days[k]||0) + (window.toNum ? window.toNum(s.cost, 0) : (Number(s.cost) || 0));
  });
  /* sort by date: Object key order is insertion order, so the "last 7 days"
   * used whatever order the sessions happened to be saved in */
  var vals = Object.keys(days).sort().map(function(k){ return days[k]; });
  var avg = vals.reduce(function(a,b){ return a+b; },0)/vals.length;
  var last7 = vals.slice(-7);
  var avg7 = last7.length ? last7.reduce(function(a,b){ return a+b; },0)/last7.length : avg;
  c.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'
    + '<div class="glass" style="padding:16px;text-align:center"><p>میانگین روزانه</p><b>'+Math.round(avg).toLocaleString('fa-IR')+'</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center"><p>میانگین ۷ روز اخیر</p><b>'+Math.round(avg7).toLocaleString('fa-IR')+'</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center"><p>پیش‌بینی ۳۰ روز آینده</p><b style="color:#818cf8">'+Math.round(avg7*30).toLocaleString('fa-IR')+'</b></div></div>';
};
})();
