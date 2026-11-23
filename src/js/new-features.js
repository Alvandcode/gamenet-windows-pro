/**
 * Gamenet Manager Pro - New Features Module
 * Phase 1: Membership, Game History, Busy Hours, Notifications, Advanced Profiles
 * Phase 2: Activity Log, Advanced Search, Data Encryption
 * Phase 3: Employee Management, Interactive Guide, Extended i18n
 */
(function(){
'use strict';

// ===== DATA STORES =====
let membershipPlans = window.safeParse(localStorage.getItem('alvand_membershipPlans')) || [
    {id:1, name:'پایه', type:'monthly', price:500000, hours:20, discount:5, description:'۲۰ ساعت بازی در ماه'},
    {id:2, name:'نقره‌ای', type:'monthly', price:900000, hours:40, discount:10, description:'۴۰ ساعت بازی در ماه'},
    {id:3, name:'طلایی', type:'monthly', price:1500000, hours:80, discount:15, description:'۸۰ ساعت بازی در ماه'},
    {id:4, name:'پایه سالانه', type:'yearly', price:5000000, hours:240, discount:10, description:'۲۴۰ ساعت بازی در سال'},
    {id:5, name:'طلایی سالانه', type:'yearly', price:12000000, hours:720, discount:20, description:'۷۲۰ ساعت بازی در سال'}
];
let customerMemberships = window.safeParse(localStorage.getItem('alvand_customerMemberships')) || [];
let gameHistory = window.safeParse(localStorage.getItem('alvand_gameHistory')) || [];
let hourlyUsage = window.safeParse(localStorage.getItem('alvand_hourlyUsage')) || {};
let notifications = window.safeParse(localStorage.getItem('alvand_notifications')) || [];
let activityLog = window.safeParse(localStorage.getItem('alvand_activityLog')) || [];
let employees = window.safeParse(localStorage.getItem('alvand_employees')) || [];
let attendance = window.safeParse(localStorage.getItem('alvand_attendance')) || [];

// ===== HELPER: escapeHtml (use existing if available) =====
const esc = window.escapeHtml || function(v){ return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
const showToast = window.showToast || function(msg){ console.log(msg); };
function nid(v){ return window.numId ? window.numId(v) : (parseInt(v, 10) || 0); }
function permit(section, label){
    try { return typeof requirePerm === 'function' ? !!requirePerm(section, label) : true; }
    catch(e){ return false; }
}

// ===== SAVE HELPERS =====
function saveMembershipPlans(){ try{ localStorage.setItem('alvand_membershipPlans', JSON.stringify(membershipPlans)); }catch(e){} }
function saveCustomerMemberships(){ try{ localStorage.setItem('alvand_customerMemberships', JSON.stringify(customerMemberships)); }catch(e){} }
window.saveCustomerMemberships = saveCustomerMemberships;
// A plain assignment captured a snapshot, so assigning a new array here left
// getActiveMembership() still looking at the original one. Mirror the contents
// into the module variable instead, the same way the other shared stores work.
window.customerMemberships = customerMemberships;
function saveGameHistory(){ try{ localStorage.setItem('alvand_gameHistory', JSON.stringify(gameHistory)); }catch(e){} }
/* Called by app.js' pruneOldSessions(): keep the two feature-owned stores in
   sync without app.js writing their localStorage keys directly. */
window.pruneFeatureData = function(cutoffMs){
    let removed = 0;
    const cut = Number(cutoffMs) || 0;
    try {
        const beforeA = activityLog.length;
        activityLog = activityLog.filter(function(a){ const t=new Date(a && a.date).getTime(); return !isFinite(t) || t >= cut; });
        removed += beforeA - activityLog.length;
        if (beforeA !== activityLog.length) saveActivityLog();
    } catch(e) {}
    try {
        const beforeG = gameHistory.length;
        gameHistory = gameHistory.filter(function(g){ const t=new Date(g && g.date).getTime(); return !isFinite(t) || t >= cut; });
        removed += beforeG - gameHistory.length;
        if (beforeG !== gameHistory.length) saveGameHistory();
    } catch(e) {}
    return removed;
};
function saveHourlyUsage(){ try{ localStorage.setItem('alvand_hourlyUsage', JSON.stringify(hourlyUsage)); }catch(e){} }
function saveNotifications(){ try{ localStorage.setItem('alvand_notifications', JSON.stringify(notifications)); }catch(e){} }
function saveActivityLog(){ try{ localStorage.setItem('alvand_activityLog', JSON.stringify(activityLog)); }catch(e){} }
function saveEmployees(){ try{ localStorage.setItem('alvand_employees', JSON.stringify(employees)); }catch(e){} }
function saveAttendance(){ try{ localStorage.setItem('alvand_attendance', JSON.stringify(attendance)); }catch(e){} }

// ===== ACTIVITY LOG =====
function logActivity(type, description, details){
    activityLog.unshift({id: Date.now(), type, description, details: details||'', date: new Date().toISOString(), operator: (window.currentOperator||{}).username||'سیستم'});
    if(activityLog.length > 500) activityLog = activityLog.slice(0, 500);
    saveActivityLog();
}
window.logActivity = logActivity;

// ===== HOURLY USAGE TRACKING =====
function trackHourlyUsage(durationSeconds){
    /* Attribute the session to the hour it STARTED, not the hour it was paid.
       The old code used payment time, so a 19:00-23:00 party landed in the
       23:00 bucket. durationSeconds lets us reconstruct the start even after
       stopTimer() cleared startTime. */
    const dur = Math.max(0, Number(durationSeconds) || 0);
    const d = new Date(Date.now() - dur * 1000);
    let hour = isFinite(d.getTime()) ? d.getHours() : new Date().getHours();
    hourlyUsage[hour] = (hourlyUsage[hour]||0) + 1;
    saveHourlyUsage();
}
function resetHourlyUsage(){
    if (!permit('reports', 'پاکسازی ساعات شلوغی')) return;
    hourlyUsage = {};
    saveHourlyUsage();
}

// ===== PHASE 1: MEMBERSHIP PLANS =====
function renderMembershipPlans(){
    let grid = document.getElementById('membershipPlansGrid');
    if(!grid) return;
    if(membershipPlans.length === 0){
        grid.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">طرحی ثبت نشده</p>';
        return;
    }
    grid.innerHTML = membershipPlans.map(function(p){
        return '<div class="glass" style="padding:16px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:start;">' +
                '<div>' +
                    '<h4 style="font-weight:800;">' + esc(p.name) + ' <span style="font-size:0.7rem; padding:2px 6px; border-radius:50px; background:' + (p.type==='monthly'?'rgba(99,102,241,0.15)':'rgba(34,197,94,0.15)') + '; color:' + (p.type==='monthly'?'#818cf8':'#22c55e') + ';">' + (p.type==='monthly'?'ماهانه':'سالانه') + '</span></h4>' +
                    '<p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">' + esc(p.description) + '</p>' +
                    '<p style="font-size:0.85rem; margin-top:4px;">⏰ ' + window.num(p.hours) + ' ساعت | 💰 ' + window.num(p.price).toLocaleString('fa-IR') + ' تومان | 🏷️ ' + window.num(p.discount) + '% تخفیف</p>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex; gap:6px; margin-top:12px;">' +
                '<button class="glass-btn" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="editMembershipPlan(' + nid(p.id) + ')">✏️ ویرایش</button>' +
                '<button class="glass-btn glass-btn-danger" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="deleteMembershipPlan(' + nid(p.id) + ')">🗑️ حذف</button>' +
            '</div>' +
        '</div>';
    }).join('');
}
window.renderMembershipPlans = renderMembershipPlans;

function openMembershipPlanModal(){
    let el;
    el = document.getElementById('mpId'); if(el) el.value = '';
    el = document.getElementById('mpName'); if(el) el.value = '';
    el = document.getElementById('mpType'); if(el) el.value = 'monthly';
    el = document.getElementById('mpPrice'); if(el) el.value = '';
    el = document.getElementById('mpHours'); if(el) el.value = '';
    el = document.getElementById('mpDiscount'); if(el) el.value = '5';
    el = document.getElementById('mpDesc'); if(el) el.value = '';
    let modal = document.getElementById('membershipPlanModal');
    if(modal) modal.classList.add('show');
}
window.openMembershipPlanModal = openMembershipPlanModal;

function editMembershipPlan(id){
    var p = membershipPlans.find(function(x){ return x.id === id; });
    if(!p) return;
    var el;
    el = document.getElementById('mpId'); if(el) el.value = p.id;
    el = document.getElementById('mpName'); if(el) el.value = p.name;
    el = document.getElementById('mpType'); if(el) el.value = p.type;
    el = document.getElementById('mpPrice'); if(el) el.value = p.price;
    el = document.getElementById('mpHours'); if(el) el.value = p.hours;
    el = document.getElementById('mpDiscount'); if(el) el.value = p.discount;
    el = document.getElementById('mpDesc'); if(el) el.value = p.description;
    var modal = document.getElementById('membershipPlanModal');
    if(modal) modal.classList.add('show');
}
window.editMembershipPlan = editMembershipPlan;

function saveMembershipPlan(){
    if(!permit('membership', 'ذخیره طرح عضویت')) return;
    var idEl = document.getElementById('mpId');
    var id = idEl ? idEl.value : '';
    var nameEl = document.getElementById('mpName');
    var name = nameEl ? nameEl.value.trim() : '';
    var typeEl = document.getElementById('mpType');
    var type = typeEl ? typeEl.value : 'monthly';
    var priceEl = document.getElementById('mpPrice');
    var price = window.parseFaNumber ? window.parseFaNumber(priceEl ? priceEl.value : '0', 0) : (parseInt(priceEl ? priceEl.value : '0') || 0);
    var hoursEl = document.getElementById('mpHours');
    var hours = window.parseFaNumber ? window.parseFaNumber(hoursEl ? hoursEl.value : '0', 0) : (parseInt(hoursEl ? hoursEl.value : '0') || 0);
    var discEl = document.getElementById('mpDiscount');
    var discount = window.parseFaNumber ? window.parseFaNumber(discEl ? discEl.value : '0', 0) : (parseInt(discEl ? discEl.value : '0') || 0);
    var descEl = document.getElementById('mpDesc');
    var description = descEl ? descEl.value.trim() : '';
    if(!name || !price || !hours){ showToast('نام، قیمت و ساعت الزامی', 'error'); return; }
    if(id){
        var p = membershipPlans.find(function(x){ return x.id === parseInt(id); });
        if(p) Object.assign(p, {name:name, type:type, price:price, hours:hours, discount:discount, description:description});
    } else {
        membershipPlans.push({id:Date.now(), name:name, type:type, price:price, hours:hours, discount:discount, description:description});
    }
    saveMembershipPlans();
    var modal = document.getElementById('membershipPlanModal');
    if(modal) modal.classList.remove('show');
    renderMembershipPlans();
    logActivity('membership', 'ذخیره طرح عضویت: ' + name);
    showToast('طرح عضویت ذخیره شد', 'success');
}
window.saveMembershipPlan = saveMembershipPlan;

function deleteMembershipPlan(id){
    if(!permit('membership', 'حذف طرح عضویت')) return;
    if(!confirm('حذف شود؟')) return;
    membershipPlans = membershipPlans.filter(function(x){ return x.id !== id; });
    saveMembershipPlans();
    renderMembershipPlans();
    logActivity('membership', 'حذف طرح عضویت');
}
window.deleteMembershipPlan = deleteMembershipPlan;

function getMembershipPlans(){
    return membershipPlans.map(function(p){ return Object.assign({}, p); });
}
window.getMembershipPlans = getMembershipPlans;

function assignMembershipToCustomer(customerId, planId){
    if(!permit('membership', 'ثبت عضویت مشتری')) return false;
    // ids may be numbers in the live store and strings after a restore
    var plan = membershipPlans.find(function(x){ return String(x.id) === String(planId); });
    var customer = (window.customers || []).find(function(x){ return String(x.id) === String(customerId); });
    if(!plan || !customer){ showToast('طرح یا مشتری پیدا نشد', 'error'); return false; }
    var now = new Date();
    var expires = new Date(now);
    if(plan.type === 'monthly') expires.setMonth(expires.getMonth() + 1);
    else expires.setFullYear(expires.getFullYear() + 1);
    var cid = customer.id;
    var existingIdx = customerMemberships.findIndex(function(m){ return String(m.customerId) === String(cid); });
    var membership = {
        customerId: cid, planId: plan.id, planName: plan.name,
        startDate: now.toISOString(), expires: expires.toISOString(),
        hoursUsed: 0, hoursTotal: plan.hours, discount: plan.discount, active: true
    };
    if(existingIdx >= 0) customerMemberships[existingIdx] = membership;
    else customerMemberships.push(membership);
    saveCustomerMemberships();
    /* Selling a plan is money coming into the shop. The old code only wrote
       the membership row, so the price never reached the cash ledger or P&L. */
    const price = Math.max(0, Number(plan.price) || 0);
    if (price > 0) {
        const nowIso = new Date().toISOString();
        const branchId = (typeof window.currentBranchId === 'function') ? window.currentBranchId() : '1';
        try {
            const ss = window.sessions;
            if (Array.isArray(ss)) {
                ss.push({
                    id: Date.now(), branchId, clientId: null, customerId: cid,
                    clientName: 'عضویت ' + customer.name, duration: 0, cost: price,
                    gameCost: 0, buffetCost: 0, tariff: 'membership', extra: 0,
                    extraSeconds: 0, extraRate: 0, stationType: null, stationTypeName: '',
                    date: nowIso, timerDuration: 0, paymentMethod: 'cash',
                    services: [], membership: true, membershipPlan: plan.name
                });
                if (typeof window.saveData === 'function') window.saveData();
            }
            const pays = (window.safeParse ? window.safeParse(localStorage.getItem('alvand_payments') || '[]', []) : []) || [];
            pays.push({amount: price, method: 'cash', date: nowIso, clientName: customer.name, branchId});
            localStorage.setItem('alvand_payments', JSON.stringify(pays));
        } catch (e) {}
    }
    logActivity('membership', 'عضویت ' + plan.name + ' برای ' + customer.name);
    showToast('عضویت فعال شد' + (price > 0 ? ' - ' + price.toLocaleString('fa-IR') + ' تومان دریافت شد' : ''), 'success');
    return true;
}
window.assignMembershipToCustomer = assignMembershipToCustomer;

function getActiveMembership(customerId){
    var now = new Date();
    return customerMemberships.find(function(m){
        return String(m.customerId) === String(customerId) && m.active && new Date(m.expires) > now;
    }) || null;
}
window.getActiveMembership = getActiveMembership;

/* A plan could be created but never assigned to anybody: the only code that
 * spent hours was the group-play finish path. This is the missing UI entry
 * point, opened from each customer card. */
function openAssignMembership(customerId){
    var c = (window.customers || []).find(function(x){ return String(x.id) === String(customerId); });
    if(!c){ showToast('مشتری پیدا نشد', 'error'); return; }
    var sel = document.getElementById('assignMembershipPlan');
    if(!sel) return;
    sel.innerHTML = membershipPlans.map(function(p){
        return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' - ' + p.hours +
            ' ساعت - ' + Number(p.price || 0).toLocaleString('fa-IR') + ' تومان</option>';
    }).join('');
    if(!membershipPlans.length){
        sel.innerHTML = '<option value="">طرحی ثبت نشده است</option>';
    }
    var cid = document.getElementById('assignMembershipCustomerId'); if(cid) cid.value = c.id;
    var name = document.getElementById('assignMembershipCustomerName'); if(name) name.textContent = c.name;
    var info = document.getElementById('assignMembershipInfo');
    if(info){
        var active = getActiveMembership(c.id);
        if(active){
            var left = Math.max(0, Number(active.hoursTotal || 0) - Number(active.hoursUsed || 0));
            info.textContent = 'عضویت فعال: ' + active.planName + ' - ' + Math.round(left) + ' ساعت باقی‌مانده';
        } else {
            info.textContent = 'این مشتری عضویت فعال ندارد.';
        }
    }
    var modal = document.getElementById('assignMembershipModal');
    if(modal) modal.classList.add('show');
}
window.openAssignMembership = openAssignMembership;

function saveAssignMembership(){
    if(!permit('membership', 'ثبت عضویت مشتری')) return;
    var cidEl = document.getElementById('assignMembershipCustomerId');
    var pidEl = document.getElementById('assignMembershipPlan');
    var customerId = cidEl ? cidEl.value : '';
    var planId = pidEl ? pidEl.value : '';
    if(!customerId || !planId){ showToast('مشتری و طرح را انتخاب کنید', 'error'); return; }
    var active = getActiveMembership(customerId);
    if(active && !confirm('این مشتری عضویت فعال دارد. جایگزین شود؟')) return;
    if(!assignMembershipToCustomer(customerId, planId)) return;
    var modal = document.getElementById('assignMembershipModal');
    if(modal) modal.classList.remove('show');
    try{ if(typeof window.renderCustomersEnhanced === 'function') window.renderCustomersEnhanced(); }catch(e){}
}
window.saveAssignMembership = saveAssignMembership;

function deductMembershipHours(customerId, hours){
    var m = getActiveMembership(customerId);
    if(!m) return false;
    m.hoursUsed = (m.hoursUsed || 0) + hours;
    if(m.hoursUsed >= m.hoursTotal) m.active = false;
    saveCustomerMemberships();
    return true;
}
window.deductMembershipHours = deductMembershipHours;

// ===== PHASE 1: GAME HISTORY =====
function recordGameSession(sessionData){
    gameHistory.unshift({
        id: Date.now(),
        clientId: sessionData.clientId,
        clientName: sessionData.clientName,
        customerName: sessionData.customerName || '',
        duration: sessionData.duration,
        cost: sessionData.cost,
        tariff: sessionData.tariff,
        stationType: sessionData.stationType || '',
        date: new Date().toISOString(),
        services: sessionData.services || [],
        paymentMethod: sessionData.paymentMethod || 'cash'
    });
    if(gameHistory.length > 2000) gameHistory = gameHistory.slice(0, 2000);
    saveGameHistory();
    trackHourlyUsage(sessionData.duration);
}
window.recordGameSession = recordGameSession;

function getCustomerHistory(customerName){
    return gameHistory.filter(function(h){
        return h.customerName === customerName || h.clientName === customerName;
    });
}
window.getCustomerHistory = getCustomerHistory;

function getCustomerStats(customerName){
    var history = getCustomerHistory(customerName);
    var totalHours = 0, totalCost = 0, visitCount = history.length;
    var typeUsage = {};
    history.forEach(function(h){
        totalHours += h.duration / 3600;
        totalCost += h.cost;
        var t = h.stationType || 'نامشخص';
        typeUsage[t] = (typeUsage[t] || 0) + 1;
    });
    var favoriteType = '';
    var maxCount = 0;
    Object.keys(typeUsage).forEach(function(k){
        if(typeUsage[k] > maxCount){ maxCount = typeUsage[k]; favoriteType = k; }
    });
    return {totalHours: totalHours, totalCost: totalCost, visitCount: visitCount, favoriteType: favoriteType, typeUsage: typeUsage};
}
window.getCustomerStats = getCustomerStats;

function renderGameHistory(customerName){
    var container = document.getElementById('gameHistoryList');
    if(!container) return;
    var history = customerName ? getCustomerHistory(customerName) : gameHistory.slice(0, 50);
    if(history.length === 0){
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">تاریخچه‌ای وجود ندارد</p>';
        return;
    }
    container.innerHTML = history.map(function(h){
        var d = new Date(h.date);
        return '<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;">' +
            '<div><span style="font-weight:700;">' + esc(h.clientName) + '</span> ' +
            (h.customerName ? '<span style="font-size:0.7rem; color:#818cf8;">(' + esc(h.customerName) + ')</span>' : '') +
            '<br><span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">' + d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR') + '</span></div>' +
            '<div style="text-align:left;">⏱️ ' + (window.num(h.duration)/60).toFixed(0) + ' دقیقه | 💰 ' + window.num(h.cost).toLocaleString('fa-IR') + ' تومان</div>' +
        '</div>';
    }).join('');
}
window.renderGameHistory = renderGameHistory;

// ===== PHASE 1: BUSY HOURS REPORT =====
function renderBusyHoursReport(){
    var container = document.getElementById('busyHoursContent');
    if(!container) return;
    var hours = Object.keys(hourlyUsage).map(function(k){ return {hour: parseInt(k), count: hourlyUsage[k]}; });
    if(hours.length === 0){
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">داده‌ای موجود نیست. داده‌ها با تسویه سشن‌ها جمع می‌شوند.</p>';
        return;
    }
    hours.sort(function(a,b){ return a.hour - b.hour; });
    var maxCount = Math.max.apply(null, hours.map(function(h){ return h.count; }));
    var barHtml = hours.map(function(h){
        var pct = maxCount > 0 ? (h.count / maxCount * 100) : 0;
        var label = h.hour.toString().padStart(2,'0') + ':00';
        var isPeak = h.count === maxCount && h.count > 0;
        return '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">' +
            '<span style="width:40px; font-size:0.75rem; text-align:left; color:rgba(255,255,255,0.6);">' + label + '</span>' +
            '<div style="flex:1; background:rgba(255,255,255,0.05); border-radius:4px; height:20px; overflow:hidden;">' +
                '<div style="width:' + pct + '%; height:100%; background:' + (isPeak ? '#ef4444' : '#818cf8') + '; border-radius:4px; transition:width 0.5s;"></div>' +
            '</div>' +
            '<span style="width:30px; font-size:0.7rem; font-weight:700; color:' + (isPeak ? '#ef4444' : 'rgba(255,255,255,0.7)') + ';">' + h.count + '</span>' +
        '</div>';
    }).join('');
    container.innerHTML =
        '<div style="margin-bottom:16px; padding:16px; background:rgba(239,68,68,0.08); border-radius:12px;">' +
            '<h4 style="margin-bottom:8px;">🔥 شلوغ‌ترین ساعات</h4>' +
            '<p style="font-size:0.85rem; color:rgba(255,255,255,0.7);">شلوغ‌ترین ساعت: <b style="color:#ef4444;">' +
                (hours.length > 0 ? hours.sort(function(a,b){ return b.count - a.count; })[0].hour.toString().padStart(2,'0') + ':00' : '-') +
            '</b> با ' + (hours.length > 0 ? hours.sort(function(a,b){ return b.count - a.count; })[0].count : 0) + ' نفر</p>' +
        '</div>' +
        '<div>' + barHtml + '</div>' +
        '<div style="display:flex; gap:12px; margin-top:16px; flex-wrap:wrap;">' +
            '<button class="glass-btn" onclick="exportBusyHoursReport()">📤 خروجی</button>' +
            '<button class="glass-btn glass-btn-danger" onclick="resetHourlyUsage(); renderBusyHoursReport();">🗑️ پاکسازی</button>' +
        '</div>';
}
window.renderBusyHoursReport = renderBusyHoursReport;

function exportBusyHoursReport(){
    if (!permit('reports', 'خروجی ساعات شلوغی')) return;
    var hours = Object.keys(hourlyUsage).map(function(k){ return parseInt(k) + ':00 - ' + hourlyUsage[k] + ' نفر'; });
    if(hours.length === 0){ showToast('داده‌ای نیست', 'error'); return; }
    var text = 'گزارش ساعات شلوغ\n' + hours.join('\n');
    if(navigator.share){
        navigator.share({title: 'گزارش ساعات شلوغ', text: text}).catch(function(){});
    } else {
        var blob = new Blob([text], {type:'text/plain'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'busy-hours.txt';
        document.body.appendChild(a);
        a.click();
        // revoking synchronously cancels the download in Chromium
        setTimeout(function(){ try{ URL.revokeObjectURL(url); a.remove(); }catch(e){} }, 4000);
    }
    showToast('گزارش خروجی گرفته شد', 'success');
}
window.exportBusyHoursReport = exportBusyHoursReport;

// ===== PHASE 1: NOTIFICATIONS =====
function addNotification(type, title, message, targetCustomer){
    notifications.unshift({
        id: Date.now(), type: type, title: title, message: message,
        targetCustomer: targetCustomer || '', date: new Date().toISOString(), read: false
    });
    if(notifications.length > 200) notifications = notifications.slice(0, 200);
    saveNotifications();
    updateNotificationBadge();
}
window.addNotification = addNotification;

function markNotificationRead(id){
    var n = notifications.find(function(x){ return x.id === id; });
    if(n){ n.read = true; saveNotifications(); updateNotificationBadge(); }
}
window.markNotificationRead = markNotificationRead;

function clearNotifications(){
    notifications = [];
    saveNotifications();
    updateNotificationBadge();
    renderNotifications();
}
window.clearNotifications = clearNotifications;

function updateNotificationBadge(){
    var unread = notifications.filter(function(n){ return !n.read; }).length;
    var badge = document.getElementById('notifBadge');
    if(badge){
        badge.textContent = unread;
        badge.style.display = unread > 0 ? 'inline-block' : 'none';
    }
}
window.updateNotificationBadge = updateNotificationBadge;

function renderNotifications(){
    var container = document.getElementById('notificationsList');
    if(!container) return;
    if(notifications.length === 0){
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">اعلانی وجود ندارد</p>';
        return;
    }
    container.innerHTML = notifications.slice(0, 30).map(function(n){
        var icon = n.type === 'timeup' ? '⏰' : n.type === 'birthday' ? '🎂' : n.type === 'reminder' ? '🔔' : n.type === 'membership' ? '🎫' : '📢';
        return '<div class="glass" style="padding:12px; border-left:3px solid ' + (n.read ? 'rgba(255,255,255,0.1)' : '#818cf8') + '; opacity:' + (n.read ? '0.6' : '1') + ';">' +
            '<div style="display:flex; justify-content:space-between; align-items:start;">' +
                '<div>' +
                    '<p style="font-weight:700;">' + icon + ' ' + esc(n.title) + '</p>' +
                    '<p style="font-size:0.8rem; color:rgba(255,255,255,0.6);">' + esc(n.message) + '</p>' +
                    '<p style="font-size:0.7rem; color:rgba(255,255,255,0.4); margin-top:4px;">' + new Date(n.date).toLocaleString('fa-IR') + '</p>' +
                '</div>' +
                '<button class="glass-btn" style="padding:4px 8px; font-size:0.7rem;" onclick="markNotificationRead(' + nid(n.id) + ')">✓ خوانده شد</button>' +
            '</div>' +
        '</div>';
    }).join('');
}
window.renderNotifications = renderNotifications;

function checkTimeNotifications(){
    if(!window.clients) return;
    window.clients.forEach(function(c, idx){
        if(!c.timerDuration || c.status !== 'online') return;
        var remaining = c.timerDuration * 60 - (c.elapsed || 0);
        if(remaining <= 300 && remaining > 0 && !c._timeNotifSent){
            c._timeNotifSent = true;
            addNotification('timeup', 'زمان در حال اتمام', 'کلاینت ' + c.name + ': ' + Math.round(remaining/60) + ' دقیقه باقی مانده', c.name);
            showToast('⏰ ' + c.name + ': ' + Math.round(remaining/60) + ' دقیقه باقی مانده', 'warning');
        }
    });
}

function checkBirthdayNotifications(){
    if(!window.customers) return;
    var now = new Date();
    window.customers.forEach(function(c){
        if(!c.birthday) return;
        var m = String(c.birthday).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if(!m) return;
        if((parseInt(m[2],10)-1) === now.getMonth() && parseInt(m[3],10) === now.getDate()){
            var existing = notifications.find(function(n){ return n.type === 'birthday' && n.targetCustomer === c.name && window.isSameDay(n.date, now); });
            if(!existing){
                addNotification('birthday', 'تولد مشتری 🎂', 'امروز تولد ' + c.name + ' است! تخفیف ۱۰٪ فعال شد.', c.name);
                showToast('🎂 امروز تولد ' + c.name + ' است!', 'success');
            }
        }
    });
}

// Removed: renderAdvancedCustomerProfile() had no caller and wrote into
// #advancedProfileContent, an element that does not exist in index.html - the
// 65-line "advanced profile" was unreachable in every build. The customer list
// (renderCustomers) is the single owner of the customer UI.

// ===== PHASE 2: ACTIVITY LOG =====
/* Each entry used to be a flex row: an emoji, a paragraph, and a time with a
 * name in the corner, with the two halves drifting apart at any window width so
 * the eye could not line entries up or find one. There was no header row and no
 * columns, so scanning for a kind of event or a person meant reading all of it.
 *
 * It is a table now, one row per entry, every field in its own cell: what kind
 * of event, what happened, the detail, who did it, and when. The banding is
 * white and a very light grey with black ink on every theme - a log is read, not
 * admired, and theme-coloured rows were unreadable on the light themes and
 * washed out on the dark ones. */
var LOG_TYPE_ICONS = {
    session:'🎮', membership:'🎫', timer:'⏰', payment:'💰', client:'👤', clients:'👤',
    reservation:'📅', backup:'💾', operator:'🔑', employee:'🧑‍💼', buffet:'🍕',
    expense:'💸', package:'📦', coupon:'🎟️', amanat:'🤝', maintenance:'🔧',
    broadcast:'📢', handover:'💼', sms:'✉️', phonebook:'📇', export:'⬇️',
    print:'🖨️', waiting:'⏳', loyalty:'⭐', survey:'📊', branch:'🏬', shift:'🕐',
    pos:'💳', event:'📅', security:'🔐', system:'⚙️'
};
var LOG_TYPE_NAMES = {
    session:'سشن', membership:'عضویت', timer:'تایمر', payment:'پرداخت',
    client:'مشتری', clients:'مشتری', reservation:'رزرو', backup:'بکاپ',
    operator:'اپراتور', employee:'کارمند', buffet:'بوفه', expense:'هزینه',
    package:'پکیج', coupon:'کوپن', amanat:'امانت', maintenance:'تعمیرات',
    broadcast:'اعلام', handover:'تحویل صندوق', sms:'پیامک', phonebook:'دفترچه',
    export:'خروجی', print:'چاپ', waiting:'انتظار', loyalty:'وفاداری',
    survey:'نظرسنجی', branch:'شعبه', shift:'شیفت', pos:'کارتخوان',
    event:'رویداد', security:'امنیت', system:'سیستم'
};
var LOG_ROWS_SHOWN = 200;

function logWhen(iso){
    var d = new Date(iso);
    if(isNaN(d.getTime())) return { date:'-', time:'-' };
    // formatDateSmart gives the Jalali date the shop reads, and falls back to
    // ISO on the other languages
    var date = (typeof window.formatDateSmart === 'function') ? window.formatDateSmart(d.toISOString()) : d.toLocaleDateString('fa-IR');
    return { date: date, time: d.toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit' }) };
}

// exported so the guard can be tested directly: an entry with a corrupt date
// cannot be written through logActivity, which always stamps the time, but one
// can arrive from an import, a backup or an older build
window.logWhen = logWhen;

function renderActivityLog(){
    var container = document.getElementById('activityLogList');
    if(!container) return;
    if(activityLog.length === 0){
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">لاگی ثبت نشده</p>';
        return;
    }
    var rows = activityLog.slice(0, LOG_ROWS_SHOWN);
    var shown = rows.map(function(log){
        var type = String(log.type || '');
        var icon = LOG_TYPE_ICONS[type] || '📋';
        var name = LOG_TYPE_NAMES[type] || (type || '—');
        var when = logWhen(log.date);
        return '<tr>' +
            '<td class="log-type">' + icon + ' ' + esc(name) + '</td>' +
            '<td class="log-what">' + esc(log.description || '—') + '</td>' +
            '<td class="log-detail">' + (log.details ? esc(log.details) : '—') + '</td>' +
            '<td class="log-who">' + esc(log.operator || 'سیستم') + '</td>' +
            '<td class="log-when"><span class="log-date">' + esc(when.date) + '</span><span class="log-time">' + esc(when.time) + '</span></td>' +
        '</tr>';
    }).join('');
    var note = '';
    if(activityLog.length > rows.length){
        // never hide rows silently: say how many are left behind
        note = '<p class="log-more">نمایش ' + rows.length.toLocaleString('fa-IR')
            + ' مورد از ' + activityLog.length.toLocaleString('fa-IR') + ' مورد ثبت‌شده</p>';
    }
    container.innerHTML =
        '<table class="log-table">' +
            '<thead><tr>' +
                '<th>نوع</th><th>شرح</th><th>جزئیات</th><th>کاربر</th><th>تاریخ و ساعت</th>' +
            '</tr></thead>' +
            '<tbody>' + shown + '</tbody>' +
        '</table>' + note;
}
window.renderActivityLog = renderActivityLog;

// ===== PHASE 2: ADVANCED SEARCH =====
function advancedSearch(query){
    if(!query || query.length < 2) return {clients:[], customers:[], sessions:[], reservations:[]};
    var q = query.toLowerCase();
    var results = {clients:[], customers:[], sessions:[], reservations:[]};
    (window.clients || []).forEach(function(c, i){
        if((c.name||'').toLowerCase().includes(q) || (c.stationType||'').toLowerCase().includes(q)){
            results.clients.push({data:c, index:i, section:'clients'});
        }
    });
    (window.customers || []).forEach(function(c){
        if((c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q)){
            results.customers.push({data:c, section:'customers'});
        }
    });
    (window.sessions || []).forEach(function(s, i){
        if((s.clientName||'').toLowerCase().includes(q)){
            results.sessions.push({data:s, index:i, section:'reports'});
        }
    });
    (window.reservations || []).forEach(function(r, i){
        if((r.clientName||'').toLowerCase().includes(q)){
            results.reservations.push({data:r, index:i, section:'reservations'});
        }
    });
    return results;
}
window.advancedSearch = advancedSearch;

function renderSearchResults(query){
    var container = document.getElementById('searchResults');
    if(!container) return;
    var results = advancedSearch(query);
    var total = results.clients.length + results.customers.length + results.sessions.length + results.reservations.length;
    if(total === 0){
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">نتیجه‌ای یافت نشد</p>';
        return;
    }
    var html = '<p style="color:rgba(255,255,255,0.6); margin-bottom:12px;">' + total + ' نتیجه برای "' + esc(query) + '"</p>';
    if(results.clients.length > 0){
        html += '<h4 style="margin-bottom:8px;">🖥️ دستگاه‌ها (' + results.clients.length + ')</h4>';
        html += results.clients.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px; cursor:pointer;" onclick="showSection(\'clients\', document.querySelector(\'[data-onclick*=clients]\'));">' + esc(r.data.name) + ' - ' + esc(r.data.stationType||'') + '</div>'; }).join('');
    }
    if(results.customers.length > 0){
        html += '<h4 style="margin:12px 0 8px;">👤 مشتریان (' + results.customers.length + ')</h4>';
        html += results.customers.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px; cursor:pointer;" onclick="showSection(\'customers\', document.querySelector(\'[data-onclick*=customers]\'));">' + esc(r.data.name) + ' - ' + esc(r.data.phone||'') + '</div>'; }).join('');
    }
    if(results.sessions.length > 0){
        html += '<h4 style="margin:12px 0 8px;">🎮 سشن‌ها (' + results.sessions.length + ')</h4>';
        html += results.sessions.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px;">' + esc(r.data.clientName) + ' - ' + new Date(r.data.date).toLocaleDateString('fa-IR') + ' - ' + r.data.cost.toLocaleString('fa-IR') + ' تومان</div>'; }).join('');
    }
    if(results.reservations.length > 0){
        html += '<h4 style="margin:12px 0 8px;">📅 رزروها (' + results.reservations.length + ')</h4>';
        html += results.reservations.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px;">' + esc(r.data.clientName) + ' - ' + esc(r.data.date) + '</div>'; }).join('');
    }
    container.innerHTML = html;
    container.style.display = 'block';
}
window.renderSearchResults = renderSearchResults;

// ===== PHASE 2: DATA ENCRYPTION =====
// Removed: encryptLocalData/decryptLocalData were a repeating-key XOR and were
// never called. XOR is not encryption, and btoa() throws on any Persian text so
// the function silently returned the PLAINTEXT for the data it was meant to
// protect. The real implementation (PBKDF2 + AES-GCM) lives in round2-c.js as
// encryptAndSave/decryptAndLoad and is reachable from the Security panel.

// ===== PHASE 3: EMPLOYEE MANAGEMENT =====
function renderEmployees(){
    var container = document.getElementById('employeesList');
    if(!container) return;
    if(employees.length === 0){
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">کارمندی ثبت نشده</p>';
        return;
    }
    container.innerHTML = employees.map(function(emp){
        var todayAtt = attendance.find(function(a){ return a.employeeId === emp.id && window.isSameDay(a.date, new Date()); });
        var isWorking = todayAtt && !todayAtt.clockOut;
        return '<div class="glass" style="padding:16px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                '<div>' +
                    '<h4 style="font-weight:800;">' + esc(emp.name) + ' <span style="font-size:0.7rem; padding:2px 8px; border-radius:50px; background:' + (isWorking ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.1)') + '; color:' + (isWorking ? '#22c55e' : 'rgba(255,255,255,0.5)') + ';">' + (isWorking ? 'فعال' : 'غیرفعال') + '</span></h4>' +
                    '<p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">📞 ' + esc(emp.phone||'-') + ' | 💰 ' + window.num(emp.salary).toLocaleString('fa-IR') + ' تومان</p>' +
                '</div>' +
                '<div style="display:flex; gap:6px;">' +
                    '<button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="editEmployee(' + nid(emp.id) + ')">✏️</button>' +
                    '<button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteEmployee(' + nid(emp.id) + ')">🗑️</button>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex; gap:6px; margin-top:12px;">' +
                (isWorking ?
                    '<button class="glass-btn glass-btn-danger" style="flex:1;" onclick="clockOutEmployee(' + nid(emp.id) + ')">🚪 خروج</button>' :
                    '<button class="glass-btn glass-btn-success" style="flex:1;" onclick="clockInEmployee(' + nid(emp.id) + ')">🚪 ورود</button>'
                ) +
                '<button class="glass-btn" style="flex:1;" onclick="viewEmployeeAttendance(' + nid(emp.id) + ')">📊 گزارش</button>' +
            '</div>' +
        '</div>';
    }).join('');
}
window.renderEmployees = renderEmployees;

function openEmployeeModal(){
    var el;
    el = document.getElementById('empId'); if(el) el.value = '';
    el = document.getElementById('empName'); if(el) el.value = '';
    el = document.getElementById('empPhone'); if(el) el.value = '';
    el = document.getElementById('empSalary'); if(el) el.value = '';
    el = document.getElementById('empRole'); if(el) el.value = '';
    var modal = document.getElementById('employeeModal');
    if(modal) modal.classList.add('show');
}
window.openEmployeeModal = openEmployeeModal;

function editEmployee(id){
    var emp = employees.find(function(x){ return x.id === id; });
    if(!emp) return;
    var el;
    el = document.getElementById('empId'); if(el) el.value = emp.id;
    el = document.getElementById('empName'); if(el) el.value = emp.name;
    el = document.getElementById('empPhone'); if(el) el.value = emp.phone || '';
    el = document.getElementById('empSalary'); if(el) el.value = emp.salary || '';
    el = document.getElementById('empRole'); if(el) el.value = emp.role || '';
    var modal = document.getElementById('employeeModal');
    if(modal) modal.classList.add('show');
}
window.editEmployee = editEmployee;

function saveEmployee(){
    if(!permit('employees', 'ذخیره کارمند')) return;
    var idEl = document.getElementById('empId');
    var id = idEl ? idEl.value : '';
    var nameEl = document.getElementById('empName');
    var name = nameEl ? nameEl.value.trim() : '';
    var phoneEl = document.getElementById('empPhone');
    var phone = phoneEl ? phoneEl.value.trim() : '';
    var salaryEl = document.getElementById('empSalary');
    var salary = window.parseFaNumber ? window.parseFaNumber(salaryEl ? salaryEl.value : '0', 0) : (parseInt(salaryEl ? salaryEl.value : '0') || 0);
    var roleEl = document.getElementById('empRole');
    var role = roleEl ? roleEl.value.trim() : '';
    if(!name){ showToast('نام کارمند الزامی', 'error'); return; }
    if(id){
        var emp = employees.find(function(x){ return x.id === parseInt(id); });
        if(emp) Object.assign(emp, {name:name, phone:phone, salary:salary, role:role});
    } else {
        employees.push({id:Date.now(), name:name, phone:phone, salary:salary, role:role});
    }
    saveEmployees();
    var modal = document.getElementById('employeeModal');
    if(modal) modal.classList.remove('show');
    renderEmployees();
    logActivity('employee', 'ذخیره کارمند: ' + name);
    showToast('کارمند ذخیره شد', 'success');
}
window.saveEmployee = saveEmployee;

function deleteEmployee(id){
    if(!permit('employees', 'حذف کارمند')) return;
    if(!confirm('حذف شود؟')) return;
    /* Attendance rows are history, so do not delete them: close any open
       shift at the deletion time. Otherwise the dashboard keeps showing an
       employee who is "still clocked in" forever. Also drop future shifts. */
    var nowIso = new Date().toISOString();
    var hadOpen = false;
    attendance.forEach(function(a){
        if (String(a.employeeId) === String(id) && !a.clockOut) {
            a.clockOut = nowIso;
            a.autoClosedOnDelete = true;
            hadOpen = true;
        }
    });
    if (hadOpen) saveAttendance();
    if (typeof window.deleteShiftsForEmployee === 'function') {
        try{ window.deleteShiftsForEmployee(id); }catch(e){}
    }
    employees = employees.filter(function(x){ return String(x.id) !== String(id); });
    saveEmployees();
    renderEmployees();
}
window.deleteEmployee = deleteEmployee;

function clockInEmployee(id){
    if(!permit('employees', 'ثبت ورود کارمند')) return;
    var open = attendance.find(function(a){ return String(a.employeeId) === String(id) && !a.clockOut; });
    if(open){ showToast('این کارمند هنوز خروج ثبت نکرده است', 'warning'); return; }
    attendance.push({id:Date.now(), employeeId:id, date:new Date().toISOString(), clockIn:new Date().toISOString(), clockOut:null});
    saveAttendance();
    renderEmployees();
    logActivity('employee', 'ورود کارمند');
    showToast('ورود ثبت شد', 'success');
}
window.clockInEmployee = clockInEmployee;

function clockOutEmployee(id){
    if(!permit('employees', 'ثبت خروج کارمند')) return;
    var open = attendance.find(function(a){ return String(a.employeeId) === String(id) && !a.clockOut; });
    if(open){
        open.clockOut = new Date().toISOString();
        saveAttendance();
        renderEmployees();
        logActivity('employee', 'خروج کارمند');
        showToast('خروج ثبت شد', 'success');
    } else {
        showToast('ورود باز برای این کارمند پیدا نشد', 'error');
    }
}
window.clockOutEmployee = clockOutEmployee;

function viewEmployeeAttendance(id){
    var emp = employees.find(function(x){ return x.id === id; });
    if(!emp) return;
    var empAtt = attendance.filter(function(a){ return a.employeeId === id; }).slice(-20).reverse();
    var container = document.getElementById('employeeAttendanceList');
    if(!container) return;
    if(empAtt.length === 0){
        container.innerHTML = '<p style="color:rgba(255,255,255,0.5);">رکوردی ثبت نشده</p>';
        return;
    }
    container.innerHTML = '<h4 style="margin-bottom:8px;">📊 ' + esc(emp.name) + '</h4>' +
        empAtt.map(function(a){
            var clockIn = new Date(a.clockIn).toLocaleTimeString('fa-IR');
            var clockOut = a.clockOut ? new Date(a.clockOut).toLocaleTimeString('fa-IR') : 'فعال';
            var hours = a.clockOut ? ((new Date(a.clockOut) - new Date(a.clockIn)) / (1000*60*60)).toFixed(1) : '-';
            return '<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;">' +
                '<span>' + new Date(a.date).toLocaleDateString('fa-IR') + '</span>' +
                '<span>' + clockIn + ' → ' + clockOut + '</span>' +
                '<span style="color:#818cf8;">' + hours + 'h</span>' +
            '</div>';
        }).join('');
}
window.viewEmployeeAttendance = viewEmployeeAttendance;

// ===== PHASE 3: INTERACTIVE GUIDE =====
function showInteractiveGuide(){
    currentGuideStep = 0;
    renderGuideStep();
    var overlay = document.getElementById('guideOverlay');
    if(overlay) overlay.style.display = 'flex';
}
window.showInteractiveGuide = showInteractiveGuide;

function closeGuide(){
    var overlay = document.getElementById('guideOverlay');
    if(overlay) overlay.style.display = 'none';
    localStorage.setItem('alvand_guideShown', '1');
}
window.closeGuide = closeGuide;

var guideSteps = [
    {title:'خوش آمدید! 👋', text:'به Gamenet Manager Pro خوش آمدید. این راهنما شما را با امکانات اصلی آشنا می‌کند.', icon:'🎮'},
    {title:'داشبورد 📊', text:'از داشبورد وضعیت کلی مغازه را ببینید: کلاینت‌های فعال، درآمد امروز و نمودار هفتگی.', icon:'📊'},
    {title:'کلاینت‌ها 🖥️', text:'دستگاه‌ها را اضافه و مدیریت کنید. تایمر را شروع کنید و هزینه را محاسبه کنید.', icon:'🖥️'},
    {title:'مشتریان 👤', text:'پروفایل مشتریان بسازید، کیف پول شارژ کنید و تخفیف تولد بدهید.', icon:'👤'},
    {title:'رزروها 📅', text:'دستگاه‌ها را برای مشتریان رزرو کنید و از تداخل جلوگیری کنید.', icon:'📅'},
    {title:'بوفه 🍕', text:'موجودی و فروش بوفه را مدیریت کنید.', icon:'🍕'},
    {title:'گزارش‌ها 📈', text:'گزارش روزانه، هفتگی و ماهانه بگیرید و PDF کنید.', icon:'📈'},
    {title:'بکاپ 💾', text:'هر روز بکاپ خودکار گرفته می‌شود. می‌توانید دستی هم بکاپ بگیرید.', icon:'💾'},
    {title:'تنظیمات ⚙️', text:'تم، صدا، زبان و سایر تنظیمات را تغییر دهید.', icon:'⚙️'},
    {title:'آماده‌اید! 🚀', text:'حالا می‌توانید شروع کنید. موفق باشید!', icon:'🚀'}
];
var currentGuideStep = 0;

function navigateGuide(dir){
    currentGuideStep += dir;
    if(currentGuideStep < 0) currentGuideStep = 0;
    if(currentGuideStep >= guideSteps.length){ closeGuide(); return; }
    renderGuideStep();
}
window.navigateGuide = navigateGuide;

function renderGuideStep(){
    var step = guideSteps[currentGuideStep];
    var container = document.getElementById('guideContent');
    if(!container) return;
    container.innerHTML =
        '<div style="text-align:center; margin-bottom:16px; font-size:4rem;">' + step.icon + '</div>' +
        '<h3 style="text-align:center; margin-bottom:12px; font-weight:900;">' + step.title + '</h3>' +
        '<p style="text-align:center; color:rgba(255,255,255,0.7); line-height:1.8; margin-bottom:20px;">' + step.text + '</p>' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<span style="color:rgba(255,255,255,0.4); font-size:0.8rem;">' + (currentGuideStep+1) + '/' + guideSteps.length + '</span>' +
            '<div style="display:flex; gap:8px;">' +
                (currentGuideStep > 0 ? '<button class="glass-btn" onclick="navigateGuide(-1)">← قبلی</button>' : '') +
                '<button class="glass-btn glass-btn-success" onclick="navigateGuide(1)">' + (currentGuideStep < guideSteps.length - 1 ? 'بعدی →' : 'شروع کن! 🚀') + '</button>' +
            '</div>' +
        '</div>';
}
window.renderGuideStep = renderGuideStep;

// ===== PHASE 3: EXTENDED i18n =====
var extraTranslations = {
    membership: {fa:'عضوویت', en:'Membership', ar:'العضوية'},
    membershipPlans: {fa:'طرح‌های عضویت', en:'Membership Plans', ar:'خطط العضوية'},
    busyHours: {fa:'ساعات شلوغ', en:'Busy Hours', ar:'الساعات المزدحمة'},
    gameHistory: {fa:'تاریخچه بازی', en:'Game History', ar:'تاريخ اللعبة'},
    notifications: {fa:'اعلان‌ها', en:'Notifications', ar:'الإشعارات'},
    activityLog: {fa:'لاگ فعالیت', en:'Activity Log', ar:'سجل النشاط'},
    employees: {fa:'کارمندان', en:'Employees', ar:'الموظفون'},
    attendance: {fa:'حضور و غیاب', en:'Attendance', ar:'الحضور والغياب'},
    advancedSearch: {fa:'جستجوی پیشرفته', en:'Advanced Search', ar:'بحث متقدم'},
    advancedProfile: {fa:'پروفایل پیشرفته', en:'Advanced Profile', ar:'الملف الشخصي المتقدم'}
};
function translateExtra(key, lang){
    if(extraTranslations[key] && extraTranslations[key][lang]) return extraTranslations[key][lang];
    return key;
}
window.translateExtra = translateExtra;

// ===== INTEGRATION WITH EXISTING SYSTEMS =====
// Game history/hourly usage are recorded by confirmPayment() in app.js, after
// the bill is actually paid. Do not hook stopTimer(): it fires before the
// cashier chooses a payment method, so a cancelled payment used to leave a
// permanent history row and a false busy-hour count.

// Hook into backup to also log it
var origCreateBackup = window.createBackup;
if(typeof origCreateBackup === 'function'){
    window.createBackup = function(){
        logActivity('backup', 'بکاپ خودکار');
        return origCreateBackup.apply(this, arguments);
    };
}

// ===== BOOT SEQUENCE =====
function initNewFeatures(){
    // Check for birthday notifications every hour
    setInterval(checkBirthdayNotifications, 3600000);
    checkBirthdayNotifications();

    // Check time notifications every 30 seconds
    setInterval(checkTimeNotifications, 30000);

    // Update notification badge
    updateNotificationBadge();

    // Show interactive guide on first run
    if(!localStorage.getItem('alvand_guideShown')){
        setTimeout(showInteractiveGuide, 3000);
    }

    logActivity('system', 'شروع سیستم');
}

// Patch showSection to handle new sections
var origShowSection = window.showSection;
if(typeof origShowSection === 'function'){
    window.showSection = function(section, el){
        var result = origShowSection.apply(this, arguments);
        if(section === 'membership') renderMembershipPlans();
        if(section === 'busyHours') renderBusyHoursReport();
        if(section === 'gameHistory') renderGameHistory();
        if(section === 'activityLog') renderActivityLog();
        if(section === 'employees') renderEmployees();
        if(section === 'notifications') renderNotifications();
        if(section === 'advancedSearch'){
            var input = document.getElementById('searchInput');
            if(input) input.focus();
        }
        return result;
    };
}

// Run on DOM ready
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initNewFeatures);
} else {
    initNewFeatures();
}

})();
