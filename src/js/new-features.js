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

// ===== SAVE HELPERS =====
function saveMembershipPlans(){ try{ localStorage.setItem('alvand_membershipPlans', JSON.stringify(membershipPlans)); }catch(e){} }
function saveCustomerMemberships(){ try{ localStorage.setItem('alvand_customerMemberships', JSON.stringify(customerMemberships)); }catch(e){} }
window.saveCustomerMemberships = saveCustomerMemberships;
// A plain assignment captured a snapshot, so assigning a new array here left
// getActiveMembership() still looking at the original one. Mirror the contents
// into the module variable instead, the same way the other shared stores work.
window.customerMemberships = customerMemberships;
function saveGameHistory(){ try{ localStorage.setItem('alvand_gameHistory', JSON.stringify(gameHistory)); }catch(e){} }
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
function trackHourlyUsage(){
    let hour = new Date().getHours();
    hourlyUsage[hour] = (hourlyUsage[hour]||0) + 1;
    saveHourlyUsage();
}
function resetHourlyUsage(){
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
                    '<p style="font-size:0.85rem; margin-top:4px;">⏰ ' + p.hours + ' ساعت | 💰 ' + p.price.toLocaleString('fa-IR') + ' تومان | 🏷️ ' + p.discount + '% تخفیف</p>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex; gap:6px; margin-top:12px;">' +
                '<button class="glass-btn" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="editMembershipPlan(' + p.id + ')">✏️ ویرایش</button>' +
                '<button class="glass-btn glass-btn-danger" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="deleteMembershipPlan(' + p.id + ')">🗑️ حذف</button>' +
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
    var idEl = document.getElementById('mpId');
    var id = idEl ? idEl.value : '';
    var nameEl = document.getElementById('mpName');
    var name = nameEl ? nameEl.value.trim() : '';
    var typeEl = document.getElementById('mpType');
    var type = typeEl ? typeEl.value : 'monthly';
    var priceEl = document.getElementById('mpPrice');
    var price = parseInt(priceEl ? priceEl.value : '0') || 0;
    var hoursEl = document.getElementById('mpHours');
    var hours = parseInt(hoursEl ? hoursEl.value : '0') || 0;
    var discEl = document.getElementById('mpDiscount');
    var discount = parseInt(discEl ? discEl.value : '0') || 0;
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
    if(!confirm('حذف شود؟')) return;
    membershipPlans = membershipPlans.filter(function(x){ return x.id !== id; });
    saveMembershipPlans();
    renderMembershipPlans();
    logActivity('membership', 'حذف طرح عضویت');
}
window.deleteMembershipPlan = deleteMembershipPlan;

function assignMembershipToCustomer(customerId, planId){
    var plan = membershipPlans.find(function(x){ return x.id === planId; });
    var customer = (window.customers || []).find(function(x){ return x.id === customerId; });
    if(!plan || !customer){ showToast('طرح یا مشتری پیدا نشد', 'error'); return; }
    var now = new Date();
    var expires = new Date(now);
    if(plan.type === 'monthly') expires.setMonth(expires.getMonth() + 1);
    else expires.setFullYear(expires.getFullYear() + 1);
    var existingIdx = customerMemberships.findIndex(function(m){ return m.customerId === customerId; });
    var membership = {
        customerId: customerId, planId: planId, planName: plan.name,
        startDate: now.toISOString(), expires: expires.toISOString(),
        hoursUsed: 0, hoursTotal: plan.hours, discount: plan.discount, active: true
    };
    if(existingIdx >= 0) customerMemberships[existingIdx] = membership;
    else customerMemberships.push(membership);
    saveCustomerMemberships();
    logActivity('membership', 'عضویت ' + plan.name + ' برای ' + customer.name);
    showToast('عضویت فعال شد', 'success');
}
window.assignMembershipToCustomer = assignMembershipToCustomer;

