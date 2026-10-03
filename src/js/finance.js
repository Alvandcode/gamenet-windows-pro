/* Finance: P&L, cash handover, tax, holidays, debt reminders, telegram backup. */
(function(){
'use strict';
var esc = window.escapeHtml || function(v){ return String(v == null ? '' : v); };
function toast(m, t){ if (window.showToast) window.showToast(m, t); }
function logAct(ty, d){ if (window.logActivity) window.logActivity(ty, d); }
function sp(k, fb){ try { if (window.safeParse) return window.safeParse(localStorage.getItem(k)) || fb; } catch(e){} return fb; }
function sv(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function val(id){ var el = document.getElementById(id); return el ? el.value.trim() : ''; }
function num(id){ var el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; }

var HO = sp('alvand_handovers', []);
var HOL = sp('alvand_holidays', []);
function saveHo(){ sv('alvand_handovers', HO); }
function saveHol(){ sv('alvand_holidays', HOL); }

/* ================= TAX ================= */
window.getTaxRate = function(){
  var v = 0;
  try{ v = parseFloat(localStorage.getItem('alvand_taxRate')) || 0; }catch(e){}
  return Math.min(100, Math.max(0, v));
};
window.setTaxRate = function(v){
  v = Math.min(100, Math.max(0, parseFloat(v) || 0));
  try{ localStorage.setItem('alvand_taxRate', String(v)); }catch(e){}
  toast('مالیات: ' + v + '٪','success');
};
window.taxAmount = function(baseTotal){
  var r = window.getTaxRate();
  return r > 0 ? Math.round((baseTotal || 0) * r / 100) : 0;
};

/* ================= P&L ================= */
window.computePNL = function(days){
  var now = Date.now();
  var inR = function(d){
    if (days == null) return true;
    if (days === 0){ return new Date(d).toDateString() === new Date().toDateString(); }
    return (now - new Date(d).getTime()) <= days * 864e5;
  };
  /* Go through num() for every stored field. A row that holds a string, a
   * Persian-digit value or null used to turn the entire P&L into NaN, and the
   * page then printed "NaN" instead of a profit or a loss. */
  var n = (typeof window.num === 'function') ? window.num : function(v){ return Number(v) || 0; };
  var gameRev = 0;
  (window.sessions || []).forEach(function(s){ if (s && inR(s.date)) gameRev += n(s.cost); });
  var bufRev = 0, bufCost = 0;
  sp('alvand_sales', []).forEach(function(s){
    if (!s || !inR(s.date)) return;
    bufRev += n(s.price) * n(s.qty);
    bufCost += n(s.cost) * n(s.qty);
  });
  var exp = 0;
  sp('alvand_expenses', []).forEach(function(e){ if (e && inR(e.date)) exp += n(e.amount); });
  var revenue = gameRev + bufRev;
  var net = revenue - bufCost - exp;
  return {gameRev:gameRev, bufRev:bufRev, revenue:revenue, cogs:bufCost, expenses:exp, net:net,
    margin: revenue > 0 ? (net / revenue * 100) : 0};
};
window.renderPNL = function(range){
  if (range) window._pnlRange = range;
  var r = window._pnlRange || 'today';
  var days = r === 'today' ? 0 : (r === 'month' ? 30 : null);
  var c = document.getElementById('pnlContent');
  if (!c) return;
  var p = window.computePNL(days);
  var col = p.net >= 0 ? '#22c55e' : '#ef4444';
  document.querySelectorAll('.pnl-range-btn').forEach(function(b){
    b.classList.toggle('glass-btn-success', b.dataset.range === r);
  });
  c.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">'
    + '<div class="glass" style="padding:16px;text-align:center;"><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">درآمد بازی</p><b style="color:#818cf8;">' + p.gameRev.toLocaleString() + '</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center;"><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">درآمد بوفه</p><b style="color:#f59e0b;">' + p.bufRev.toLocaleString() + '</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center;"><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">جمع درآمد</p><b>' + p.revenue.toLocaleString() + '</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center;"><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">بهای تمام‌شده بوفه</p><b style="color:#f59e0b;">-' + p.cogs.toLocaleString() + '</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center;"><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">هزینه‌ها</p><b style="color:#ef4444;">-' + p.expenses.toLocaleString() + '</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center;border-color:' + col + '55;"><p style="font-size:0.75rem;color:rgba(255,255,255,0.5);">سود خالص</p><b style="font-size:1.3rem;color:' + col + ';">' + p.net.toLocaleString() + '</b><br><span style="font-size:0.75rem;color:' + col + ';">حاشیه ' + p.margin.toFixed(1) + '٪</span></div>'
    + '</div>';
};

/* ================= HANDOVER ================= */
window.expectedCashIn = function(){
  var pays = sp('alvand_payments', []);
  var since = 0;
  HO.forEach(function(h){ var t = new Date(h.date).getTime(); if (t > since) since = t; });
  if (!since){ var d = new Date(); d.setHours(0, 0, 0, 0); since = d.getTime(); }
  /* A split bill is stored as two rows, one cash and one card, so only the
   * 'cash' rows belong in the till. The old code also had a 'split' branch
   * taking half of a row, but no such row is ever written, so the cash half of
   * every split payment was missing from the handover and the counted cash
   * looked short. */
  var n2 = (typeof window.num === 'function') ? window.num : function(v){ return Number(v) || 0; };
  return pays.filter(function(p){
    if (!p) return false;
    if (new Date(p.date).getTime() < since) return false;
    if (p.method === 'cash') return true;
    // tolerate a hand-edited or older backup that really does hold one 'split'
    // row, so those amounts are not lost as well
    if (p.method === 'split') return true;
    return false;
  }).reduce(function(acc, p){
    if (p.method === 'cash') return acc + n2(p.amount);
    if (p.method === 'split') return acc + Math.round(n2(p.amount) / 2);
    return acc;
  }, 0);
};
window.saveHandover = function(){
  var op = val('hoOperator') || ((window.currentOperator && window.currentOperator.username) || '');
  var opening = num('hoOpening');
  var counted = num('hoCounted');
  if (!op){ toast('نام تحویل‌دهنده را بنویس','error'); return; }
  var cashIn = window.expectedCashIn();
  var expected = opening + cashIn;
  var diff = counted - expected;
  HO.unshift({id:Date.now(), date:new Date().toISOString(), operator:op,
    opening:opening, cashIn:cashIn, expected:expected, counted:counted, diff:diff, note:val('hoNote')});
  saveHo();
  window.renderHandovers();
  logAct('handover', 'تحویل صندوق: ' + op + ' مغایرت ' + diff.toLocaleString());
  toast('تحویل ثبت شد - مغایرت: ' + diff.toLocaleString(), diff === 0 ? 'success' : 'warning');
};
window.deleteHandover = function(id){
  if (!confirm('حذف شود؟')) return;
  HO = HO.filter(function(x){ return x.id !== id; });
  saveHo(); window.renderHandovers();
};
window.renderHandovers = function(){
  var c = document.getElementById('handoversList');
  if (!c) return;
  var op = document.getElementById('hoOperator');
  if (op && !op.value) op.value = (window.currentOperator && window.currentOperator.username) || '';
  var exp = document.getElementById('hoExpected');
  if (exp){
    var opening = num('hoOpening');
    exp.textContent = 'ورودی صندوق موردانتظار: ' + (opening + window.expectedCashIn()).toLocaleString() + ' تومان';
  }
  if (!HO.length){ c.innerHTML += ''; }
  var h = HO.slice(0, 20).map(function(x){
    var col = x.diff === 0 ? '#22c55e' : '#ef4444';
    return '<div class="glass" style="padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
      + '<div><b>' + esc(x.operator) + '</b> <span style="font-size:0.75rem;color:rgba(255,255,255,0.5);">' + new Date(x.date).toLocaleString('fa-IR') + '</span><br>'
      + '<span style="font-size:0.8rem;">اول: ' + x.opening.toLocaleString() + ' | ورودی: ' + x.cashIn.toLocaleString() + ' | شمارش: ' + x.counted.toLocaleString() + '</span><br>'
      + '<span style="font-size:0.85rem;font-weight:800;color:' + col + ';">مغایرت: ' + x.diff.toLocaleString() + '</span>'
      + (x.note ? '<br><span style="font-size:0.75rem;color:rgba(255,255,255,0.4);">' + esc(x.note) + '</span>' : '') + '</div>'
      + '<button class="glass-btn glass-btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="deleteHandover(' + x.id + ')">🗑️</button></div>';
  }).join('');
  var emptyMsg = HO.length ? '' : '<p style="text-align:center;color:rgba(255,255,255,0.5);">تحویلی ثبت نشده</p>';
  var listEl = document.getElementById('handoversHistory');
  if (listEl) listEl.innerHTML = emptyMsg + h;
  else c.innerHTML = emptyMsg + h;
};

/* ================= HOLIDAYS ================= */
function localISO(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
window.isHoliday = function(iso){
  return HOL.indexOf(iso) >= 0;
};
window.renderHolidays = function(){
  var c = document.getElementById('holidaysList');
  if (!c) return;
  var disp = function(iso){
    if (window.formatDateSmart) return formatDateSmart(iso);
    return iso;
  };
  c.innerHTML = HOL.length ? HOL.slice().sort().map(function(iso){
    return '<div class="glass" style="padding:8px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">'
      + '<span>' + esc(disp(iso)) + '</span>'
      + '<button class="glass-btn glass-btn-danger" style="padding:4px 8px;font-size:0.7rem;" onclick="deleteHoliday(\'' + iso + '\')">🗑️</button></div>';
  }).join('') : '<p style="text-align:center;color:rgba(255,255,255,0.5);font-size:0.85rem;">تعطیلی ثبت نشده (جمعه‌ها خودکار حساب می‌شوند)</p>';
};
window.addHoliday = function(){
  var iso = window.getPickerISO ? getPickerISO('holidayDate') : val('holidayDate');
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)){ toast('تاریخ معتبر انتخاب کن','error'); return; }
  if (HOL.indexOf(iso) < 0){ HOL.push(iso); saveHol(); }
  window.renderHolidays();
  toast('تعطیلی اضافه شد','success');
};
window.deleteHoliday = function(iso){
  HOL = HOL.filter(function(x){ return x !== iso; });
  saveHol(); window.renderHolidays();
};

/* ================= DEBT REMINDERS ================= */
window.sendDebtReminders = function(){
  var ta = document.getElementById('debtTemplate');
  var tpl = ta ? ta.value.trim() : '';
  if (!tpl) tpl = 'سلام {نام}، بدهی شما {مبلغ} تومان است. لطفا تسویه کنید.';
  var mobOk = window.pbMobileOk || function(p){ return /^09\d{9}$/.test(String(p || '').replace(/[^0-9]/g, '')); };
  var list = (window.customers || []).filter(function(c){ return (c.debt || 0) > 0 && c.phone && mobOk(c.phone); });
  if (!list.length){ toast('بدهکاری با موبایل معتبر نیست','error'); return; }
  if (!window.sendSmsTo){ toast('ماژول پیامک لود نشده','error'); return; }
  if (!confirm(list.length + ' یادآوری بدهی ارسال شود؟')) return;
  toast('ارسال یادآوری شروع شد...','success');
  logAct('sms', 'یادآوری بدهی به ' + list.length + ' نفر');
  var i = 0, okCount = 0;
  (function next(){
    if (i >= list.length){
      toast('تمام شد: ' + okCount + ' موفق از ' + list.length, okCount === list.length ? 'success' : 'warning');
      return;
    }
    var c = list[i++];
    var msg = tpl.replace(/\{نام\}/g, c.name).replace(/\{مبلغ\}/g, (c.debt || 0).toLocaleString());
    window.sendSmsTo(c.phone, c.name, msg).then(function(res){
      if (res && res.ok) okCount++;
      setTimeout(next, 800);
    });
  })();
};

/* ================= SECTION RENDER ================= */
window.renderFinance = function(){
  try{ window.renderPNL(window._pnlRange || 'today'); }catch(e){}
  try{ window.renderHandovers(); }catch(e){}
  var t = document.getElementById('taxRateInput');
  if (t) t.value = window.getTaxRate();
};
window.renderOpsSection = function(){
  try{ window.renderPackages(); }catch(e){}
  try{ window.renderCoupons(); }catch(e){}
  try{ window.renderAmanats(); }catch(e){}
  try{ window.renderMaintenance(); }catch(e){}
  var ps = document.getElementById('pkgSelect');
  var pkgs = (window.getPackages ? window.getPackages() : []);
  if (ps) ps.innerHTML = '<option value="">انتخاب پکیج...</option>' + pkgs.map(function(p){ return '<option value="' + p.id + '">' + esc(p.name) + ' - ' + (p.price || 0).toLocaleString() + '</option>'; }).join('');
  var cs = document.getElementById('pkgClientSelect');
  if (cs) cs.innerHTML = '<option value="">انتخاب کلاینت...</option>' + (window.clients || []).map(function(c, i){ return '<option value="' + i + '">' + esc(c.name) + '</option>'; }).join('');
};
window.tsDayLabel = function(dt){
  if (dt === 'weekend') return 'پنجشنبه و جمعه';
  if (dt === 'holiday') return 'تعطیلات';
  return 'همه روزها';
};
})();
