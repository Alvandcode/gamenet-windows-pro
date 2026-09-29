
    /* ---------- branch tagging ----------
     * switchBranch() used to write `alvand_currentBranch` and then nothing read
     * it: the selector looked like it isolated the books per branch, but every
     * session and expense landed in one shared pile. New records now carry the
     * branch so the numbers can actually be split; older records have no
     * branchId and are treated as the main branch. */
    function currentBranchId(){
        try { return String(localStorage.getItem('alvand_currentBranch') || '1'); }
        catch(e){ return '1'; }
    }
    function branchIdOf(rec){
        // a session/expense saved before branching existed belongs to branch 1
        return (rec && rec.branchId !== undefined && rec.branchId !== null && rec.branchId !== '') ? String(rec.branchId) : '1';
    }
    window.currentBranchId = currentBranchId;
    window.branchIdOf = branchIdOf;

    // ========== Cross-module state bridge ==========
    /* app.js runs inside one big IIFE, so its `customers` / `sessions` / ...
     * are invisible to the other renderer scripts. Five modules read them as
     * window.customers / window.sessions and never found anything, which
     * silently disabled: the phonebook account panel, membership + history +
     * attendance + the activity log, the waiting list, the busy-hours report,
     * the forecast, the customer portal and "encrypt customers backup"
     * (it encrypted an empty array). Arrow-function accessors close over the
     * IIFE scope, so these stay live after the arrays are replaced by
     * loadData()/restoreBackup(), and the setters accept writes.
     * sessions/reservations live here too and are read the same way. */
    function publishState(name, get, set){
        if (Object.prototype.hasOwnProperty.call(window, name)) return;
        try {
            Object.defineProperty(window, name, {
                configurable: true, enumerable: true, get: get, set: set
            });
        } catch(e){ /* already taken by another module */ }
    }
    publishState('clients',          () => clients,          v => { clients = v; });
    publishState('stationTypes',    () => stationTypes,    v => { stationTypes = v; });
    publishState('tariffs',          () => tariffs,          v => { tariffs = v; });
    publishState('services',         () => services,         v => { services = v; });
    publishState('expenses',         () => expenses,         v => { expenses = v; });
    publishState('tariffSchedules',  () => tariffSchedules,  v => { tariffSchedules = v; });
    publishState('sales',            () => sales,            v => { sales = v; });
    publishState('clientServiceMap', () => clientServiceMap, v => { clientServiceMap = v; });
    publishState('sessions',         () => sessions,         v => { sessions = v; });
    publishState('reservations',     () => reservations,     v => { reservations = v; });
    publishState('customers',        () => customers,        v => { customers = v; });
    publishState('operators',        () => operators,        v => { operators = v; });
    publishState('currentOperator',  () => currentOperator,  v => { currentOperator = v; });
    publishState('walletHistory',    () => walletHistory,    v => { walletHistory = v; });
    publishState('activeLicense',    () => activeLicense,    v => { activeLicense = v; });
    publishState('allLicenses',      () => allLicenses,      v => { allLicenses = v; });

    // Data Store - enhanced
    let clients = safeParse(localStorage.getItem('alvand_clients')) || [];
    let tariffs = safeParse(localStorage.getItem('alvand_tariffs')) || { single: 15000, double: 25000, extra: 8000 };
    // Phase 1 - new stores
    let services = safeParse(localStorage.getItem('alvand_services')) || [
        {id:1, name:'نوشابه', price:15000, cost:8000, stock:50, category:'buffet'},
        {id:2, name:'چیپس', price:20000, cost:12000, stock:30, category:'buffet'},
        {id:3, name:'آب معدنی', price:10000, cost:5000, stock:40, category:'buffet'},
        {id:4, name:'دسته اضافه', price:10000, cost:0, stock:999, category:'service'},
        {id:5, name:'شارژ دسته', price:5000, cost:0, stock:999, category:'service'}
    ];
    let expenses = safeParse(localStorage.getItem('alvand_expenses')) || [];
    let tariffSchedules = safeParse(localStorage.getItem('alvand_tariffSchedules')) || [];
    let sales = safeParse(localStorage.getItem('alvand_sales')) || []; // buffet sales
    let pendingPayment = null;
    let clientServiceMap = safeParse(localStorage.getItem('alvand_clientServiceMap')) || {}; // clientId -> [{serviceId, qty}]
    // Phase 2 - customers & operators
    let customers = safeParse(localStorage.getItem('alvand_customers')) || [];
    let operators = safeParse(localStorage.getItem('alvand_operators')) || [{id:1, username:'admin', password:'1234', role:'admin', perms:{clients:true, buffet:true, reservations:true, reports:true, income:true, expenses:true, customers:true, backup:true, operators:true, tariffs:true}}];
    let currentOperator = safeParse(localStorage.getItem('alvand_currentOperator')||'null');
    let walletHistory = safeParse(localStorage.getItem('alvand_walletHistory')||'[]');
    // Phase 3
    let currentTheme = localStorage.getItem('alvand_theme') || 'club';
    let alarmSound = localStorage.getItem('alvand_alarmSound') || 'beep';
    let alarmRepeat = parseInt(localStorage.getItem('alvand_alarmRepeat')||'3');
    let customAlarmData = localStorage.getItem('alvand_customAlarm') || null;
    // License system
    let activeLicense = safeParse(localStorage.getItem('alvand_license')||'null');
    let allLicenses = safeParse(localStorage.getItem('alvand_allLicenses')||'[]') || [];
    // ===== Firebase Config (FIXED: no hardcoded secrets; see config.example.json) =====
    /* The Firebase config can arrive late (config.js loads it) and the SDK
     * itself is a `defer` CDN tag, so both may still be missing when app.js
     * runs. Read them lazily on every call instead of deciding once at load. */
    function fbConfig(){
        const c = window.APP_CONFIG && window.APP_CONFIG.firebase;
        return (c && c.apiKey) ? c : null;
    }
    let firebaseReady = false;
    function ensureFirebase(){
        try{
            const cfg = fbConfig();
            if(!cfg){ firebaseReady = false; return false; }
            if(typeof firebase === 'undefined'){ firebaseReady = false; return false; }
            if(firebase.apps && firebase.apps.length){ firebaseReady = true; return true; }
            firebase.initializeApp(cfg);
            firebaseReady = true; return true;
        }catch(e){ console.log('firebase init fail', e); firebaseReady = false; return false; }
    }
    try { ensureFirebase(); } catch(e){ firebaseReady = false; }
    try { window.ensureFirebase = ensureFirebase; } catch(_e){}
    function firebaseKey(k){ return String(k==null?'':k).replace(/[^A-Z0-9]/gi,'_'); }
    function updateFirebaseStatus(){
        let el=document.getElementById('firebaseStatus');
        if(!el) return;
        ensureFirebase();
        if(!firebaseReady){
            el.textContent = window.__configLoadFailed
                ? 'حالت محلی (فایل تنظیمات سرور پیدا نشد)'
                : (fbConfig() ? 'در انتظار بارگذاری کتابخانه...' : 'حالت محلی (سرور تنظیم نشده)');
            el.style.color='#f59e0b'; return;
        }
        el.textContent='متصل به سرور ✅'; el.style.color='#22c55e';
    }
    // the CDN SDK tags are deferred: keep trying for a while, then give up
    try {
        if (fbConfig() && typeof window.__fbRetry === 'undefined') {
            window.__fbRetry = true;
            let _n = 0;
            const _iv = setInterval(function(){
                _n++;
                if (ensureFirebase()) { clearInterval(_iv); updateFirebaseStatus(); }
                else if (_n > 60) { clearInterval(_iv); updateFirebaseStatus(); }
            }, 400);
        }
    } catch(e){}
    let roundingMode = localStorage.getItem('alvand_rounding') || 'none';
    let stationTypes = safeParse(localStorage.getItem('alvand_stationTypes')) || null;
    if(!stationTypes || !stationTypes.length){
        stationTypes = [
            {id:'pc', name:'کامپیوتر', icon:'🖥️', price:20000},
            {id:'ps', name:'پلی‌استیشن', icon:'🎮', price:30000},
            {id:'xbox', name:'ایکس‌باکس', icon:'🕹️', price:30000},
            {id:'foosball', name:'فوتبال دستی', icon:'⚽', price:15000},
            {id:'billiard', name:'بیلیارد', icon:'🎱', price:25000}
        ];
        try{ localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes)); }catch(e){}
    }
    let clientTypeFilter = '';
    let serviceFilter = 'all';
    let sessions = safeParse(localStorage.getItem('alvand_sessions')) || [];
    let reservations = safeParse(localStorage.getItem('alvand_reservations')) || [];
    let currentTimeClient = null;
    // new-features.js reads window.currentTimeClient to show "who is playing
    // right now" in the customer portal / POS; it was undefined, so the portal
    // always looked idle.
    publishState('currentTimeClient', () => currentTimeClient, v => { currentTimeClient = v; });
    let timerInterval = null;
    let currentFilter = 'all';
    let currentPdfBlob = null;
    let currentPdfFilename = '';
    let currentShareText = '';
    let alarmClientIndex = null;
    let alarmInterval = null;

    // ===== NEW FEATURES: Phase 1-3 Data Stores =====
    // These 8 stores are OWNED BY new-features.js (membershipPlans,
    // customerMemberships, gameHistory, hourlyUsage, notifications,
    // activityLog, employees, attendance).
    // app.js used to declare its own copies of the same arrays and rewrite them
    // from saveData() every 15s, which silently wiped whatever new-features.js
    // had just written (activity log, notifications, game history, employee
    // records, membership plans...). app.js never read them, so the duplicates
    // are gone - new-features.js is the single source of truth and persists each
    // store itself. Do NOT re-add them here.

    // Migration for old clients
    clients.forEach(c=>{
        if(c.timerDuration===undefined) c.timerDuration = c.timerDuration||0;
        if(c.timerDurationSec===undefined && c.timerDuration) c.timerDurationSec = c.timerDuration*60;
        if(c.timerEnabled===undefined) c.timerEnabled = !!c.timerDuration;
        if(c.notified===undefined) c.notified = false;
        if(!c.reservations) c.reservations=[];
    });

    

    // ========== PHASE 2: Customers, Wallet, Rank, Birthday, Operators ==========
    function getRank(hours){
        if(hours>=200) return {name:'💎 الماس', cls:'rank-diamond', discount:25};
        if(hours>=100) return {name:'🏆 پلاتین', cls:'rank-platinum', discount:20};
        if(hours>=50) return {name:'🥇 طلا', cls:'rank-gold', discount:15};
        if(hours>=20) return {name:'🥈 نقره', cls:'rank-silver', discount:10};
        if(hours>=5) return {name:'🥉 برنز', cls:'rank-bronze', discount:5};
        return {name:'🆕 تازه‌کار', cls:'rank-bronze', discount:0};
    }
    function checkLogin(){
        if(!currentOperator){
            document.getElementById('loginOverlay').style.display='flex';
        } else {
            document.getElementById('loginOverlay').style.display='none';
            updateOperatorBar();
            applyPerms();
        }
    }
    function doLogin(){
        let u=document.getElementById('loginUser').value.trim();
        let p=document.getElementById('loginPass').value.trim();
        let op=operators.find(x=>x.username===u && x.password===p);
        let err=document.getElementById('loginError');
        if(!op){ err.textContent='نام کاربری یا رمز اشتباه'; err.style.display='block'; return; }
        currentOperator=op;
        localStorage.setItem('alvand_currentOperator', JSON.stringify(op));
        document.getElementById('loginOverlay').style.display='none';
        updateOperatorBar(); applyPerms();
        showToast('خوش آمدید '+op.username,'success');
        err.style.display='none';
    }
    function logoutOperator(){
        currentOperator=null;
        localStorage.removeItem('alvand_currentOperator');
        checkLogin();
        showToast('خارج شدید','warning');
    }
    function updateOperatorBar(){
        let el=document.getElementById('operatorNameDisplay');
        if(!el) return;
        if(currentOperator) el.textContent=(currentOperator.role==='admin'?'👑 ':'👤 ')+currentOperator.username + (currentOperator.role==='admin'?' (مدیر)':' (اپراتور)');
        else el.textContent='👤 مهمان';
        try{ syncAdminCredCard(); }catch(e){}
    }
    function applyPerms(){
        if(!currentOperator || currentOperator.role==='admin'){
            document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('operator-locked'));
            document.querySelectorAll('.nav-group').forEach(el=>el.classList.remove('group-all-locked'));
            let navOp=document.getElementById('navOperators'); if(navOp) navOp.style.display='';
            let subLic=document.getElementById('settingsSubLicense'); if(subLic) subLic.style.display='';
            return;
        }
        // lock nav
        document.querySelectorAll('.nav-item').forEach(el=>{
            let sec=el.getAttribute('onclick')?.match(/showSection\('([^']+)'/);
            if(sec){
                let s=sec[1];
                if(!hasPerm(s)) el.classList.add('operator-locked');
                else el.classList.remove('operator-locked');
            }
        });
        // a group whose every child is locked is useless -> grey the header out
        document.querySelectorAll('.nav-group').forEach(g=>{
            const items=g.querySelectorAll('.nav-item');
            if(!items.length){ g.classList.remove('group-all-locked'); return; }
            let locked=0; items.forEach(i=>{ if(i.classList.contains('operator-locked')) locked++; });
            g.classList.toggle('group-all-locked', locked>0 && locked===items.length);
        });
        let navOp=document.getElementById('navOperators'); if(navOp) navOp.style.display='none';
        let subLic2=document.getElementById('settingsSubLicense'); if(subLic2) subLic2.style.display = hasPerm('license') ? '' : 'none';
    }
    function openOperatorModal(){
        if(!requirePerm('operators','مدیریت اپراتورها')) return;
        if(currentOperator?.role!=='admin'){ showToast('فقط مدیر','error'); return; }
        document.getElementById('opId').value='';
        document.getElementById('opUser').value='';
        document.getElementById('opPass').value='';
        document.getElementById('opRole').value='operator';
        document.getElementById('operatorModal').classList.add('show');
    }
    function editOperator(id){
        let op=operators.find(x=>x.id===id);
        if(!op) return;
        document.getElementById('opId').value=op.id;
        document.getElementById('opUser').value=op.username;
        /* The stored value is a PBKDF2 hash. Showing it here meant that saving
         * the form (e.g. only to flip a permission) re-hashed the hash and the
         * operator lost their password for good. The field is write-only. */
        const _pass=document.getElementById('opPass');
        if(_pass){ _pass.value=''; _pass.placeholder='خالی = رمز فعلی بدون تغییر'; }
        document.getElementById('opRole').value=op.role;
        let p=op.perms||{};
        document.getElementById('permClients').checked=!!p.clients;
        document.getElementById('permBuffet').checked=!!p.buffet;
        document.getElementById('permReservations').checked=!!p.reservations;
        document.getElementById('permReports').checked=!!p.reports;
        document.getElementById('permIncome').checked=!!p.income;
        document.getElementById('permExpenses').checked=!!p.expenses;
        document.getElementById('permCustomers').checked=!!p.customers;
        document.getElementById('permBackup').checked=!!p.backup;
        document.getElementById('permTariffs').checked=!!p.tariffs;
        document.getElementById('permEmployees').checked=!!p.employees;
        document.getElementById('permOperators').checked=!!p.operators;
        document.getElementById('operatorModal').classList.add('show');
    }
    function saveOperator(){
        let id=document.getElementById('opId').value;
        let username=document.getElementById('opUser').value.trim();
        let password=document.getElementById('opPass').value.trim();
        let role=document.getElementById('opRole').value;
        // on EDIT an empty password means "keep it"; the field is never
        // pre-filled with the stored hash, so this cannot wipe a password
        if(!username || (!password && !document.getElementById('opId').value)){ showToast('نام و رمز','error'); return; }
        let perms={
            clients:document.getElementById('permClients').checked,
            buffet:document.getElementById('permBuffet').checked,
            reservations:document.getElementById('permReservations').checked,
            reports:document.getElementById('permReports').checked,
            income:document.getElementById('permIncome').checked,
            expenses:document.getElementById('permExpenses').checked,
            customers:document.getElementById('permCustomers').checked,
            backup:document.getElementById('permBackup').checked,
            tariffs:!!(document.getElementById('permTariffs')||{}).checked,
            employees:!!(document.getElementById('permEmployees')||{}).checked,
            operators:!!(document.getElementById('permOperators')||{}).checked
        };
        if(id){
            let op=operators.find(x=>String(x.id)===String(id));
            if(!op){ showToast('اپراتور پیدا نشد','error'); return; }
            const wasBlank=!password;   // the field is write-only, so empty = keep the current one
            // demoting the last admin would lock the shop out
            if(op.role==='admin' && role!=='admin' && operators.filter(x=>x.role==='admin').length<=1){
                showToast('آخرین مدیر را نمی‌توان به اپراتور تغییر داد','error'); return;
            }
            Object.assign(op,{username,role,perms});
            // only overwrite the stored secret when a NEW password was typed
            if(!wasBlank) op.password=password;
        } else {
            if(operators.find(x=>x.username===username)){ showToast('نام تکراری','error'); return; }
            operators.push({id:Date.now(), username,password,role,perms});
        }
        try{ localStorage.setItem('alvand_operators', JSON.stringify(operators)); }catch(e){}
        closeModal('operatorModal');
        renderOperators();
        showToast('اپراتور ذخیره شد','success');
    }
    function deleteOperator(id){
        if(!requirePerm('operators','حذف اپراتور')) return;
        const target = operators.find(x=>String(x.id)===String(id));
        if(!target){ showToast('اپراتور پیدا نشد','error'); return; }
        if(target.role==='admin'){
            // Never remove or demote the last admin: that locks the shop out of
            // its own data with no way back in.
            const admins = operators.filter(x=>x.role==='admin');
            if(admins.length<=1){ showToast('آخرین مدیر را نمی‌توان حذف کرد','error'); return; }
            if(!confirm('این کاربر مدیر است. حذف شود؟')) return;
        } else {
            if(!confirm('حذف شود؟')) return;
        }
        operators=operators.filter(x=>String(x.id)!==String(id));
        // keep at least one admin
        if(!operators.some(x=>x.role==='admin') && operators.length){
            operators[0].role='admin';
            showToast('نقش '+operators[0].username+' به مدیر تغییر کرد','warning');
        }
        try{ localStorage.setItem('alvand_operators', JSON.stringify(operators)); }catch(e){}
        renderOperators();
        showToast('اپراتور حذف شد','success');
    }
    function getAdminOp(){
        const admins = operators.filter(x=>x.role==='admin');
        return admins[0] || operators.find(x=>x.id===1) || operators[0] || null;
    }
    function syncAdminCredCard(){
        // Only admins may see/use the credential card in Settings
        const card=document.getElementById('adminCredCard');
        if(!card) return;
        const isAdmin = !!(currentOperator && currentOperator.role==='admin');
        card.style.display = isAdmin ? '' : 'none';
        if(!isAdmin) return;
        const adm=getAdminOp();
        const cur=document.getElementById('adminCredCurrent');
        if(cur) cur.textContent = adm? adm.username : '-';
        const nu=document.getElementById('adminCredUser');
        if(nu && document.activeElement!==nu) nu.value = adm? adm.username : '';
    }
    async function changeAdminCredentials(){
        if(!requirePerm('operators','تغییر رمز مدیر')) return;
        if(!currentOperator || currentOperator.role!=='admin'){ showToast('فقط مدیر','error'); return; }
        const adm=getAdminOp();
        if(!adm){ showToast('حساب مدیر پیدا نشد','error'); return; }
        const nuEl=document.getElementById('adminCredUser');
        const p1El=document.getElementById('adminCredPass1');
        const p2El=document.getElementById('adminCredPass2');
        const nu=(nuEl?nuEl.value:'').trim();
        const p1=p1El?p1El.value:'';
        const p2=p2El?p2El.value:'';
        if(!nu){ showToast('نام کاربری را وارد کن','error'); return; }
        if(operators.some(x=>x!==adm && x.username===nu)){ showToast('این نام کاربری تکراری است','error'); return; }
        if(p1||p2){
            if(p1!==p2){ showToast('تکرار رمز یکی نیست','error'); return; }
            if(p1.length<4){ showToast('رمز حداقل ۴ کاراکتر','error'); return; }
            try { adm.password = await window.sha256hex('gamenet::'+p1); }
            catch(e){ showToast('خطا در ذخیره رمز','error'); return; }
        }
        adm.username=nu;
        try{ localStorage.setItem('alvand_operators', JSON.stringify(operators)); }catch(e){ showToast('خطا در ذخیره','error'); return; }
        if(currentOperator && currentOperator.id===adm.id){
            try{ localStorage.setItem('alvand_currentOperator', JSON.stringify(currentOperator)); }catch(e){}
            updateOperatorBar();
        }
        if(p1El) p1El.value='';
        if(p2El) p2El.value='';
        try{ renderOperators(); }catch(e){}
        syncAdminCredCard();
        showToast('مشخصات مدیر ذخیره شد ✅','success');
    }
    function renderOperators(){
        let list=document.getElementById('operatorsList');
        if(!list) return;
        list.innerHTML=operators.map(op=>`
            <div class="glass" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <p style="font-weight:800;">${escapeHtml(op.username)} <span style="font-size:0.7rem; padding:2px 8px; border-radius:50px; background:${op.role==='admin'?'#22c55e':'#6366f1'}; color:white;">${op.role==='admin'?'مدیر':'اپراتور'}</span></p>
                    <p style="font-size:0.75rem; color:rgba(255,255,255,0.5);">رمز: ••••</p>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="editOperator(${numId(op.id)})">✏️</button>
                    <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteOperator(${numId(op.id)})">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // Customers Enhanced
    function renderCustomersEnhanced(){
        // override old renderCustomers if exists
        let container=document.getElementById('customersList');
        if(!container) return;
        if(customers.length===0){
            container.innerHTML=`<div class="glass" style="padding:20px; text-align:center;"><p style="color:rgba(255,255,255,0.5);">هنوز مشتری ثبت نشده</p><button class="glass-btn glass-btn-success" style="margin-top:12px;" onclick="openCustomerModal()">+ افزودن مشتری</button></div>`;
            return;
        }
        // birthday check
        let now=new Date();
        container.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><p style="color:rgba(255,255,255,0.5); font-size:0.85rem;">${customers.length} مشتری</p><button class="glass-btn glass-btn-success" style="padding:8px 14px; font-size:0.8rem;" onclick="openCustomerModal()">+ مشتری</button></div>` +
        `<div style="display:grid; gap:10px;">` + customers.map(c=>{
            let rank=getRank(c.totalHours||0);
            let isBirthday = c.birthday && new Date(c.birthday).getMonth()===now.getMonth();
            let walletClass = (c.wallet||0) <0 ? 'wallet-negative' : 'wallet-card';
            return `
            <div class="glass ${walletClass}" style="padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h4 style="font-weight:800;">${escapeHtml(c.name)} ${isBirthday?'<span class="birthday-badge">🎂 تولد این ماه! 10% تخفیف</span>':''}</h4>
                        <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">📞 ${escapeHtml(c.phone||'-')} | 🎂 ${c.birthday||'-'} | ✉️ ${escapeHtml(c.email||'-')}</p>
                        <p style="font-size:0.75rem; margin-top:4px;"><span class="${rank.cls}" style="padding:2px 8px; border-radius:50px; font-size:0.7rem; font-weight:800;">${rank.name}</span> <span style="color:#22c55e;">${rank.discount}% تخفیف</span> | 🕒 ${Math.floor(c.totalHours||0)}h | 💰 ${ (c.totalSpent||0).toLocaleString('fa-IR')} تومان</p>
                    </div>
                    <div style="text-align:left;">
                        <p style="font-size:0.75rem; color:rgba(255,255,255,0.5);">کیف پول</p>
                        <p style="font-weight:900; color:${(c.wallet||0)<0?'#ef4444':'#22c55e'};">${(c.wallet||0).toLocaleString('fa-IR')} تومان</p>
                        ${(c.debt||0)>0?`<p style="font-size:0.7rem; color:#ef4444;">بدهی: ${c.debt.toLocaleString('fa-IR')}</p>`:''}
                    </div>
                </div>
                <div style="display:flex; gap:6px; margin-top:12px; flex-wrap:wrap;">
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="openCustomerModal(${numId(c.id)})">✏️ ویرایش</button>
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem; background:rgba(34,197,94,0.15);" onclick="quickCharge(${numId(c.id)})">💰 شارژ</button>
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" data-cust-name="${escapeHtml(c.name)}" data-cust-phone="${escapeHtml(c.phone||'')}" data-cust-email="${escapeHtml(c.email||'')}" onclick="sendReportToCustomerFromNode(this)">📤 ارسال</button>
                    <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteCustomer(${numId(c.id)})">🗑️</button>
                </div>
            </div>`;
        }).join('') + `</div>`;
    }
    // Override old renderCustomers
    /** Customers section = the customer DATABASE (wallet / rank / loyalty) plus the
        reservation roster and the operators list. Single definition on purpose:
        a second renderCustomers() used to shadow this one and hide the database. */
    function renderCustomers(){
        if(!requirePerm('customers','مشتریان')) return;
        try{ renderCustomersEnhanced(); }catch(e){}
        try{ renderCustomerRoster(); }catch(e){}
        try{ renderOperators(); }catch(e){}
    }
    // Roster button -> share modal, without building an inline JS string out of
    // user data (that was a stored-XSS hole: escapeHtml does not make a value
    // safe inside onclick="fn('...')").
    function sendReportToCustomerFromNode(node){
        if(!node) return;
        try{ openShareModalForCustomer(node.getAttribute('data-cust-name')||'', node.getAttribute('data-cust-phone')||'', node.getAttribute('data-cust-email')||''); }
        catch(e){ showToast('ارسال گزارش ممکن نشد','error'); }
    }
    function openCustomerModal(id=null){
        if(!requirePerm('customers','مشتریان')) return;
        if(id){
            let c=customers.find(x=>x.id===id);
            if(!c) return;
            document.getElementById('custId').value=c.id;
            document.getElementById('custName').value=c.name;
            document.getElementById('custPhone').value=c.phone||'';
            document.getElementById('custEmail').value=c.email||'';
            document.getElementById('custSocial').value=c.telegram||'';
            document.getElementById('custBirthday').value=c.birthday||'';
            document.getElementById('custWalletDisplay').textContent=(c.wallet||0).toLocaleString('fa-IR')+' تومان';
            document.getElementById('custHoursDisplay').textContent=Math.floor(c.totalHours||0)+'h';
            let rank=getRank(c.totalHours||0);
            document.getElementById('custRankDisplay').innerHTML='<span class="'+rank.cls+'" style="padding:2px 8px; border-radius:50px; font-size:0.7rem;">'+rank.name+'</span>';
            // history
            let hist=walletHistory.filter(h=>h.customerId===c.id).slice(-8).reverse();
            document.getElementById('custHistory').innerHTML = hist.length? hist.map(h=>`<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);"><span>${new Date(h.date).toLocaleDateString('fa-IR')} ${h.action}</span><span style="color:${h.amount>0?'#22c55e':'#ef4444'};">${h.amount.toLocaleString('fa-IR')}</span></div>`).join('') : '<p style="color:rgba(255,255,255,0.4); text-align:center;">تاریخچه‌ای نیست</p>';
        } else {
            document.getElementById('custId').value='';
            document.getElementById('custName').value='';
            document.getElementById('custPhone').value='';
            document.getElementById('custEmail').value='';
            document.getElementById('custSocial').value='';
            document.getElementById('custBirthday').value='';
            document.getElementById('custWalletDisplay').textContent='0 تومان';
            document.getElementById('custHoursDisplay').textContent='0h';
            document.getElementById('custRankDisplay').textContent='-';
            document.getElementById('custHistory').innerHTML='<p style="color:rgba(255,255,255,0.4); text-align:center;">مشتری جدید</p>';
        }
        document.getElementById('customerModal').classList.add('show');
    }
    function saveCustomer(){
        let id=document.getElementById('custId').value;
        let name=document.getElementById('custName').value.trim();
        let phone=document.getElementById('custPhone').value.trim();
        let email=document.getElementById('custEmail').value.trim();
        let social=document.getElementById('custSocial').value.trim();
        let birthday=document.getElementById('custBirthday').value;
        if(!name){ showToast('نام الزامی','error'); return; }
        if(id){
            let c=customers.find(x=>x.id===parseInt(id));
            Object.assign(c,{name,phone,email, telegram:social, birthday});
        } else {
            customers.push({id:Date.now(), name,phone,email, telegram:social, birthday, wallet:0, debt:0, totalHours:0, totalSpent:0, createdAt:new Date().toISOString()});
        }
        localStorage.setItem('alvand_customers', JSON.stringify(customers));
        closeModal('customerModal');
        renderCustomersEnhanced();
        showToast('مشتری ذخیره شد','success');
    }
    function deleteCustomer(id){
        if(!requirePerm('customers','حذف مشتری')) return;
        if(!confirm('حذف شود؟')) return;
        customers=customers.filter(c=>c.id!==id);
        localStorage.setItem('alvand_customers', JSON.stringify(customers));
        renderCustomersEnhanced();
        showToast('حذف شد','success');
    }
    function quickCharge(id){
        if(!requirePerm('customers','شارژ کیف پول')) return;
        let c=customers.find(x=>x.id===id);
        if(!c) return;
        window._chargeId=id;
        document.getElementById('chargeCustomerName').textContent=c.name;
        document.getElementById('chargeAmount').value='';
        document.getElementById('chargeModal').classList.add('show');
        setTimeout(()=>{ try{ document.getElementById('chargeAmount').focus(); }catch(e){} },300);
    }
    function submitCharge(){
        let id=window._chargeId;
        let amount=parseFaNumber(document.getElementById('chargeAmount').value, 0);
        if(!amount||amount<=0){ showToast('مبلغ معتبر وارد کن','error'); return; }
        let c=customers.find(x=>x.id===id);
        if(!c) return;
        c.wallet=(c.wallet||0)+amount;
        walletHistory.push({customerId:id, amount, action:'شارژ', date:new Date().toISOString()});
        localStorage.setItem('alvand_customers', JSON.stringify(customers));
        localStorage.setItem('alvand_walletHistory', JSON.stringify(walletHistory));
        closeModal('chargeModal');
        renderCustomersEnhanced();
        showToast('شارژ شد','success');
    }
    function doWalletAction(){
        if(!requirePerm('customers','کیف پول')) return;
        let id=parseInt(document.getElementById('custId').value);
        if(!id){ showToast('اول مشتری را ذخیره کن','error'); return; }
        let raw=document.getElementById('walletAmount').value;
        let amount=(typeof parseFaNumber==='function')? parseFaNumber(raw,NaN) : (parseInt(raw)||0);
        if(!isFinite(amount) || amount<=0){ showToast('مبلغ وارد کن','error'); return; }
        amount=Math.floor(amount);
        let action=document.getElementById('walletAction').value;
        let c=customers.find(x=>x.id===id);
        if(!c){ showToast('مشتری پیدا نشد','error'); return; }
        const wallet0=Number(c.wallet)||0, debt0=Number(c.debt)||0;
        let delta=0;
        if(action==='charge'){ c.wallet=wallet0+amount; delta=amount; }
        else if(action==='deduct'){
            if(amount>wallet0){ showToast('موجودی کیف پول کافی نیست','error'); return; }
            c.wallet=wallet0-amount; delta=-amount;
        }
        else if(action==='debt'){
            if(amount>wallet0){ showToast('موجودی کیف پول کافی نیست','error'); return; }
            c.debt=debt0+amount; c.wallet=wallet0-amount; delta=-amount;
        }
        else if(action==='payDebt'){
            // Only what is actually owed may be paid back: the old code clamped
            // the debt to 0 but still credited the FULL amount to the wallet,
            // which handed the customer free money on every overpayment.
            if(debt0<=0){ showToast('این مشتری بدهی ندارد','error'); return; }
            const paid=Math.min(amount, debt0);
            if(paid<amount) showToast('فقط '+(paid).toLocaleString('fa-IR')+' تومان از بدهی کسر شد','warning');
            c.debt=debt0-paid; c.wallet=wallet0+paid; delta=paid;
        }
        else { showToast('عملیات نامعتبر','error'); return; }
        walletHistory.push({customerId:id, amount: delta, action, date:new Date().toISOString()});
        localStorage.setItem('alvand_customers', JSON.stringify(customers));
        localStorage.setItem('alvand_walletHistory', JSON.stringify(walletHistory));
        document.getElementById('custWalletDisplay').textContent=(c.wallet||0).toLocaleString('fa-IR')+' تومان';
        document.getElementById('walletAmount').value='';
        renderCustomersEnhanced();
        showToast('انجام شد','success');
    }
    /** True only on the customer's actual birthday (day+month), not for the whole
     *  month. A birthday field holds a YYYY-MM-DD string, which JS parses as UTC
     *  midnight, so the day is compared in UTC to stay stable across timezones. */
    function isBirthdayToday(birthday){
        if(!birthday) return false;
        const m=String(birthday).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if(!m) return false;
        const now=new Date();
        return (parseInt(m[2],10)-1)===now.getUTCMonth() && parseInt(m[3],10)===now.getUTCDate();
    }
    function checkBirthdays(){
        let now=new Date();
        let todays=(customers||[]).filter(c=> isBirthdayToday(c.birthday));
        if(todays.length>0){
            // show once per day
            let last=localStorage.getItem('alvand_birthdayShown');
            let todayStr=localDayKey(now);
            if(last!==todayStr){
                showToast('🎂 امروز تولد '+todays.map(c=>c.name).join('، ')+' هست! 10% تخفیف بده','warning');
                localStorage.setItem('alvand_birthdayShown', todayStr);
                // also notification
                if('Notification' in window && Notification.permission==='granted'){
                    try{ new Notification('🎂 تولد مشتری', {body: todays.map(c=>c.name).join('، ') + ' - تخفیف تولد'});}catch(e){}
                }
            }
        }
    }
    // Enhance confirmPayment to handle wallet and rank
    let origConfirmPayment = confirmPayment;
    /** Normalised name match. The old code used String.includes() both ways,
     *  so customer "علی" matched client "علی رضایی" and the discount/wallet of
     *  the wrong person was applied. Now it is an exact match after trimming,
     *  spaces and ZWNJ, with a phone match as a secondary. */
    function normPersonName(s){
        return String(s==null?'':s)
            .replace(/[\u200c\u200d\u064a]/g, m => (m==='\u064a'?'ی':''))
            .replace(/\s+/g,' ')
            .trim()
            .toLowerCase();
    }
    function findCustomerForPayment(pp){
        if(!pp) return null;
        const want = normPersonName(pp.clientName);
        const wantPhone = String(pp.phone||'').replace(/[^0-9]/g,'');
        if(!want && !wantPhone) return null;
        let byName=null, byPhone=null;
        for(const c of (customers||[])){
            if(!c) continue;
            if(!byName && want && normPersonName(c.name)===want) byName=c;
            const cp=String(c.phone||'').replace(/[^0-9]/g,'');
            if(!byPhone && wantPhone && cp && (cp===wantPhone || cp.slice(-10)===wantPhone.slice(-10))) byPhone=c;
            if(byName && byPhone) break;
        }
        return byName || byPhone || null;
    }
    confirmPayment = function(){
        // check if customer selected for discount
        if(pendingPayment){
            // package bundle replaces hourly game pricing (overage beyond minutes billed hourly)
            if(pendingPayment.package && pendingPayment.package.price>0){
                let pkg=pendingPayment.package;
                let overSec=Math.max(0,(pendingPayment.duration||0)-(pkg.minutes||0)*60);
                let overCost=0;
                if(overSec>0){
                    try{
                        let cc=clients.find(function(x){ return x && x.id===pendingPayment.clientId; }) || clients[pendingPayment.clientIdx];
                        let rate=cc? getTariffForClient(cc) : tariffs.single;
                        overCost=Math.round(overSec/3600*rate);
                    }catch(e){}
                }
                pendingPayment.baseTotal = pkg.price + overCost + (pendingPayment.buffetCost||0);
                pendingPayment.total = applyRounding(pendingPayment.baseTotal);
                showToast('🎁 پکیج '+pkg.name+' اعمال شد','success');
            }
            let cust=findCustomerForPayment(pendingPayment);
            if(cust){
                const baseTotal = pendingPayment.total;
                // apply rank discount
                let rank=getRank(cust.totalHours||0);
                if(rank.discount>0){
                    let disc=Math.round(pendingPayment.total * rank.discount/100);
                    pendingPayment.total -= disc;
                    showToast('🏆 تخفیف '+rank.name+' '+rank.discount+'% : -'+disc.toLocaleString('fa-IR'),'success');
                }
                // birthday discount (only on the exact birthday month+day)
                if(cust.birthday && isBirthdayToday(cust.birthday)){
                    let bDisc=Math.round(pendingPayment.total*0.10);
                    pendingPayment.total -= bDisc;
                    showToast('🎂 تخفیف تولد 10% : -'+bDisc.toLocaleString('fa-IR'),'success');
                }
                // reflect the discount in the payment modal so the number on
                // screen is the number that will be charged
                if(pendingPayment.total !== baseTotal){
                    pendingPayment.discount = baseTotal - pendingPayment.total;
                    try{
                        const tEl=document.getElementById('payTotal');
                        if(tEl) tEl.textContent = pendingPayment.total.toLocaleString('fa-IR') + ' تومان';
                        const info=document.getElementById('payRoundingInfo');
                        if(info) info.innerHTML = 'تخفیف اعمال‌شده: <b style="color:#22c55e">-'+(pendingPayment.discount).toLocaleString('fa-IR')+'</b> تومان (مبلغ اصلی: '+baseTotal.toLocaleString('fa-IR')+')';
                    }catch(_e){}
                }
                // try wallet payment
                if(cust.wallet > 0 && cust.wallet >= pendingPayment.total){
                    if(confirm('کیف پول '+cust.name+' موجودی کافی دارد ('+cust.wallet.toLocaleString('fa-IR')+') از کیف پول کسر شود؟')){
                        cust.wallet -= pendingPayment.total;
                        walletHistory.push({customerId:cust.id, amount:-pendingPayment.total, action:'پرداخت بازی', date:new Date().toISOString()});
                        pendingPayment.walletPaid = true;
                        showToast('از کیف پول کسر شد','success');
                    }
                }
                // update customer stats
                const dur=Number(pendingPayment.duration);
                cust.totalHours = (cust.totalHours||0) + (isFinite(dur) ? dur/3600 : 0);
                cust.totalSpent = (cust.totalSpent||0) + pendingPayment.total;
                localStorage.setItem('alvand_customers', JSON.stringify(customers));
                localStorage.setItem('alvand_walletHistory', JSON.stringify(walletHistory));
        localStorage.setItem('alvand_theme', currentTheme);
        localStorage.setItem('alvand_alarmSound', alarmSound);
        localStorage.setItem('alvand_alarmRepeat', alarmRepeat.toString());
            }
        }
        return origConfirmPayment();
    };

    
    // ========== PHASE 3: Themes, Lights, Station Hours, Yearly Charts ==========
    const themes = [
        {id:'club', name:'کلوپ', bg:'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', accent:'#d4f542'},
        {id:'ocean', name:'اقیانوس', bg:'linear-gradient(135deg, #001f3f 0%, #003366 50%, #00509d 100%)', accent:'#ffb020'},
        {id:'forest', name:'جنگل', bg:'linear-gradient(135deg, #0d1b0d 0%, #1a3a1a 50%, #2d5a2d 100%)', accent:'#ffcf40'},
        {id:'sunset', name:'غروب', bg:'linear-gradient(135deg, #4a0e0e 0%, #8b2500 50%, #ff6b35 100%)', accent:'#35c8ff'},
        {id:'neon', name:'نئون', bg:'linear-gradient(135deg, #0f0c29 0%, #ff00cc 50%, #333399 100%)', accent:'#00ffa3'},
        {id:'gold', name:'طلایی', bg:'linear-gradient(135deg, #3a2a00 0%, #b8860b 45%, #ffd700 70%, #ffec9e 100%)', accent:'#4fa8ff'},
        {id:'cyber', name:'سایبر', bg:'linear-gradient(135deg, #000000 0%, #1a1a2e 50%, #0f3460 100%)', accent:'#ff9e2c'},
        {id:'candy', name:'آبنباتی', bg:'linear-gradient(135deg, #ff6b9d 0%, #c44dff 50%, #6a82fb 100%)', accent:'#00c98a'},
        {id:'arctic', name:'قطبی', bg:'linear-gradient(135deg, #e0f7fa 0%, #80deea 50%, #00838f 100%)', accent:'#e85d1f'},
        {id:'volcano', name:'آتشفشان', bg:'linear-gradient(135deg, #1a0000 0%, #4a0000 50%, #8b0000 100%)', accent:'#ffd23f'},
        {id:'midnight', name:'نیمه‌شب', bg:'linear-gradient(135deg, #000000 0%, #0f0f0f 50%, #1a1a1a 100%)', accent:'#22d3ee'},
        {id:'emerald', name:'زمرد', bg:'linear-gradient(135deg, #004d40 0%, #00796b 50%, #00bfa5 100%)', accent:'#ff5d5d'},
        {id:'royal', name:'سلطنتی', bg:'linear-gradient(135deg, #1a0033 0%, #4a148c 50%, #7c4dff 100%)', accent:'#d8ff3e'},
        {id:'fire', name:'آتش', bg:'linear-gradient(135deg, #ff3d00 0%, #ff6d00 50%, #ff9e00 100%)', accent:'#2ea8ff'},
        {id:'ice', name:'یخی', bg:'linear-gradient(135deg, #0d47a1 0%, #1976d2 50%, #64b5f6 100%)', accent:'#ff6b4a'},
        {id:'matrix', name:'ماتریکس', bg:'linear-gradient(135deg, #001100 0%, #003300 50%, #00ff00 100%)', accent:'#ff4fd8'},
        {id:'luxury', name:'لوکس', bg:'linear-gradient(135deg, #212121 0%, #424242 50%, #bdbdbd 100%)', accent:'#7c3aed'},
        {id:'retro', name:'رترو', bg:'linear-gradient(135deg, #3e2723 0%, #5d4037 50%, #8d6e63 100%)', accent:'#41c8ff'},
        {id:'galaxy', name:'کهکشان', bg:'linear-gradient(135deg, #0b0c2a 0%, #1a1a40 50%, #4a148c 100%)', accent:'#c6ff4d'},
        {id:'desert', name:'کویر', bg:'linear-gradient(135deg, #3e2723 0%, #bf360c 50%, #ffab40 100%)', accent:'#3fa9ff'},
        {id:'roshan', name:'روشن', bg:'linear-gradient(135deg, #fffdf5 0%, #f9edd2 45%, #ecd9ac 100%)', accent:'#4f46e5'}
    ];
    function getThemeAccent(id){
        try{
            const t=themes.find(x=>x.id===(id||currentTheme));
            if(t && t.accent) return t.accent;
        }catch(e){}
        return '#d4f542';
    }
    function applyTheme(id){
        currentTheme=id;
        document.body.className = document.body.className.replace(/theme-\w+/g,'').trim();
        document.body.classList.add('theme-'+id);
        // The page background is painted on the ROOT element (see main.css): with UI
        // zoom on <body> a body-painted gradient used to stop mid-window and left a
        // hard seam. The theme class must therefore live on <html> as well, and the
        // gradient is handed over through --app-bg so CSS keeps owning the paint.
        try{
            const root=document.documentElement;
            root.className = root.className.replace(/theme-\w+/g,'').trim();
            root.classList.add('theme-'+id);
            const t=themes.find(x=>x.id===id);
            if(t && t.bg) root.style.setProperty('--app-bg', t.bg);
        }catch(e){}
        try{ document.documentElement.style.setProperty('--active-accent', getThemeAccent(id)); }catch(e){}
        localStorage.setItem('alvand_theme', id);
        renderThemeGrid();
        // let zoom.js re-assert its own inline styles on the same element
        try{ document.dispatchEvent(new CustomEvent('gamenet:theme', {detail:{theme:id}})); }catch(e){}
    }
    function loadLiteMode(){ try{ if(localStorage.getItem('alvand_lite')==='1') document.body.classList.add('lite'); }catch(e){} }
    function setLiteMode(v){ try{ localStorage.setItem('alvand_lite', v?'1':'0'); }catch(e){} try{ document.body.classList.toggle('lite', !!v); }catch(e){} try{ syncLiteUI(); }catch(e){} }
    function syncLiteUI(){ try{ const t=document.getElementById('liteModeToggle'); if(t) t.checked = localStorage.getItem('alvand_lite')==='1'; }catch(e){} }
    /* .length counts UTF-16 code units, not bytes, so a 5 MB database was
     * reported as 2.5 MB. Count real UTF-8 bytes (key + value) and surface
     * the quota: localStorage is ~5 MB per origin and once it is full every
     * saveData() throws, i.e. the app silently stops persisting. */
    function utf8Len(str){
        let n=0;
        for(let i=0;i<str.length;i++){
            const c=str.charCodeAt(i);
            if(c<0x80) n+=1; else if(c<0x800) n+=2;
            else if(c>=0xD800 && c<=0xDBFF && i+1<str.length && str.charCodeAt(i+1)>=0xDC00 && str.charCodeAt(i+1)<=0xDFFF){ n+=4; i++; }
            else n+=3;
        }
        return n;
    }
    function getDbSizeBytes(){
        try{
            let bytes=0;
            for(let i=0;i<localStorage.length;i++){
                const k=localStorage.key(i);
                if(k && k.indexOf('alvand_')===0) bytes+=utf8Len(k)+utf8Len(localStorage.getItem(k)||'');
            }
            return bytes;
        }catch(e){ return 0; }
    }
    function getDbSizeText(){
        const bytes=getDbSizeBytes();
        if(!bytes) return '0 کیلوبایت';
        if(bytes>=1048576) return (bytes/1048576).toFixed(2)+' مگابایت';
        return (bytes/1024).toFixed(1)+' کیلوبایت';
    }
    function updateDbSizeText(){
        try{
            const el=document.getElementById('dbSizeText');
            if(!el) return;
            const bytes=getDbSizeBytes();
            el.textContent=getDbSizeText();
            el.title=bytes.toLocaleString('fa-IR')+' بایت';
            const warn = bytes > 4*1024*1024;   // ~4 MB of the usual 5 MB quota
            el.style.color = warn ? '#ef4444' : '';
            if(warn && !el.dataset.warned){
                el.dataset.warned='1';
                showToast('حجم داده به بسیر است. از بخش هاششت سریس داده استفاده کنید،','error');
            } else if(!warn){ delete el.dataset.warned; }
        }catch(e){}
    }
    function pruneOldSessions(){
        if(!requirePerm('backup','پاکسازی داده‌ها')) return;
        const daysEl=document.getElementById('pruneDays');
        const days=Math.max(30, (typeof parseFaNumber==='function')? parseFaNumber(daysEl&&daysEl.value,365) : (parseInt(daysEl&&daysEl.value)||365));
        const cutoff=Date.now()-days*86400000;
        const isOld=(d)=>{ const t=new Date(d).getTime(); return !isNaN(t) && t<cutoff; };
        const oldS=sessions.filter(s=>isOld(s.date));
        const oldSales=sales.filter(s=>isOld(s.date));
        let pays=[]; try{ pays=safeParse(localStorage.getItem('alvand_payments')||'[]')||[]; }catch(e){ pays=[]; }
        const oldP=pays.filter(p=>isOld(p.date));
        if(!oldS.length && !oldSales.length && !oldP.length){ showToast('چیز قدیمی برای حذف نیست','success'); return; }
        if(!confirm(`🧹 ${oldS.length} سشن + ${oldSales.length} فروش بوفه + ${oldP.length} پرداخت قدیمی‌تر از ${days} روز حذف شود؟\nاول بکاپ خودکار گرفته می‌شود.`)) return;
        try{
            try{ createBackup(); }catch(e){}
            sessions=sessions.filter(s=>!isOld(s.date));
            sales=sales.filter(s=>!isOld(s.date));
            pays=pays.filter(p=>!isOld(p.date));
            try{ localStorage.setItem('alvand_payments', JSON.stringify(pays)); }catch(e){}
            saveData();
            try{ updateIncome(); }catch(e){}
            try{ updateStats(); }catch(e){}
            try{ renderWeeklyChart(); }catch(e){}
            updateDbSizeText(); updateBackupDisplay();
            showToast('پاکسازی شد (بکاپ قبلی ذخیره است)','success');
        }catch(e){ showToast('خطا در پاکسازی','error'); }
    }
    function renderThemeGrid(){
        let grid=document.getElementById('themeGrid');
        if(!grid) return;
        grid.innerHTML=themes.map(t=>`
            <div class="theme-card ${t.id===currentTheme?'active':''}" style="background:${t.bg};" onclick="applyTheme('${escapeHtml(jsStr(t.id))}')">
                <span>${escapeHtml(t.name)}</span>
            </div>
        `).join('');
    }
    function loadAlarmSettings(){
        let s1=document.getElementById('alarmSoundSelect'); if(s1) s1.value=alarmSound;
        let s2=document.getElementById('alarmRepeat'); if(s2) s2.value=alarmRepeat.toString();
    }
    /* the two <input type="month"> pickers start empty, so the user had to
     * remember the YYYY-MM format with no hint */
    function initCompareMonths(){
        try{
            const a=document.getElementById('compareMonth1'), b=document.getElementById('compareMonth2');
            if(!a||!b) return;
            const now=new Date();
            const key=d=>d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);
            if(!a.value) a.value=key(new Date(now.getFullYear(), now.getMonth()-1, 1));
            if(!b.value) b.value=key(now);
        }catch(e){}
    }
    function renderStationHours(){
        let container=document.getElementById('stationHoursList');
        if(!container) return;
        let todayStr=localDayKey(new Date());
        let stats=clients.map(c=>{
            let todaySessions=sessions.filter(s=> s.clientId===c.id && isSameDay(s.date, todayStr));
            let sessHours=todaySessions.reduce((sum,s)=>sum+s.duration/3600,0);
            let currentHours= c.status==='online' ? (c.elapsed||0)/3600 : 0;
            let total=sessHours + currentHours;
            return {name:c.name, hours:total, status:c.status};
        }).sort((a,b)=> b.hours - a.hours);
        let maxHours=Math.max(...stats.map(s=>s.hours), 1);
        // the bar used a hardcoded 8h divisor, so maxHours was dead code
        const barScale=Math.max(maxHours, 8);
        let totalAll=stats.reduce((s,x)=>s+x.hours,0);
        let avg=stats.length? totalAll/stats.length:0;
        let most=stats[0];
        container.innerHTML=stats.map(st=>`
            <div class="glass" style="padding:16px; display:flex; justify-content:space-between; align-items:center; ${st.hours>6?'border-color:rgba(34,197,94,0.3);':''}">
                <div style="flex:1;">
                    <p style="font-weight:800;">${escapeHtml(st.name)} <span style="font-size:0.7rem; padding:2px 6px; border-radius:50px; background:${st.status==='online'?'#22c55e':st.status==='paused'?'#f59e0b':'#64748b'}; color:white;">${st.status==='online'?'فعال':st.status==='paused'?'متوقف':'آفلاین'}</span></p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${Math.min(100,(st.hours/barScale)*100)}%;"></div></div>
                    <p style="font-size:0.75rem; color:rgba(255,255,255,0.5); margin-top:4px;">${st.hours.toFixed(2)} ساعت امروز</p>
                </div>
                <div style="text-align:left; margin-right:12px;">
                    <p style="font-weight:900; color:#22c55e;">${st.hours.toFixed(1)}h</p>
                    <p style="font-size:0.7rem; color:rgba(255,255,255,0.4);">${Math.round((st.hours/8)*100)}% ظرفیت</p>
                </div>
            </div>
        `).join('');
        let el1=document.getElementById('totalHoursToday'); if(el1) el1.textContent=totalAll.toFixed(1)+'h';
        let el2=document.getElementById('avgHoursToday'); if(el2) el2.textContent=avg.toFixed(1)+'h';
        let el3=document.getElementById('mostActiveStation'); if(el3) el3.textContent=most? most.name+' ('+most.hours.toFixed(1)+'h)':'-';
        // also update yearly chart if visible
        renderYearlyChart();
    }
    function renderYearlyChart(){
        let cont=document.getElementById('yearlyChartContainer');
        let chart=document.getElementById('yearlyChart');
        let labels=document.getElementById('yearlyLabels');
        if(!chart||!labels||!cont) return;   // markup may be absent in an older build
        const num=v=>(typeof toNum==='function')? toNum(v,0) : (Number(v)||0);
        let now=new Date();
        let months=[];
        for(let i=0;i<12;i++){
            let m=new Date(now.getFullYear(), i, 1);
            let inMonth=d=>d.getFullYear()===now.getFullYear() && d.getMonth()===i;
            let inc=sessions.filter(s=>inMonth(new Date(s.date))).reduce((sum,s)=>sum+num(s.cost),0);
            let buff=sales.filter(s=>inMonth(new Date(s.date))).reduce((sum,s)=>sum+num(s.price)*num(s.qty),0);
            inc+=buff;
            months.push({label:m.toLocaleDateString('fa-IR',{month:'short'}), inc});
        }
        let max=Math.max(...months.map(m=>m.inc),1);
        chart.innerHTML=months.map(m=>`
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
                <div style="font-size:0.65rem; color:rgba(255,255,255,0.6);">${(m.inc/1000).toFixed(0)}k</div>
                <div class="chart-bar" style="width:100%; max-width:32px; height:${(m.inc/max)*140}px;"></div>
            </div>
        `).join('');
        labels.innerHTML=months.map(m=>`<span style="flex:1; text-align:center;">${m.label}</span>`).join('');
        cont.style.display='block';
    }
    function compareMonths(){
        const el1=document.getElementById('compareMonth1'), el2=document.getElementById('compareMonth2');
        if(!el1||!el2){ showToast('ابزار مقایسه آمادنیست','error'); return; }
        let m1=el1.value, m2=el2.value;
        if(!m1||!m2){ showToast('دو ماه انتخاب کن','error'); return; }
        let d1=new Date(m1+'-01'); let d2=new Date(m2+'-01');
        let inc1=sessions.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d1.getFullYear() && d.getMonth()===d1.getMonth(); }).reduce((sum,s)=>sum+(s.cost||0),0) + sales.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d1.getFullYear() && d.getMonth()===d1.getMonth(); }).reduce((sum,s)=>sum+s.price*s.qty,0);
        let inc2=sessions.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d2.getFullYear() && d.getMonth()===d2.getMonth(); }).reduce((sum,s)=>sum+(s.cost||0),0) + sales.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d2.getFullYear() && d.getMonth()===d2.getMonth(); }).reduce((sum,s)=>sum+s.price*s.qty,0);
        let exp1=expenses.filter(e=>{ let d=new Date(e.date); return d.getFullYear()===d1.getFullYear() && d.getMonth()===d1.getMonth(); }).reduce((sum,e)=>sum+e.amount,0);
        let exp2=expenses.filter(e=>{ let d=new Date(e.date); return d.getFullYear()===d2.getFullYear() && d.getMonth()===d2.getMonth(); }).reduce((sum,e)=>sum+e.amount,0);
        let max=Math.max(inc1,inc2,exp1,exp2,1);
        let cont=document.getElementById('compareChartContainer');
        let chart=document.getElementById('compareChart');
        if(!cont||!chart){ showToast('ابزار نمایش در حال نیست','error'); return; }
        cont.style.display='block';
        chart.innerHTML=`
            <div style="flex:1; text-align:center;">
                <h4 style="margin-bottom:8px;">${m1}</h4>
                <div style="background:rgba(99,102,241,0.15); border-radius:12px; padding:12px; margin-bottom:8px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">درآمد</p>
                    <p style="font-weight:900; color:#22c55e;">${inc1.toLocaleString('fa-IR')}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(inc1/max)*100}%; background:linear-gradient(90deg, #6366f1, #22c55e);"></div></div>
                </div>
                <div style="background:rgba(239,68,68,0.12); border-radius:12px; padding:12px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">هزینه</p>
                    <p style="font-weight:900; color:#ef4444;">${exp1.toLocaleString('fa-IR')}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(exp1/max)*100}%; background:linear-gradient(90deg, #ef4444, #f59e0b);"></div></div>
                </div>
                <p style="margin-top:8px; font-weight:800; color:${inc1-exp1>=0?'#22c55e':'#ef4444'};">سود: ${(inc1-exp1).toLocaleString('fa-IR')}</p>
            </div>
            <div style="flex:1; text-align:center;">
                <h4 style="margin-bottom:8px;">${m2}</h4>
                <div style="background:rgba(99,102,241,0.15); border-radius:12px; padding:12px; margin-bottom:8px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">درآمد</p>
                    <p style="font-weight:900; color:#22c55e;">${inc2.toLocaleString('fa-IR')}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(inc2/max)*100}%; background:linear-gradient(90deg, #6366f1, #22c55e);"></div></div>
                </div>
                <div style="background:rgba(239,68,68,0.12); border-radius:12px; padding:12px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">هزینه</p>
                    <p style="font-weight:900; color:#ef4444;">${exp2.toLocaleString('fa-IR')}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(exp2/max)*100}%; background:linear-gradient(90deg, #ef4444, #f59e0b);"></div></div>
                </div>
                <p style="margin-top:8px; font-weight:800; color:${inc2-exp2>=0?'#22c55e':'#ef4444'};">سود: ${(inc2-exp2).toLocaleString('fa-IR')}</p>
            </div>
        `;
        // also show diff
        let diff=inc2-inc1;
        showToast((diff>=0?'📈 رشد ':'📉 افت ')+Math.abs(diff).toLocaleString('fa-IR')+' تومان','success');
    }
    // Override generateReport to handle yearly
    let origGenerateReport = generateReport;
    generateReport = function(type){
        if(type==='yearly'){
            document.getElementById('btnDaily')?.classList.remove('glass-btn-success');
            document.getElementById('btnWeekly')?.classList.remove('glass-btn-success');
            document.getElementById('btnMonthly')?.classList.remove('glass-btn-success');
            document.getElementById('btnYearly')?.classList.add('glass-btn-success');
            let now=new Date();
            let filtered=sessions.filter(s=> new Date(s.date).getFullYear()===now.getFullYear());
            let total=filtered.reduce((sum,s)=>sum+(s.cost||0),0) + sales.filter(s=> new Date(s.date).getFullYear()===now.getFullYear()).reduce((sum,s)=>sum+s.price*s.qty,0);
            let html=`<h3 style="text-align:center; margin-bottom:16px;">گزارش سالانه ${now.getFullYear()}</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
                <div class="glass" style="padding:16px; text-align:center;"><p style="color:rgba(255,255,255,0.5);">تعداد سشن</p><p style="font-size:1.5rem; font-weight:900; color:#818cf8;">${filtered.length}</p></div>
                <div class="glass" style="padding:16px; text-align:center;"><p style="color:rgba(255,255,255,0.5);">درآمد کل سال</p><p style="font-size:1.5rem; font-weight:900; color:#22c55e;">${total.toLocaleString('fa-IR')} تومان</p></div>
            </div>`;
            document.getElementById('reportContent').innerHTML=html;
            renderYearlyChart();
            return;
        }
        return origGenerateReport(type);
    };

    
    // ========== LICENSE SYSTEM ==========
    // The old forgeable scheme (licSecret/licHash/makeLicenseKey) is GONE from
    // the app: shipping a symmetric secret plus its hash function let anyone
    // mint licenses. Issuance lives only in the seller tool; the app verifies
    // RSA signatures (see src/js/license.js).
    function licPrice(cap){
        cap=parseInt(cap)||3;
        if(cap<=3) return 1000000;
        return 1000000 + (cap-3)*200000;
    }
    function updateGenPrice(){
        let cap=parseFaNumber(document.getElementById('genCapacity').value, 3)||3;
        document.getElementById('genPrice').textContent=licPrice(cap).toLocaleString('fa-IR')+' تومان';
    }
    /** Kept only so the old (hidden) issuance panel can never mint a key even if
     *  someone re-enables it in devtools. Always returns null. */
    function makeLicenseKey(){
        try { showToast('ساخت لایسنس فقط با ابزار فروشنده انجام می‌شود','error'); } catch(_e){}
        return null;
    }
    function parseLicenseKey(key){
        // Structural parse only (signature is verified async by LicVerify).
        // Legacy ALV- keys are ALWAYS rejected: their symmetric checksum was extractable from the app.
        try {
            if (window.LicVerify) {
                const r = window.LicVerify.parseToken(key);
                if (!r.structural) return {valid:false, error:r.error};
                return {valid:true, capacity:r.payload.cap, months:r.payload.months, _payload:r.payload, _needsVerify:true};
            }
        } catch(_e){}
        return {valid:false, error:'ماژول تأیید لایسنس لود نشده؛ برنامه را دوباره نصب کن.'};
    }
    function getDeviceId(){
        let id=localStorage.getItem('alvand_deviceId');
        if(!id){
            id=(typeof secureRandomId==='function'?secureRandomId('DEV',6,4):('DEV-'+Math.random().toString(36).substring(2,8).toUpperCase()+'-'+Date.now().toString(36).toUpperCase().slice(-4)));
            localStorage.setItem('alvand_deviceId', id);
        }
        return id;
    }
    /* Network probes. The old version leaked its abort timers and reused the
     * already-aborted controller for the fallback request, so once the first
     * fetch timed out the second one failed instantly and checkInternet()
     * always answered "offline" (which then skipped the device registration and
     * made the update check useless). Each request now gets its own controller
     * and the timer is always cleared. */
    async function fetchWithTimeout(url, ms, opts){
        const ctl=new AbortController();
        const t=setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, ms||6000);
        try{
            const o=Object.assign({}, opts||{});
            o.signal=ctl.signal;
            return await fetch(url, o);
        } finally { clearTimeout(t); }
    }
    async function getIP(){
        try{
            const r=await fetchWithTimeout('https://api.ipify.org?format=json', 6000);
            const j=await r.json();
            return (j && j.ip) ? j.ip : 'unknown';
        }catch(e){ return 'unknown'; }
    }
    async function checkInternet(){
        if(navigator && navigator.onLine===false) return false;
        try{
            await fetchWithTimeout('https://api.ipify.org?format=json', 5000, {mode:'cors'});
            return true;
        }catch(e){
            try{ await fetchWithTimeout('https://alvandcode.github.io/', 5000, {mode:'no-cors'}); return true; }catch(e2){ return false; }
        }
    }
    async function initLicenseGate(){
        // Belt & suspenders: the gate is already visible by default in HTML;
        // keep it up until (and unless) a valid signed license is proven.
        try{ showLicenseGate(); }catch(_e){}
        let devEl=document.getElementById('licDeviceId'); if(devEl) devEl.textContent=getDeviceId();
        // check existing SIGNED license: verify RSA signature + expiry + hardware bind
        try {
            const raw = localStorage.getItem('alvand_license');
            if (raw) {
                const stored = safeParse(raw, null);
                if (stored && stored.token && window.LicVerify) {
                    const res = await window.LicVerify.verifyLicenseToken(stored.token).catch(()=>({ok:false}));
                    if (res.ok && !window.LicVerify.isExpired(res.payload)) {
                        let fp='';
                        try { if (window.gamenet && window.gamenet.device) { const r=await window.gamenet.device.fingerprint(); if(r&&r.ok) fp=r.fp; } } catch(_e){}
                        if(!fp){ try{ fp='local-'+getDeviceId(); }catch(_e){ fp='local-unknown'; } }
                        if (stored.fp && stored.fp !== fp) {
                            window.__licState={status:'hw-mismatch', token:stored.token, payload:res.payload, fp};
                            try{ activeLicense=null; }catch(_e){}
                            showLicenseGate();
                            const e2=document.getElementById('licenseError');
                            if(e2){ e2.textContent='سخت‌افزار این دستگاه عوض شده. برای فعال‌سازی مجدد با فروشنده تماس بگیر.'; e2.style.display='block'; }
                            renderLicenseSection();
                            return;
                        }
                        window.__licState={status:'valid', token:stored.token, payload:res.payload, fp:stored.fp||fp};
                        try{ activeLicense=stored; }catch(_e){}
                        try{ await registerCurrentDevice(false); }catch(_e){}
                        hideLicenseGate();
                        renderLicenseSection();
                        return;
                    }
                }
            }
        } catch(_e){}
        try{ window.__licState={status:'invalid', token:null, payload:null, fp:null}; }catch(_e){}
        showLicenseGate();
        // fill IP async
        let ip=await getIP();
        let ipEl=document.getElementById('licIP'); if(ipEl) ipEl.textContent=ip;
        let net=await checkInternet();
        let st=document.getElementById('licNetStatus');
        if(st) st.innerHTML=net?'<span style="color:#22c55e;">● آنلاین</span>':'<span style="color:#ef4444;">● آفلاین - وصل شو</span>';
    }
    function isLicenseValid(lic){
        // Trust ONLY async-verified state (RSA signature checked at boot/activation).
        // Legacy {key} objects without a verified token are always invalid.
        try {
            const st = window.__licState;
            if(!st || st.status!=='valid' || !st.token || !lic || lic.token!==st.token) return false;
            if(st.payload && st.payload.exp && Date.now()>st.payload.exp) return false;
            return true;
        } catch(_e){ return false; }
    }
    function showLicenseGate(){
        document.getElementById('licenseOverlay').classList.add('show');
        document.body.style.overflow='hidden';
    }
    function hideLicenseGate(){
        document.getElementById('licenseOverlay').classList.remove('show');
        document.body.style.overflow='';
    }
    async function activateLicense(){
        const inputEl=document.getElementById('licenseKeyInput');
        const token=String(inputEl?inputEl.value:'').replace(/\s/g,'');
        let err=document.getElementById('licenseError');
        if(err) err.style.display='none';
        if(!token){ if(err){ err.textContent='کلید را وارد کن (یا فایل لایسنس را انتخاب کن)'; err.style.display='block'; } return; }
        showToast('در حال تأیید امضای لایسنس...','warning');
        let res;
        try { res = await window.LicVerify.verifyLicenseToken(token); }
        catch(e){ if(err){ err.textContent='خطا در تأیید امضا'; err.style.display='block'; } return; }
        if(!res.ok){ if(err){ err.textContent=res.error; err.style.display='block'; } return; }
        const p=res.payload;
        if(window.LicVerify.isExpired(p)){ if(err){ err.textContent='این لایسنس منقضی شده. برای تمدید با فروشنده تماس بگیر.'; err.style.display='block'; } return; }
        // hardware bind: this PC's fingerprint
        let fp='';
        try { if(window.gamenet && window.gamenet.device){ const r=await window.gamenet.device.fingerprint(); if(r&&r.ok) fp=r.fp; } } catch(_e){}
        if(!fp){ try{ fp='local-'+getDeviceId(); }catch(_e){ fp='local-unknown'; } }
        // capacity: distinct known devices (server + local) vs maxDev
        // (wrapped: ANY unexpected error here must surface in red, never die silent)
        let ip='unknown';
        try {
        let serverDevs=[];
        try { const s=await fbLoadActivations(p.id); if(s&&Array.isArray(s.devices)) serverDevs=s.devices; } catch(_e){}
        const devKey=(d)=>String((d&&(d.fp||d.id))||'');
        const known=new Set();
        serverDevs.forEach(d=>{ if(devKey(d)) known.add(devKey(d)); });
        if(!Array.isArray(allLicenses)) allLicenses=[];
        let rec=allLicenses.find(l=>l.keyId===p.id);
        const localDevs=(rec&&Array.isArray(rec.devices))?rec.devices:[];
        localDevs.forEach(d=>{ if(devKey(d)) known.add(devKey(d)); });
        const already=serverDevs.concat(localDevs).some(d=>devKey(d)===String(fp));
        if(!already){ known.add(String(fp)); }
        if(!already && known.size>=p.maxDev){ licCapacityError(); return; }
        // revoked on server?
        try { const meta=await fbLoadLicenseMeta(p.id); if(meta&&meta.revoked){ if(err){ err.textContent='این لایسنس توسط فروشنده باطل شده.'; err.style.display='block'; } return; } } catch(_e){}
        try{ ip=await getIP(); }catch(_e){}
        activeLicense={token, id:p.id, customer:p.customer, phone:p.phone, capacity:p.cap, months:p.months, exp:p.exp, maxDev:p.maxDev, fp, activatedAt:new Date().toISOString()};
        try{ localStorage.setItem('alvand_license', JSON.stringify(activeLicense)); }catch(_e){}
        const merged=[...serverDevs, ...localDevs];
        if(!merged.some(d=>devKey(d)===String(fp))) merged.push({fp:String(fp), id:String(fp), ip, date:new Date().toISOString()});
        if(rec){ rec.devices=merged.slice(-100); rec.customer=p.customer; rec.phone=p.phone; }
        else { allLicenses.push({key:token, keyId:p.id, capacity:p.cap, months:p.months, exp:p.exp, maxDev:p.maxDev, price:licPrice(p.cap), customer:p.customer, phone:p.phone, createdAt:new Date().toISOString(), devices:merged.slice(-100)}); }
        try{ localStorage.setItem('alvand_allLicenses', JSON.stringify(allLicenses)); }catch(_e){}
        } catch(e) {
            console.warn('activate failed', e);
            if(err){ err.textContent='خطای غیرمنتظره در فعال‌سازی. متن خطا را برای پشتیبانی بفرست: '+String((e&&e.message)||e); err.style.display='block'; }
            return;
        }
        try{ await fbPingActivation(p.id, fp); }catch(_e){}
        try{ window.__licState={status:'valid', token, payload:p, fp}; }catch(_e){}
        hideLicenseGate();
        renderLicenseSection();
        showToast('✅ فعال شد! خوش آمدی','success');
        let ipEl=document.getElementById('licIP'); if(ipEl) ipEl.textContent=ip;
    }
    async function registerCurrentDevice(showErr=true){
        try{
            const st=window.__licState;
            if(!st||st.status!=='valid'||!st.payload) return;
            const online=await checkInternet().catch(()=>false);
            if(!online) return;
            try{
                const meta=await fbLoadLicenseMeta(st.payload.id);
                if(meta&&meta.revoked){
                    window.__licState={status:'revoked', token:st.token, payload:st.payload, fp:st.fp};
                    try{ activeLicense=null; localStorage.removeItem('alvand_license'); }catch(_e){}
                    showLicenseGate();
                    const e2=document.getElementById('licenseError');
                    if(e2){ e2.textContent='این لایسنس توسط فروشنده باطل شده.'; e2.style.display='block'; }
                    renderLicenseSection();
                    return;
                }
            }catch(_e){}
            try{
                const srv=await fbLoadActivations(st.payload.id);
                const devs=(srv&&srv.devices)||[];
                const myFp=st.fp||'';
                if(myFp && !devs.find(d=>String((d&&(d.fp||d.id))||'')===String(myFp)) && devs.length>=st.payload.maxDev){
                    showLicenseGate();
                    licCapacityError();
                    return;
                }
                if(myFp) await fbPingActivation(st.payload.id, myFp);
            }catch(_e){}
        }catch(_e){}
    }
    function deactivateLicense(){
        if(!requirePerm('license','غیرفعال‌سازی لایسنس')) return;
        if(!confirm('لایسنس این دستگاه غیرفعال شود؟ (برای آزادسازی کامل ظرفیت، فروشنده هم باید در پنل تأیید کند)')) return;
        try{
            const st=window.__licState;
            const myFp=(st&&st.fp)||'';
            if(activeLicense){
                const id=activeLicense.id;
                const rec=allLicenses.find(l=>l.keyId===id);
                if(rec&&myFp){ rec.devices=(rec.devices||[]).filter(d=>String((d&&(d.fp||d.id))||'')!==String(myFp)); }
                try{ localStorage.setItem('alvand_allLicenses', JSON.stringify(allLicenses)); }catch(_e){}
            }
        }catch(_e){}
        activeLicense=null;
        try{ window.__licState={status:'invalid', token:null, payload:null, fp:null}; }catch(_e){}
        try{ localStorage.removeItem('alvand_license'); }catch(_e){}
        showLicenseGate();
        renderLicenseSection();
        showToast('غیرفعال شد','warning');
    }
    function generateLicenseUI(){
        // DISABLED FOR SECURITY: issuance moved to the seller tool (license-tools/gen-license.bat).
        // Keeping the panel would let any buyer mint their own keys (old flaw).
        try{ showToast('ساخت لایسنس فقط با ابزار فروشنده انجام می‌شود','error'); }catch(_e){}
        return;
    }
    function copyLastLicense(){
        showToast('ساخت لایسنس در برنامه انجام نمی‌شود','error');
    }
    function renderLicenseSection(){
        let info=document.getElementById('activeLicenseInfo');
        if(info){
            const st=(window.__licState||{});
            if(activeLicense && activeLicense.token && isLicenseValid(activeLicense) && st.payload){
                const p=st.payload;
                const rec=allLicenses.find(l=>l.keyId===p.id);
                const used=rec? rec.devices.length : 1;
                const expTxt=!p.exp? 'مادام‌العمر' : ('تا '+new Date(p.exp).toLocaleDateString('fa-IR'));
                const dl=window.LicVerify? window.LicVerify.daysLeft(p) : null;
                const dlTxt=(dl===null)? '' : (' | ⏳ '+dl+' روز مانده');
                const actDate=activeLicense.activatedAt? new Date(activeLicense.activatedAt).toLocaleDateString('fa-IR') : '-';
                info.innerHTML=`🔑 <span style="font-family:monospace; direction:ltr;">${escapeHtml(p.id)}</span><br>👤 ${escapeHtml(p.customer||'-')} | 📞 ${escapeHtml(p.phone||'-')}<br>👥 فعال‌سازی: <b>${used} از ${p.maxDev} دستگاه</b> | 🖥️ دستگاه: <b>${clients.length} از ${p.cap}</b> | 📅 ${expTxt}${dlTxt}<br>🚀 فعال‌سازی: <b>${actDate}</b>`;
                const fill=document.getElementById('licenseSlotFill'); if(fill) fill.style.width=Math.min(100,(used/Math.max(1,p.maxDev))*100)+'%';
                const stx=document.getElementById('licenseSlotText'); if(stx) stx.textContent=`استفاده شده: ${used} از ${p.maxDev}`;
                const adl=document.getElementById('activeDevicesList'); if(adl) adl.innerHTML=(rec?.devices||[]).map(d=>{ const f=String((d&&(d.fp||d.id))||''); return `<span class="device-pill">🖥️ ${escapeHtml(f.slice(0,12))}… | ${escapeHtml(d.ip||'')}</span>`; }).join('');
            } else {
                const hw=(window.__licState&&window.__licState.status==='hw-mismatch');
                info.innerHTML=hw? '<span style="color:#f59e0b;">⚠️ سخت‌افزار عوض شده — فعال‌سازی مجدد لازم است</span>'
                    : '<span style="color:#ef4444;">⛔ لایسنس فعال نیست — کلید ALV2 را وارد کن</span>';
            }
        }
        let list=document.getElementById('allLicensesList');
        if(list){
            const known=allLicenses.filter(l=>l.keyId);
            const legacy=allLicenses.filter(l=>!l.keyId);
            let html='';
            if(known.length===0 && legacy.length===0) html='<p style="text-align:center; color:rgba(255,255,255,0.4);">هنوز لایسنسی فعال نشده</p>';
            else html=known.slice().reverse().map((l,idx)=>{
                const realIdx=allLicenses.indexOf(l);
                return `<div class="glass" style="padding:14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div><p style="font-family:monospace; direction:ltr; font-weight:800;">${escapeHtml(l.keyId)}</p>
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">${escapeHtml(l.customer||'-')} | 📞 ${escapeHtml(l.phone||'-')} | ${l.capacity} کاربره | ${(l.devices||[]).length}/${l.maxDev||l.capacity} دستگاه</p></div>
                    <div style="display:flex; gap:6px;">
                        <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="copyLicense(${numId(realIdx)})">📋</button>
                        <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteLicense(${numId(realIdx)})">🗑️</button>
                    </div>
                </div>`;
            }).join('') + legacy.map(()=>{
                return `<div class="glass" style="padding:14px; margin-bottom:8px; opacity:0.6;"><p style="font-size:0.8rem; color:#f59e0b;">⚠️ رکورد قدیمی (ALV-...) — دیگر معتبر نیست. لایسنس ALV2 جدید بگیر.</p></div>`;
            }).join('');
            list.innerHTML=html;
        }
        try{
            // Issuance moved to seller tool: generation UI stays hidden for everyone.
            const gc=document.getElementById('licenseGenCard'); if(gc) gc.style.display='none';
            const note=document.getElementById('licenseSellerNote'); if(note) note.style.display='';
        }catch(e){}
        try{ updateGenPrice(); }catch(e){}
    }
    function copyLicense(i){ try{ const k=allLicenses[i]&&(allLicenses[i].key||''); if(!k){ showToast('چیزی برای کپی نیست','error'); return; } navigator.clipboard.writeText(k).then(()=>showToast('کپی شد','success')); }catch(e){ showToast('کپی نشد','error'); } }
    function deleteLicense(i){
        if(!confirm('حذف شود؟')) return;
        allLicenses.splice(i,1);
        localStorage.setItem('alvand_allLicenses', JSON.stringify(allLicenses));
        renderLicenseSection();
    }

    
    // ========== Firebase License Sync ==========
    /* fbSaveLicense / fbLoadLicense / arrayToObj / objToArray are intentionally
     * absent: the client is not allowed to write license records any more (see
     * database.rules.json) and the only live sync is the activation ping below.
     * The old pair keyed records by rec.key (the raw token) while the read path
     * used the license id, so a revoke written to one key was invisible in the
     * other. */
    // ========== Signed-license server sync (audit + revoke + capacity) ==========
    // Clients may only CREATE their own activation ping (see database.rules.json).
    // Full license records are NEVER written by clients anymore (old flaw).
    async function fbPingActivation(keyId, fp){
        if(!firebaseReady) return;
        try{
            let ip='unknown';
            try{ ip=await getIP(); }catch(_e){}
            await firebase.database().ref('activations/'+firebaseKey(keyId)+'/'+firebaseKey(fp||'unknown')).set({fp:fp||'unknown', ip, date:new Date().toISOString()});
        }catch(e){ console.log('fb ping fail', e); }
    }
    async function fbLoadActivations(keyId){
        if(!firebaseReady) return null;
        try{
            const snap=await firebase.database().ref('activations/'+firebaseKey(keyId)).once('value');
            const v=snap.val();
            if(!v) return {devices:[]};
            return {devices:Object.values(v)};
        }catch(e){ console.log('fb load fail', e); return null; }
    }
    async function fbLoadLicenseMeta(keyId){
        if(!firebaseReady) return null;
        try{
            const snap=await firebase.database().ref('licenses/'+firebaseKey(keyId)).once('value');
            return snap.val();
        }catch(e){ console.log('fb meta fail', e); return null; }
    }

    
    // ========== Update System v1.8 ==========
    // Single source of truth: config.js sets window.APP_VERSION (and the build
    // pipeline keeps it in sync with package.json). This used to be a second
    // hardcoded copy, so bumping one place left the update check and the
    // "current version" label stuck on the old number.
    const APP_VERSION = (typeof window.APP_VERSION === 'string' && window.APP_VERSION) ? window.APP_VERSION : '1.8.1';
    let latestRelease = null;
    function toggleSettingsMenu(el){
        // The settings block is a normal sidebar group now: same open/close logic,
        // kept under its own function name because the nav markup calls it.
        // Closed -> just open it; already open -> jump to the settings page.
        const g=document.querySelector('.nav-group[data-group="settings"]');
        if(g && !g.classList.contains('open')){ setNavGroupOpen('settings', true); return; }
        showSection('settings', el||document.getElementById('navSettings'));
    }
    // ---------- Sidebar groups ----------
    // The sidebar is one flat list of ~28 entries; related features (money,
    // customers, tools...) were impossible to tell apart. Items are grouped and
    // collapsible, the open/closed state is remembered per install.
    const NAV_GROUP_KEY = 'alvand_navGroups';
    function loadNavGroupState(){
        try{ return safeParse(localStorage.getItem(NAV_GROUP_KEY)||'null') || {}; }catch(e){ return {}; }
    }
    function saveNavGroupState(){
        const open={};
        document.querySelectorAll('.nav-group').forEach(g=>{
            const k=g.getAttribute('data-group'); if(!k) return;
            if(g.classList.contains('open')) open[k]=1;
        });
        try{ localStorage.setItem(NAV_GROUP_KEY, JSON.stringify(open)); }catch(e){}
    }
    function setNavGroupOpen(id, open, persist){
        const g=document.querySelector('.nav-group[data-group="'+id+'"]');
        if(!g) return false;
        g.classList.toggle('open', !!open);
        if(persist!==false) saveNavGroupState();
        return true;
    }
    function toggleNavGroup(id){
        const g=document.querySelector('.nav-group[data-group="'+id+'"]');
        if(!g) return;
        setNavGroupOpen(id, !g.classList.contains('open'));
    }
    function restoreNavGroups(){
        const state=loadNavGroupState();
        // first ever run: only the daily-ops group starts open
        const known=Object.keys(state).length>0;
        document.querySelectorAll('.nav-group').forEach(g=>{
            const k=g.getAttribute('data-group'); if(!k) return;
            setNavGroupOpen(k, known ? !!state[k] : (k==='ops'), false);
        });
        syncNavGroupBadges();
        saveNavGroupState();
    }
    /* Attribute values came from user data (section ids, client ids), so
     * pasting them straight into a CSS selector blew up on quotes/brackets:
     * "[onclick*=\"showSection('a\"b'\"]" is not a valid selector and the
     * DOM parser then throws. Filter in JS instead. */
    function byAttrValue(sel, attr, value){
        const want = String(value);
        let hit = null;
        document.querySelectorAll(sel).forEach(el=>{
            if(hit) return;
            if(String(el.getAttribute(attr) || '').indexOf(want) !== -1) hit = el;
        });
        return hit;
    }
    /** Sidebar entry (or settings sub-item) that owns <section>. */
    function navEntryForSection(section){
        if(!section) return null;
        const q = "showSection('" + section + "'";
        let hit = byAttrValue('.nav-item, .settings-sub-item', 'onclick', q);
        return hit;
    }
    /** Open the group that owns <section> and mark the group as "has active item". */
    function expandNavGroupForSection(section){
        if(!section) return;
        document.querySelectorAll('.nav-group').forEach(g=>g.classList.remove('has-active'));
        // matches both .nav-item entries and the .settings-sub-item buttons
        const item = navEntryForSection(section);
        if(!item) return;
        const group=item.closest('.nav-group');
        if(!group) return;
        if(!group.classList.contains('open')) setNavGroupOpen(group.getAttribute('data-group'), true, false);
        group.classList.add('has-active');
    }
    /** Show a red dot on group headers that own a section with pending items. */
    function syncNavGroupBadges(){
        document.querySelectorAll('.nav-group').forEach(g=>{
            let head=g.querySelector('.nav-group-head'); if(!head) return;
            let cnt=head.querySelector('.nav-group-count');
            let pending=0;
            g.querySelectorAll('.nav-item').forEach(it=>{
                const b=it.querySelector('span[id$="Badge"]');
                if(b && b.style.display!=='none' && b.textContent && b.textContent!=='0') pending++;
            });
            if(pending>0){
                if(!cnt){ cnt=document.createElement('span'); cnt.className='nav-group-count'; head.appendChild(cnt); }
                cnt.textContent=String(pending);
                head.style.color='#fca5a5';
            } else {
                if(cnt) cnt.remove();
                head.style.color='';
            }
        });
    }
    function parseVer(v){
        v=String(v||'').replace(/^v/i,'').split('.').map(x=>parseInt(x)||0);
        while(v.length<3) v.push(0);
        return v.slice(0,3);
    }
    function isNewer(tag, cur){
        let a=parseVer(tag), b=parseVer(cur);
        for(let i=0;i<3;i++){ if(a[i]>b[i]) return true; if(a[i]<b[i]) return false; }
        return false;
    }
    function releaseAppVersion(rel){
        try{
            let vers=[];
            (rel.assets||[]).forEach(a=>{
                let m=String(a.name||'').match(/(\d+)\.(\d+)\.(\d+)/);
                if(m) vers.push([parseInt(m[1]),parseInt(m[2]),parseInt(m[3])]);
            });
            if(!vers.length) return null;
            vers.sort((a,b)=> a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
            return vers[vers.length-1].join('.');
        }catch(e){ return null; }
    }
    function cleanNotes(body){
        try{
            let lines=String(body||'').split('\n');
            let out=[];
            for(let l of lines){
                if(/full changelog/i.test(l)) continue;
                if(/\u0641\u0627\u06cc\u0644 \u0646\u0635\u0628/.test(l)) break;
                l=l.replace(/^[#>*\s-]+/,'').replace(/`/g,'').trim();
                if(!l) continue;
                if(/^\u0642\u0627\u0628\u0644\u06cc\u062a/.test(l)) continue;
                out.push('\u2022 '+l);
            }
            return out.join('\n').substring(0,600);
        }catch(e){ return ''; }
    }
    async function checkForUpdate(manual){
        updateUpdateUI('checking');
        let online=false;
        try{ online = await checkInternet(); }catch(e){ online = navigator.onLine; }
        if(!online){
            updateUpdateUI('offline');
            if(manual) showToast('برای بررسی آپدیت به اینترنت وصل شو','error');
            return;
        }
        try{
            /* a hung GitHub request left the button spinning forever, and every
             * field of the response is remote-controlled data */
            let r=await fetchWithTimeout('https://api.github.com/repos/Alvandcode/gamenet-windows-pro/releases/latest', 10000, {headers:{'Accept':'application/vnd.github+json'}});
            if(!r.ok) throw new Error('http '+r.status);
            let j=await r.json();
            if(!j || typeof j.tag_name!=='string') throw new Error('bad payload');
            latestRelease=j;
            let relVer=releaseAppVersion(j) || String(j.tag_name||'').replace(/^v/i,'');
            window._relVer=relVer;
            if(isNewer(relVer, APP_VERSION)){
                updateUpdateUI('available');
                if(manual) showToast('🎉 نسخه جدید اومده!','success');
            } else {
                updateUpdateUI('latest');
                if(manual) showToast('به‌روزی ✅','success');
            }
        }catch(e){
            // 403 = unauthenticated GitHub rate limit, not a network problem
            const rate=/403/.test(String(e && e.message));
            updateUpdateUI('error');
            if(manual) showToast(rate ? 'تلارد متند زیاده شده، کمبی بعدً تحدید کن' : 'خطا در بررسی آپدیت', rate?'warning':'error');
        }
    }
    function updateUpdateUI(state){
        if(state) window._updState=state;
        state=window._updState||'idle';
        let cv=document.getElementById('currentVersionText'); if(cv) cv.textContent=APP_VERSION;
        let st=document.getElementById('updateStatusText');
        let btn=document.getElementById('updateBtn');
        let notes=document.getElementById('updateNotes');
        if(!st||!btn) return;
        if(state==='checking'){ st.textContent='⏳ در حال بررسی...'; st.style.color='#f59e0b'; btn.disabled=true; }
        else if(state==='offline'){ st.textContent='⛔ آفلاین - برای بررسی وصل شو'; st.style.color='#ef4444'; btn.disabled=false; }
        else if(state==='error'){ st.textContent='⚠️ خطا در بررسی - بعدا دوباره امتحان کن'; st.style.color='#ef4444'; btn.disabled=false; }
        else if(state==='latest'){ st.textContent='✅ به‌روزی - نسخه '+APP_VERSION; st.style.color='#22c55e'; btn.disabled=true; if(notes) notes.style.display='none'; }
        else if(state==='available'){
            /* tag_name comes from the GitHub API: remote data must never be
             * injected with innerHTML */
            let tag=String(window._relVer || (latestRelease? latestRelease.tag_name : '')).slice(0,40);
            st.textContent='🎉 نسخه جدید '+tag+' منتشر شده!'; st.style.color='#22c55e'; btn.disabled=false;
            if(notes && latestRelease && latestRelease.body){ let cn=cleanNotes(latestRelease.body); notes.textContent=cn; notes.style.display=cn?'block':'none'; }
        }
        else { st.textContent='هنوز بررسی نشده - برای بررسی به اینترنت وصل شو'; st.style.color='rgba(255,255,255,0.5)'; btn.disabled=true; }
    }
    async function doInAppUpdate(){
        if(!latestRelease){ showToast('اول بررسی آپدیت را بزن','error'); return; }
        let ok=confirm('⚠️ قبل از آپدیت حتما از اطلاعاتت بکاپ بگیر!\n\nالان خود برنامه اتومات بکاپ میگیرد.\n(از بخش تنظیمات میتوانی بکاپ اتوماتیک را فعال کنی)\n\nادامه میدی؟');
        if(!ok) return;
        try{ createBackup(); }catch(e){}
        showToast('💾 بکاپ گرفته شد، دانلود شروع میشود...','success');
        let assets=latestRelease.assets||[];
        let exe=assets.find(a=>/setup.*\.exe$/i.test(a.name)) || assets.find(a=>/\.exe$/i.test(a.name));
        if(!exe){
            showToast('فایل نصب پیدا نشد','error');
            try{ window.open(latestRelease.html_url,'_blank'); }catch(e){}
            return;
        }
        let a=document.createElement('a');
        a.href=exe.browser_download_url; a.download=exe.name; a.target='_blank';
        document.body.appendChild(a); a.click();
        setTimeout(()=>a.remove(), 8000);
        showToast('⏬ دانلود شروع شد - بعد از اتمام فایل را اجرا کن تا نصب شود','success');
    }

    
    // ========== i18n: FA / EN / AR ==========
    let appLang = localStorage.getItem('alvand_lang') || 'fa';
    const I18N = {
        "داشبورد": {en:"Dashboard", ar:"لوحة القيادة"},
        "مدیریت کلاینت‌ها": {en:"Client Management", ar:"إدارة العملاء"},
        "تعرفه‌ها": {en:"Tariffs", ar:"التعريفات"},
        "گزارش‌ها": {en:"Reports", ar:"التقارير"},
        "درآمد": {en:"Income", ar:"الدخل"},
        "رزروها": {en:"Reservations", ar:"الحجوزات"},
        "مشتریان": {en:"Customers", ar:"العملاء"},
        "بوفه و خدمات": {en:"Buffet & Services", ar:"البوفيه والخدمات"},
        "هزینه‌ها": {en:"Expenses", ar:"المصاريف"},
        "تعرفه ساعتی": {en:"Hourly Tariffs", ar:"تعرفة الساعات"},
        "تنظیمات": {en:"Settings", ar:"الإعدادات"},
        "اپراتورها": {en:"Operators", ar:"المشغلون"},
        "تم و صدا": {en:"Theme & Sound", ar:"السمة والصوت"},
        "کارکرد ایستگاه": {en:"Station Usage", ar:"عمل المحطات"},
        "بکاپ‌گیری": {en:"Backup", ar:"النسخ الاحتياطي"},
        "بکاپ": {en:"Backup", ar:"نسخ احتياطي"},
        "لایسنس": {en:"License", ar:"الترخيص"},
        "تاریخ امروز": {en:"Today", ar:"اليوم"},
        "کلاینت‌های فعال": {en:"Active Clients", ar:"العملاء النشطون"},
        "متوقف شده": {en:"Paused", ar:"متوقف"},
        "درآمد امروز": {en:"Today's Income", ar:"دخل اليوم"},
        "کل کلاینت‌ها": {en:"Total Clients", ar:"إجمالي العملاء"},
        "نمودار درآمد هفتگی": {en:"Weekly Income Chart", ar:"مخطط الدخل الأسبوعي"},
        "کلاینت‌های فعال فعلی": {en:"Currently Active Clients", ar:"العملاء النشطون حاليا"},
        "هیچ کلاینت فعالی وجود ندارد": {en:"No active clients", ar:"لا يوجد عملاء نشطون"},
        "افزودن کلاینت جدید": {en:"Add New Client", ar:"إضافة عميل جديد"},
        "مدیریت تعرفه‌ها": {en:"Manage Tariffs", ar:"إدارة التعريفات"},
        "تک نفره": {en:"Single", ar:"فردي"},
        "دو نفره": {en:"Double", ar:"زوجي"},
        "نفرات اضافه": {en:"Extra Persons", ar:"أشخاص إضافيون"},
        "گزارش‌گیری": {en:"Reports", ar:"التقارير"},
        "محاسبه درآمد": {en:"Income", ar:"الدخل"},
        "مدیریت رزروها": {en:"Manage Reservations", ar:"إدارة الحجوزات"},
        "مدیریت زمان": {en:"Time Management", ar:"إدارة الوقت"},
        "زمان سپری شده": {en:"Elapsed Time", ar:"الوقت المنقضي"},
        "هزینه فعلی": {en:"Current Cost", ar:"التكلفة الحالية"},
        "تومان": {en:"Toman", ar:"تومان"},
        "شروع": {en:"Start", ar:"بدء"},
        "توقف": {en:"Pause", ar:"إيقاف مؤقت"},
        "قطع": {en:"Stop", ar:"إيقاف"},
        "ریست": {en:"Reset", ar:"إعادة تعيين"},
        "ثبت": {en:"Save", ar:"حفظ"},
        "انصراف": {en:"Cancel", ar:"إلغاء"},
        "حذف": {en:"Delete", ar:"حذف"},
        "ویرایش": {en:"Edit", ar:"تعديل"},
        "بستن": {en:"Close", ar:"إغلاق"},
        "ذخیره": {en:"Save", ar:"حفظ"},
        "روزانه": {en:"Daily", ar:"يومي"},
        "هفتگی": {en:"Weekly", ar:"أسبوعي"},
        "ماهانه": {en:"Monthly", ar:"شهري"},
        "سالانه": {en:"Yearly", ar:"سنوي"},
        "کیف پول": {en:"Wallet", ar:"المحفظة"},
        "بوفه": {en:"Buffet", ar:"بوفيه"},
        "خدمات": {en:"Services", ar:"خدمات"},
        "موجودی": {en:"Stock", ar:"المخزون"},
        "سود": {en:"Profit", ar:"الربح"},
        "نقد": {en:"Cash", ar:"نقدي"},
        "خروج": {en:"Logout", ar:"تسجيل الخروج"},
        "مدیر": {en:"Admin", ar:"مدير"},
        "اپراتور": {en:"Operator", ar:"مشغل"},
        "تخفیف": {en:"Discount", ar:"خصم"},
        "زبان": {en:"Language", ar:"اللغة"},
        "شارژ": {en:"Charge", ar:"شحن"},
        "بدهی": {en:"Debt", ar:"دين"},
        // ===== Round2+: new sections, cards, dynamics =====
        "عضویت": {en:"Membership", ar:"العضوية"},
        "لیست انتظار": {en:"Waiting List", ar:"قائمة الانتظار"},
        "رویدادها": {en:"Events", ar:"الفعاليات"},
        "شعبه‌ها": {en:"Branches", ar:"الفروع"},
        "شیفت‌ها": {en:"Shifts", ar:"الورديات"},
        "تحلیل و پیش‌بینی": {en:"Analytics & Forecast", ar:"التحليل والتنبؤ"},
        "ابزارها": {en:"Tools", ar:"الأدوات"},
        "بیشتر": {en:"More", ar:"المزيد"},
        "پایان": {en:"End", ar:"إنهاء"},
        "ادامه": {en:"Resume", ar:"استئناف"},
        "توقف موقت": {en:"Pause", ar:"إيقاف مؤقت"},
        "طرح‌های عضویت و اشتراک": {en:"Membership Plans", ar:"خطط العضوية"},
        "طرح جدید": {en:"New Plan", ar:"خطة جديدة"},
        "طرح‌های اشتراکی برای مشتریان دائمی با تخفیف ویژه": {en:"Subscription plans for regular customers with special discount", ar:"خطط اشتراك للعملاء الدائمين بخصم خاص"},
        "نام طرح": {en:"Plan Name", ar:"اسم الخطة"},
        "نوع": {en:"Type", ar:"النوع"},
        "قیمت (تومان)": {en:"Price (Toman)", ar:"السعر (تومان)"},
        "ساعت": {en:"hour", ar:"ساعة"},
        "تخفیف (%)": {en:"Discount (%)", ar:"خصم (٪)"},
        "توضیحات": {en:"Description", ar:"الوصف"},
        "طرح عضویت": {en:"Membership Plan", ar:"خطة العضوية"},
        "مدیریت کارمندان": {en:"Employee Management", ar:"إدارة الموظفين"},
        "کارمند جدید": {en:"New Employee", ar:"موظف جديد"},
        "گزارش حضور و غیاب": {en:"Attendance Report", ar:"تقرير الحضور والغياب"},
        "نام کامل": {en:"Full Name", ar:"الاسم الكامل"},
        "تلفن": {en:"Phone", ar:"الهاتف"},
        "حقوق (تومان)": {en:"Salary (Toman)", ar:"الراتب (تومان)"},
        "سمت": {en:"Position", ar:"المنصب"},
        "کارمند": {en:"Employee", ar:"موظف"},
        "تحلیل ساعات پرترافیک مغازه بر اساس داده‌های واقعی": {en:"Busy-hours analysis based on real data", ar:"تحليل الساعات المزدحمة بناء على بيانات حقيقية"},
        "سابقه تمام بازی‌ها و سشن‌ها": {en:"Full history of games and sessions", ar:"سجل جميع الألعاب والجلسات"},
        "تاریخچه بازی": {en:"Game History", ar:"سجل الألعاب"},
        "تاریخچه تمام عملیات انجام شده در سیستم": {en:"Full log of all system operations", ar:"سجل جميع عمليات النظام"},
        "لاگ فعالیت": {en:"Activity Log", ar:"سجل النشاط"},
        "پاکسازی": {en:"Clear", ar:"مسح"},
        "جستجوی پیشرفته": {en:"Advanced Search", ar:"بحث متقدم"},
        "جستجو در تمام بخش‌ها: دستگاه‌ها، مشتریان، سشن‌ها، رزروها": {en:"Search everywhere: devices, customers, sessions, reservations", ar:"ابحث في كل الأقسام: الأجهزة، العملاء، الجلسات، الحجوزات"},
        "نام مشتری، شماره، دستگاه...": {en:"Customer name, phone, device...", ar:"اسم العميل، الرقم، الجهاز..."},
        "رد کردن": {en:"Skip", ar:"تخطي"},
        "افزودن به لیست": {en:"Add to List", ar:"إضافة إلى القائمة"},
        "وقتی همه دستگاه‌ها پر هستند، مشتری را اینجا نگه دار": {en:"When all stations are busy, keep customers here", ar:"عندما تكون جميع الأجهزة مشغولة، احتفظ بالعملاء هنا"},
        "نام مشتری": {en:"Customer Name", ar:"اسم العميل"},
        "لیست انتظار خالی است": {en:"Waiting list is empty", ar:"قائمة الانتظار فارغة"},
        "انجام شد": {en:"Done", ar:"تم"},
        "رویدادها و تورنمنت": {en:"Events & Tournaments", ar:"الفعاليات والبطولات"},
        "مسابقه، تورنمنت و شب‌های ویژه برگزار کن": {en:"Run matches, tournaments and special nights", ar:"نظم المباريات والبطولات والليالي الخاصة"},
        "رویداد جدید": {en:"New Event", ar:"فعالية جديدة"},
        "عنوان": {en:"Title", ar:"العنوان"},
        "تاریخ": {en:"Date", ar:"التاريخ"},
        "ورودی (تومان)": {en:"Entry Fee (Toman)", ar:"رسم الدخول (تومان)"},
        "جایزه": {en:"Prize", ar:"الجائزة"},
        "رویدادی نیست": {en:"No events", ar:"لا توجد فعاليات"},
        "ورودی:": {en:"Entry:", ar:"الدخول:"},
        "جایزه:": {en:"Prize:", ar:"الجائزة:"},
        "بازیکنان:": {en:"Players:", ar:"اللاعبون:"},
        "شرکت در رویداد": {en:"Join Event", ar:"المشاركة في الفعالية"},
        "نام بازیکن:": {en:"Player name:", ar:"اسم اللاعب:"},
        "مدیریت شعبه‌ها": {en:"Branch Management", ar:"إدارة الفروع"},
        "شعبه جدید": {en:"New Branch", ar:"فرع جديد"},
        "نام شعبه": {en:"Branch Name", ar:"اسم الفرع"},
        "آدرس": {en:"Address", ar:"العنوان"},
        "شعبه اصلی": {en:"Main Branch", ar:"الفرع الرئيسي"},
        "(فعال)": {en:"(Active)", ar:"(نشط)"},
        "تغییر": {en:"Switch", ar:"تبديل"},
        "برنامه شیفت کارمندان": {en:"Employee Shift Schedule", ar:"جدول ورديات الموظفين"},
        "شیفت جدید": {en:"New Shift", ar:"وردية جديدة"},
        "تقویم هفتگی شیفت‌ها": {en:"Weekly Shift Calendar", ar:"تقويم الورديات الأسبوعي"},
        "تمام فیلدها الزامی است": {en:"All fields are required", ar:"جميع الحقول مطلوبة"},
        "مقایسه این ماه با ماه قبل": {en:"This Month vs Last Month", ar:"هذا الشهر مقابل الشهر الماضي"},
        "پیش‌بینی درآمد": {en:"Income Forecast", ar:"التنبؤ بالدخل"},
        "رضایت مشتریان": {en:"Customer Satisfaction", ar:"رضا العملاء"},
        "هشدار موجودی بوفه": {en:"Buffet Stock Alerts", ar:"تنبيهات مخزون البوفيه"},
        "آستانه هشدار": {en:"Alert Threshold", ar:"حد التنبيه"},
        "این ماه": {en:"This Month", ar:"هذا الشهر"},
        "ماه قبل": {en:"Last Month", ar:"الشهر الماضي"},
        "سشن": {en:"sessions", ar:"جلسات"},
        "تغییر:": {en:"Change:", ar:"التغيير:"},
        "میانگین روزانه": {en:"Daily Average", ar:"المتوسط اليومي"},
        "میانگین ۷ روز اخیر": {en:"Last 7 Days Average", ar:"متوسط آخر ٧ أيام"},
        "پیش‌بینی ۳۰ روز آینده": {en:"Next 30 Days Forecast", ar:"توقعات الثلاثين يوما القادمة"},
        "داده‌ای نیست": {en:"No Data", ar:"لا توجد بيانات"},
        "نظرسنجی ثبت نشده": {en:"No Surveys Yet", ar:"لا توجد استطلاعات"},
        "میانگین": {en:"Average", ar:"المتوسط"},
        "نظر": {en:"reviews", ar:"تقييمات"},
        "تمام شده": {en:"Out of Stock", ar:"نفد المخزون"},
        "کم موجودی": {en:"Low Stock", ar:"مخزون منخفض"},
        "تمام شده:": {en:"Out of Stock:", ar:"نفد:"},
        "کم موجودی:": {en:"Low Stock:", ar:"مخزون منخفض:"},
        "موجودی:": {en:"Stock:", ar:"المخزون:"},
        "تمام موجودی‌ها کافی است": {en:"All stock is sufficient", ar:"كل المخزون كافٍ"},
        "خروجی اکسل، چاپ رسید، کارتخوان، پورتال مشتری و امنیت": {en:"Excel export, receipts, POS, customer portal and security", ar:"تصدير إكسل، الإيصالات، الدفع، بوابة العميل والأمان"},
        "خروجی CSV (اکسل)": {en:"CSV Export (Excel)", ar:"تصدير CSV (إكسل)"},
        "سشن‌های امروز": {en:"Today's Sessions", ar:"جلسات اليوم"},
        "سشن‌های هفته": {en:"This Week's Sessions", ar:"جلسات الأسبوع"},
        "سشن‌های ماه": {en:"This Month's Sessions", ar:"جلسات الشهر"},
        "چاپ رسید حرارتی": {en:"Thermal Receipt Printing", ar:"طباعة الإيصالات الحرارية"},
        "رسید ۸۰ میلی‌متری برای پرینتر حرارتی": {en:"80mm receipts for thermal printers", ar:"إيصالات ٨٠مم للطابعات الحرارية"},
        "تنظیم نام و تلفن مغازه": {en:"Set Shop Name & Phone", ar:"تعيين اسم المتجر وهاتفه"},
        "دستگاه کارتخوان": {en:"POS Terminal", ar:"جهاز الدفع"},
        "پورتال مشتری (نمای زنده)": {en:"Customer Portal (Live)", ar:"بوابة العميل (مباشر)"},
        "بروزرسانی": {en:"Refresh", ar:"تحديث"},
        "امنیت و رمزنگاری": {en:"Security & Encryption", ar:"الأمان والتشفير"},
        "امتیاز وفاداری مشتری": {en:"Customer Loyalty Points", ar:"نقاط ولاء العميل"},
        "انتخاب مشتری...": {en:"Select Customer...", ar:"اختر العميل..."},
        "QR مشتری": {en:"Customer QR", ar:"رمز العميل"},
        "فعال‌سازی کارتخوان": {en:"Enable POS Terminal", ar:"تفعيل جهاز الدفع"},
        "آی‌پی": {en:"IP", ar:"الآيبي"},
        "پورت": {en:"Port", ar:"المنفذ"},
        "تست": {en:"Test", ar:"اختبار"},
        "آخرین وضعیت:": {en:"Last Status:", ar:"آخر حالة:"},
        "رمزنگاری بکاپ مشتریان": {en:"Encrypt Customer Backup", ar:"تشفير نسخة العملاء الاحتياطية"},
        "رمز (حداقل ۴ کاراکتر)": {en:"Password (min 4 chars)", ar:"كلمة المرور (٤ أحرف على الأقل)"},
        "رمزنگاری": {en:"Encrypt", ar:"تشفير"},
        "بررسی رمزگشایی": {en:"Verify Decryption", ar:"التحقق من فك التشفير"},
        "رمزنگاری شد": {en:"Encrypted", ar:"تم التشفير"},
        "رمزگشایی شد:": {en:"Decrypted:", ar:"تم فك التشفير:"},
        "مشتری": {en:"Customer", ar:"عميل"},
        "خطا": {en:"Error", ar:"خطأ"},
        "دستگاه آزاد": {en:"Free Stations", ar:"أجهزة متاحة"},
        "در انتظار": {en:"Waiting", ar:"في الانتظار"},
        "دستگاه‌ها (زنده)": {en:"Stations (Live)", ar:"الأجهزة (مباشر)"},
        "مشغول": {en:"Busy", ar:"مشغول"},
        "آزاد": {en:"Free", ar:"متاح"},
        "دستگاهی نیست": {en:"No Stations", ar:"لا توجد أجهزة"},
        "امتیاز فعلی:": {en:"Current Points:", ar:"النقاط الحالية:"},
        "امتیاز کافی نیست": {en:"Not Enough Points", ar:"نقاط غير كافية"},
        "بازخرید": {en:"Redeem", ar:"استبدال"},
        "نام الزامی است": {en:"Name Is Required", ar:"الاسم مطلوب"},
        "نام شعبه الزامی است": {en:"Branch Name Is Required", ar:"اسم الفرع مطلوب"},
        "عنوان الزامی است": {en:"Title Is Required", ar:"العنوان مطلوب"},
        "به لیست اضافه شد": {en:"added to the list", ar:"تمت الإضافة إلى القائمة"},
        "دقیقه": {en:"min", ar:"دقيقة"},
        "متصل": {en:"Connected", ar:"متصل"},
        "نامشخص": {en:"Unknown", ar:"غير معروف"},
        "بدون IP": {en:"No IP", ar:"بدون IP"},
        "نظرت چی بود؟": {en:"How was it?", ar:"كيف كانت تجربتك؟"},
        "از ۱ تا ۵ ستاره بده": {en:"Rate 1 to 5 stars", ar:"قيّم من ١ إلى ٥ نجوم"},
        "نظر (اختیاری)...": {en:"Comment (optional)...", ar:"تعليق (اختياري)..."},
        "بیخیال": {en:"Skip", ar:"تجاهل"},
        "انتخاب تاریخ...": {en:"Pick a date...", ar:"اختر التاريخ..."},
        "تکمیل شده": {en:"Completed", ar:"مكتمل"},
        "فعال": {en:"Active", ar:"نشط"},
        "غیرفعال": {en:"Inactive", ar:"غير نشط"},
        "ورود": {en:"Check-in", ar:"دخول"},
        "امتیاز": {en:"Points", ar:"نقاط"},
        "بازیکنان": {en:"Players", ar:"اللاعبون"},
        "شعبه": {en:"Branch", ar:"فرع"},
        "رویداد": {en:"Event", ar:"فعالية"},
        "انتظار": {en:"Wait", ar:"انتظار"},  // careful: substring of "لیست انتظار"/"در انتظار" (longer first ✓)
        "حضور و غیاب": {en:"Attendance", ar:"الحضور والغياب"},
        "کارمندی ثبت نشده": {en:"No employees yet", ar:"لا يوجد موظفون"},
        "طرحی ثبت نشده": {en:"No plans yet", ar:"لا توجد خطط"},
        "اعلانی وجود ندارد": {en:"No notifications", ar:"لا توجد إشعارات"},
        "نتیجه‌ای یافت نشد": {en:"No results found", ar:"لا توجد نتائج"},
        "تاریخچه‌ای وجود ندارد": {en:"No history yet", ar:"لا يوجد سجل"},
        "داده‌ای موجود نیست": {en:"No data available", ar:"لا توجد بيانات"},
        "شلوغ‌ترین ساعت": {en:"Peak hour", ar:"ساعة الذروة"},
        "خوانده شد": {en:"Mark read", ar:"تعليم كمقروء"},
        "آمار کلی": {en:"Overview", ar:"نظرة عامة"},
        "بازدید": {en:"Visits", ar:"الزيارات"},
        "هزینه کل": {en:"Total Spent", ar:"إجمالي المصروف"},
        "رتبه": {en:"Rank", ar:"الرتبة"},
        "دستگاه محبوب": {en:"Favorite Station", ar:"الجهاز المفضل"},
        "مالی": {en:"Billing", ar:"المالية"},
        "عضو فعالی نیست": {en:"No active membership", ar:"لا توجد عضوية نشطة"},
        "انتخاب طرح...": {en:"Choose a plan...", ar:"اختر خطة..."},
        "فعال‌سازی": {en:"Activate", ar:"تفعيل"},
        "عضویت فعال": {en:"Active Membership", ar:"عضوية نشطة"},
        "آخرین بازی‌ها": {en:"Recent Sessions", ar:"الجلسات الأخيرة"},
        "سابقه‌ای ثبت نشده": {en:"No history recorded", ar:"لا يوجد سجل مسجل"},
        "لاگی ثبت نشده": {en:"No logs yet", ar:"لا توجد سجلات"},
        "فایل CSV دانلود شد": {en:"CSV file downloaded", ar:"تم تنزيل ملف CSV"},
        "ذخیره شد": {en:"Saved", ar:"تم الحفظ"},  // careful: substring of "مشخصات مدیر ذخیره شد"? contains "ذخیره شد" ✓ translates part — fine.
        "شعبه اضافه شد": {en:"Branch added", ar:"تمت إضافة الفرع"},
        "شعبه تغییر کرد": {en:"Branch switched", ar:"تم تبديل الفرع"},
        "ثبت‌نام شد": {en:"Registered", ar:"تم التسجيل"},
        "ممنون از نظر شما": {en:"Thanks for your feedback", ar:"شكرا لرأيك"},
        "لطفا ستاره انتخاب کنید": {en:"Please pick stars", ar:"اختر النجوم من فضلك"},
        "لغو": {en:"Cancel", ar:"إلغاء"},
        "نوع دستگاه:": {en:"Device Type:", ar:"نوع الجهاز:"},
        "تعرفه:": {en:"Tariff:", ar:"التعريفة:"},
        "باقی‌مانده:": {en:"Remaining:", ar:"المتبقي:"},
        "تایمر:": {en:"Timer:", ar:"المؤقت:"},
        "نفر اضافه": {en:"Extra Person", ar:"شخص إضافي"},
        "نفر": {en:"persons", ar:"أشخاص"},
        "رزرو:": {en:"Reservation:", ar:"الحجز:"},
        "کامپیوتر": {en:"Computer", ar:"كمبيوتر"},
        "پلی‌استیشن": {en:"PlayStation", ar:"بلاي ستيشن"},
        "ایکس‌باکس": {en:"Xbox", ar:"إكس بوكس"},
        "فوتبال دستی": {en:"Foosball", ar:"كرة طاولة"},
        "بیلیارد": {en:"Billiards", ar:"بلياردو"},
        "اول ایمیل گیرنده را وارد کن": {en:"Enter the recipient email first", ar:"أدخل بريد المستلم أولا"},
        "متن کپی شد": {en:"Text copied", ar:"تم نسخ النص"},
        "کپی نشد - دستی انتخاب و کپی کن": {en:"Copy failed - select and copy manually", ar:"تعذر النسخ - حدد وانسخ يدويا"},
        "کپی متن": {en:"Copy Text", ar:"نسخ النص"},
        "کپی خودکار ممکن نشد - متن زیر را دستی کپی کن": {en:"Auto-copy failed - copy the text below manually", ar:"تعذر النسخ التلقائي - انسخ النص أدناه يدويا"},
        "کپی": {en:"Copy", ar:"نسخ"},
        "مشخصات مغازه": {en:"Shop Details", ar:"بيانات المتجر"},
        "نام مغازه": {en:"Shop Name", ar:"اسم المتجر"},
        "تلفن مغازه": {en:"Shop Phone", ar:"هاتف المتجر"},
        "ثبت‌نام": {en:"Register", ar:"تسجيل"},
        "نام بازیکن": {en:"Player Name", ar:"اسم اللاعب"},
        "کتابخانه PDF آفلاین در دسترس نیست - چاپ سیستمی": {en:"PDF library offline - using system print", ar:"مكتبة PDF غير متصلة - استخدام الطباعة"},
        "پنجره چاپ باز می‌شود - «ذخیره PDF» را بزن": {en:"Print dialog opens - choose Save as PDF", ar:"نافذة الطباعة ستفتح - اختر حفظ كـ PDF"},
        "متن گزارش برای تلگرام و واتساپ باز می‌شود؛ برای ایمیل اول آدرس را وارد کن.": {en:"Report text opens for Telegram and WhatsApp; enter the address first for email.", ar:"يفتح نص التقرير لتليغرام وواتساب؛ أدخل العنوان أولا للبريد."},
        "دفترچه تلفن": {en:"Phonebook", ar:"دفتر الهاتف"},
        "مخاطب جدید": {en:"New Contact", ar:"جهة اتصال جديدة"},
        "جزئیات حساب هر مخاطب خودکار از لیست مشتریان و کارکرد پیدا و نمایش داده می‌شود": {en:"Each contact's account details are found automatically from customers and performance", ar:"يتم العثور على تفاصيل حساب كل جهة اتصال تلقائيا من العملاء والأداء"},
        "اتصال پنل پیامک (اختیاری)": {en:"SMS Panel Connection (Optional)", ar:"ربط لوحة الرسائل (اختياري)"},
        "متن پیام": {en:"Message Text", ar:"نص الرسالة"},
        "از {نام} برای اسم هر مخاطب استفاده کن": {en:"Use {نام} for each contact's name", ar:"استخدم {نام} لاسم كل جهة اتصال"},
        "سلام {نام}، ...": {en:"Hi {نام}, ...", ar:"مرحبا {نام}، ..."},
        "ارسال گروهی به همه": {en:"Bulk Send to All", ar:"إرسال جماعي للجميع"},
        "گزارش ارسال‌ها": {en:"Send Log", ar:"سجل الإرسال"},
        "مخاطب": {en:"Contact", ar:"جهة اتصال"},
        "نام *": {en:"First Name", ar:"الاسم"},
        "نام خانوادگی": {en:"Last Name", ar:"اسم العائلة"},
        "موبایل": {en:"Mobile", ar:"جوال"},
        "تلفن ثابت": {en:"Landline", ar:"هاتف ثابت"},
        "یادداشت": {en:"Note", ar:"ملاحظة"},
        "مخاطبی ثبت نشده": {en:"No contacts yet", ar:"لا توجد جهات اتصال"},
        "متصل به حساب ✅": {en:"Linked ✅", ar:"مرتبط ✅"},
        "بدون تطابق": {en:"No Match", ar:"لا يوجد تطابق"},
        "ساعت بازی": {en:"Play Time", ar:"وقت اللعب"},
        "سشن‌ها": {en:"Sessions", ar:"الجلسات"},
        "پیامک": {en:"SMS", ar:"رسالة نصية"},
        "نام یا نام خانوادگی الزامی است": {en:"First or last name is required", ar:"الاسم أو اسم العائلة مطلوب"},
        "حداقل یک شماره تلفن وارد کن": {en:"Enter at least one phone number", ar:"أدخل رقما واحدا على الأقل"},
        "موبایل معتبر نیست (09xxxxxxxxx)": {en:"Invalid mobile (09xxxxxxxxx)", ar:"جوال غير صالح (09xxxxxxxxx)"},
        "مخاطب ذخیره شد": {en:"Contact saved", ar:"تم حفظ جهة الاتصال"},
        "فعال‌سازی پنل پیامک": {en:"Enable SMS Panel", ar:"تفعيل لوحة الرسائل"},
        "کاوه‌نگار (Kavenegar)": {en:"Kavenegar", ar:"كاوه نيغار"},
        "سفارشی (Custom HTTP)": {en:"Custom HTTP", ar:"HTTP مخصص"},
        "کلید API": {en:"API Key", ar:"مفتاح API"},
        "شماره فرستنده": {en:"Sender Number", ar:"رقم المرسل"},
        "متد": {en:"Method", ar:"الطريقة"},
        "قالب آدرس (متغیرها: {key} {sender} {to} {text})": {en:"URL template (vars: {key} {sender} {to} {text})", ar:"قالب الرابط (المتغيرات: {key} {sender} {to} {text})"},
        "هدرها (JSON، اختیاری)": {en:"Headers (JSON, optional)", ar:"الترويسات (JSON، اختياري)"},
        "ارسال مستقیم با API کاوه‌نگار (متد ارسال ساده).": {en:"Direct send via Kavenegar API (simple send).", ar:"إرسال مباشر عبر API كاوه نيغار."},
        "شماره تست (09...)": {en:"Test number (09...)", ar:"رقم الاختبار (09...)"},
        "تست ارسال": {en:"Test Send", ar:"إرسال تجريبي"},
        "پنل پیامک فعال شد": {en:"SMS panel enabled", ar:"تم تفعيل لوحة الرسائل"},
        "پنل پیامک غیرفعال شد": {en:"SMS panel disabled", ar:"تم تعطيل لوحة الرسائل"},
        "تنظیمات پیامک ذخیره شد": {en:"SMS settings saved", ar:"تم حفظ إعدادات الرسائل"},
        "فرمت JSON هدرها اشتباه است": {en:"Headers JSON format is wrong", ar:"صيغة JSON للترويسات خاطئة"},
        "پنل پیامک غیرفعال است": {en:"SMS panel is disabled", ar:"لوحة الرسائل معطلة"},
        "در حال ارسال...": {en:"Sending...", ar:"جارٍ الإرسال..."},
        "پیامک ارسال شد ✅": {en:"SMS sent ✅", ar:"تم إرسال الرسالة ✅"},
        "خطا در ارسال": {en:"Send error", ar:"خطأ في الإرسال"},
        "اول متن پیام را بنویس": {en:"Write the message first", ar:"اكتب الرسالة أولا"},
        "این مخاطب موبایل ندارد": {en:"This contact has no mobile", ar:"جهة الاتصال هذه بلا جوال"},
        "مخاطب پیدا نشد": {en:"Contact not found", ar:"جهة الاتصال غير موجودة"},
        "شماره تست را وارد کن": {en:"Enter the test number", ar:"أدخل رقم الاختبار"},
        "تست پنل پیامک گیم‌نت ✅": {en:"Gamenet SMS panel test ✅", ar:"اختبار لوحة رسائل غيم نت ✅"},
        "مخاطبی با موبایل معتبر نیست": {en:"No contacts with valid mobile", ar:"لا توجد جهات اتصال بجوال صالح"},
        "تمام شد:": {en:"Done:", ar:"تم:"},
        "موفق از": {en:"successful out of", ar:"ناجحة من"},
        "ارسالی ثبت نشده": {en:"No sends logged", ar:"لا توجد إرسالات مسجلة"}
    };
    const I18N_KEYS = Object.keys(I18N).sort((a,b)=>b.length-a.length);
    /* Translation works by remembering the Persian source text of every text
     * node and swapping it back and forth. Two problems with the old version:
     *  - a node whose text is set later (a live timer, a price, a client name)
     *    kept the FIRST value it ever had, so switching back to Persian restored
     *    a stale snapshot and wiped the live numbers;
     *  - the MutationObserver walked the whole document on every change, and the
     *    app mutates the DOM once per second, i.e. a full tree walk per second.
     * A node is now only treated as "translatable" when its current text equals
     * the last text we produced for it; anything else is new content and is
     * re-captured. */
    const _i18nOrig = new WeakMap();   // node -> last text WE wrote
    const _i18nSource = new WeakMap(); // node -> its Persian source text
    const _i18nTracked = new WeakSet();
    function i18nTranslateText(src, lang){
        if(lang==='fa' || !src) return src;
        let txt = src;
        for(const k of I18N_KEYS){
            if(txt.indexOf(k) < 0) continue;
            const rep = I18N[k][lang];
            if(rep) txt = txt.split(k).join(rep);
        }
        return txt;
    }
    function translateNodeText(node){
        if(!node || !node.nodeValue) return;
        const cur = node.nodeValue;
        const last = _i18nOrig.get(node);
        let src;
        if(last === undefined || cur === last){
            // untouched by us, or already what we wrote: translate from source
            src = _i18nSource.get(node);
            if(src === undefined) src = cur;
        } else {
            // the app just wrote new content - that is the new source text
            src = cur;
        }
        _i18nSource.set(node, src);
        _i18nTracked.add(node);
        const out = i18nTranslateText(src, appLang);
        if(out !== cur){
            _i18nOrig.set(node, out);
            node.nodeValue = out;
        } else {
            _i18nOrig.set(node, out);
        }
    }
    function translateRoot(root){
        try{
            let walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            let nodes=[];
            while(walker.nextNode()){
                let n=walker.currentNode;
                let p=n.parentNode;
                if(!p) continue;
                let tag=p.nodeName;
                if(tag==='SCRIPT'||tag==='STYLE') continue;
                if(!n.nodeValue || !n.nodeValue.trim()) continue;
                nodes.push(n);
            }
            for(let i=0;i<nodes.length;i++) translateNodeText(nodes[i]);
            const phs = root.querySelectorAll ? root.querySelectorAll('input[placeholder], textarea[placeholder]') : [];
            phs.forEach(el=>{
                if(el._phOrig===undefined) el._phOrig=el.getAttribute('placeholder')||'';
                const ph=i18nTranslateText(el._phOrig, appLang);
                if(el.getAttribute('placeholder')!==ph) el.setAttribute('placeholder', ph);
            });
        }catch(e){}
    }
    let _i18nTimer=null;
    function applyAppLang(){
        document.documentElement.lang = appLang==='en'?'en':(appLang==='ar'?'ar':'fa');
        document.documentElement.dir = appLang==='en'?'ltr':'rtl';
        let layout=document.getElementById('appLayout');
        if(layout) layout.style.direction = appLang==='en'?'ltr':'rtl';
        translateRoot(document.body);
        document.querySelectorAll('.lang-btn').forEach(b=>b.classList.remove('active'));
        let cur=document.getElementById('lang'+appLang.toUpperCase());
        if(cur) cur.classList.add('active');
        if(!window._i18nObs){
            try{
                // Only newly ADDED subtrees need translating. Text changes inside
                // an existing node are already Persian (the app writes Persian),
                // so re-walking the whole document on every tick is pure waste.
                let pending = [];
                let flush = () => {
                    _i18nTimer=null;
                    const list=pending.splice(0, pending.length);
                    for(let i=0;i<list.length;i++){
                        const n=list[i];
                        if(n && n.isConnected !== false) translateRoot(n);
                    }
                };
                window._i18nObs=new MutationObserver((records)=>{
                    for(const r of records){
                        for(let i=0;i<r.addedNodes.length;i++){
                            const n=r.addedNodes[i];
                            if(n.nodeType===1) pending.push(n);
                            else if(n.nodeType===3 && n.parentElement) pending.push(n.parentElement);
                        }
                    }
                    if(!pending.length) return;
                    clearTimeout(_i18nTimer);
                    _i18nTimer=setTimeout(flush, 250);
                });
                window._i18nObs.observe(document.body, {childList:true, subtree:true});
            }catch(e){}
        }
    }
    function setLang(l){
        appLang=l;
        localStorage.setItem('alvand_lang', l);
        applyAppLang();
        showToast(l==='fa'?'زبان: فارسی':(l==='ar'?'اللغة: العربية':'Language: English'),'success');
    }

    
    // NOTE: license issuance lives ONLY in license-tools/ (seller side).
    // There is intentionally no owner PIN / in-app minting in the customer app.
    function licCapacityError(what){
        let err=document.getElementById('licenseError');
        let head = what==='stations'
            ? '⛔ تعداد دستگاه‌های این لایسنس پر شده است.'
            : '⛔ این لایسنس به حد نصاب فعال‌سازی رسیده است.';
        let msg=head+'<br>برای خرید لایسنس جدید با سازنده تماس بگیرید.<br><a href="https://github.com/Alvandcode/gamenet-windows-pro" target="_blank" style="color:#818cf8; text-decoration:underline;">🔗 تماس با سازنده در گیت‌هاب</a>';
        if(err){ err.innerHTML=msg; err.style.display='block'; }
    }

    /** Paid station capacity. `cap` is what the customer actually bought
     *  (licPrice() prices it), and it was never enforced anywhere: any license
     *  allowed an unlimited number of clients. Checked before adding a station
     *  and shown in the license panel. */
    function licenseStationCap(){
        const st=window.__licState;
        if(!st || st.status!=='valid' || !st.payload) return null;   // local/dev mode
        const cap=Number(st.payload.cap);
        if(!isFinite(cap) || cap<=0) return null;
        return Math.floor(cap);
    }
    function licenseStationsLeft(){
        const cap=licenseStationCap();
        if(cap===null) return null;
        return Math.max(0, cap - clients.length);
    }
    function enforceStationCapacity(){
        const cap=licenseStationCap();
        if(cap===null) return true;
        if(clients.length < cap) return true;
        showToast('⛔ ظرفیت لایسنس پر است ('+clients.length+' از '+cap+' دستگاه)','error');
        try{
            showSection('license');
            renderLicenseSection();
        }catch(e){}
        licCapacityError('stations');
        return false;
    }

    
    // ========== Station Types ==========
    function renderStationTypes(){
        let grid=document.getElementById('stationTypesGrid');
        if(!grid) return;
        grid.innerHTML=stationTypes.map(t=>{
            let count=clients.filter(c=>(c.stationType||'none')===t.id).length;
            return `<div class="glass" style="padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <h4 style="font-weight:800;">${t.icon} ${escapeHtml(t.name)}</h4>
                    <span style="font-size:0.7rem; color:rgba(255,255,255,0.5);">${count} دستگاه</span>
                </div>
                <label style="font-size:0.75rem; color:rgba(255,255,255,0.6);">تومان / ساعت (0 = تعرفه تک/دو نفره)</label>
                <div style="display:flex; gap:6px; margin-top:6px;">
                    <input type="number" value="${escapeHtml(String(t.price))}" onchange="saveStationTypePrice('${escapeHtml(jsStr(t.id))}', this.value)" style="text-align:center; font-weight:800;">
                    <button class="glass-btn glass-btn-danger" style="padding:8px 10px; font-size:0.75rem;" onclick="deleteStationType('${escapeHtml(jsStr(t.id))}')">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }
    function saveStationTypePrice(id, val){
        let t=stationTypes.find(x=>x.id===id); if(!t) return;
        t.price=(typeof parseFaNumber==='function')? parseFaNumber(val,0) : (parseInt(val)||0);
        localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes));
        renderClients(); updateStats();
        showToast('تعرفه '+t.name+' ذخیره شد','success');
    }
    function addStationType(){
        if(!requirePerm('tariffs','نوع دستگاه')) return;
        let name=document.getElementById('newTypeName').value.trim();
        let price=(typeof parseFaNumber==='function')? parseFaNumber(document.getElementById('newTypePrice').value,0) : (parseInt(document.getElementById('newTypePrice').value)||0);
        if(!name){ showToast('نام نوع را وارد کن','error'); return; }
        stationTypes.push({id:'t'+Date.now(), name, icon:'🎮', price});
        localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes));
        document.getElementById('newTypeName').value='';
        document.getElementById('newTypePrice').value='';
        renderStationTypes();
        showToast('نوع جدید اضافه شد','success');
    }
    let __confirmCb=null;
    function askConfirm(msg, cb){
        try{
            document.getElementById('confirmText').textContent=msg||'مطمئنی؟';
            __confirmCb=(typeof cb==='function')?cb:null;
            document.getElementById('confirmModal').classList.add('show');
        }catch(e){ if(cb){ try{cb();}catch(_){} } }
    }
    function resolveConfirm(ok){
        try{ document.getElementById('confirmModal').classList.remove('show'); }catch(e){}
        const cb=__confirmCb; __confirmCb=null;
        if(ok && cb){ try{cb();}catch(e){ showToast('خطا در انجام عملیات','error'); } }
    }
    function deleteStationType(id){
        if(!requirePerm('tariffs','حذف نوع دستگاه')) return;
        let used=clients.filter(c=>c.stationType===id).length;
        if(used>0){ showToast('این نوع '+used+' دستگاه دارد، اول نوع آنها را عوض کن','error'); return; }
        askConfirm('حذف شود؟', function(){
            stationTypes=stationTypes.filter(t=>t.id!==id);
            localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes));
            renderStationTypes();
            showToast('حذف شد','success');
        });
    }
    function changeClientType(idx, val){
        clients[idx].stationType = val||null;
        saveData();
        renderClients();
        showToast('نوع دستگاه تغییر کرد','success');
    }
    function changeClientExtra(idx, delta){
        const c=clients[idx]; if(!c) return;
        const ne=Math.max(0,(c.extra||0)+delta);
        if(ne===(c.extra||0)) return;
        c.extra=ne;
        saveData();
        renderClients();
        updateStats();
        showToast(ne>0? `نفر اضافه: ${ne} نفر — از این لحظه حساب می‌شود` : 'نفر اضافه صفر شد','success');
    }
    function fillClientTypeSelect(){
        let sel=document.getElementById('newClientType');
        if(!sel) return;
        /* the per-hour price lives on the station type (that is the "tariff
         * simplification" the product went through): getTariffForClient()
         * prefers stationType.price and only falls back to tariffs.single /
         * tariffs.double when a type has no price of its own. */
        sel.innerHTML=stationTypes.map(t=>`<option value="${t.id}">${t.icon} ${escapeHtml(t.name)} - ${t.price>0? t.price.toLocaleString('fa-IR')+' تومان' : 'تعرفه پایه'}</option>`).join('');
    }
    function renderTypeFilter(){
        let bar=document.getElementById('typeFilterBar');
        if(!bar) return;
        let btn=(id,label)=>`<button class="glass-btn ${clientTypeFilter===id?'glass-btn-success':''}" style="padding:8px 14px; font-size:0.8rem;" onclick="filterClientsByType('${escapeHtml(jsStr(id))}')">${label}</button>`;
        bar.innerHTML=btn('','همه ('+clients.length+')')+stationTypes.map(t=>{
            let n=clients.filter(c=>(c.stationType||'none')===t.id).length;
            return btn(t.id, t.icon+' '+t.name+' ('+n+')');
        }).join('');
    }
    function filterClientsByType(id){ clientTypeFilter=id; renderClients(); }
    function renderTsTypePrices(editId){
        let box=document.getElementById('tsTypePrices');
        if(!box) return;
        let ts=editId? tariffSchedules.find(x=>x.id===editId) : null;
        box.innerHTML='<p style="color:rgba(255,255,255,0.6); font-size:0.8rem; margin-bottom:8px; grid-column:1/-1;">قیمت ساعتی هر نوع دستگاه در این بازه (خالی = تعرفه عادی):</p>'+stationTypes.map(t=>{
            let v=ts&&ts.prices? (ts.prices[t.id]||'') : (t.price||'');
            return `<div><label style="display:block; margin-bottom:6px; color:rgba(255,255,255,0.7); font-size:0.8rem;">${t.icon} ${escapeHtml(t.name)}</label><input type="number" data-type="${t.id}" value="${v}" placeholder="${t.price}"></div>`;
        }).join('');
    }
    function renderTypeBreakdown(){
        let box=document.getElementById('typeBreakdown');
        if(!box) return;
        let map={};
        sessions.forEach(s=>{
            let st=getStationType(s.stationType);
            let label=st? st.icon+' '+st.name : (s.stationTypeName||'سایر');
            if(!map[label]) map[label]={total:0, count:0};
            map[label].total+=(s.cost||0); map[label].count++;
        });
        let keys=Object.keys(map);
        if(!keys.length){ box.innerHTML=''; return; }
        box.innerHTML='<h3 style="margin-bottom:12px;">🖥️ درآمد بر اساس نوع دستگاه</h3><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr)); gap:12px;">'+keys.map(k=>`
            <div class="glass" style="padding:16px; text-align:center;">
                <p style="color:rgba(255,255,255,0.6); font-size:0.85rem; margin-bottom:6px;">${k}</p>
                <p style="font-weight:900; color:#22c55e;">${map[k].total.toLocaleString('fa-IR')} تومان</p>
                <p style="font-size:0.75rem; color:rgba(255,255,255,0.4);">${map[k].count} سشن</p>
            </div>`).join('')+'</div>';
    }

    
    // ========== Remote Agent (LAN control) ==========
    const AGENT_PORT = 48721;
    function agentToken(){ try{ return localStorage.getItem('alvand_agentToken')||'alvand123'; }catch(e){ return 'alvand123'; } }
    function setAgentToken(v){ try{ localStorage.setItem('alvand_agentToken', (v||'').trim()||'alvand123'); }catch(e){} showToast('توکن ایجنت ذخیره شد','success'); }
    async function agentFetch(ip, path){
        const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),5000);
        try{
            const r=await fetch(`http://${ip}:${AGENT_PORT}${path}${path.includes('?')?'&':'?'}token=${encodeURIComponent(agentToken())}`, {signal:ctl.signal});
            clearTimeout(t);
            return await r.json();
        }catch(e){ clearTimeout(t); throw e; }
    }
    async function agentCmd(idx, action){
        const c=clients[idx];
        if(!c||!c.ip){ showToast('اول IP دستگاه را وارد کن (مدیریت زمان)','error'); return; }
        try{
            if(action==='warn') await agentFetch(c.ip, '/warn?msg='+encodeURIComponent('چند دقیقه تا پایان وقت باقی مانده است'));
            else await agentFetch(c.ip, '/'+action);
            c.online=true; saveData(); renderClients();
            showToast(action==='lock'?'🔒 قفل شد':action==='unlock'?'🔓 باز شد':'⚠️ هشدار فرستاده شد','success');
        }catch(e){ c.online=false; saveData(); renderClients(); showToast('ایجنت جواب نداد (خاموش یا قطع شبکه؟)','error'); }
    }
    async function agentShutdown(idx){
        const c=clients[idx];
        if(!c||!c.ip){ showToast('اول IP دستگاه را وارد کن','error'); return; }
        if(!confirm(`سیستم ${escapeHtml(c.name)} خاموش شود؟`)) return;
        try{ await agentFetch(c.ip, '/shutdown?sec=10'); showToast('⏻ دستور خاموش فرستاده شد','success'); }
        catch(e){ c.online=false; saveData(); renderClients(); showToast('ایجنت جواب نداد','error'); }
    }
    /* One dead machine used to stall the whole sweep: the loop awaited
     * agentFetch() sequentially, so every unreachable PC blocked the status
     * refresh for a full timeout, one after another. Poll in parallel with a
     * bounded pool and treat any failure as "offline". */
    const AGENT_POLL_CONCURRENCY=6;
    async function agentPollOne(c){
        if(!c.ip) return false;
        try{
            const s=await agentFetch(c.ip, '/status');
            const on=!!(s&&s.ok);
            if(c.online!==on){ c.online=on; return true; }
        }catch(e){
            if(c.online!==false){ c.online=false; return true; }
        }
        return false;
    }
    async function agentPoll(){
        let changed=false;
        const targets=clients.filter(c=>!!c.ip);
        if(!targets.length) return;
        for(let i=0;i<targets.length;i+=AGENT_POLL_CONCURRENCY){
            const batch=targets.slice(i, i+AGENT_POLL_CONCURRENCY);
            const results=await Promise.allSettled(batch.map(agentPollOne));
            results.forEach(r=>{ if(r.status==='fulfilled' && r.value) changed=true; });
        }
        if(changed){ saveData(); renderClients(); }
    }
    setInterval(agentPoll, 30000);

    // Initialize
    function init() {
        // Fail-closed: lock FIRST, render later. Gates are also visible by
        // default in HTML, so even a slow/failed boot never exposes the app.
        try{ checkLogin(); }catch(e){}
        try{ initLicenseGate(); }catch(e){ try{ showLicenseGate(); }catch(_){} }
        createParticles();
        updateDateTime();
        setInterval(updateDateTime, 1000);
        setInterval(updateTimers, 1000);
        requestNotificationPermission();
        // Fast path: only what the first paint (dashboard + gates) needs.
        updateStats();
        renderWeeklyChart();
        loadTariffs();
        loadRoundingMode();
        try{ loadLiteMode(); }catch(e){}
        try{ initCompareMonths(); }catch(e){}
        try{ renderYearlyChart(); }catch(e){}
        applyTheme(currentTheme);
        try{ restoreNavGroups(); }catch(e){}
        expandNavGroupForSection('dashboard');
        updateReservationBadge();
        setInterval(checkAutoBackup, 60000);
        setInterval(updateActiveTariffDisplay, 60000);
        setInterval(checkBirthdays, 3600000);
        setInterval(renderStationHours, 30000);
        setTimeout(()=>{ try{ checkForUpdate(false); }catch(e){} }, 8000);
        setInterval(()=>{ try{ checkForUpdate(false); }catch(e){} }, 6*3600*1000);
        try{ applyAppLang(); }catch(e){}
        setTimeout(updateFirebaseStatus, 1500);
        // migrate reservations clientName
        try{
        reservations.forEach(r=>{ if(!r.clientName){ let cl=clients.find(c=>c.id===r.clientId); if(cl) r.clientName=cl.name; }});
        saveReservations();
        }catch(e){}
        // setup date default
        let d=document.getElementById('resDate'); if(d && !d.value) d.valueAsDate=new Date();
        let t=document.getElementById('resStartTime'); if(t && !t.value) t.value = new Date().toTimeString().slice(0,5);
        updateActiveTariffDisplay();
        // Deferred: heavy renders for hidden sections run after first paint,
        // one at a time. Opening any section also renders it (see showSection).
        setTimeout(function(){
            const jobs=[
                renderClients, renderReservations, renderCustomers, renderServices,
                updateBuffetStats, renderExpenses, updateExpenseStats, updateCashCardStats,
                renderTariffSchedules, updateIncome, renderTypeBreakdown, renderStationHours,
                renderThemeGrid, loadAlarmSettings, updateUpdateUI, checkBirthdays,
                renderCustomersEnhanced, updateBackupDisplay, checkAutoBackup, syncLiteUI,
                updateDbSizeText
            ];
            (function next(i){
                if(i>=jobs.length) return;
                try{ jobs[i](); }catch(e){}
                setTimeout(function(){ next(i+1); }, 30);
            })(0);
        }, 120);
    }

    function requestNotificationPermission(){
        if('Notification' in window && Notification.permission==='default'){
            Notification.requestPermission().catch(()=>{});
        }
    }

    function createParticles() {
        const container = document.getElementById('particles');
        if(!container) return;
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.width = Math.random() * 100 + 50 + 'px';
            p.style.height = p.style.width;
            p.style.left = Math.random() * 100 + '%';
            p.style.top = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 20 + 's';
            p.style.animationDuration = (15 + Math.random() * 10) + 's';
            container.appendChild(p);
        }
    }

    function updateDateTime() {
        const now = new Date();
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        let d=document.getElementById('currentDate'); if(d) d.textContent = now.toLocaleDateString('fa-IR', options);
        let t=document.getElementById('currentTime'); if(t) t.textContent = now.toLocaleTimeString('fa-IR');
    }

    /* Permission map. Sections marked `true` are always reachable; every other
       section is gated on a permission checkbox. The old code did
       `if(!key) return true`, so any section missing from this map (membership,
       events, phonebook, tools, insights, shifts, branches, employees,
       notifications, gameHistory, activityLog, waiting, advancedSearch,
       busyHours...) was wide open to any operator. Unknown sections now fail
       CLOSED, and the list below covers every section that exists in index.html. */
    const PERM_MAP = {
        dashboard: true,
        clients: 'clients',
        buffet: 'buffet',
        reservations: 'reservations',
        reports: 'reports',
        income: 'income',
        expenses: 'expenses',
        customers: 'customers',
        backup: 'backup',
        operators: 'operators',
        tariffs: 'tariffs',
        tariffSchedule: 'tariffs',
        // grouped extras - reuse the closest existing permission
        stationHours: 'reports',
        settings: true,
        license: 'operators',
        membership: 'customers',
        phonebook: 'customers',
        events: 'customers',
        gameHistory: 'customers',
        branches: 'operators',
        shifts: 'employees',
        employees: 'employees',
        activityLog: 'operators',
        notifications: true,
        busyHours: 'reports',
        // Finance + Operations pages (added with finance.js / ops.js). Without
        // these two entries the fail-closed rule above locked BOTH pages: the nav
        // item and every hasPerm('finance'|'ops') call returned false.
        finance: 'reports',      // P&L, handover, tax, debt reminders = money read
        ops: 'clients',          // packages, coupons, deposits (amanat), maintenance
        insights: 'reports',
        tools: 'operators',
        advancedSearch: true,
        waiting: 'clients',
    };
    function hasPerm(section){
        if(!currentOperator) return true;
        if(currentOperator.role==='admin') return true;
        if(!section) return false;
        const p=currentOperator.perms||{};
        // A fresh operator record predating the perms refactor: only the
        // sections that never needed a permission stay reachable.
        if(!p || typeof p!=='object') return PERM_MAP[section]===true;
        const key=PERM_MAP[section];
        if(key===true) return true;
        if(key===undefined) return false;          // fail closed
        return !!p[key];
    }
    /* Guard for every state-changing action. Previously permissions were only
     * checked in showSection(), so hiding a nav item was the ONLY protection:
     * any operator could still call deleteClient(), createBackup(), changeAdmin
     * Credentials() and the rest from the console or a stale bookmarked action.
     * Admin bypasses; an admin with no operator record (clean dev install) is
     * allowed so the app never dead-ends. */
    function requirePerm(section, actionLabel){
        try{
            if(hasPerm(section)) return true;
            showToast('⛔ دسترسی ندارید' + (actionLabel? ' ('+actionLabel+')':'') + ' - اپراتور','error');
        }catch(e){}
        return false;
    }
    function showSection(section, el) {
        if(!hasPerm(section)){
            showToast('⛔ دسترسی ندارید - اپراتور','error');
            return;
        }
        document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
        let sec=document.getElementById(section + '-section');
        if(sec) sec.style.display = 'block';
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        // no explicit element (programmatic jump, e.g. from the dashboard) ->
        // highlight the sidebar entry that owns this section
        if (!el) el = navEntryForSection(section) || document.getElementById('navSettings');
        if (el && el.classList) el.classList.add('active');
        expandNavGroupForSection(section);
        if (window.innerWidth <= 768) closeSidebar();

        if (section === 'dashboard') { updateStats(); renderActiveClients(); renderWeeklyChart(); }
        if (section === 'clients') renderClients();
        if (section === 'tariffs') { try{loadTariffs();}catch(e){} try{renderStationTypes();}catch(e){} }
        if (section === 'stationHours') { try{renderStationHours();}catch(e){} }
        if (section === 'income') updateIncome(); try{renderTypeBreakdown();}catch(e){}
        if (section === 'reservations') renderReservations();
        if (section === 'customers') renderCustomers();
        if (section === 'buffet') { renderServices(); updateBuffetStats(); }
        if (section === 'expenses') { renderExpenses(); updateExpenseStats(); updateCashCardStats(); }
        if (section === 'tariffSchedule') { renderTariffSchedules(); updateActiveTariffDisplay(); }
        if (section === 'backup') { updateBackupDisplay(); }
        if (section === 'license') { renderLicenseSection(); }
        if (section === 'settings') { try{renderThemeGrid();}catch(e){} try{loadAlarmSettings();}catch(e){} try{updateUpdateUI();}catch(e){} try{syncAdminCredCard();}catch(e){} try{syncLiteUI();}catch(e){} }
        if (section === 'reports') {}
        if (section === 'membership') { try{renderMembershipPlans();}catch(e){} }
        if (section === 'employees') { try{renderEmployees();}catch(e){} }
        if (section === 'busyHours') { try{renderBusyHoursReport();}catch(e){} }
        if (section === 'gameHistory') { try{renderGameHistory();}catch(e){} }
        if (section === 'activityLog') { try{renderActivityLog();}catch(e){} }
        if (section === 'notifications') { try{renderNotifications();}catch(e){} }
        if (section === 'advancedSearch') { var si=document.getElementById('searchInput'); if(si) si.focus(); }
        if (section === 'waiting') { try{renderWaitingList();}catch(e){} try{updateWaitingBadge();}catch(e){} }
        if (section === 'events') { try{renderEvents();}catch(e){} }
        if (section === 'branches') { try{renderBranches();}catch(e){} }
        if (section === 'shifts') { try{renderShifts();}catch(e){} }
        if (section === 'insights') { try{generateMonthlyComparison();}catch(e){} try{renderForecast();}catch(e){} try{renderSurveyStats();}catch(e){} try{renderStockAlerts();}catch(e){} }
        if (section === 'tools') { try{renderPOSConfig();}catch(e){} try{renderSecurityPanel();}catch(e){} try{renderCustomerPortal();}catch(e){} try{fillToolsCustomerSelects();}catch(e){} }
        if (section === 'phonebook') { try{renderPhonebook();}catch(e){} try{renderSmsConfig();}catch(e){} try{renderSmsLog();}catch(e){} }
    }
    function fillToolsCustomerSelects(){
        var opts = customers.map(function(c){ return '<option value="'+c.id+'">'+escapeHtml(c.name)+'</option>'; }).join('');
        var l=document.getElementById('loyaltyCustomerSelect'); if(l) l.innerHTML='<option value="">انتخاب مشتری...</option>'+opts;
        var q=document.getElementById('qrCustomerSelect'); if(q) q.innerHTML='<option value="">انتخاب مشتری...</option>'+opts;
    }

    /* Toasts. There was a single #toast node: a second toast reused it and the
     * first one's 3.5s timer then removed the "show" class from the NEWER
     * message, so toasts vanished early (or stacked invisibly). Each toast now
     * gets its own node, the queue is bounded, and a repeated identical message
     * is debounced instead of spamming. */
    const _toastHistory = new Map();
    function showToast(msg, type='success'){
        try{
            const host = document.getElementById('toast') ? document.getElementById('toast').parentElement : document.body;
            if(!host) return;
            const text = String(msg == null ? '' : msg);
            // debounce identical repeats (the 1s tick can repeat the same warning)
            const last = _toastHistory.get(text) || 0;
            const now = Date.now();
            if (now - last < 2500) return;
            _toastHistory.set(text, now);
            if (_toastHistory.size > 60) _toastHistory.clear();

            const el = document.createElement('div');
            el.className = 'toast show toast-' + (type || 'success');
            el.setAttribute('role', 'status');
            el.textContent = text;
            const container = document.getElementById('toast');
            if(container && container.classList.contains('toast')) container.parentElement.insertBefore(el, container);
            else host.appendChild(el);
            // keep the DOM small
            const live = document.querySelectorAll('body > .toast.show, body > div > .toast.show');
            if (live.length > 4) live[0].remove();
            setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>{ try{ el.remove(); }catch(e){} }, 400); }, 3500);
        }catch(e){}
    }

    // ========== Client Management ==========
    function renderClients() {
        const grid = document.getElementById('clientsGrid');
        if(!grid) return;
        try{renderTypeFilter();}catch(e){}
        if (clients.length === 0) {
            grid.innerHTML = '<div class="glass" style="grid-column: 1/-1; text-align: center; padding: 60px;"><p style="font-size: 3rem; margin-bottom: 16px;">&#128123;</p><p>هیچ کلاینتی ثبت نشده</p><p style="color:rgba(255,255,255,0.4); font-size:0.85rem; margin-top:8px;">برای شروع یک کلاینت جدید اضافه کنید</p></div>';
            try{ window._cliSig = []; }catch(e){}
            return;
        }

        let shownIdx = clients.map((c,i)=>i).filter(i=> !clientTypeFilter || (clients[i].stationType||'none')===clientTypeFilter);
        if(shownIdx.length===0){
            grid.innerHTML = '<div class="glass" style="grid-column: 1/-1; text-align: center; padding: 60px;"><p>در این دسته دستگاهی نیست</p></div>';
            try{ window._cliSig = clients.map(clientSig); }catch(e){}
            return;
        }
        grid.innerHTML = shownIdx.map((i) => { const c=clients[i];
            const statusClass = c.status === 'online' ? 'status-online' : c.status === 'paused' ? 'status-paused' : 'status-offline';
            const statusColor = c.status === 'online' ? '#22c55e' : c.status === 'paused' ? '#f59e0b' : '#ef4444';
            const tariffLabel = c.tariff === 'single' ? 'تک نفره' : 'دو نفره';
            const tariffClass = c.tariff === 'single' ? 'tariff-single' : 'tariff-double';
            const timeStr = formatTime(c.elapsed || 0);
            const cost = calculateCost(c);
            const reserved = getActiveReservationForClient(c.id);
            const isReserved = !!reserved;
            const timerEnabled = c.timerDuration && c.timerDuration>0;
            let remainingStr = '';
            let remainingSec = 0;
            if(timerEnabled && c.status==='online'){
                remainingSec = c.timerDuration*60 - (c.elapsed||0);
                if(remainingSec<0) remainingSec=0;
                remainingStr = formatTime(remainingSec);
            }

            return `
                <div class="glass client-card ${isReserved?'reserved-card':''} ${c.status==='online'?'client-card-active':''} ${timerEnabled && remainingSec<=300 && c.status==='online' ? 'shake':''}" data-cid="${c.id}" style="padding: 24px; position: relative; overflow: hidden;">
                    <div class="client-status-bar" style="position: absolute; top: 0; left: 0; right: 0; height: 10px; background: ${statusColor}; box-shadow: 0 2px 14px ${statusColor};"></div>
                    ${isReserved? `<div style="position:absolute; top:10px; left:12px;" class="reservation-badge">🔒 رزرو: ${escapeHtml(reserved.customerName)} - ${reserved.startTime} (${reserved.duration}د)</div>`:''}
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px; margin-top:${isReserved?'22px':'0'};">
                        <div>
                            <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 4px;">${escapeHtml(c.name)}</h3>
                            <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                            <span class="tariff-badge ${tariffClass}">${tariffLabel}</span>
                            <span style="display:inline-flex; align-items:center; gap:4px; vertical-align:middle;" title="نفر اضافه — از لحظه تغییر حساب می‌شود">
                                <button class="glass-btn" style="padding:2px 9px; font-size:0.8rem; font-weight:900;" title="کم کردن نفر اضافه" onclick="changeClientExtra(${numId(i)},-1)">−</button>
                                <span class="tariff-badge tariff-extra">+${c.extra||0} نفر</span>
                                <button class="glass-btn" style="padding:2px 9px; font-size:0.8rem; font-weight:900;" title="اضافه کردن نفر (از این لحظه حساب می‌شود)" onclick="changeClientExtra(${numId(i)},1)">+</button>
                            </span>
                            ${(()=>{ let st=getStationType(c.stationType); return st? `<span class="tariff-badge" style="background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3);">${st.icon} ${escapeHtml(st.name)}</span>` : ''; })()}
                            ${timerEnabled? `<span class="tariff-badge" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.3);">⏱️ ${c.timerDuration}د</span>`:''}
                            </div>
                        </div>
                        <span style="display:flex; align-items:center; gap:8px;">${c.status==='online'?'<span class="active-pill">● فعال</span>':''}<span class="status-dot ${statusClass}" title="${c.status}"></span></span>
                    </div>

                    <div style="text-align: center; margin: 16px 0;">
                        <p style="font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-bottom: 4px;">زمان سپری شده</p>
                        <p id="cliElapsed-${i}" style="font-size: 1.8rem; font-weight: 900; font-variant-numeric: tabular-nums; ${timerEnabled && c.status==='online' && remainingSec<=300 ? 'color:#ef4444;':''}">${timeStr}</p>
                        ${timerEnabled? `<div id="cliRemainWrap-${i}" style="margin-top:6px;"><span id="cliRemain-${i}" class="countdown-badge" style="${remainingSec<=300 && c.status==='online'?'background:rgba(239,68,68,0.25); color:#fff;':''}">${c.status==='online'? '⏳ باقی‌مانده: '+remainingStr : '⏱️ تایمر: '+c.timerDuration+' دقیقه'}</span></div>` : ''}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 16px;">
                        <span style="color: rgba(255,255,255,0.6);">هزینه فعلی:</span>
                        <span id="cliCost-${i}" style="font-weight: 900; color: #22c55e; font-size: 1.1rem;">${cost.toLocaleString('fa-IR')} تومان</span>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:rgba(99,102,241,0.08); border-radius:12px; padding:8px 12px;">
                        <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);">تعرفه:</span>
                        <select onchange="changeClientTariff(${i}, this.value)" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:4px 8px; color:white; font-size:0.75rem; width:auto;">
                            <option value="single" ${c.tariff==='single'?'selected':''}>تک نفره</option>
                            <option value="double" ${c.tariff==='double'?'selected':''}>دو نفره</option>
                        </select>
                        <span style="font-size:0.7rem; color:#fbbf24;">${getActiveTariff()? '⏰ ساعتی فعال':''}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:rgba(34,197,94,0.06); border-radius:12px; padding:8px 12px;">
                        <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);">نوع دستگاه:</span>
                        <select onchange="changeClientType(${i}, this.value)" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:4px 8px; color:white; font-size:0.75rem; width:auto;">
                            ${stationTypes.map(t=>`<option value="${t.id}" ${c.stationType===t.id?'selected':''}>${t.icon} ${escapeHtml(t.name)}</option>`).join('')}
                            ${!c.stationType?'<option value="" selected>—</option>':''}
                        </select>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:rgba(6,182,214,0.06); border-radius:12px; padding:8px 12px;">
                        <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);">🌐 ${escapeHtml(c.ip||'بدون IP')} <span class="status-dot ${c.online===true?'status-online':(c.online===false?'status-offline':'status-paused')}" title="${c.online===true?'متصل':(c.online===false?'قطع':'نامشخص')}"></span></span>
                    </div>
                    ${(() => {
                        let svc = clientServiceMap[c.id]||[];
                        let svcCost = svc.reduce((sum, it)=>{ let s=services.find(x=>x.id===it.serviceId); return sum + (s? s.price*it.qty:0); },0);
                        return svcCost>0? `<div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); border-radius:12px; padding:8px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:0.75rem; color:#fbbf24;">🍿 بوفه: ${svc.length} قلم</span><span style="font-weight:800; color:#fbbf24; font-size:0.85rem;">${svcCost.toLocaleString('fa-IR')} تومان</span></div>`:'';
                    })()}
                    ${c.status==='online'
                        ? `<button class="glass-btn glass-btn-danger" style="width:100%; padding:12px; font-size:1rem; font-weight:900; margin-bottom:8px;" onclick="toggleClientTimer(${numId(i)})">■ پایان</button>`
                        : `<button class="glass-btn glass-btn-success" style="width:100%; padding:12px; font-size:1rem; font-weight:900; margin-bottom:8px;" onclick="toggleClientTimer(${numId(i)})">▶ ${c.status==='paused'?'ادامه':'شروع'}</button>`}
                    <button class="glass-btn" style="width:100%; padding:10px; font-size:0.85rem; margin-bottom:8px;" onclick="toggleClientMenu(${numId(i)})">⋯ بیشتر</button>
                    <div id="clientMenu-${i}" style="display:none; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px; margin-bottom:8px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom:8px;">
                            ${c.status==='online' ? `<button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="pauseClient(${numId(i)})">⏸ توقف موقت</button>` : ''}
                            <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="openTimeModal(${numId(i)})">&#9201; زمان / مبلغ</button>
                            <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="openReservationModal(${numId(i)})">&#128197; رزرو</button>
                            <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="openAddServiceToClient(${numId(i)})">🍿 بوفه</button>
                            <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="openShareModalForClient(${numId(i)})">📤 ارسال</button>
                            <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="generatePdfForClient(${numId(i)})">📄 PDF</button>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom:8px;">
                            <button class="glass-btn" style="padding: 8px 6px; font-size: 0.78rem;" title="باز کردن" onclick="agentCmd(${numId(i)},'unlock')">🔓</button>
                            <button class="glass-btn" style="padding: 8px 6px; font-size: 0.78rem;" title="قفل" onclick="agentCmd(${numId(i)},'lock')">🔒</button>
                            <button class="glass-btn" style="padding: 8px 6px; font-size: 0.78rem;" title="هشدار" onclick="agentCmd(${numId(i)},'warn')">⚠️</button>
                            <button class="glass-btn glass-btn-danger" style="padding: 8px 6px; font-size: 0.78rem;" title="خاموش" onclick="agentShutdown(${numId(i)})">⏻</button>
                        </div>
                        <button class="glass-btn glass-btn-danger" style="width:100%; padding: 8px 10px; font-size: 0.78rem;" onclick="deleteClient(${numId(i)})">&#128465; حذف</button>
                    </div>
                </div>
            `;
        }).join('');
        try{ window._cliSig = clients.map(clientSig); }catch(e){}
    }

    // Structural signature of a client card. Elapsed/cost are live-updated
    // in place and excluded, so the 1s tick never rebuilds the DOM (no jumps).
    function clientSig(c){
        let r = null;
        try{ r = getActiveReservationForClient(c.id); }catch(e){}
        let svc = clientServiceMap[c.id]||[];
        let rem = (c.timerDuration && c.timerDuration>0 && c.status==='online') ? Math.max(0, c.timerDuration*60 - (c.elapsed||0)) : -1;
        return [c.status, c.tariff, c.extra||0, c.stationType||'', c.timerDuration||0,
            svc.length, svc.reduce((s,x)=>s+x.serviceId+':'+x.qty+',',''),
            r?(r.id||(r.customerName+'|'+r.startTime)):'', c.ip||'',
            c.online==null?'?':(c.online?'1':'0'),
            (rem>=0 && rem<=300)?'warn':'ok', c.name].join('|');
    }
    function setLiveText(id, txt){
        let el = document.getElementById(id);
        if(el && el.textContent !== txt) el.textContent = txt;
        return !!el;
    }
    // Called every second from the timer tick: updates only text nodes.
    // Full re-render happens only when something structural actually changed.
    function refreshClientCards(){
        let sigs = [];
        try{ sigs = clients.map(clientSig); }catch(e){ renderClients(); return; }
        let prev = window._cliSig || [];
        let needFull = sigs.length !== prev.length;
        if(!needFull){
            for(let k=0;k<sigs.length;k++){
                if(sigs[k] !== prev[k]){ needFull = true; break; }
            }
        }
        if(needFull){ renderClients(); try{ updateStats(); }catch(e){} return; }
        for(let i=0;i<clients.length;i++){
            let c = clients[i];
            setLiveText('cliElapsed-'+i, formatTime(c.elapsed||0));
            try{ setLiveText('cliCost-'+i, calculateCost(c).toLocaleString('fa-IR') + ' تومان'); }catch(e){}
            if(c.timerDuration && c.timerDuration>0){
                if(c.status==='online'){
                    let rem = Math.max(0, c.timerDuration*60 - (c.elapsed||0));
                    setLiveText('cliRemain-'+i, '⏳ باقی‌مانده: ' + formatTime(rem));
                } else {
                    setLiveText('cliRemain-'+i, '⏱️ تایمر: ' + c.timerDuration + ' دقیقه');
                }
            }
            let elp = document.getElementById('cliElapsed-'+i);
            if(elp){
                let hot = !!(c.timerDuration && c.timerDuration>0 && c.status==='online' && (c.timerDuration*60-(c.elapsed||0))<=300);
                let col = hot ? '#ef4444' : '';
                if(elp.style.color !== col) elp.style.color = col;
            }
        }
    }

    function openAddClientModal() {
        const left = licenseStationsLeft();
        const hint = document.getElementById('newClientCapHint');
        if(hint){
            hint.style.display = (left===null) ? 'none' : 'block';
            hint.textContent = (left===null) ? '' : ('ظرفیت لایسنس: ' + clients.length + ' از ' + licenseStationCap() + ' دستگاه — ' + left + ' جای خالی');
        }
        const btnAdd = document.getElementById('addClientSubmitBtn');
        if(btnAdd && left!==null) btnAdd.disabled = (left<=0);
        try{fillClientTypeSelect();}catch(e){}
        document.getElementById('addClientModal').classList.add('show');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('show');
        if(id==='timerEndModal'){ stopAlarmSound(); }
    }

    function addClient() {
        if(!requirePerm('clients','افزودن دستگاه')) return;
        const name = document.getElementById('newClientName').value.trim();
        const ip = (document.getElementById('newClientIP') && document.getElementById('newClientIP').value.trim()) || '';
        const tariffEl = document.getElementById('newClientTariff');
        const tariff = (tariffEl && tariffEl.value) || 'single';
        const extra = (typeof parseFaNumber==='function')? parseFaNumber(document.getElementById('newClientExtra').value,0) : (parseInt(document.getElementById('newClientExtra').value) || 0);
        const timerMin = (typeof parseFaNumber==='function')? parseFaNumber(document.getElementById('newClientTimer')?.value,0) : (parseInt(document.getElementById('newClientTimer')?.value) || 0);

        if (!name) { showToast('لطفاً نام کلاینت را وارد کنید','error'); return; }
        // paid capacity: never let the shop exceed the number of stations it bought
        if(!enforceStationCapacity()) return;

        clients.push({
            id: Date.now(),
            name,
            tariff,
            extra,
            stationType: (document.getElementById('newClientType') && document.getElementById('newClientType').value) || 'pc',
            ip: (document.getElementById('newClientIP') && document.getElementById('newClientIP').value.trim()) || '',
            status: 'offline',
            elapsed: 0,
            extraSeconds: 0,
            startTime: null,
            totalCost: 0,
            createdAt: new Date().toISOString(),
            timerDuration: timerMin,
            notified: false
        });

        saveData();
        closeModal('addClientModal');
        renderClients();
        updateStats();
        document.getElementById('newClientName').value = '';
        if(document.getElementById('newClientIP')) document.getElementById('newClientIP').value='';
        if(document.getElementById('newClientTimer')) document.getElementById('newClientTimer').value='0';
        showToast('کلاینت با موفقیت اضافه شد','success');
    }

    function deleteClient(index) {
        if(!requirePerm('clients','حذف دستگاه')) return;
        if (confirm('آیا از حذف این کلاینت اطمینان دارید؟')) {
            let cid=clients[index].id;
            clients.splice(index, 1);
            // also remove reservations for this client
            reservations = reservations.filter(r=>r.clientId!==cid);
            // fix stale index references (array shifted): otherwise the 1s tick
            // reads .elapsed of undefined -> "Cannot read properties" errors
            if(currentTimeClient===index){ currentTimeClient=null; try{closeModal('timeModal');}catch(e){} }
            else if(currentTimeClient!==null && currentTimeClient>index){ currentTimeClient--; }
            if(alarmClientIndex===index){ try{dismissAlarm();}catch(e){} alarmClientIndex=null; }
            else if(alarmClientIndex!==null && alarmClientIndex>index){ alarmClientIndex--; }
            saveData();
            saveReservations();
            renderClients();
            updateStats();
            renderReservations();
            updateReservationBadge();
            showToast('کلاینت حذف شد','success');
        }
    }

    // ========== Timer Management Enhanced ==========
    function openTimeModal(index) {
        currentTimeClient = index;
        const c = clients[index];
        if(!c){ currentTimeClient=null; return; }
        document.getElementById('timeClientName').textContent = c.name;
        let _ipEl=document.getElementById('timeClientIP');
        if(_ipEl){ _ipEl.value=c.ip||''; _ipEl.onchange=()=>{ c.ip=_ipEl.value.trim(); saveData(); renderClients(); }; }
        document.getElementById('timeModal').classList.add('show');
        // show reservation warning if any
        let res=getActiveReservationForClient(c.id);
        let warn=document.getElementById('reservationWarning');
        if(res){
            warn.style.display='block';
            warn.innerHTML=`🔒 <b>رزرو فعال:</b> ${escapeHtml(res.customerName)} - ${res.date} ساعت ${res.startTime} به مدت ${res.duration} دقیقه<br>اگر مشتری رزرو حاضر شد، این سشن را پایان دهید.`;
        } else {
            // check upcoming within 1 hour
            let up=getUpcomingReservationForClient(c.id);
            if(up){
                warn.style.display='block';
                warn.innerHTML=`⚠️ <b>رزرو نزدیک:</b> ${escapeHtml(up.customerName)} - ${up.date} ${up.startTime} (${up.duration}د)`;
            } else warn.style.display='none';
        }
        // check conflicting if trying to start
        let conflictCheck = checkStartConflict(c.id);
        if(conflictCheck){
            warn.style.display='block';
            warn.innerHTML=`⛔ <b>تداخل رزرو:</b> این دستگاه توسط <b>${escapeHtml(conflictCheck.customerName)}</b> برای ${conflictCheck.date} ساعت ${conflictCheck.startTime} رزرو شده است!`;
        }
        updateTimeDisplay();
        updateTimerStatusText();
    }

    function updateTimeDisplay() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        if(!c){ currentTimeClient=null; try{closeModal('timeModal');}catch(e){} return; }
        document.getElementById('timeDisplay').textContent = formatTime(c.elapsed || 0);
        // countdown
        let cd=document.getElementById('countdownDisplay');
        let cdVal=document.getElementById('countdownValue');
        if(c.timerDuration && c.timerDuration>0){
            cd.style.display='block';
            let remaining = c.timerDuration*60 - (c.elapsed||0);
            if(remaining<0) remaining=0;
            cdVal.textContent = formatTime(remaining);
            if(remaining<=300 && c.status==='online'){
                cdVal.style.color='#fff';
                cdVal.style.background='rgba(239,68,68,0.35)';
                document.getElementById('timeDisplay').classList.add('timer-warning');
            } else {
                cdVal.style.color='#fca5a5';
                cdVal.style.background='';
                document.getElementById('timeDisplay').classList.remove('timer-warning');
            }
        } else {
            cd.style.display='none';
            document.getElementById('timeDisplay').classList.remove('timer-warning');
        }
    }

    function updateTimerStatusText(){
        if(currentTimeClient===null) return;
        let c=clients[currentTimeClient];
        let el=document.getElementById('timerStatusText');
        if(!el) return;
        if(c.timerDuration && c.timerDuration>0){
            el.textContent=`تایمر فعال: ${c.timerDuration} دقیقه - هشدار در پایان`;
            el.style.color='#22c55e';
        } else {
            el.textContent='بدون تایمر (نامحدود)';
            el.style.color='rgba(255,255,255,0.5)';
        }
    }

    function setTimerPreset(mins){
        if(currentTimeClient===null) return;
        clients[currentTimeClient].timerDuration = mins;
        clients[currentTimeClient].notified=false;
        saveData();
        updateTimeDisplay();
        updateTimerStatusText();
        renderClients();
        showToast(mins? `تایمر ${mins} دقیقه تنظیم شد`:'تایمر لغو شد','success');
    }
    function setCustomTimer(){
        let mins=parseFaNumber(document.getElementById('timerDurationInput').value, 0)||0;
        if(mins<=0){ showToast('زمان معتبر وارد کنید','error'); return;}
        setTimerPreset(mins);
        document.getElementById('timerDurationInput').value='';
    }

    function startTimer() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        if(!c){ currentTimeClient=null; return; }
        // check reservation conflict before starting
        let conflict=checkStartConflict(c.id);
        if(conflict){
            if(!confirm(`⚠️ این دستگاه برای ${escapeHtml(conflict.customerName)} در ${conflict.date} ساعت ${conflict.startTime} رزرو شده است! آیا مطمئن هستید میخواهید شروع کنید؟`)){
                return;
            }
        }
        if (c.status === 'online') return;

        c.status = 'online';
        c.startTime = Date.now() - (c.elapsed || 0) * 1000;
        c.notified=false;
        saveData();
        renderClients();
        updateStats();
        c._warned5=false; c._warned1=false; c._timeNotifSent=false;
        if(c.ip){ agentFetch(c.ip,'/unlock').then(()=>{ c.online=true; }).catch(()=>{ c.online=false; showToast('⚠️ ایجنت جواب نداد ولی تایمر شروع شد','warning'); }); }
        showToast(`تایمر ${escapeHtml(c.name)} شروع شد`,'success');
    }

    function pauseTimer() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        if(!c){ currentTimeClient=null; return; }
        if (c.status !== 'online') return;

        c.status = 'paused';
        c.elapsed = Math.floor((Date.now() - c.startTime) / 1000);
        c.startTime = null;
        saveData();
        renderClients();
        updateStats();
        showToast('تایمر متوقف شد','warning');
    }

    // Card-level timer controls: single Start/Stop toggle + "More" menu
    function toggleClientTimer(i){
        currentTimeClient = i;
        if(!clients[i]){ currentTimeClient=null; return; }
        if(clients[i].status === 'online') stopTimer();
        else startTimer();
    }
    function pauseClient(i){
        currentTimeClient = i;
        if(!clients[i]){ currentTimeClient=null; return; }
        pauseTimer();
    }
    function toggleClientMenu(i){
        let m = document.getElementById('clientMenu-' + i);
        if(!m) return;
        let open = m.style.display !== 'none';
        document.querySelectorAll('[id^="clientMenu-"]').forEach(x => x.style.display = 'none');
        document.querySelectorAll('#clientsGrid .client-card.menu-open').forEach(x => x.classList.remove('menu-open'));
        m.style.display = open ? 'none' : 'block';
        if(!open){
            // selected card (menu open) is exempt from spotlight blur
            let card = m.closest ? m.closest('.client-card') : null;
            if(card) card.classList.add('menu-open');
        }
    }

    /** Elapsed seconds of a client, derived safely from startTime.
     *  A client can be left with status 'online' and startTime === null (old or
     *  hand-edited backup). Math.floor((Date.now() - null)/1000) then yields
     *  ~1.7e9 seconds and the bill explodes to billions of toman. Never trust
     *  startTime blindly. */
    function clientElapsed(c) {
        if (!c) return 0;
        let e = Number(c.elapsed);
        if (!isFinite(e) || e < 0) e = 0;
        if (c.status === 'online') {
            const st = Number(c.startTime);
            if (isFinite(st) && st > 0) {
                const derived = Math.floor((Date.now() - st) / 1000);
                // a derived value can never be smaller than what is already stored
                if (isFinite(derived) && derived >= 0) e = Math.max(e, derived);
            }
        }
        // hard sanity ceiling: 400 days, no shop runs a session for longer
        if (e > 34560000) {
            console.warn('[gamenet] implausible elapsed clamped for', c && c.name, e);
            e = 34560000;
        }
        return Math.floor(e);
    }
    function stopTimer() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        if(!c){ currentTimeClient=null; return; }
        if (c.status === 'online') {
            const before = Number(c.elapsed) || 0;
            c.elapsed = clientElapsed(c);
            if (c.elapsed > before * 1000 + 3600) {
                // the stored elapsed was missing/garbage: fall back to it and warn
                c.elapsed = before;
                showToast('⏱️ زمان این کلاینت نامعتبر بود - دستی بررسی کنید','error');
            }
            c.startTime = null;
            c.status = 'paused';
            saveData();
        }
        // calculate costs including buffet
        let gameCost = calculateCost(c);
        let buffetCost = 0;
        let svc = clientServiceMap[c.id]||[];
        svc.forEach(it=>{ let s=services.find(x=>x.id===it.serviceId); if(s) buffetCost += (Number(s.price)||0)*(Number(it.qty)||0); });
        if (gameCost < 0) gameCost = 0;
        if (buffetCost < 0) buffetCost = 0;
        let total = applyRounding(gameCost + buffetCost);
        pendingPayment = {
            clientIdx: currentTimeClient,
            clientId: c.id,
            clientName: c.name,
            duration: c.elapsed,
            gameCost, buffetCost, total,
            tariff: c.tariff, extra: c.extra,
            stationType: c.stationType||null,
            services: (Array.isArray(svc) ? svc : []).slice()
        };
        document.getElementById('paymentClientName').textContent = c.name + ' - ' + formatTime(c.elapsed);
        document.getElementById('payDuration').textContent = formatTime(c.elapsed);
        document.getElementById('payGameCost').textContent = gameCost.toLocaleString('fa-IR') + ' تومان';
        document.getElementById('payBuffetCost').textContent = buffetCost.toLocaleString('fa-IR') + ' تومان';
        document.getElementById('payTotal').textContent = total.toLocaleString('fa-IR') + ' تومان';
        let roundingInfo = document.getElementById('payRoundingInfo');
        if(roundingMode!=='none') roundingInfo.textContent = 'رند: '+roundingMode+' (اصلی: '+(gameCost+buffetCost).toLocaleString('fa-IR')+')';
        else roundingInfo.textContent = '';
        closeModal('timeModal');
        document.getElementById('paymentModal').classList.add('show');
    }
    function confirmPayment(){
        if(!pendingPayment) return;
        // Resolve by ID, not by the array index captured when the modal opened:
        // if a client was deleted meanwhile the index now points at somebody
        // else and the bill would be charged to the wrong station.
        let c = clients.find(x => String(x.id) === String(pendingPayment.clientId));
        if(!c){ pendingPayment=null; try{closeModal('paymentModal');}catch(e){} showToast('این کلاینت دیگر وجود ندارد','error'); return; }
        let method = document.getElementById('payMethod').value;
        let total = pendingPayment.total;
        // record session
        sessions.push({
            branchId: currentBranchId(),      // which branch earned this
            clientId: pendingPayment.clientId,
            clientName: pendingPayment.clientName,
            duration: pendingPayment.duration,
            cost: total,
            gameCost: pendingPayment.gameCost,
            buffetCost: pendingPayment.buffetCost,
            tariff: pendingPayment.tariff,
            extra: pendingPayment.extra,
            extraSeconds: c.extraSeconds||0,
            stationType: pendingPayment.stationType||null,
            stationTypeName: (function(){ let st=getStationType(pendingPayment.stationType); return st? st.icon+' '+st.name : ''; })(),
            date: new Date().toISOString(),
            timerDuration: c.timerDuration||0,
            paymentMethod: method,
            services: pendingPayment.services
        });
        // record sales for buffet profit
        pendingPayment.services.forEach(it=>{
            let s=services.find(x=>x.id===it.serviceId);
            if(s){
                // reduce stock
                s.stock = Math.max(0, (s.stock||0) - it.qty);
                // record sale
                sales.push({serviceId:s.id, name:s.name, qty:it.qty, price:s.price, cost:s.cost, profit:(s.price-s.cost)*it.qty, date:new Date().toISOString(), branchId:currentBranchId()});
            }
        });
        // record cash/card
        let payments = safeParse(localStorage.getItem('alvand_payments')||'[]');
        if(method==='split'){
            payments.push({amount: Math.round(total/2), method:'cash', date:new Date().toISOString(), clientName:pendingPayment.clientName});
            payments.push({amount: total - Math.round(total/2), method:'card', date:new Date().toISOString(), clientName:pendingPayment.clientName});
        } else {
            payments.push({amount: total, method, date:new Date().toISOString(), clientName:pendingPayment.clientName});
        }
        localStorage.setItem('alvand_payments', JSON.stringify(payments));
        c.status = 'offline';
        c.startTime = null;
        c.elapsed=0;
        c.extraSeconds=0;
        c._lastElapsed=null;
        c.notified=false;
        // full reset for the next customer: extras, timer/amount, internal flags
        c.extra=0;
        c.timerDuration=0;
        c.timerDurationSec=0;
        c._warned5=false;
        c._warned1=false;
        c._timeNotifSent=false;
        try{ window._calcDur=null; }catch(e){}
        c.totalCost = (c.totalCost || 0) + total;
        // clear client services
        delete clientServiceMap[c.id];
        saveClientServiceMap();
        saveServices(); saveSales();
        saveData();
        closeModal('paymentModal');
        renderClients();
        updateStats();
        updateIncome(); try{renderTypeBreakdown();}catch(e){}
        updateBuffetStats();
        updateCashCardStats();
        updateExpenseStats();
        showToast(`تسویه ${escapeHtml(pendingPayment.clientName)} - ${total.toLocaleString('fa-IR')} تومان (${method==='cash'?'نقد':method==='card'?'کارت':'نصف/نصف'})`,'success');
        let idx=sessions.length-1;
        pendingPayment=null;
        setTimeout(()=> openShareModalForSession(idx), 600);
    }

    function resetTimer() {
        if(!requirePerm('clients','ریست تایمر')) return;
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        if(!c){ currentTimeClient=null; return; }
        /* Wiping elapsed/extraSeconds used to throw the played time away with no
         * confirmation and no record: nothing was written to `sessions`, so the
         * money silently vanished from the books. Confirm with the exact amount
         * and keep the discarded time in a ledger so it can still be billed. */
        const seconds = clientElapsed(c);
        const money = calculateCost(c);
        const doReset = () => {
            if(seconds>0){
                try{
                    const led = safeParse(localStorage.getItem('alvand_discardedTime'))||[];
                    led.push({clientId:c.id, clientName:c.name, seconds:seconds, cost:money, date:new Date().toISOString()});
                    localStorage.setItem('alvand_discardedTime', JSON.stringify(led));
                    logAct('clients', 'زمان تایمر '+c.name+': '+(seconds/60).toFixed(1)+' دقیقه / '+money.toLocaleString('fa-IR'));
                }catch(e){}
            }
            c.elapsed = 0;
            c.extraSeconds=0;
            c._lastElapsed=null;
            c.startTime = null;
            c.status = 'offline';
            c.notified=false;
            saveData();
            updateTimeDisplay();
            renderClients();
            updateStats();
            showToast(seconds>0
                ? 'تایمر صفر شد، '+money.toLocaleString('fa-IR')+'‌تومان در دفتر ثبت شد'
                : 'تایمر ریست شد','success');
        };
        if(seconds<=0){ doReset(); return; }
        askConfirm('تایمر «'+c.name+'» ریست شود؟ کل دقیقه بازی از دست حذر می‌شود حذر کانست و به صورت دفترثبار نکهده می‌شود.', doReset);
    }

    function addTime() {
        if (currentTimeClient === null) return;
        const mins = parseFaNumber(document.getElementById('timeAdjust').value, 0) || 0;
        const c = clients[currentTimeClient];
        if(!c){ currentTimeClient=null; return; }
        c.elapsed = (c.elapsed || 0) + mins * 60;
        if (c.status === 'online' && c.startTime) {
            // elapsed is derived from startTime every tick: shift it back so the bonus sticks
            c.startTime -= mins * 60 * 1000;
        }
        // keep pro-rata extra billing consistent (manual edits don't back-charge extras)
        c._lastElapsed = c.elapsed;
        saveData();
        updateTimeDisplay();
        renderClients();
        showToast(mins + ' دقیقه اضافه شد','success');
    }

    function subTime() {
        if (currentTimeClient === null) return;
        const mins = parseFaNumber(document.getElementById('timeAdjust').value, 0) || 0;
        const c = clients[currentTimeClient];
        if(!c){ currentTimeClient=null; return; }
        c.elapsed = Math.max(0, (c.elapsed || 0) - mins * 60);
        if (c.status === 'online') {
            // shift startTime forward; clamp so elapsed never goes negative
            c.startTime = Date.now() - c.elapsed * 1000;
        }
        // keep pro-rata extra billing consistent (manual edits don't refund extras)
        c._lastElapsed = c.elapsed;
        saveData();
        updateTimeDisplay();
        renderClients();
        showToast(mins + ' دقیقه کم شد','success');
    }

    function updateTimers() {
        let changed = false;
        let now=Date.now();
        clients.forEach((c, idx) => {
            if (c.status === 'online' && c.startTime) {
                c.elapsed = Math.floor((now - c.startTime) / 1000);
                // pro-rata extra billing: accumulate extra-person-seconds as time passes,
                // so extras added mid-game are charged only from the moment they join
                if (c._lastElapsed == null) {
                    c._lastElapsed = c.elapsed;
                    if (!(c.extraSeconds > 0) && (c.extra || 0) > 0) c.extraSeconds = (c.extra || 0) * (c.elapsed || 0);
                } else {
                    const dSec = c.elapsed - c._lastElapsed;
                    if (dSec > 0 && (c.extra || 0) > 0) c.extraSeconds = (c.extraSeconds || 0) + (c.extra || 0) * dSec;
                    if (dSec !== 0) c._lastElapsed = c.elapsed;
                }
                changed = true;
                // check timer end
                if(c.timerDuration && c.timerDuration>0 && !c.notified){
                    let remaining = c.timerDuration*60 - c.elapsed;
                    if(remaining<=0){
                        c.notified=true;
                        try{ saveData(); window._lastPersist=Date.now(); }catch(e){}
                        triggerAlarm(idx);
                    } else if(remaining<=300 && !c._warned5){
                        // was `remaining===300`: a delayed tick (background
                        // throttling, a busy main process, a sleeping laptop)
                        // jumps from 320 to 260 and the warning never fired.
                        c._warned5 = true;
                        showToast(`⏰ ${escapeHtml(c.name)}: کمتر از 5 دقیقه تا پایان`,'warning');
                        if(c.ip) agentFetch(c.ip,'/warn?msg='+encodeURIComponent(c.name+': 5 دقیقه تا پایان وقت')).catch(()=>{});
                        if('Notification' in window && Notification.permission==='granted'){
                            try{ new Notification('هشدار زمان', {body: `${escapeHtml(c.name)}: 5 دقیقه باقی مانده`}); }catch(e){}
                        }
                    } else if(remaining<=60 && !c._warned1){
                        c._warned1 = true;
                        showToast(`⏰ ${escapeHtml(c.name)}: 1 دقیقه تا پایان`,'warning');
                    }
                }
            }
        });
        if (changed) {
            // FIXED: persist at most every 15s (was every 1s -> SSD wear + UI jank + corruption window).
            var __now = Date.now();
            window._lastPersist = window._lastPersist || 0;
            if (__now - window._lastPersist > 15000) { window._lastPersist = __now; try { saveData(); } catch(e){} }
            // Live tick: update only text nodes (no DOM rebuild -> no page jumps).
            // Full re-render happens inside refresh* only on structural changes.
            try {
                if (document.getElementById('clients-section')?.style.display !== 'none') refreshClientCards();
                if (document.getElementById('dashboard-section')?.style.display !== 'none'){ refreshDashboardLive(); }
            } catch(e){}
            // Station hours: only when visible, at most every 30s (heavy innerHTML rebuild).
            window._lastStationHours = window._lastStationHours || 0;
            try {
                if (__now - window._lastStationHours > 30000 && document.getElementById('stationHours-section')?.style.display !== 'none') {
                    window._lastStationHours = __now;
                    renderStationHours();
                }
            } catch(e){}
        }
        if (currentTimeClient !== null) updateTimeDisplay();
        // update reservation badge periodically
        if(changed && Math.floor(now/10000)%6===0) updateReservationBadge();
    }

    function triggerAlarm(clientIdx){
        alarmClientIndex=clientIdx;
        let c=clients[clientIdx];
        if(!c){ alarmClientIndex=null; return; }
        document.getElementById('timerEndText').innerHTML=`کلاینت <b>${escapeHtml(c.name)}</b> به زمان تعیین شده (${c.timerDuration} دقیقه) رسید.<br>زمان سپری شده: <b>${formatTime(c.elapsed)}</b><br>هزینه فعلی: <b>${calculateCost(c).toLocaleString('fa-IR')} تومان</b>`;
        document.getElementById('timerEndModal').classList.add('show');
        // warning lights
        document.getElementById('warningBar')?.classList.add('show');
        document.getElementById('warningFull')?.classList.add('show');
        // flash station card
        setTimeout(()=>{ document.querySelectorAll('.client-card').forEach((el,idx)=>{ if(idx===clientIdx) el.classList.add('station-flash'); }); },100);
        playAlarmSound();
        if(navigator.vibrate){
            let pattern=[]; for(let i=0;i<(alarmRepeat||3);i++) pattern.push(600,200);
            navigator.vibrate(pattern);
        }
        if('Notification' in window && Notification.permission==='granted'){
            try{ new Notification('⏰ زمان به پایان رسید', {body: `${escapeHtml(c.name)} - ${c.timerDuration} دقیقه تمام شد`, requireInteraction:true}); }catch(e){}
        }
        if(c.ip){ agentFetch(c.ip,'/lock?msg='+encodeURIComponent(c.name+': وقت تمام شد! به صندوق مراجعه کنید')).catch(()=>{}); }
        showToast(`⏰ زمان ${escapeHtml(c.name)} تمام شد!`,'error');
        // auto hide lights after 20s
        setTimeout(()=>{ dismissLights(); }, 20000);
    }
    function dismissLights(){
        document.getElementById('warningBar')?.classList.remove('show');
        document.getElementById('warningFull')?.classList.remove('show');
        document.querySelectorAll('.station-flash').forEach(el=>el.classList.remove('station-flash'));
    }
    function dismissAlarm(){
        document.getElementById('timerEndModal').classList.remove('show');
        stopAlarmSound();
        dismissLights();
        alarmClientIndex=null;
    }
    function extendTimerEnd(mins){
        if(alarmClientIndex===null) return;
        let c=clients[alarmClientIndex];
        if(!c){ alarmClientIndex=null; return; }
        c.timerDuration = (c.timerDuration||0)+mins;
        c.notified=false;
        saveData();
        dismissAlarm();
        renderClients();
        showToast(`⏱️ ${mins} دقیقه اضافه شد - تایمر جدید: ${c.timerDuration} دقیقه`,'success');
    }
    function stopTimerFromAlarm(){
        if(alarmClientIndex===null) return;
        currentTimeClient=alarmClientIndex;
        dismissAlarm();
        stopTimer();
    }
    function playAlarmSound(){
        // always silence whatever is playing first: the old code created a new
        // AudioContext on every alarm and only closed the newest one, so a busy
        // night leaked dozens of contexts until Chromium capped them and the
        // alarm went silent.
        try{ stopAlarmSound(); }catch(e){}
        try{
            let reps = (parseInt(alarmRepeat)===0) ? 99999 : Math.max(1, parseInt(alarmRepeat)||3);
            if(customAlarmData && alarmSound==='custom'){
                let audio=new Audio(customAlarmData);
                audio.volume=0.8;
                let count=0;
                audio.onended=()=>{ count++; if(count<reps && !window._alarmStopped){ try{audio.currentTime=0; audio.play();}catch(e){} } };
                audio.play().catch(()=>{});
                window._customAudio=audio;
                return;
            }
            let AudioCtx=window.AudioContext||window.webkitAudioContext;
            if(!AudioCtx) return;
            // reuse one context for the whole session instead of one per alarm
            let ctx=window._alarmCtx;
            if(!ctx || ctx.state==='closed'){
                ctx=new AudioCtx();
                window._alarmCtx=ctx;
            }
            if(ctx.state==='suspended'){ ctx.resume().catch(()=>{}); }
            let freqMap={beep:880, bell:660, alarm:990, chime:523, game:440};
            let base=freqMap[alarmSound]||880;
            let type = alarmSound==='alarm' ? 'square' : alarmSound==='bell' ? 'triangle' : 'sine';
            let done=0;
            window._alarmStopped=false;
            function burst(){
                if(window._alarmStopped) return;
                if(done>=reps){ stopAlarmSound(); return; }
                done++;
                try{
                    let t=ctx.currentTime+0.02;
                    for(let i=0;i<3;i++){
                        let o=ctx.createOscillator(), g=ctx.createGain();
                        o.type=type;
                        let f=base;
                        if(alarmSound==='game') f=400+Math.random()*600;
                        else if(alarmSound==='chime') f=base*Math.pow(1.25,i);
                        else if(i===2) f=base*1.4;
                        o.frequency.value=f;
                        g.gain.setValueAtTime(0.0001,t+i*0.3);
                        g.gain.exponentialRampToValueAtTime(0.4,t+i*0.3+0.03);
                        g.gain.exponentialRampToValueAtTime(0.0001,t+i*0.3+0.26);
                        o.connect(g); g.connect(ctx.destination);
                        o.start(t+i*0.3); o.stop(t+i*0.3+0.32);
                    }
                }catch(e){}
            }
            burst();
            window._alarmInt=setInterval(burst, 1500);
            if(reps<99999){ window._alarmEndTimer=setTimeout(()=>stopAlarmSound(), reps*1500+1200); }
        }catch(e){ console.log('audio err',e); }
    }
    function setAlarmSound(v){ alarmSound=v; localStorage.setItem('alvand_alarmSound',v); showToast('صدا: '+v,'success'); }
    function setAlarmRepeat(v){ alarmRepeat=parseInt(v); localStorage.setItem('alvand_alarmRepeat',v); showToast('تکرار: '+(parseInt(v)===0?'نامحدود':v),'success'); }
    function loadCustomAlarm(input){
        let file=input.files[0];
        if(!file) return;
        let reader=new FileReader();
        reader.onload=e=>{ customAlarmData=e.target.result; localStorage.setItem('alvand_customAlarm', customAlarmData); alarmSound='custom'; localStorage.setItem('alvand_alarmSound','custom'); showToast('فایل صدا ذخیره شد','success'); };
        reader.readAsDataURL(file);
    }
    function testAlarm(){ playAlarmSound(); showToast('تست صدا','success'); setTimeout(stopAlarmSound,3000); }
    function stopAlarmSound(){
        try{
            window._alarmStopped=true;
            if(window._alarmInt){ clearInterval(window._alarmInt); window._alarmInt=null; }
            if(window._alarmEndTimer){ clearTimeout(window._alarmEndTimer); window._alarmEndTimer=null; }
            if(window._customAudio){ try{window._customAudio.pause();}catch(e){} window._customAudio=null; }
            if(window._alarmCtx){ try{window._alarmCtx.close();}catch(e){} window._alarmCtx=null; }
            window._alarmOsc=null;
        }catch(e){}
        try{ if(navigator.vibrate) navigator.vibrate(0); }catch(e){}
    }

    // ========== Reservation System ==========
    function saveReservations(){ localStorage.setItem('alvand_reservations', JSON.stringify(reservations)); }
    function updateReservationBadge(){
        let upcoming=reservations.filter(r=> isReservationActiveOrUpcoming(r)).length;
        let badge=document.getElementById('reservationBadge');
        if(badge){
            if(upcoming>0){ badge.textContent=upcoming; badge.style.display='inline-block';}
            else badge.style.display='none';
        }
    }
    function isReservationActiveOrUpcoming(r){
        let now=new Date();
        let start=new Date(r.date+'T'+r.startTime);
        let end=new Date(start.getTime()+ r.duration*60000);
        // upcoming within 2 hours or active now
        return end>now && start < new Date(now.getTime()+ 24*3600*1000);
    }
    function getActiveReservationForClient(clientId){
        let now=new Date();
        return reservations.find(r=>{
            if(r.clientId!==clientId) return false;
            if(r.status==='cancelled' || r.status==='completed') return false;
            let start=new Date(r.date+'T'+r.startTime);
            let end=new Date(start.getTime()+ r.duration*60000);
            return now>=start && now<=end;
        });
    }
    function getUpcomingReservationForClient(clientId){
        let now=new Date();
        let future=reservations.filter(r=>{
            if(r.clientId!==clientId) return false;
            if(r.status==='cancelled' || r.status==='completed') return false;
            let start=new Date(r.date+'T'+r.startTime);
            return start>now && start < new Date(now.getTime()+ 24*3600*1000*2);
        }).sort((a,b)=> new Date(a.date+'T'+a.startTime) - new Date(b.date+'T'+b.startTime));
        return future[0]||null;
    }
    function checkStartConflict(clientId){
        let now=new Date();
        // check if any reservation for this client that is active now or starts within 30 min
        return reservations.find(r=>{
            if(r.clientId!==clientId) return false;
            if(r.status==='cancelled' || r.status==='completed') return false;
            let start=new Date(r.date+'T'+r.startTime);
            let end=new Date(start.getTime()+ r.duration*60000);
            // active now
            if(now>=start && now<=end) return true;
            // starts within next 15 minutes
            let diff=(start - now)/60000;
            if(diff>=0 && diff<=15) return true;
            return false;
        });
    }
    function checkReservationConflict(clientId, date, startTime, duration, excludeId=null){
        let newStart=new Date(date+'T'+startTime);
        let newEnd=new Date(newStart.getTime()+ duration*60000);
        return reservations.find(r=>{
            if(excludeId && r.id===excludeId) return false;
            if(r.clientId!==clientId) return false;
            if(r.status==='cancelled' || r.status==='completed') return false;
            let rStart=new Date(r.date+'T'+r.startTime);
            let rEnd=new Date(rStart.getTime()+ r.duration*60000);
            return (newStart < rEnd && newEnd > rStart);
        });
    }

    function openReservationModal(prefillClientIdx=null){
        if(!requirePerm('reservations','رزرو')) return;
        // populate clients dropdown
        let sel=document.getElementById('resClientId');
        sel.innerHTML = clients.map(c=> `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        if(clients.length===0){ showToast('ابتدا کلاینت اضافه کنید','error'); return; }
        if(prefillClientIdx!==null && clients[prefillClientIdx]) sel.value=clients[prefillClientIdx].id;
        // reset fields if new
        if(prefillClientIdx!==null || !document.getElementById('reservationId').value){
            document.getElementById('reservationId').value='';
            document.getElementById('resCustomerName').value='';
            document.getElementById('resPhone').value='';
            document.getElementById('resEmail').value='';
            document.getElementById('resTelegram').value='';
            document.getElementById('resNotes').value='';
            document.getElementById('reservationConflictWarning').style.display='none';
            // default date/time now
            let now=new Date();
            document.getElementById('resDate').valueAsDate=now;
            document.getElementById('resStartTime').value=now.toTimeString().slice(0,5);
        }
        // live conflict check on change
        sel.onchange = checkResConflictLive;
        document.getElementById('resDate').onchange=checkResConflictLive;
        document.getElementById('resStartTime').onchange=checkResConflictLive;
        document.getElementById('resDuration').onchange=checkResConflictLive;
        document.getElementById('reservationModal').classList.add('show');
    }
    function checkResConflictLive(){
        let cid=parseInt(document.getElementById('resClientId').value);
        let date=document.getElementById('resDate').value;
        let time=document.getElementById('resStartTime').value;
        let dur=parseFaNumber(document.getElementById('resDuration').value, 0);
        let exId=document.getElementById('reservationId').value? parseInt(document.getElementById('reservationId').value):null;
        if(!cid || !date || !time) return;
        let conflict=checkReservationConflict(cid,date,time,dur,exId);
        let warn=document.getElementById('reservationConflictWarning');
        if(conflict){
            warn.style.display='block';
            warn.innerHTML=`⛔ تداخل: این دستگاه قبلاً برای <b>${escapeHtml(conflict.customerName)}</b> در ${conflict.date} ساعت ${conflict.startTime} به مدت ${conflict.duration} دقیقه رزرو شده است.`;
        } else warn.style.display='none';
    }
    function saveReservation(){
        let idVal=document.getElementById('reservationId').value;
        let clientId=parseInt(document.getElementById('resClientId').value);
        let customerName=document.getElementById('resCustomerName').value.trim();
        let phone=document.getElementById('resPhone').value.trim();
        let email=document.getElementById('resEmail').value.trim();
        let telegram=document.getElementById('resTelegram').value.trim();
        let date=document.getElementById('resDate').value;
        let startTime=document.getElementById('resStartTime').value;
        let duration=parseFaNumber(document.getElementById('resDuration').value, 0);
        let notes=document.getElementById('resNotes').value.trim();

        if(!customerName){ showToast('نام مشتری الزامی است','error'); return; }
        if(!clientId || !date || !startTime || !duration){ showToast('فیلدهای ستاره‌دار را پر کنید','error'); return; }

        let conflict=checkReservationConflict(clientId,date,startTime,duration, idVal?parseInt(idVal):null);
        if(conflict){
            if(!confirm(`تداخل رزرو با ${escapeHtml(conflict.customerName)} در ${conflict.date} ${conflict.startTime} وجود دارد. باز هم ثبت شود؟`)) return;
        }

        let client=clients.find(c=>c.id===clientId);
        if(idVal){
            let r=reservations.find(x=>x.id===parseInt(idVal));
            Object.assign(r,{clientId, clientName:client?client.name:'', customerName, phone, email, telegram, date, startTime, duration, notes});
            showToast('رزرو بروزرسانی شد','success');
        } else {
            reservations.push({
                id: Date.now(),
                clientId,
                clientName: client?client.name:'',
                customerName, phone, email, telegram, date, startTime, duration, notes,
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            showToast('رزرو با موفقیت ثبت شد','success');
        }
        saveReservations();
        closeModal('reservationModal');
        renderReservations();
        renderClients();
        updateReservationBadge();
        renderCustomers();
    }
    function editReservation(id){
        let r=reservations.find(x=>x.id===id);
        if(!r) return;
        document.getElementById('reservationId').value=r.id;
        // populate dropdown
        let sel=document.getElementById('resClientId');
        sel.innerHTML = clients.map(c=> `<option value="${c.id}" ${c.id===r.clientId?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
        document.getElementById('resCustomerName').value=r.customerName;
        document.getElementById('resPhone').value=r.phone||'';
        document.getElementById('resEmail').value=r.email||'';
        document.getElementById('resTelegram').value=r.telegram||'';
        document.getElementById('resDate').value=r.date;
        document.getElementById('resStartTime').value=r.startTime;
        document.getElementById('resDuration').value=r.duration;
        document.getElementById('resNotes').value=r.notes||'';
        document.getElementById('reservationConflictWarning').style.display='none';
        document.getElementById('reservationModal').classList.add('show');
    }
    function deleteReservation(id){
        if(!requirePerm('reservations','حذف رزرو')) return;
        if(!confirm('رزرو حذف شود؟')) return;
        reservations=reservations.filter(r=>r.id!==id);
        saveReservations();
        renderReservations();
        renderClients();
        updateReservationBadge();
        showToast('رزرو حذف شد','success');
    }
    function completeReservation(id){
        let r=reservations.find(x=>x.id===id);
        if(r){ r.status='completed'; saveReservations(); renderReservations(); showToast('رزرو تکمیل شد','success'); }
    }
    function renderReservations(filter='all'){
        if(filter) currentFilter=filter;
        else filter=currentFilter;
        let container=document.getElementById('reservationsList');
        if(!container) return;
        // update filter buttons
        ['all','today','upcoming','expired'].forEach(f=>{
            let btn=document.getElementById('filter'+f.charAt(0).toUpperCase()+f.slice(1));
            if(btn){
                if(f===filter) btn.classList.add('glass-btn-success');
                else btn.classList.remove('glass-btn-success');
            }
        });
        let now=new Date();
        let todayStr=localDayKey(now);
        let filtered=[...reservations].sort((a,b)=> new Date(a.date+'T'+a.startTime)-new Date(b.date+'T'+b.startTime));
        if(filter==='today') filtered=filtered.filter(r=>r.date===todayStr);
        else if(filter==='upcoming') filtered=filtered.filter(r=> new Date(r.date+'T'+r.startTime) >= now);
        else if(filter==='expired') filtered=filtered.filter(r=> { let end=new Date(new Date(r.date+'T'+r.startTime).getTime()+ r.duration*60000); return end < now; });

        if(filtered.length===0){
            container.innerHTML=`<div class="glass" style="text-align:center; padding:50px; color:rgba(255,255,255,0.5);">هیچ رزروی یافت نشد</div>`;
            return;
        }
        container.innerHTML=filtered.map(r=>{
            let start=new Date(r.date+'T'+r.startTime);
            let end=new Date(start.getTime()+r.duration*60000);
            let now2=new Date();
            let status=''; let statusColor='#22c55e'; let statusText='آینده';
            if(r.status==='completed'){ statusText='تکمیل شده'; statusColor='#64748b'; }
            else if(r.status==='cancelled'){ statusText='لغو شده'; statusColor='#ef4444'; }
            else if(now2>=start && now2<=end){ statusText='🔴 در حال استفاده'; statusColor='#ef4444'; }
            else if(end < now2){ statusText='منقضی'; statusColor='#f59e0b'; }
            else if(start>now2){ statusText='⏳ آینده'; statusColor='#22c55e'; }
            let isActive = now2>=start && now2<=end;
            return `<div class="glass" style="padding:20px; border-right:4px solid ${statusColor}; ${isActive?'background:rgba(239,68,68,0.08);':''}">
                <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="font-weight:800; margin-bottom:6px;">${escapeHtml(r.clientName)} <span style="font-weight:400; color:rgba(255,255,255,0.5);"> - ${escapeHtml(r.customerName)}</span></h3>
                        <p style="font-size:0.85rem; color:rgba(255,255,255,0.6);">📅 ${r.date} ⏰ ${r.startTime} - ${end.toTimeString().slice(0,5)} (${r.duration} دقیقه)</p>
                        <p style="font-size:0.8rem; color:rgba(255,255,255,0.5); margin-top:4px;">📞 ${escapeHtml(r.phone||'-')} | ✈️ ${escapeHtml(r.telegram||'-')} | 📧 ${escapeHtml(r.email||'-')}</p>
                        ${r.notes? `<p style="font-size:0.8rem; color:#fbbf24; margin-top:6px;">📝 ${escapeHtml(r.notes)}</p>`:''}
                    </div>
                    <span style="padding:6px 12px; border-radius:50px; background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}44; font-size:0.75rem; font-weight:700;">${statusText}</span>
                </div>
                <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
                    <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" onclick="editReservation(${numId(r.id)})">✏️ ویرایش</button>
                    <button class="glass-btn glass-btn-success" style="padding:8px 14px; font-size:0.8rem;" onclick="completeReservation(${numId(r.id)})">✅ تکمیل</button>
                    <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" onclick="openShareModalForReservation(${numId(r.id)})">📤 ارسال</button>
                    <button class="glass-btn glass-btn-danger" style="padding:8px 14px; font-size:0.8rem;" onclick="deleteReservation(${numId(r.id)})">🗑️ حذف</button>
                </div>
            </div>`;
        }).join('');
    }
    function filterReservations(f){ renderReservations(f); }

    /* Roster built from reservations: a quick "who visited and send them the
       report" list. It used to be called renderCustomers() and, because a later
       declaration of the same name wins, it silently REPLACED the customer
       database renderer - which made the whole customer/wallet/loyalty UI
       unreachable. It now has its own name and its own container. */
    function renderCustomerRoster(){
        let container=document.getElementById('customerRosterList');
        if(!container) return;
        // collect unique customers from reservations + sessions
        let map=new Map();
        reservations.forEach(r=>{
            let key=r.customerName+'|'+r.phone;
            if(!map.has(key)) map.set(key,{name:r.customerName, phone:r.phone, email:r.email, telegram:r.telegram, count:0, total:0});
            map.get(key).count++;
        });
        sessions.forEach(s=>{
            // sessions may not have customer info, skip
        });
        // also add from reservations
        let roster=[...map.values()];
        if(roster.length===0){
            container.innerHTML=`<p style="color:rgba(255,255,255,0.5); text-align:center; padding:20px;">هنوز مشتری ثبت نشده - با رزرو کردن مشتری اضافه میشود</p>`;
            return;
        }
        container.innerHTML=`<div style="display:grid; gap:10px;">`+roster.map(c=>`
            <div class="glass" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <h4 style="font-weight:700;">${escapeHtml(c.name)}</h4>
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">📞 ${escapeHtml(c.phone||'-')} | 📧 ${escapeHtml(c.email||'-')} | ✈️ ${escapeHtml(c.telegram||'-')}</p>
                    <p style="font-size:0.75rem; color:rgba(255,255,255,0.4);">${c.count} رزرو</p>
                </div>
                <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" data-cust-name="${escapeHtml(c.name)}" data-cust-phone="${escapeHtml(c.phone||'')}" data-cust-email="${escapeHtml(c.email||'')}" onclick="sendReportToCustomerFromNode(this)">📤 ارسال گزارش</button>
            </div>
        `).join('')+`</div>`;
    }

    // ========== PDF & Share ==========
    function buildShareTextForClient(client, durationSec, cost){
        return `🎮 گزارش گیم‌نت الوند
`+
`کلاینت: ${escapeHtml(client.name)}
`+
`تعرفه: ${client.tariff==='single'?'تک نفره':'دو نفره'} ${client.extra? `+${client.extra} نفر اضافه`:''}
`+
`مدت کارکرد: ${formatTime(durationSec)}
`+
`هزینه: ${cost.toLocaleString('fa-IR')} تومان
`+
`تاریخ: ${new Date().toLocaleString('fa-IR')}
`+
`-------------------
`+
`با تشکر از حضور شما 🙏
`+
`Gamenet Manager Pro`;
    }
    function openShareModalForClient(idx){
        let c=clients[idx];
        let cost=calculateCost(c);
        let text=buildShareTextForClient(c, c.elapsed||0, cost);
        openShareModal(c.name, text, {clientIdx:idx, cost, duration:c.elapsed||0});
        // also prepare PDF html
        preparePdfForClient(c, cost);
    }
    function openShareModalForSession(sessionIdx){
        let s=sessions[sessionIdx];
        if(!s) return;
        let text=`🎮 گزارش گیم‌نت الوند
`+
`کلاینت: ${escapeHtml(s.clientName)}
`+
`مدت: ${formatTime(s.duration)}
`+
`هزینه: ${s.cost.toLocaleString('fa-IR')} تومان
`+
`تعرفه: ${s.tariff==='single'?'تک نفره':'دو نفره'}
`+
`تاریخ: ${new Date(s.date).toLocaleString('fa-IR')}
`+
`Gamenet Manager Pro`;
        openShareModal(s.clientName, text, {sessionIdx});
        preparePdfForSession(s);
    }
    function openShareModalForReservation(resId){
        let r=reservations.find(x=>x.id===resId);
        if(!r) return;
        let text=`🎮 رزرو گیم‌نت الوند
`+
`کلاینت: ${escapeHtml(r.clientName)}
`+
`مشتری: ${escapeHtml(r.customerName)}
`+
`تاریخ: ${r.date} ساعت ${r.startTime}
`+
`مدت: ${r.duration} دقیقه
`+
`تماس: ${escapeHtml(r.phone||'-')}
`+
`Gamenet Manager Pro`;
        openShareModal(r.customerName, text, {});
        preparePdfForReservation(r);
    }
    function openShareModalForCustomer(name, phone, email){
        let text=`🎮 گیم‌نت الوند - گزارش کارکرد
`+
`مشتری: ${name}
`+
`این گزارش از Gamenet Manager Pro ارسال شده است.`;
        openShareModal(name, text, {});
        document.getElementById('sharePhone').value=phone||'';
        document.getElementById('shareEmail').value=email||'';
        // prepare generic pdf
        let html=`<h2 style="text-align:center; color:#4f46e5;">گزارش مشتری: ${name}</h2>
`+
`<p>تلفن: ${escapeHtml(phone||'-')}</p><p>ایمیل: ${escapeHtml(email||'-')}</p>
`+
`<p>تاریخ گزارش: ${new Date().toLocaleString('fa-IR')}</p>
`+
`<hr>
`+
`<p>این گزارش شامل خلاصه فعالیت شما در گیم‌نت میباشد.</p>`;
        setPdfContent(html, `customer-${name}.pdf`);
    }
    // Report share button -> share modal, reading the payload from data-*
    // attributes instead of building an inline JS string out of user data.
    function shareReportFromNode(node){
        if(!node) return;
        try{
            openShareModal(node.getAttribute('data-report-title')||'', node.getAttribute('data-report-text')||'', {});
        }catch(e){ showToast('اشتراک‌گذاری ممکن نشد','error'); }
    }
    function openShareModal(title, text, meta){
        document.getElementById('shareClientName').textContent=title;
        document.getElementById('shareSummary').textContent=text;
        currentShareText=text;
        // try to fill phone/email from reservations if available
        let r=reservations.find(x=>x.customerName===title);
        if(r){
            document.getElementById('sharePhone').value=r.phone||r.telegram||'';
            document.getElementById('shareEmail').value=r.email||'';
        }
        document.getElementById('shareModal').classList.add('show');
    }
    function setPdfContent(html, filename){
        document.getElementById('pdfContentInner').innerHTML=html;
        document.getElementById('pdfDate').textContent=new Date().toLocaleString('fa-IR');
        currentPdfFilename=filename;
        // prepare blob async for share
        setTimeout(()=> generatePdfBlob(), 300);
    }
    function preparePdfForClient(c, cost){
        let html=`
            <h2 style="color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">گزارش کارکرد: ${escapeHtml(c.name)}</h2>
            <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700; width:35%;">نام کلاینت</td><td style="padding:10px; border:1px solid #e2e8f0;">${escapeHtml(c.name)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">تعرفه</td><td style="padding:10px; border:1px solid #e2e8f0;">${c.tariff==='single'?'تک نفره':'دو نفره'} ${c.extra? `+${c.extra} نفر اضافه`:''}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">مدت فعلی</td><td style="padding:10px; border:1px solid #e2e8f0; direction:ltr; text-align:right;">${formatTime(c.elapsed||0)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">هزینه</td><td style="padding:10px; border:1px solid #e2e8f0; color:#16a34a; font-weight:800;">${cost.toLocaleString('fa-IR')} تومان</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">وضعیت</td><td style="padding:10px; border:1px solid #e2e8f0;">${c.status==='online'?'🟢 فعال':c.status==='paused'?'🟡 متوقف':'🔴 آفلاین'}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">تاریخ</td><td style="padding:10px; border:1px solid #e2e8f0;">${new Date().toLocaleString('fa-IR')}</td></tr>
            </table>
            <p style="color:#64748b; font-size:12px; margin-top:20px;">قیمت پایه: تک نفره ${tariffs.single.toLocaleString('fa-IR')} / دو نفره ${tariffs.double.toLocaleString('fa-IR')} / نفر اضافه ${tariffs.extra.toLocaleString('fa-IR')} تومان بر ساعت</p>
        `;
        setPdfContent(html, `client-${escapeHtml(c.name)}-${Date.now()}.pdf`);
    }
    function preparePdfForSession(s){
        let html=`
            <h2 style="color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">رسید سشن: ${escapeHtml(s.clientName)}</h2>
            <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">کلاینت</td><td style="padding:10px; border:1px solid #e2e8f0;">${escapeHtml(s.clientName)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">مدت</td><td style="padding:10px; border:1px solid #e2e8f0; direction:ltr; text-align:right;">${formatTime(s.duration)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">هزینه</td><td style="padding:10px; border:1px solid #e2e8f0; color:#16a34a; font-weight:800;">${s.cost.toLocaleString('fa-IR')} تومان</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">تاریخ</td><td style="padding:10px; border:1px solid #e2e8f0;">${new Date(s.date).toLocaleString('fa-IR')}</td></tr>
            </table>
        `;
        setPdfContent(html, `session-${escapeHtml(s.clientName)}-${Date.now()}.pdf`);
    }
    function preparePdfForReservation(r){
        let html=`
            <h2 style="color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">برگ رزرو: ${escapeHtml(r.clientName)}</h2>
            <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">کلاینت</td><td style="padding:10px; border:1px solid #e2e8f0;">${escapeHtml(r.clientName)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">مشتری</td><td style="padding:10px; border:1px solid #e2e8f0;">${escapeHtml(r.customerName)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">تاریخ و ساعت</td><td style="padding:10px; border:1px solid #e2e8f0;">${r.date} - ${r.startTime}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">مدت</td><td style="padding:10px; border:1px solid #e2e8f0;">${r.duration} دقیقه</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">تماس</td><td style="padding:10px; border:1px solid #e2e8f0;">${escapeHtml(r.phone||'-')}</td></tr>
            </table>
        `;
        setPdfContent(html, `reservation-${escapeHtml(r.customerName)}-${Date.now()}.pdf`);
    }
    // Minimum sane size for a non-empty A4 PDF. Blank renders are ~1-3KB.
    const MIN_PDF_BLOB_SIZE = 4096;
    async function generatePdfBlob(){
        try{
            if(!window.html2pdf || window.__pdfFailed){ currentPdfBlob=null; return; }
            let element=document.getElementById('pdfTemplate');
            let opt={ margin:10, filename:currentPdfFilename, image:{type:'jpeg', quality:0.98}, html2canvas:{scale:2, useCORS:true}, jsPDF:{unit:'mm', format:'a4', orientation:'portrait'}};
            // html2pdf returns promise when using .output
            let worker=html2pdf().set(opt).from(element);
            let pdfBlob=await worker.outputPdf('blob');
            currentPdfBlob=(pdfBlob && pdfBlob.size>MIN_PDF_BLOB_SIZE)? pdfBlob : null;
            if(!currentPdfBlob) console.log('pdf blob blank (size '+(pdfBlob&&pdfBlob.size)+'), will use native print');
        }catch(e){
            console.log('pdf blob err',e);
            currentPdfBlob=null;
        }
    }
    async function downloadCurrentPdf(){
        try{
            if(window.html2pdf && !window.__pdfFailed){
                let element=document.getElementById('pdfTemplate');
                let opt={ margin:10, filename:currentPdfFilename||'report.pdf', image:{type:'jpeg', quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'mm', format:'a4', orientation:'portrait'}};
                let worker=html2pdf().set(opt).from(element);
                let blob=await worker.outputPdf('blob');
                if(blob && blob.size>MIN_PDF_BLOB_SIZE){
                    let url=URL.createObjectURL(blob);
                    let a=document.createElement('a');
                    a.href=url; a.download=currentPdfFilename||'report.pdf';
                    document.body.appendChild(a); a.click();
                    setTimeout(()=>{ try{URL.revokeObjectURL(url); a.remove();}catch(e){} },4000);
                    currentPdfBlob=blob;
                    showToast('PDF دانلود شد','success');
                    return;
                }
                console.log('pdf render blank (size '+(blob&&blob.size)+'), falling back to native print');
            } else {
                showToast('کتابخانه PDF آفلاین در دسترس نیست - چاپ سیستمی','warning');
            }
        }catch(e){
            console.error(e);
        }
        // Fallback: native print dialog (offline-safe, never blank) -> Save as PDF
        showToast('پنجره چاپ باز می‌شود - «ذخیره PDF» را بزن','warning');
        nativePrintPdf();
    }
    // Native system print showing ONLY the receipt template (offline-safe).
    function nativePrintPdf(){
        try{ window.print(); }
        catch(e){ showToast('چاپ ممکن نشد','error'); }
    }
    async function sharePdfFile(){
        if(!currentPdfBlob){
            await generatePdfBlob();
        }
        if(currentPdfBlob && navigator.canShare && navigator.canShare({files:[new File([currentPdfBlob], currentPdfFilename, {type:'application/pdf'})]})){
            try{
                let file=new File([currentPdfBlob], currentPdfFilename, {type:'application/pdf'});
                await navigator.share({title:'Gamenet Report', text:currentShareText, files:[file]});
                showToast('فایل PDF اشتراک گذاشته شد','success');
                return;
            }catch(e){ if(e.name!=='AbortError') console.log(e); }
        }
        // fallback: download and share text
        showToast('اشتراک فایل مستقیم پشتیبانی نمیشود - PDF دانلود میشود','warning');
        downloadCurrentPdf();
    }
    function shareVia(platform){
        let text=currentShareText;
        let phone=document.getElementById('sharePhone').value.trim();
        let email=document.getElementById('shareEmail').value.trim();
        let encoded=encodeURIComponent(text);
        if(platform==='telegram'){
            let url=`https://t.me/share/url?url=&text=${encoded}`;
            window.open(url,'_blank');
            showToast('در تلگرام باز شد','success');
        } else if(platform==='whatsapp'){
            let waPhone=phone.replace(/[^0-9]/g,'');
            let url=waPhone? `https://wa.me/${waPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
            // also try api
            window.open(url,'_blank');
            showToast('در واتساپ باز شد','success');
        } else if(platform==='email'){
            if(!email){
                showToast('اول ایمیل گیرنده را وارد کن','error');
                let em=document.getElementById('shareEmail');
                if(em){ em.focus(); em.style.borderColor='#ef4444'; setTimeout(()=>{em.style.borderColor='';},2500); }
                return;
            }
            let subject=encodeURIComponent('گزارش گیم‌نت الوند');
            let body=encoded;
            window.location.href=`mailto:${email}?subject=${subject}&body=${body}`;
            showToast('ایمیل باز شد','success');
        }
    }

    function generatePdfForClient(idx){
        let c=clients[idx];
        let cost=calculateCost(c);
        preparePdfForClient(c,cost);
        setTimeout(()=>downloadCurrentPdf(),700);
    }
    function generatePdfForSession(idx){
        let s=sessions[idx];
        preparePdfForSession(s);
        setTimeout(()=>downloadCurrentPdf(),700);
    }
    function generatePdfForReport(type){
        let now=new Date();
        let filtered=[];
        let title='';
        if(type==='daily'){ filtered=sessions.filter(s=> isSameDay(s.date, now)); title='گزارش روزانه - '+now.toLocaleDateString('fa-IR');}
        else if(type==='weekly'){ let w=new Date(now-7*24*60*60*1000); filtered=sessions.filter(s=> new Date(s.date)>=w); title='گزارش هفتگی';}
        else { let m=new Date(now-30*24*60*60*1000); filtered=sessions.filter(s=> new Date(s.date)>=m); title='گزارش ماهانه';}
        let total=filtered.reduce((sum,s)=>sum+s.cost,0);
        let html=`<h2 style="color:#1e293b; text-align:center;">${title}</h2>
        <p style="text-align:center; color:#64748b;">تعداد سشن: ${filtered.length} | جمع درآمد: ${total.toLocaleString('fa-IR')} تومان</p>
        <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:12px;">
        <thead><tr style="background:#4f46e5; color:white;"><th style="padding:8px; border:1px solid #ddd;">کلاینت</th><th style="padding:8px; border:1px solid #ddd;">مدت</th><th style="padding:8px; border:1px solid #ddd;">هزینه</th><th style="padding:8px; border:1px solid #ddd;">تاریخ</th></tr></thead><tbody>
        `+filtered.map(s=>`<tr><td style="padding:6px; border:1px solid #e2e8f0;">${escapeHtml(s.clientName)}</td><td style="padding:6px; border:1px solid #e2e8f0; direction:ltr;">${formatTime(s.duration)}</td><td style="padding:6px; border:1px solid #e2e8f0;">${s.cost.toLocaleString('fa-IR')}</td><td style="padding:6px; border:1px solid #e2e8f0; font-size:10px;">${new Date(s.date).toLocaleString('fa-IR')}</td></tr>`).join('')+`</tbody></table>`;
        setPdfContent(html, `report-${type}-${Date.now()}.pdf`);
        setTimeout(()=>downloadCurrentPdf(),800);
    }

    // Tariff Management
    function loadTariffs() {
        if(!requirePerm('tariffs','تعرفه‌ها')) return;
        let a=document.getElementById('tariffSingle'); if(a) a.value = tariffs.single;
        let b=document.getElementById('tariffDouble'); if(b) b.value = tariffs.double;
        let c=document.getElementById('tariffExtra'); if(c) c.value = tariffs.extra;
    }

    function updateTariff(type, value) {
        if(!requirePerm('tariffs','تغییر تعرفه')) return;
        if (type !== 'single' && type !== 'double' && type !== 'extra') {
            showToast('تعرفه نامعتبر','error'); return;
        }
        let v = (typeof parseFaNumber==='function')? parseFaNumber(value,0) : (parseInt(value) || 0);
        // A negative tariff makes calculateCost() return a negative cost: the
        // shop would PAY the customer. 0 makes play free. Clamp instead.
        if (!isFinite(v) || v < 0) { showToast('تعرفه نمی‌تواند منفی باشد','error'); return; }
        if (v > 100000000) { showToast('تعرفه خیلی بزرگ است','error'); return; }
        tariffs[type] = Math.floor(v);
        localStorage.setItem('alvand_tariffs', JSON.stringify(tariffs));
        try{ renderClients(); updateStats(); }catch(e){}
        showToast('تعرفه بروز شد','success');
    }

    // Cost Calculation - with time-based tariff and rounding
    /** Minutes-since-midnight for a "HH:MM" string, or null when malformed.
     *  A tariff schedule with a missing/garbage start or end used to throw here,
     *  and because calculateCost() runs for every card on every tick that single
     *  bad row (a hand-edited or shared backup) blanked the whole page. */
    function parseHhMm(v){
        const m=String(v==null?'':v).match(/^(\d{1,2}):(\d{2})$/);
        if(!m) return null;
        const h=parseInt(m[1],10), mi=parseInt(m[2],10);
        if(!isFinite(h)||!isFinite(mi)||h<0||h>23||mi<0||mi>59) return null;
        return h*60+mi;
    }
    function tariffWindowActive(ts, curMin){
        if(!ts) return false;
        const sMin=parseHhMm(ts.start), eMin=parseHhMm(ts.end);
        if(sMin===null || eMin===null) return false;
        if(sMin===eMin) return false;            // empty window
        if(sMin < eMin) return curMin>=sMin && curMin<eMin;
        return curMin>=sMin || curMin<eMin;       // overnight
    }
    function getActiveTariff(){
        const now = new Date();
        const curMin = now.getHours()*60 + now.getMinutes();
        const list = Array.isArray(tariffSchedules) ? tariffSchedules : [];
        for(const ts of list){
            if(!ts) continue;
            if(tariffWindowActive(ts, curMin)) return ts;
        }
        return null;
    }
    function getStationType(id){ return (stationTypes||[]).find(t=>t.id===id); }
    /** A usable, non-negative rate. Tariffs come from storage/inputs and could be
     *  missing, a string or negative; every consumer must get a number >= 0. */
    function safeRate(v, fallback){
        let n=Number(v);
        if(!isFinite(n) || n<0) n=Number(fallback);
        if(!isFinite(n) || n<0) n=0;
        return n;
    }
    function getTariffForClient(client){
        if(!client) return 0;
        let active = getActiveTariff();
        let tid = client.stationType||null;
        if(tid){
            if(active && active.prices && active.prices[tid]>0) return safeRate(active.prices[tid], 0);
            let st=getStationType(tid);
            if(st && st.price>0) return safeRate(st.price, 0);
        }
        if(active){
            if(client.tariff==='single') return safeRate(active.single, tariffs.single);
            else return safeRate(active.double, tariffs.double);
        }
        return safeRate(client.tariff === 'single' ? tariffs.single : tariffs.double, 0);
    }
    function getExtraRate(){
        let active = getActiveTariff();
        return safeRate(active ? active.extra : tariffs.extra, 0);
    }
    function calculateCost(client) {
        if(!client) return 0;
        const hours = (Number(client.elapsed)||0) / 3600;
        let rate = getTariffForClient(client);
        let cost = Math.round(hours * rate);
        // extras are billed pro-rata from the moment each one joined (see updateTimers)
        const xs = Number(client.extraSeconds)||0;
        if (xs > 0) cost += Math.round((xs / 3600) * getExtraRate());
        if(!isFinite(cost) || cost < 0) cost = 0;
        return applyRounding(cost);
    }
    function calculateDurationFromAmountRaw(amount, tariffType='single', extra=0, stationType=null){
        let rate = 0;
        let active = getActiveTariff();
        if(stationType){
            if(active && active.prices && active.prices[stationType]>0) rate = active.prices[stationType];
            else { let st=getStationType(stationType); if(st && st.price>0) rate = st.price; }
        }
        if(!rate){
            rate = tariffType==='single' ? tariffs.single : tariffs.double;
            if(active) rate = tariffType==='single' ? active.single : active.double;
        }
        rate += extra * getExtraRate();
        if(rate<=0) return 0;
        return Math.round((amount / rate) * 3600);
    }
    function applyRounding(amount){
        let a=Number(amount);
        if(!isFinite(a) || a<=0) return 0;        // never turn 0/-x into a charge
        if(roundingMode==='none') return a;
        // "round down to the nearest 1000" turned a 500-toman session into 0,
        // i.e. free play. Anything under the step keeps its own value.
        if(a<1000) return a;
        if(roundingMode==='up') return Math.ceil(a/1000)*1000;
        if(roundingMode==='down') return Math.max(1000, Math.floor(a/1000)*1000);
        if(roundingMode==='nearest') return Math.max(1000, Math.round(a/1000)*1000);
        return a;
    }

    // Stats
    function updateStats() {
        const active = clients.filter(c => c.status === 'online').length;
        const paused = clients.filter(c => c.status === 'paused').length;
        const total = clients.length;

        const todayIncome = sessions.filter(s => {
            const d = new Date(s.date);
            const now = new Date();
            return isSameDay(d, now);
        }).reduce((sum, s) => sum + s.cost, 0);

        let a=document.getElementById('statActive'); if(a) a.textContent = active;
        let b=document.getElementById('statPaused'); if(b) b.textContent = paused;
        let c=document.getElementById('statTotal'); if(c) c.textContent = total;
        let d2=document.getElementById('statIncome'); if(d2) d2.textContent = todayIncome.toLocaleString('fa-IR') + ' تومان';

        renderActiveClients();
    }

    // Clients shown on the dashboard: running + paused (paused ones must stay
    // reachable, otherwise "resume" is impossible from here).
    function dashboardClientList(){
        return clients.filter(c => c.status === 'online' || c.status === 'paused');
    }
    function renderActiveClients() {
        const container = document.getElementById('activeClientsList');
        if(!container) return;
        const list = dashboardClientList();

        if (list.length === 0) {
            container.innerHTML = '<div class="glass" style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.5);"><p>هیچ کلاینت فعالی وجود ندارد</p></div>';
            try{ window._actIds = ''; }catch(e){}
            return;
        }

        container.innerHTML = list.map(c => {
            const online = c.status === 'online';
            let remaining='';
            if(c.timerDuration && c.timerDuration>0){
                let rem=c.timerDuration*60 - (c.elapsed||0);
                if(rem<0) rem=0;
                remaining=`<p id="actRemain-${c.id}" style="color:${rem<=300?'#fca5a5':'#fbbf24'}; font-size:0.8rem;">⏳ باقی‌مانده: ${formatTime(rem)}</p>`;
            }
            const hot = !!(c.timerDuration && (c.timerDuration*60 - (c.elapsed||0))<=300);
            return `
            <div class="glass active-row clickable" data-cid="${c.id}" onclick="openClientFromDashboard(${numId(c.id)})" title="برای دیدن جزئیات کلیک کنید" style="padding: 18px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <h4 style="font-weight: 700;">${escapeHtml(c.name)}</h4>
                    <span class="qa-state" id="actState-${c.id}" style="background:${online?'rgba(34,197,94,0.18)':'rgba(245,158,11,0.18)'}; color:${online?'#4ade80':'#fcd34d'};">${online?'● فعال':'⏸ متوقف'}</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span class="tariff-badge ${c.tariff === 'single' ? 'tariff-single' : 'tariff-double'}">${c.tariff === 'single' ? 'تک نفره' : 'دو نفره'}</span>
                    ${c.extra ? `<span class="tariff-badge tariff-extra">+${c.extra} نفر</span>` : ''}
                    ${c.timerDuration ? `<span class="tariff-badge" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.3);">⏱️ ${c.timerDuration}د</span>` : ''}
                </div>
                ${remaining}
                <div style="text-align: left;">
                    <p id="actElapsed-${c.id}" style="font-size: 1.4rem; font-weight: 900; font-variant-numeric: tabular-nums; color: ${hot?'#ef4444':'#22c55e'};">${formatTime(c.elapsed || 0)}</p>
                    <p id="actCost-${c.id}" style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">${calculateCost(c).toLocaleString('fa-IR')} تومان</p>
                </div>
                <div class="qa-bar">
                    ${online
                        ? `<button class="qa-btn qa-pause" onclick="event.stopPropagation();dashboardAction(${numId(c.id)},'pause')">⏸ توقف</button>
                           <button class="qa-btn qa-stop" onclick="event.stopPropagation();dashboardAction(${numId(c.id)},'stop')">■ پایان</button>`
                        : `<button class="qa-btn qa-start" onclick="event.stopPropagation();dashboardAction(${numId(c.id)},'start')">▶ ${c.elapsed>0?'ادامه':'شروع'}</button>
                           <button class="qa-btn qa-stop" onclick="event.stopPropagation();dashboardAction(${numId(c.id)},'stop')">■ پایان</button>`}
                    <button class="qa-btn" onclick="event.stopPropagation();openClientFromDashboard(${numId(c.id)})">⋯ جزئیات</button>
                </div>
            </div>`;
        }).join('');
        try{ window._actIds = list.map(c=>c.id).join(','); }catch(e){}
    }
    /** Dashboard quick actions. Resolve the client by ID (never by index). */
    function dashboardAction(id, action){
        const idx = clients.findIndex(c => String(c.id) === String(id));
        if(idx < 0){ showToast('این کلاینت دیگر وجود ندارد','error'); return; }
        currentTimeClient = idx;
        if(action === 'start') startTimer();
        else if(action === 'pause') pauseTimer();
        else if(action === 'stop') stopTimer();
        else return;
        try{ renderActiveClients(); }catch(e){}
    }
    /** Dashboard -> client management: jump to the card, flash it, open its menu. */
    function openClientFromDashboard(id){
        const idx = clients.findIndex(c => String(c.id) === String(id));
        if(idx < 0){ showToast('این کلاینت دیگر وجود ندارد','error'); return; }
        showSection('clients', navEntryForSection('clients'));
        let tries = 0;
        const focus = () => {
            let card = byAttrValue('#clientsGrid .client-card', 'data-cid', String(id));
            if(!card){
                // hidden behind the station-type filter -> clear it and render once more
                if(clientTypeFilter && tries === 0){
                    tries++;
                    clientTypeFilter = '';
                    try{ renderClients(); }catch(e){}
                    setTimeout(focus, 40);
                    return;
                }
                if(tries < 3){ tries++; setTimeout(focus, 60); return; }
                return;
            }
            try{
                card.scrollIntoView({behavior:'smooth', block:'center'});
            }catch(e){}
            try{ card.classList.add('flash-focus'); setTimeout(()=>card.classList.remove('flash-focus'), 2400); }catch(e){}
            // open the "more" menu so every per-client action is right there
            try{
                document.querySelectorAll('[id^="clientMenu-"]').forEach(x => x.style.display = 'none');
                document.querySelectorAll('#clientsGrid .client-card.menu-open').forEach(x => x.classList.remove('menu-open'));
                const menu = document.getElementById('clientMenu-' + idx);
                if(menu){ menu.style.display = 'block'; card.classList.add('menu-open'); }
            }catch(e){}
        };
        setTimeout(focus, 60);
    }

    // Light per-second dashboard tick: numbers + surgical list refresh (no rebuild).
    function refreshDashboardLive(){
        try{
            const active = clients.filter(c => c.status === 'online').length;
            const paused = clients.filter(c => c.status === 'paused').length;
            const now = new Date();
            const todayIncome = sessions.filter(s => isSameDay(s.date, now)).reduce((sum, s) => sum + s.cost, 0);
            let a=document.getElementById('statActive'); if(a && a.textContent != String(active)) a.textContent = active;
            let b=document.getElementById('statPaused'); if(b && b.textContent != String(paused)) b.textContent = paused;
            let c=document.getElementById('statTotal'); if(c && c.textContent != String(clients.length)) c.textContent = clients.length;
            let d2=document.getElementById('statIncome');
            let incTxt = todayIncome.toLocaleString('fa-IR') + ' تومان';
            if(d2 && d2.textContent !== incTxt) d2.textContent = incTxt;
        }catch(e){}
        try{ refreshActiveClients(); }catch(e){}
    }

    // Dashboard counterpart of refreshClientCards: in-place text updates only.
    function refreshActiveClients(){
        let list = [];
        try{ list = dashboardClientList(); }catch(e){ return; }
        let ids = list.map(c=>c.id).join(',');
        if(window._actIds !== ids){ renderActiveClients(); return; }
        list.forEach(c => {
            const online = c.status === 'online';
            setLiveText('actElapsed-'+c.id, formatTime(c.elapsed||0));
            try{ setLiveText('actCost-'+c.id, calculateCost(c).toLocaleString('fa-IR') + ' تومان'); }catch(e){}
            if(c.timerDuration && c.timerDuration>0){
                let rem = Math.max(0, c.timerDuration*60 - (c.elapsed||0));
                setLiveText('actRemain-'+c.id, '⏳ باقی‌مانده: ' + formatTime(rem));
            }
            const st = document.getElementById('actState-'+c.id);
            if(st){
                const txt = online ? '● فعال' : '⏸ متوقف';
                if(st.textContent !== txt){
                    st.textContent = txt;
                    st.style.background = online ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.18)';
                    st.style.color = online ? '#4ade80' : '#fcd34d';
                }
            }
        });
    }

    // Reports - enhanced with PDF button
    function generateReport(type) {
        if(!requirePerm('reports','گزارش‌گیری')) return;
        let a=document.getElementById('btnDaily'); if(a) a.classList.remove('glass-btn-success');
        let b=document.getElementById('btnWeekly'); if(b) b.classList.remove('glass-btn-success');
        let c=document.getElementById('btnMonthly'); if(c) c.classList.remove('glass-btn-success');
        let btn=document.getElementById('btn' + type.charAt(0).toUpperCase() + type.slice(1));
        if(btn) btn.classList.add('glass-btn-success');

        const now = new Date();
        let filtered = [];
        let title = '';

        if (type === 'daily') {
            filtered = sessions.filter(s => isSameDay(s.date, now));
            title = 'گزارش روزانه - ' + now.toLocaleDateString('fa-IR');
        } else if (type === 'weekly') {
            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            filtered = sessions.filter(s => new Date(s.date) >= weekAgo);
            title = 'گزارش هفتگی';
        } else {
            const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
            filtered = sessions.filter(s => new Date(s.date) >= monthAgo);
            title = 'گزارش ماهانه';
        }

        const totalTime = filtered.reduce((sum, s) => sum + s.duration, 0);
        const totalCost = filtered.reduce((sum, s) => sum + s.cost, 0);

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
                <h3 style="margin:0;">${title}</h3>
                <div style="display:flex; gap:8px;">
                    <button class="glass-btn glass-btn-success" style="padding:8px 14px; font-size:0.8rem;" onclick="generatePdfForReport('${escapeHtml(jsStr(type))}')">📄 PDF</button>
                    <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" data-report-title="${escapeHtml(title)}" data-report-text="${escapeHtml(filtered.length+' سشن - '+totalCost.toLocaleString('fa-IR')+' تومان - '+title)}" onclick="shareReportFromNode(this)">📤 اشتراک</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: rgba(255,255,255,0.5);">تعداد نشست‌ها</p>
                    <p style="font-size: 1.8rem; font-weight: 900; color: #818cf8;">${filtered.length}</p>
                </div>
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: rgba(255,255,255,0.5);">درآمد کل</p>
                    <p style="font-size: 1.8rem; font-weight: 900; color: #22c55e;">${totalCost.toLocaleString('fa-IR')} تومان</p>
                </div>
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(255,255,255,0.1);">
                            <th style="padding: 12px; text-align: right;">کلاینت</th>
                            <th style="padding: 12px; text-align: right;">تعرفه</th>
                            <th style="padding: 12px; text-align: right;">مدت</th>
                            <th style="padding: 12px; text-align: right;">هزینه</th>
                            <th style="padding: 12px; text-align: right;">تاریخ</th>
                            <th style="padding: 12px; text-align: center;">عملیات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if(filtered.length===0){
            html += `<tr><td colspan="6" style="text-align:center; padding:30px; color:rgba(255,255,255,0.5);">داده‌ای وجود ندارد</td></tr>`;
        } else {
            // need reverse copy
            [...filtered].reverse().forEach((s, idx) => {
                let origIdx=sessions.indexOf(s);
                html += `
                    <tr class="report-row">
                        <td style="padding: 12px;">${escapeHtml(s.clientName)}</td>
                        <td style="padding: 12px;"><span class="tariff-badge ${s.tariff === 'single' ? 'tariff-single' : 'tariff-double'}">${s.tariff === 'single' ? 'تک نفره' : 'دو نفره'}</span></td>
                        <td style="padding: 12px;">${formatTime(s.duration)}</td>
                        <td style="padding: 12px; font-weight: 700; color: #22c55e;">${s.cost.toLocaleString('fa-IR')}</td>
                        <td style="padding: 12px; color: rgba(255,255,255,0.6); font-size: 0.85rem;">${new Date(s.date).toLocaleString('fa-IR')}</td>
                        <td style="padding: 12px; text-align:center;">
                            <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="generatePdfForSession(${numId(origIdx)})">PDF</button>
                            <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="openShareModalForSession(${numId(origIdx)})">📤</button>
                        </td>
                    </tr>
                `;
            });
        }

        html += '</tbody></table></div>';

        document.getElementById('reportContent').innerHTML = html;
        // also prepare pdf for this report
        let reportHtmlTitle=title;
        // set pdf content for later download
        let pdfHtml=`<h2 style="text-align:center; color:#4f46e5;">${reportHtmlTitle}</h2><p style="text-align:center;">${filtered.length} سشن - ${totalCost.toLocaleString('fa-IR')} تومان</p>`;
        // we don't auto set here, generatePdfForReport will do
    }

    // Income
    function updateIncome() {
        const now = new Date();

        const today = sessions.filter(s => isSameDay(s.date, now)).reduce((sum, s) => sum + s.cost, 0);
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const week = sessions.filter(s => new Date(s.date) >= weekAgo).reduce((sum, s) => sum + s.cost, 0);
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const month = sessions.filter(s => new Date(s.date) >= monthAgo).reduce((sum, s) => sum + s.cost, 0);
        const total = sessions.reduce((sum, s) => sum + s.cost, 0);

        let a=document.getElementById('incomeToday'); if(a) a.textContent = today.toLocaleString('fa-IR') + ' تومان';
        let b=document.getElementById('incomeWeek'); if(b) b.textContent = week.toLocaleString('fa-IR') + ' تومان';
        let c=document.getElementById('incomeMonth'); if(c) c.textContent = month.toLocaleString('fa-IR') + ' تومان';
        let d=document.getElementById('incomeTotal'); if(d) d.textContent = total.toLocaleString('fa-IR') + ' تومان';

        // Breakdown
        const byTariff = { single: 0, double: 0, extra: 0 };
        sessions.forEach(s => {
            if (s.tariff === 'single') byTariff.single += s.cost;
            else byTariff.double += s.cost;
            byTariff.extra += (s.extraSeconds != null ? (s.extraSeconds / 3600) : (s.extra || 0) * (s.duration / 3600)) * tariffs.extra;
        });

        let br=document.getElementById('incomeBreakdown');
        if(br) br.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: #60a5fa; margin-bottom: 8px;">تک نفره</p>
                    <p style="font-size: 1.5rem; font-weight: 900;">${Math.round(byTariff.single).toLocaleString('fa-IR')} تومان</p>
                </div>
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: #c084fc; margin-bottom: 8px;">دو نفره</p>
                    <p style="font-size: 1.5rem; font-weight: 900;">${Math.round(byTariff.double).toLocaleString('fa-IR')} تومان</p>
                </div>
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: #fbbf24; margin-bottom: 8px;">نفرات اضافه</p>
                    <p style="font-size: 1.5rem; font-weight: 900;">${Math.round(byTariff.extra).toLocaleString('fa-IR')} تومان</p>
                </div>
            </div>
        `;
    }

    // Weekly Chart
    function renderWeeklyChart() {
        const now = new Date();
        const data = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now - i * 24 * 60 * 60 * 1000);
            const income = sessions.filter(s => isSameDay(s.date, d)).reduce((sum, s) => sum + s.cost, 0);
            data.push(income);
        }

        const max = Math.max(...data, 1);
        const container = document.getElementById('weeklyChart');
        if(!container) return;
        container.innerHTML = data.map((val, i) => `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); font-weight: 700;">${(val/1000).toFixed(0)}k</div>
                <div class="chart-bar" style="width: 100%; height: ${(val/max)*160}px; max-width: 40px;"></div>
            </div>
        `).join('');
    }

    // Utilities
    function formatTime(seconds) {
        seconds=Math.max(0, Math.floor(seconds));
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    function saveData() {
        // FIXED: per-key try/catch so QuotaExceeded on one key doesn't wipe the rest.
        // NOTE: the 8 new-features stores (membershipPlans, customerMemberships,
        // gameHistory, hourlyUsage, notifications, activityLog, employees,
        // attendance) are intentionally NOT here - new-features.js owns them and
        // saving them from here used to erase their data.
        var __pairs = [
          ['alvand_clients', clients], ['alvand_sessions', sessions], ['alvand_services', services],
          ['alvand_expenses', expenses], ['alvand_tariffSchedules', tariffSchedules], ['alvand_sales', sales],
          ['alvand_clientServiceMap', clientServiceMap], ['alvand_customers', customers],
          ['alvand_operators', operators], ['alvand_walletHistory', walletHistory],
          ['alvand_stationTypes', stationTypes]
        ];
        for (var __i = 0; __i < __pairs.length; __i++) {
          try { localStorage.setItem(__pairs[__i][0], JSON.stringify(__pairs[__i][1])); }
          catch (e) { try { console.warn('save failed:', __pairs[__i][0], e); } catch(_e){} }
        }
        try { localStorage.setItem('alvand_theme', currentTheme); } catch(e){}
        try { localStorage.setItem('alvand_alarmSound', alarmSound); } catch(e){}
        try { localStorage.setItem('alvand_alarmRepeat', String(alarmRepeat)); } catch(e){}
        try { localStorage.setItem('alvand_rounding', roundingMode); } catch(e){}
    }
    function saveServices(){ localStorage.setItem('alvand_services', JSON.stringify(services)); }
    function saveExpenses(){ localStorage.setItem('alvand_expenses', JSON.stringify(expenses)); }
    function saveTariffSchedules(){ localStorage.setItem('alvand_tariffSchedules', JSON.stringify(tariffSchedules)); }
    function saveSales(){ localStorage.setItem('alvand_sales', JSON.stringify(sales)); }
    function saveClientServiceMap(){ localStorage.setItem('alvand_clientServiceMap', JSON.stringify(clientServiceMap)); }

    

    // ========== PHASE 1 FUNCTIONS ==========
    function changeClientTariff(idx, val){
        clients[idx].tariff = val;
        saveData();
        renderClients();
        showToast('تعرفه تغییر کرد','success');
    }
    function openAmountModal(idx){
        currentTimeClient = idx;
        document.getElementById('amountInput').value='';
        document.getElementById('amountResult').style.display='none';
        document.getElementById('amountModal').classList.add('show');
    }
    function calculateDurationFromAmount(amount){
        if(!amount) amount = parseFaNumber(document.getElementById('amountInput').value, 0)||0;
        else document.getElementById('amountInput').value = amount;
        if(amount<=0){ showToast('مبلغ وارد کن','error'); return; }
        if(currentTimeClient===null) return;
        let c = clients[currentTimeClient];
        let dur = calculateDurationFromAmountRaw(amount, c.tariff, c.extra, c.stationType);
        document.getElementById('amountResult').style.display='block';
        document.getElementById('amountResultText').textContent = formatTime(dur) + '  ('+Math.round(dur/60)+' دقیقه)';
        window._calcDur = dur;
    }
    document.getElementById('amountInput')?.addEventListener('input', function(){ if(this.value) calculateDurationFromAmount(parseFaNumber(this.value, 0)); });
    function applyAmountDuration(){
        if(!window._calcDur) { showToast('اول مبلغ را وارد کن','error'); return; }
        if(currentTimeClient===null) return;
        let c=clients[currentTimeClient];
        c.timerDuration = Math.ceil(window._calcDur/60);
        c.notified=false;
        saveData();
        closeModal('amountModal');
        renderClients();
        showToast('مدت '+c.timerDuration+' دقیقه تنظیم شد','success');
        openTimeModal(currentTimeClient);
    }

    // Buffet
    function renderServices(){
        let grid=document.getElementById('servicesGrid');
        if(!grid) return;
        let filtered = serviceFilter==='all' ? services : services.filter(s=>s.category===serviceFilter);
        if(filtered.length===0) grid.innerHTML='<p style="text-align:center; color:rgba(255,255,255,0.5); padding:20px;">خدمتی ثبت نشده</p>';
        else grid.innerHTML = filtered.map(s=>`
            <div class="glass service-card" style="padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <h4 style="font-weight:800;">${escapeHtml(s.name)} <span style="font-size:0.7rem; padding:2px 6px; border-radius:50px; background:${s.category==='buffet'?'rgba(245,158,11,0.15)':'rgba(99,102,241,0.15)'}; color:${s.category==='buffet'?'#fbbf24':'#818cf8'};">${s.category==='buffet'?'بوفه':'خدمات'}</span></h4>
                        <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">خرید: ${s.cost.toLocaleString('fa-IR')} - فروش: ${s.price.toLocaleString('fa-IR')}</p>
                        <p class="profit-badge" style="display:inline-block; margin-top:6px;">سود: ${(s.price-s.cost).toLocaleString('fa-IR')} تومان</p>
                    </div>
                    <span class="${s.stock<10?'stock-low':'stock-ok'}" style="font-size:0.85rem;">موجودی: ${s.stock}</span>
                </div>
                <div style="display:flex; gap:6px; margin-top:12px;">
                    <button class="glass-btn" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="editService(${numId(s.id)})">✏️ ویرایش</button>
                    <button class="glass-btn glass-btn-danger" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="deleteService(${numId(s.id)})">🗑️ حذف</button>
                </div>
            </div>
        `).join('');
        updateBuffetStats();
    }
    function filterServices(f){ serviceFilter=f; renderServices(); }
    function openServiceModal(){
        if(!requirePerm('buffet','بوفه')) return;
        document.getElementById('serviceId').value='';
        document.getElementById('serviceName').value='';
        document.getElementById('servicePrice').value='';
        document.getElementById('serviceCost').value='';
        document.getElementById('serviceStock').value='50';
        document.getElementById('serviceModal').classList.add('show');
    }
    function editService(id){
        let s=services.find(x=>x.id===id);
        if(!s) return;
        document.getElementById('serviceId').value=s.id;
        document.getElementById('serviceName').value=s.name;
        document.getElementById('servicePrice').value=s.price;
        document.getElementById('serviceCost').value=s.cost;
        document.getElementById('serviceStock').value=s.stock;
        document.getElementById('serviceCategory').value=s.category;
        document.getElementById('serviceModal').classList.add('show');
    }
    function saveService(){
        let id=document.getElementById('serviceId').value;
        let name=document.getElementById('serviceName').value.trim();
        let price=parseFaNumber(document.getElementById('servicePrice').value, 0)||0;
        let cost=parseFaNumber(document.getElementById('serviceCost').value, 0)||0;
        let stock=parseFaNumber(document.getElementById('serviceStock').value, 0)||0;
        let category=document.getElementById('serviceCategory').value;
        if(!name||!price){ showToast('نام و قیمت الزامی','error'); return; }
        if(id){
            let s=services.find(x=>x.id===parseInt(id));
            Object.assign(s,{name,price,cost,stock,category});
        } else {
            services.push({id:Date.now(), name,price,cost,stock,category});
        }
        saveServices();
        closeModal('serviceModal');
        renderServices();
        showToast('خدمت ذخیره شد','success');
    }
    function deleteService(id){
        if(!requirePerm('buffet','حذف خدمت')) return;
        if(!confirm('حذف شود؟')) return;
        services=services.filter(s=>s.id!==id);
        saveServices(); renderServices(); showToast('حذف شد','success');
    }
    function updateBuffetStats(){
        let today=localDayKey(new Date());
        let todaySales=sales.filter(s=> isSameDay(s.date, today));
        let income=todaySales.reduce((sum,s)=>sum+s.price*s.qty,0);
        let profit=todaySales.reduce((sum,s)=>sum+s.profit,0);
        let low=services.filter(s=>s.stock<10).length;
        let el1=document.getElementById('buffetIncomeToday'); if(el1) el1.textContent=income.toLocaleString('fa-IR')+' تومان';
        let el2=document.getElementById('buffetProfitToday'); if(el2) el2.textContent=profit.toLocaleString('fa-IR')+' تومان';
        let el3=document.getElementById('lowStockCount'); if(el3) el3.textContent=low+' قلم';
        // sales list
        let list=document.getElementById('buffetSalesList');
        if(list){
            if(todaySales.length===0) list.innerHTML='<p style="text-align:center; color:rgba(255,255,255,0.4); padding:20px;">فروشی امروز نداشته‌اید</p>';
            else list.innerHTML=todaySales.slice(-10).reverse().map(s=>`<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;"><span>${escapeHtml(s.name)} x${s.qty}</span><span style="color:#22c55e;">${(s.price*s.qty).toLocaleString('fa-IR')} تومان</span></div>`).join('');
        }
    }
    function openAddServiceToClient(idx){
        let c=clients[idx];
        currentTimeClient=idx;
        document.getElementById('svcClientName').textContent=c.name;
        let list=document.getElementById('svcListForClient');
        list.innerHTML=services.map(s=>`
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border-radius:12px; padding:10px 12px;">
                <div>
                    <p style="font-weight:700; font-size:0.9rem;">${escapeHtml(s.name)} <span style="font-size:0.7rem; color:rgba(255,255,255,0.5);">موجودی:${s.stock}</span></p>
                    <p style="font-size:0.8rem; color:#22c55e;">${s.price.toLocaleString('fa-IR')} تومان</p>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="addServiceToClientQty(${numId(s.id)}, -1)">-</button>
                    <span id="svcQty-${s.id}" style="min-width:24px; text-align:center; font-weight:800;">${((clientServiceMap[c.id]||[]).find(x=>x.serviceId===s.id)?.qty||0)}</span>
                    <button class="glass-btn glass-btn-success" style="padding:4px 8px; font-size:0.8rem;" onclick="addServiceToClientQty(${numId(s.id)}, 1)">+</button>
                </div>
            </div>
        `).join('');
        updateSvcSelected();
        document.getElementById('addServiceToClientModal').classList.add('show');
    }
    function addServiceToClientQty(serviceId, delta){
        if(currentTimeClient===null) return;
        let c=clients[currentTimeClient];
        let arr=clientServiceMap[c.id]||[];
        let it=arr.find(x=>x.serviceId===serviceId);
        let s=services.find(x=>x.id===serviceId);
        if(!it && delta>0){
            if(s.stock<=0){ showToast('موجودی کافی نیست','error'); return; }
            arr.push({serviceId, qty:1});
        } else if(it){
            it.qty+=delta;
            if(it.qty<=0) arr=arr.filter(x=>x.serviceId!==serviceId);
            if(delta>0 && s.stock < it.qty){ showToast('موجودی کم','error'); it.qty=s.stock; }
        }
        clientServiceMap[c.id]=arr;
        saveClientServiceMap();
        document.getElementById('svcQty-'+serviceId).textContent = arr.find(x=>x.serviceId===serviceId)?.qty||0;
        updateSvcSelected();
        renderClients();
    }
    function updateSvcSelected(){
        if(currentTimeClient===null) return;
        let c=clients[currentTimeClient];
        let arr=clientServiceMap[c.id]||[];
        let total=arr.reduce((sum,it)=>{ let s=services.find(x=>x.id===it.serviceId); return sum+(s? s.price*it.qty:0); },0);
        document.getElementById('svcTotalForClient').textContent=total.toLocaleString('fa-IR')+' تومان';
        let sel=document.getElementById('svcSelectedList');
        if(arr.length===0) sel.innerHTML='<p style="color:rgba(255,255,255,0.4); font-size:0.8rem;">چیزی انتخاب نشده</p>';
        else sel.innerHTML=arr.map(it=>{ let s=services.find(x=>x.id===it.serviceId); return `<span style="display:inline-block; background:rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3); border-radius:50px; padding:4px 10px; margin:4px; font-size:0.75rem;">${escapeHtml(s.name)} x${it.qty}</span>`; }).join('');
    }

    // Expenses
    function renderExpenses(){
        let list=document.getElementById('expensesList');
        if(!list) return;
        if(expenses.length===0) list.innerHTML='<p style="text-align:center; color:rgba(255,255,255,0.4); padding:20px;">هزینه‌ای ثبت نشده</p>';
        else list.innerHTML=expenses.slice().reverse().map(e=>`
            <div class="glass expense-row" style="padding:14px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div>
                    <p style="font-weight:700;">${escapeHtml(e.title)} <span style="font-size:0.7rem; padding:2px 6px; border-radius:50px; background:rgba(255,255,255,0.08);">${escapeHtml(e.category||"")}</span></p>
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">${new Date(e.date).toLocaleDateString('fa-IR')}</p>
                </div>
                <div style="text-align:left;">
                    <p style="font-weight:800; color:#ef4444;">${e.amount.toLocaleString('fa-IR')} تومان</p>
                    <div style="display:flex; gap:6px; margin-top:4px;">
                        <button class="glass-btn" style="padding:4px 8px; font-size:0.7rem;" onclick="editExpense(${numId(e.id)})">✏️</button>
                        <button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:0.7rem;" onclick="deleteExpense(${numId(e.id)})">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    function openExpenseModal(){
        if(!requirePerm('expenses','هزینه')) return;
        document.getElementById('expenseId').value='';
        document.getElementById('expenseTitle').value='';
        document.getElementById('expenseAmount').value='';
        document.getElementById('expenseDate').valueAsDate=new Date();
        document.getElementById('expenseModal').classList.add('show');
    }
    function editExpense(id){
        let e=expenses.find(x=>x.id===id);
        if(!e) return;
        document.getElementById('expenseId').value=e.id;
        document.getElementById('expenseTitle').value=e.title;
        document.getElementById('expenseAmount').value=e.amount;
        document.getElementById('expenseCategory').value=e.category;
        document.getElementById('expenseDate').value=e.date;
        document.getElementById('expenseModal').classList.add('show');
    }
    function saveExpense(){
        let id=document.getElementById('expenseId').value;
        let title=document.getElementById('expenseTitle').value.trim();
        let amount=parseFaNumber(document.getElementById('expenseAmount').value, 0)||0;
        let category=document.getElementById('expenseCategory').value;
        let date=document.getElementById('expenseDate').value;
        if(!title||!amount||!date){ showToast('همه فیلدها','error'); return; }
        if(id){
            let e=expenses.find(x=>x.id===parseInt(id));
            Object.assign(e,{title,amount,category,date});
        } else {
            expenses.push({id:Date.now(), title,amount,category,date, branchId:currentBranchId()});
        }
        saveExpenses();
        closeModal('expenseModal');
        renderExpenses(); updateExpenseStats(); updateCashCardStats();
        showToast('هزینه ثبت شد','success');
    }
    function deleteExpense(id){
        if(!requirePerm('expenses','حذف هزینه')) return;
        if(!confirm('حذف شود؟')) return;
        expenses=expenses.filter(e=>e.id!==id);
        saveExpenses(); renderExpenses(); updateExpenseStats();
        showToast('حذف شد','success');
    }
    function updateExpenseStats(){
        let today=localDayKey(new Date());
        let todayExp=expenses.filter(e=> isSameDay(e.date, today)).reduce((s,e)=>s+(Number(e.amount)||0),0);
        let month=new Date().getMonth();
        let monthExp=expenses.filter(e=>{ const d=new Date(e.date); return d.getMonth()===month && d.getFullYear()===new Date().getFullYear(); }).reduce((s,e)=>s+(Number(e.amount)||0),0);
        let todayIncome=sessions.filter(s=> isSameDay(s.date, today)).reduce((s,x)=>s+(x.cost||0),0);
        let buffetToday=sales.filter(s=> isSameDay(s.date, today)).reduce((s,x)=>s+x.price*x.qty,0);
        todayIncome+=buffetToday;
        let el1=document.getElementById('expenseToday'); if(el1) el1.textContent=todayExp.toLocaleString('fa-IR')+' تومان';
        let el2=document.getElementById('expenseMonth'); if(el2) el2.textContent=monthExp.toLocaleString('fa-IR')+' تومان';
        let el3=document.getElementById('netProfitToday'); if(el3) el3.textContent=(todayIncome - todayExp).toLocaleString('fa-IR')+' تومان';
        if(el3) el3.style.color = (todayIncome - todayExp)>=0 ? '#22c55e':'#ef4444';
    }
    function updateCashCardStats(){
        let today=localDayKey(new Date());
        let pays=safeParse(localStorage.getItem('alvand_payments')||'[]');
        let cash=pays.filter(p=> isSameDay(p.date, today) && p.method==='cash').reduce((s,p)=>s+(Number(p.amount)||0),0);
        let card=pays.filter(p=> isSameDay(p.date, today) && p.method==='card').reduce((s,p)=>s+(Number(p.amount)||0),0);
        let el1=document.getElementById('cashToday'); if(el1) el1.textContent=cash.toLocaleString('fa-IR')+' تومان';
        let el2=document.getElementById('cardToday'); if(el2) el2.textContent=card.toLocaleString('fa-IR')+' تومان';
        let el3=document.getElementById('totalCashCardToday'); if(el3) el3.textContent=(cash+card).toLocaleString('fa-IR')+' تومان';
    }

    // Tariff Schedule
    function renderTariffSchedules(){
        let list=document.getElementById('tariffSchedulesList');
        if(!list) return;
        if(tariffSchedules.length===0) list.innerHTML='<div class="glass" style="padding:20px; text-align:center; color:rgba(255,255,255,0.5);">بازه‌ای ثبت نشده - تعرفه ثابت استفاده میشود</div>';
        else list.innerHTML=tariffSchedules.map(ts=>`
            <div class="glass ${isTariffActive(ts)?'tariff-active':''}" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <h4 style="font-weight:800;">${escapeHtml(ts.name)} <span style="font-size:0.8rem; color:#818cf8;">${escapeHtml(ts.start)} تا ${escapeHtml(ts.end)}</span> ${isTariffActive(ts)?'<span style="background:#22c55e; color:white; padding:2px 8px; border-radius:50px; font-size:0.7rem;">فعال الان</span>':''}</h4>
                    <p style="font-size:0.85rem; color:rgba(255,255,255,0.6);">تک:${ts.single.toLocaleString('fa-IR')} دو:${ts.double.toLocaleString('fa-IR')} اضافه:${ts.extra.toLocaleString('fa-IR')}</p>
                    ${(ts.prices && Object.keys(ts.prices).filter(k=>ts.prices[k]>0).length) ? `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">`+Object.keys(ts.prices).filter(k=>ts.prices[k]>0).map(tid=>{ let st=getStationType(tid); return `<span class="tariff-badge tariff-extra">${st?st.icon+' '+st.name:tid}: ${(ts.prices[tid]||0).toLocaleString('fa-IR')}</span>`; }).join('')+`</div>` : ''}
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="editTariffSchedule(${numId(ts.id)})">✏️</button>
                    <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteTariffSchedule(${numId(ts.id)})">🗑️</button>
                </div>
            </div>
        `).join('');
    }
    function isTariffActive(ts){
        const now=new Date();
        return tariffWindowActive(ts, now.getHours()*60 + now.getMinutes());
    }
    function openTariffScheduleModal(){
        if(!requirePerm('tariffs','تعرفه ساعتی')) return;
        document.getElementById('tariffScheduleId').value='';
        document.getElementById('tsName').value='';
        try{renderTsTypePrices(null);}catch(e){}
        document.getElementById('tariffScheduleModal').classList.add('show');
    }
    function editTariffSchedule(id){
        let ts=tariffSchedules.find(x=>x.id===id);
        if(!ts) return;
        document.getElementById('tariffScheduleId').value=ts.id;
        document.getElementById('tsName').value=ts.name;
        document.getElementById('tsStart').value=ts.start;
        document.getElementById('tsEnd').value=ts.end;
        document.getElementById('tsSingle').value=ts.single;
        document.getElementById('tsDouble').value=ts.double;
        document.getElementById('tsExtra').value=ts.extra;
        try{renderTsTypePrices(ts.id);}catch(e){}
        document.getElementById('tariffScheduleModal').classList.add('show');
    }
    function saveTariffSchedule(){
        let id=document.getElementById('tariffScheduleId').value;
        let name=document.getElementById('tsName').value.trim()||'بدون نام';
        let start=document.getElementById('tsStart').value;
        let end=document.getElementById('tsEnd').value;
        let single=parseFaNumber(document.getElementById('tsSingle').value, 0)||0;
        let double=parseFaNumber(document.getElementById('tsDouble').value, 0)||0;
        let extra=parseFaNumber(document.getElementById('tsExtra').value, 0)||0;
        let prices={};
        document.querySelectorAll('#tsTypePrices input').forEach(inp=>{
            const v=(typeof parseFaNumber==='function'? parseFaNumber(inp.value,0) : parseInt(inp.value)||0);
            prices[inp.dataset.type]= v>0 ? v : 0;
        });
        if(parseHhMm(start)===null || parseHhMm(end)===null){ showToast('ساعت را در قالب HH:MM وارد کن','error'); return; }
        if(start===end){ showToast('شروع و پایان بازه یکی است','error'); return; }
        if(single<0||double<0||extra<0){ showToast('مبلغ تعرفه نمی‌تواند منفی باشد','error'); return; }
        if(id){
            let ts=tariffSchedules.find(x=>x.id===parseInt(id));
            Object.assign(ts,{name,start,end,single,double,extra,prices});
        } else {
            tariffSchedules.push({id:Date.now(), name,start,end,single,double,extra,prices});
        }
        saveTariffSchedules();
        closeModal('tariffScheduleModal');
        renderTariffSchedules(); updateActiveTariffDisplay();
        showToast('تعرفه ساعتی ذخیره شد','success');
    }
    function deleteTariffSchedule(id){
        if(!requirePerm('tariffs','حذف بازه ساعتی')) return;
        if(!confirm('حذف شود؟')) return;
        tariffSchedules=tariffSchedules.filter(x=>x.id!==id);
        saveTariffSchedules(); renderTariffSchedules(); updateActiveTariffDisplay();
    }
    function clearTariffSchedules(){
        if(!requirePerm('tariffs','پاک کردن بازه‌ها')) return;
        if(!confirm('همه بازه‌ها حذف شوند؟')) return;
        tariffSchedules=[]; saveTariffSchedules(); renderTariffSchedules();
    }
    function updateActiveTariffDisplay(){
        let now=new Date();
        let el1=document.getElementById('currentHourDisplay'); if(el1) el1.textContent=now.toLocaleTimeString('fa-IR');
        let active=getActiveTariff();
        let el2=document.getElementById('activeTariffDisplay');
        if(!el2) return;
        if(active) el2.textContent=active.name+' - تک:'+active.single.toLocaleString('fa-IR')+' دو:'+active.double.toLocaleString('fa-IR');
        else el2.textContent='تعرفه عادی - تک:'+tariffs.single.toLocaleString('fa-IR')+' دو:'+tariffs.double.toLocaleString('fa-IR');
    }

    // Backup
    function toggleAutoBackup(v){
        localStorage.setItem('alvand_backupEnabled', v?'1':'0');
        showToast(v?'بکاپ خودکار فعال شد':'بکاپ غیرفعال','success');
    }
    function loadRoundingMode(){
        let el=document.getElementById('roundingMode'); if(el) el.value=roundingMode;
        let tog=document.getElementById('autoBackupToggle'); if(tog) tog.checked = localStorage.getItem('alvand_backupEnabled')!=='0';
        let bt=document.getElementById('backupTimeInput'); if(bt) bt.value=localStorage.getItem('alvand_backupTime')||'23:59';
        let tog2=document.getElementById('autoBackupToggle2'); if(tog2) tog2.checked = localStorage.getItem('alvand_backupEnabled')!=='0';
        let atk=document.getElementById('agentTokenInput'); if(atk) atk.value=agentToken();
    }
    function setRoundingMode(v){ roundingMode=v; localStorage.setItem('alvand_rounding',v); showToast('رند: '+v,'success'); }
    function updateBackupDisplay(){
        let last=localStorage.getItem('alvand_lastBackup');
        let txt = last ? new Date(parseInt(last)).toLocaleString('fa-IR') : 'هرگز';
        let el=document.getElementById('lastBackupTime');
        if(el) el.textContent = txt;
        let el2=document.getElementById('lastBackupTimeSettings');
        if(el2) el2.textContent = txt;
    }
    /* ---------- Backup ----------
       The old payload only held 10 keys, so a restore silently dropped the shop
       name, customers' wallets, operators, the license and every new-features
       store. It was also written straight back into the very localStorage it
       was backing up, with no validation at all (sanitizeBackup existed but was
       never called). Now: a complete snapshot, validated on restore, and mirrored
       to a real file in userData/backups via the preload bridge. */
    const BACKUP_STORE_KEYS = [
      'clients','tariffs','sessions','reservations','services','expenses','tariffSchedules','sales',
      'clientServiceMap','stationTypes','payments','customers','operators','walletHistory',
      'license','allLicenses','rounding','lang','theme','alarmSound','alarmRepeat','rounding',
      'backupTime','lite','uiZoom','shopName','shopPhone','guideShown',
      // new-features stores
      'membershipPlans','customerMemberships','gameHistory','hourlyUsage','notifications',
      'activityLog','employees','attendance',
      // modules
      'waitingList','loyaltyPoints','surveys','smsLog','smsConfig','phonebook','events',
      'branches','currentBranch','shifts','lowStockThreshold','posConfig','customers_enc'
    ];
    function collectBackupObject(){
        const dump={ date: new Date().toISOString(), appVersion: (typeof APP_VERSION!=='undefined'? APP_VERSION : (window.APP_VERSION||'')), schema: 2 };
        BACKUP_STORE_KEYS.forEach(function(k){
            if(k==='rounding') { dump.roundingMode = localStorage.getItem('alvand_rounding')||'none'; return; }
            try{
                const raw=localStorage.getItem('alvand_'+k);
                if(raw!==null && raw!==undefined) dump[k]=raw;   // raw JSON string, restored as-is
            }catch(e){}
        });
        // keep live values that may not have been flushed yet
        try{ dump.clients = JSON.stringify(clients); }catch(e){}
        try{ dump.sessions = JSON.stringify(sessions); }catch(e){}
        try{ dump.customers = JSON.stringify(customers); }catch(e){}
        try{ dump.operators = JSON.stringify(operators); }catch(e){}
        try{ dump.tariffs = JSON.stringify(tariffs); }catch(e){}
        try{ dump.stationTypes = JSON.stringify(stationTypes); }catch(e){}
        return dump;
    }
    function createBackup(){
        let data;
        try{ data = collectBackupObject(); }
        catch(e){ showToast('بکاپ ساخته نشد','error'); return null; }
        let json;
        try{ json = JSON.stringify(data); }
        catch(e){ showToast('بکاپ ساخته نشد','error'); return null; }
        try{ localStorage.setItem('alvand_backup', json); }catch(e){ showToast('فضای ذخیره‌سازی پر است','error'); return null; }
        localStorage.setItem('alvand_lastBackup', Date.now().toString());
        updateBackupDisplay();
        showToast('بکاپ ذخیره شد','success');
        return json;
    }
    function downloadBackupFile(){
        let data=localStorage.getItem('alvand_backup');
        if(!data){ data = createBackup(); }
        if(!data) return;
        let blob=new Blob([data], {type:'application/json'});
        let url=URL.createObjectURL(blob);
        let a=document.createElement('a');
        a.href=url;
        a.download='gamenet-backup-'+localDayKey(new Date())+'-'+Date.now().toString().slice(-5)+'.json';
        document.body.appendChild(a);
        a.click();
        // revoking immediately can cancel the download in Chromium
        setTimeout(function(){ try{ URL.revokeObjectURL(url); a.remove(); }catch(e){} }, 4000);
        showToast('فایل بکاپ دانلود شد','success');
    }
    function restoreBackup(input){
        if(!requirePerm('backup','بازگردانی بکاپ')) return;
        let file=input.files[0];
        if(!file) return;
        if(file.size > 60*1024*1024){ showToast('فایل بکاپ خیلی بزرگ است','error'); return; }
        let reader=new FileReader();
        reader.onload=function(e){
            try{
                let data=safeParse(e.target.result);
                if(!data || typeof data!=='object'){ showToast('فایل خراب است','error'); return; }
                // validate BEFORE touching a single live key
                if(typeof window.validatedRestoreObject==='function'){
                    const v = window.validatedRestoreObject(data);
                    if(!v){ showToast('فایل بکاپ معتبر نیست','error'); return; }
                    data = v;
                } else if(typeof window.sanitizeBackup==='function'){
                    const r = window.sanitizeBackup(data);
                    if(!r.ok){ showToast('فایل بکاپ معتبر نیست: '+(r.error||''),'error'); return; }
                }
                let restored=0;
                BACKUP_STORE_KEYS.forEach(function(k){
                    if(k==='rounding'){
                        if(data.roundingMode!==undefined){ localStorage.setItem('alvand_rounding', String(data.roundingMode)); restored++; }
                        return;
                    }
                    if(data[k]===undefined || data[k]===null) return;
                    try{ localStorage.setItem('alvand_'+k, typeof data[k]==='string'? data[k] : JSON.stringify(data[k])); restored++; }catch(err){}
                });
                // explicit legacy field name
                if(data.roundingMode!==undefined && data.rounding===undefined){
                    localStorage.setItem('alvand_rounding', String(data.roundingMode));
                }
                showToast(restored? ('بازگردانی شد ('+restored+' بخش) - صفحه رفرش میشود') : 'این فایل بکاپ داده‌ای ندارد', restored? 'success':'error');
                if(restored) setTimeout(()=> location.reload(), 1500);
            }catch(err){ showToast('بازگردانی ناموفق','error'); }
        };
        reader.onerror=function(){ showToast('خواندن فایل ناموفق بود','error'); };
        reader.readAsText(file);
        try{ input.value=''; }catch(e){}
    }
    function checkAutoBackup(){
        if(localStorage.getItem('alvand_backupEnabled')==='0') return;
        let last=parseInt(localStorage.getItem('alvand_lastBackup')||'0');
        let now=Date.now();
        if(now - last > 24*3600*1000){
            createBackup();
        }
        try{
            let t=localStorage.getItem('alvand_backupTime')||'23:59';
            let parts=t.split(':'); let hh=parseInt(parts[0]); if(isNaN(hh)) hh=23; let mm=parseInt(parts[1]); if(isNaN(mm)) mm=59;
            let d=new Date(); d.setHours(hh,mm,0,0);
            let todayStr=localDayKey(new Date());
            if(Date.now()>=d.getTime() && localStorage.getItem('alvand_backupDay')!==todayStr){
                createBackup();
                localStorage.setItem('alvand_backupDay', todayStr);
            }
        }catch(e){}
        updateBackupDisplay();
    }
    function toggleAutoBackup2(v){
        localStorage.setItem('alvand_backupEnabled', v?'1':'0');
        let tog=document.getElementById('autoBackupToggle'); if(tog) tog.checked=v;
        showToast(v?'بکاپ خودکار فعال شد':'بکاپ غیرفعال','success');
    }
    function setBackupTime(v){
        localStorage.setItem('alvand_backupTime', v||'23:59');
        showToast('ساعت بکاپ: '+(v||'23:59'),'success');
    }


    // (The second bridge this file used to declare here is gone: publishState()
    //  at the top of this file covers the same stores AND accepts writes, which
    //  the getters-only version silently dropped.)

    // Init
    init();
    
    function toggleSidebar() {
        const sidebar = document.querySelector('aside.glass');
        const overlay = document.getElementById('sidebarOverlay');
        const btn = document.getElementById('hamburgerBtn');
        const isOpen = sidebar.classList.contains('open');
        if (isOpen) {
            sidebar.classList.remove('open');
            overlay.classList.remove('show');
            btn.classList.remove('active');
        } else {
            sidebar.classList.add('open');
            overlay.classList.add('show');
            btn.classList.add('active');
        }
    }

    function closeSidebar() {
        const sidebar = document.querySelector('aside.glass');
        const overlay = document.getElementById('sidebarOverlay');
        const btn = document.getElementById('hamburgerBtn');
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
        btn.classList.remove('active');
    }

    // Close sidebar when clicking a nav item on mobile
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });

    // Handle resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            document.querySelector('aside.glass').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('show');
            document.getElementById('hamburgerBtn').classList.remove('active');
        }
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(el=>{
        el.addEventListener('click', (e)=>{
            if(e.target===el) el.classList.remove('show');
        });
    });