function getActiveMembership(customerId){
    var now = new Date();
    return customerMemberships.find(function(m){
        return m.customerId === customerId && m.active && new Date(m.expires) > now;
    }) || null;
}
window.getActiveMembership = getActiveMembership;

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
    trackHourlyUsage();
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
            '<div style="text-align:left;">⏱️ ' + (h.duration/60).toFixed(0) + ' دقیقه | 💰 ' + h.cost.toLocaleString('fa-IR') + ' تومان</div>' +
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
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">داده‌ای موجود نیست. داده‌ها با شروع تایمر جمع می‌شوند.</p>';
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
    var hours = Object.keys(hourlyUsage).map(function(k){ return parseInt(k) + ':00 - ' + hourlyUsage[k] + ' نفر'; });
    if(hours.length === 0){ showToast('داده‌ای نیست', 'error'); return; }
    var text = 'گزارش ساعات شلوغ\n' + hours.join('\n');
    if(navigator.share){
        navigator.share({title: 'گزارش ساعات شلوغ', text: text}).catch(function(){});
    } else {
        var blob = new Blob([text], {type:'text/plain'});
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'busy-hours.txt'; a.click();
        URL.revokeObjectURL(url);
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
                '<button class="glass-btn" style="padding:4px 8px; font-size:0.7rem;" onclick="markNotificationRead(' + n.id + ')">✓ خوانده شد</button>' +
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
        var bday = new Date(c.birthday);
        if(bday.getDate() === now.getDate() && bday.getMonth() === now.getMonth()){
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
function renderActivityLog(){
    var container = document.getElementById('activityLogList');
    if(!container) return;
    if(activityLog.length === 0){
        container.innerHTML = '<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">لاگی ثبت نشده</p>';
        return;
    }
    var typeIcons = {session:'🎮', membership:'🎫', timer:'⏰', payment:'💰', client:'👤', reservation:'📅', backup:'💾', operator:'🔑', buffet:'🍕', expense:'💸'};
    container.innerHTML = activityLog.slice(0, 50).map(function(log){
        return '<div style="display:flex; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;">' +
            '<span style="font-size:1.2rem;">' + (typeIcons[log.type] || '📋') + '</span>' +
            '<div style="flex:1;">' +
                '<p><b>' + esc(log.description) + '</b></p>' +
                (log.details ? '<p style="font-size:0.75rem; color:rgba(255,255,255,0.5);">' + esc(log.details) + '</p>' : '') +
            '</div>' +
            '<div style="text-align:left;">' +
                '<p style="font-size:0.7rem; color:rgba(255,255,255,0.4);">' + new Date(log.date).toLocaleTimeString('fa-IR') + '</p>' +
                '<p style="font-size:0.7rem; color:rgba(255,255,255,0.5);">' + esc(log.operator) + '</p>' +
            '</div>' +
        '</div>';
    }).join('');
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
        html += results.clients.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px; cursor:pointer;" onclick="showSection(\'clients\', document.querySelector(\'[onclick*=clients]\'));">' + esc(r.data.name) + ' - ' + (r.data.stationType||'') + '</div>'; }).join('');
    }
    if(results.customers.length > 0){
        html += '<h4 style="margin:12px 0 8px;">👤 مشتریان (' + results.customers.length + ')</h4>';
        html += results.customers.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px; cursor:pointer;" onclick="showSection(\'customers\', document.querySelector(\'[onclick*=customers]\'));">' + esc(r.data.name) + ' - ' + esc(r.data.phone||'') + '</div>'; }).join('');
    }
    if(results.sessions.length > 0){
        html += '<h4 style="margin:12px 0 8px;">🎮 سشن‌ها (' + results.sessions.length + ')</h4>';
        html += results.sessions.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px;">' + esc(r.data.clientName) + ' - ' + new Date(r.data.date).toLocaleDateString('fa-IR') + ' - ' + r.data.cost.toLocaleString('fa-IR') + ' تومان</div>'; }).join('');
    }
    if(results.reservations.length > 0){
        html += '<h4 style="margin:12px 0 8px;">📅 رزروها (' + results.reservations.length + ')</h4>';
        html += results.reservations.map(function(r){ return '<div class="glass" style="padding:8px 12px; margin-bottom:6px;">' + esc(r.data.clientName) + ' - ' + r.data.date + '</div>'; }).join('');
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
                    '<p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">📞 ' + esc(emp.phone||'-') + ' | 💰 ' + (emp.salary||0).toLocaleString('fa-IR') + ' تومان</p>' +
                '</div>' +
                '<div style="display:flex; gap:6px;">' +
                    '<button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="editEmployee(' + emp.id + ')">✏️</button>' +
                    '<button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteEmployee(' + emp.id + ')">🗑️</button>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex; gap:6px; margin-top:12px;">' +
                (isWorking ?
                    '<button class="glass-btn glass-btn-danger" style="flex:1;" onclick="clockOutEmployee(' + emp.id + ')">🚪 خروج</button>' :
                    '<button class="glass-btn glass-btn-success" style="flex:1;" onclick="clockInEmployee(' + emp.id + ')">🚪 ورود</button>'
                ) +
                '<button class="glass-btn" style="flex:1;" onclick="viewEmployeeAttendance(' + emp.id + ')">📊 گزارش</button>' +
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
    var idEl = document.getElementById('empId');
    var id = idEl ? idEl.value : '';
    var nameEl = document.getElementById('empName');
    var name = nameEl ? nameEl.value.trim() : '';
    var phoneEl = document.getElementById('empPhone');
    var phone = phoneEl ? phoneEl.value.trim() : '';
    var salaryEl = document.getElementById('empSalary');
    var salary = parseInt(salaryEl ? salaryEl.value : '0') || 0;
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
    if(!confirm('حذف شود؟')) return;
    employees = employees.filter(function(x){ return x.id !== id; });
    saveEmployees();
    renderEmployees();
}
window.deleteEmployee = deleteEmployee;

function clockInEmployee(id){
    attendance.push({id:Date.now(), employeeId:id, date:new Date().toISOString(), clockIn:new Date().toISOString(), clockOut:null});
    saveAttendance();
    renderEmployees();
    logActivity('employee', 'ورود کارمند');
    showToast('ورود ثبت شد', 'success');
}
window.clockInEmployee = clockInEmployee;

function clockOutEmployee(id){
    var today = attendance.find(function(a){ return a.employeeId === id && !a.clockOut && window.isSameDay(a.date, new Date()); });
    if(today){
        today.clockOut = new Date().toISOString();
        saveAttendance();
        renderEmployees();
        logActivity('employee', 'خروج کارمند');
        showToast('خروج ثبت شد', 'success');
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
// Hook into timer stop to record game history
var origStopTimer = window.stopTimer;
if(typeof origStopTimer === 'function'){
    window.stopTimer = function(){
        try{
            var c = window.clients && window.currentTimeClient != null ? window.clients[window.currentTimeClient] : null;
            if(c && c.status === 'online'){
                var duration = (c.elapsed || 0);
                var cost = window.calculateCost ? window.calculateCost(c) : 0;
                var matchedCustomer = null;
                if(window.customers && window.reservations){
                    var reserv = window.reservations.find(function(r){ return r.clientId === c.id && r.status !== 'completed'; });
                    if(reserv) matchedCustomer = window.customers.find(function(cu){ return cu.id === reserv.customerId; });
                }
                recordGameSession({
                    clientId: c.id, clientName: c.name,
                    customerName: matchedCustomer ? matchedCustomer.name : '',
                    duration: duration, cost: cost,
                    tariff: c.tariff, stationType: c.stationType || '',
                    services: (window.clientServiceMap && window.clientServiceMap[c.id]) || []
                });
                logActivity('session', 'پایان سشن: ' + c.name, 'مدت: ' + Math.round(duration/60) + ' دقیقه - هزینه: ' + cost.toLocaleString('fa-IR') + ' تومان');
            }
        }catch(e){}
        return origStopTimer.apply(this, arguments);
    };
}

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
