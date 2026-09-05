
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
    let allLicenses = safeParse(localStorage.getItem('alvand_allLicenses')||'[]');
    let lastGeneratedLicense = '';
    // ===== Firebase Config (FIXED: no hardcoded secrets; see config.example.json) =====
    const firebaseConfig = (window.APP_CONFIG && window.APP_CONFIG.firebase && window.APP_CONFIG.firebase.apiKey)
        ? window.APP_CONFIG.firebase
        : { apiKey: '', authDomain: '', databaseURL: '', projectId: '', appId: '' };
    let firebaseReady = false;
    function ensureFirebase(){
        try{
            if(!firebaseConfig.apiKey) { firebaseReady = false; return false; }
            if(typeof firebase === 'undefined') { firebaseReady = false; return false; }
            if(firebase.apps && firebase.apps.length) { firebaseReady = true; return true; }
            firebase.initializeApp(firebaseConfig);
            firebaseReady = true; return true;
        }catch(e){ console.log('firebase init fail', e); firebaseReady = false; return false; }
    }
    try { ensureFirebase(); } catch(e){ firebaseReady = false; }
    try { window.ensureFirebase = ensureFirebase; } catch(_e){}
    function firebaseKey(k){ return k.replace(/[^A-Z0-9]/gi,'_'); }
    function updateFirebaseStatus(){
        let el=document.getElementById('firebaseStatus');
        if(!el) return;
        if(!firebaseReady){ el.textContent='حالت محلی (سرور تنظیم نشده)'; el.style.color='#f59e0b'; return; }
        el.textContent='متصل به سرور ✅'; el.style.color='#22c55e';
    }
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
    let timerInterval = null;
    let currentFilter = 'all';
    let currentPdfBlob = null;
    let currentPdfFilename = '';
    let currentShareText = '';
    let alarmClientIndex = null;
    let alarmInterval = null;

    // Migration for old clients
    clients.forEach(c=>{
        if(c.timerDuration===undefined) c.timerDuration = c.timerDuration||0;
        if(c.timerDurationSec===undefined && c.timerDuration) c.timerDurationSec = c.timerDuration*60;
        if(c.timerEnabled===undefined) c.timerEnabled = !!c.timerDuration;
        if(c.notified===undefined) c.notified = false;
        if(!c.reservations) c.reservations=[];
    });

    

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
        if(!amount) amount = parseInt(document.getElementById('amountInput').value)||0;
        else document.getElementById('amountInput').value = amount;
        if(amount<=0){ showToast('مبلغ وارد کن','error'); return; }
        if(currentTimeClient===null) return;
        let c = clients[currentTimeClient];
        let dur = calculateDurationFromAmountRaw(amount, c.tariff, c.extra, c.stationType);
        document.getElementById('amountResult').style.display='block';
        document.getElementById('amountResultText').textContent = formatTime(dur) + '  ('+Math.round(dur/60)+' دقیقه)';
        window._calcDur = dur;
    }
    document.getElementById('amountInput')?.addEventListener('input', function(){ if(this.value) calculateDurationFromAmount(parseInt(this.value)); });
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
                        <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">خرید: ${s.cost.toLocaleString()} - فروش: ${s.price.toLocaleString()}</p>
                        <p class="profit-badge" style="display:inline-block; margin-top:6px;">سود: ${(s.price-s.cost).toLocaleString()} تومان</p>
                    </div>
                    <span class="${s.stock<10?'stock-low':'stock-ok'}" style="font-size:0.85rem;">موجودی: ${s.stock}</span>
                </div>
                <div style="display:flex; gap:6px; margin-top:12px;">
                    <button class="glass-btn" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="editService(${s.id})">✏️ ویرایش</button>
                    <button class="glass-btn glass-btn-danger" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="deleteService(${s.id})">🗑️ حذف</button>
                </div>
            </div>
        `).join('');
        updateBuffetStats();
    }
    function filterServices(f){ serviceFilter=f; renderServices(); }
    function openServiceModal(){
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
        let price=parseInt(document.getElementById('servicePrice').value)||0;
        let cost=parseInt(document.getElementById('serviceCost').value)||0;
        let stock=parseInt(document.getElementById('serviceStock').value)||0;
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
        if(!confirm('حذف شود؟')) return;
        services=services.filter(s=>s.id!==id);
        saveServices(); renderServices(); showToast('حذف شد','success');
    }
    function updateBuffetStats(){
        let today=new Date().toDateString();
        let todaySales=sales.filter(s=> new Date(s.date).toDateString()===today);
        let income=todaySales.reduce((sum,s)=>sum+s.price*s.qty,0);
        let profit=todaySales.reduce((sum,s)=>sum+s.profit,0);
        let low=services.filter(s=>s.stock<10).length;
        let el1=document.getElementById('buffetIncomeToday'); if(el1) el1.textContent=income.toLocaleString()+' تومان';
        let el2=document.getElementById('buffetProfitToday'); if(el2) el2.textContent=profit.toLocaleString()+' تومان';
        let el3=document.getElementById('lowStockCount'); if(el3) el3.textContent=low+' قلم';
        // sales list
        let list=document.getElementById('buffetSalesList');
        if(list){
            if(todaySales.length===0) list.innerHTML='<p style="text-align:center; color:rgba(255,255,255,0.4); padding:20px;">فروشی امروز نداشته‌اید</p>';
            else list.innerHTML=todaySales.slice(-10).reverse().map(s=>`<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;"><span>${escapeHtml(s.name)} x${s.qty}</span><span style="color:#22c55e;">${(s.price*s.qty).toLocaleString()} تومان</span></div>`).join('');
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
                    <p style="font-size:0.8rem; color:#22c55e;">${s.price.toLocaleString()} تومان</p>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="addServiceToClientQty(${s.id}, -1)">-</button>
                    <span id="svcQty-${s.id}" style="min-width:24px; text-align:center; font-weight:800;">${((clientServiceMap[c.id]||[]).find(x=>x.serviceId===s.id)?.qty||0)}</span>
                    <button class="glass-btn glass-btn-success" style="padding:4px 8px; font-size:0.8rem;" onclick="addServiceToClientQty(${s.id}, 1)">+</button>
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
        document.getElementById('svcTotalForClient').textContent=total.toLocaleString()+' تومان';
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
                    <p style="font-weight:700;">${escapeHtml(e.title)} <span style="font-size:0.7rem; padding:2px 6px; border-radius:50px; background:rgba(255,255,255,0.08);">${e.category}</span></p>
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">${new Date(e.date).toLocaleDateString('fa-IR')}</p>
                </div>
                <div style="text-align:left;">
                    <p style="font-weight:800; color:#ef4444;">${e.amount.toLocaleString()} تومان</p>
                    <div style="display:flex; gap:6px; margin-top:4px;">
                        <button class="glass-btn" style="padding:4px 8px; font-size:0.7rem;" onclick="editExpense(${e.id})">✏️</button>
                        <button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:0.7rem;" onclick="deleteExpense(${e.id})">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    function openExpenseModal(){
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
        let amount=parseInt(document.getElementById('expenseAmount').value)||0;
        let category=document.getElementById('expenseCategory').value;
        let date=document.getElementById('expenseDate').value;
        if(!title||!amount||!date){ showToast('همه فیلدها','error'); return; }
        if(id){
            let e=expenses.find(x=>x.id===parseInt(id));
            Object.assign(e,{title,amount,category,date});
        } else {
            expenses.push({id:Date.now(), title,amount,category,date});
        }
        saveExpenses();
        closeModal('expenseModal');
        renderExpenses(); updateExpenseStats(); updateCashCardStats();
        showToast('هزینه ثبت شد','success');
    }
    function deleteExpense(id){
        if(!confirm('حذف شود؟')) return;
        expenses=expenses.filter(e=>e.id!==id);
        saveExpenses(); renderExpenses(); updateExpenseStats();
        showToast('حذف شد','success');
    }
    function updateExpenseStats(){
        let today=new Date().toDateString();
        let todayExp=expenses.filter(e=> new Date(e.date).toDateString()===today).reduce((s,e)=>s+e.amount,0);
        let month=new Date().getMonth();
        let monthExp=expenses.filter(e=> new Date(e.date).getMonth()===month).reduce((s,e)=>s+e.amount,0);
        let todayIncome=sessions.filter(s=> new Date(s.date).toDateString()===today).reduce((s,x)=>s+(x.cost||0),0);
        let buffetToday=sales.filter(s=> new Date(s.date).toDateString()===today).reduce((s,x)=>s+x.price*x.qty,0);
        todayIncome+=buffetToday;
        let el1=document.getElementById('expenseToday'); if(el1) el1.textContent=todayExp.toLocaleString()+' تومان';
        let el2=document.getElementById('expenseMonth'); if(el2) el2.textContent=monthExp.toLocaleString()+' تومان';
        let el3=document.getElementById('netProfitToday'); if(el3) el3.textContent=(todayIncome - todayExp).toLocaleString()+' تومان';
        if(el3) el3.style.color = (todayIncome - todayExp)>=0 ? '#22c55e':'#ef4444';
    }
    function updateCashCardStats(){
        let today=new Date().toDateString();
        let pays=safeParse(localStorage.getItem('alvand_payments')||'[]');
        let cash=pays.filter(p=> new Date(p.date).toDateString()===today && p.method==='cash').reduce((s,p)=>s+p.amount,0);
        let card=pays.filter(p=> new Date(p.date).toDateString()===today && p.method==='card').reduce((s,p)=>s+p.amount,0);
        let el1=document.getElementById('cashToday'); if(el1) el1.textContent=cash.toLocaleString()+' تومان';
        let el2=document.getElementById('cardToday'); if(el2) el2.textContent=card.toLocaleString()+' تومان';
        let el3=document.getElementById('totalCashCardToday'); if(el3) el3.textContent=(cash+card).toLocaleString()+' تومان';
    }

    // Tariff Schedule
    function renderTariffSchedules(){
        let list=document.getElementById('tariffSchedulesList');
        if(!list) return;
        if(tariffSchedules.length===0) list.innerHTML='<div class="glass" style="padding:20px; text-align:center; color:rgba(255,255,255,0.5);">بازه‌ای ثبت نشده - تعرفه ثابت استفاده میشود</div>';
        else list.innerHTML=tariffSchedules.map(ts=>`
            <div class="glass ${isTariffActive(ts)?'tariff-active':''}" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <h4 style="font-weight:800;">${escapeHtml(ts.name)} <span style="font-size:0.8rem; color:#818cf8;">${ts.start} تا ${ts.end}</span> ${isTariffActive(ts)?'<span style="background:#22c55e; color:white; padding:2px 8px; border-radius:50px; font-size:0.7rem;">فعال الان</span>':''}</h4>
                    <p style="font-size:0.85rem; color:rgba(255,255,255,0.6);">تک:${ts.single.toLocaleString()} دو:${ts.double.toLocaleString()} اضافه:${ts.extra.toLocaleString()}</p>
                    ${(ts.prices && Object.keys(ts.prices).filter(k=>ts.prices[k]>0).length) ? `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">`+Object.keys(ts.prices).filter(k=>ts.prices[k]>0).map(tid=>{ let st=getStationType(tid); return `<span class="tariff-badge tariff-extra">${st?st.icon+' '+st.name:tid}: ${(ts.prices[tid]||0).toLocaleString()}</span>`; }).join('')+`</div>` : ''}
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="editTariffSchedule(${ts.id})">✏️</button>
                    <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteTariffSchedule(${ts.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }
    function isTariffActive(ts){
        let now=new Date(); let cur=now.getHours()*60+now.getMinutes();
        let s=ts.start.split(':').map(Number); let e=ts.end.split(':').map(Number);
        let sMin=s[0]*60+s[1]; let eMin=e[0]*60+e[1];
        if(sMin<=eMin) return cur>=sMin && cur<eMin;
        else return cur>=sMin || cur<eMin;
    }
    function openTariffScheduleModal(){
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
        let single=parseInt(document.getElementById('tsSingle').value)||0;
        let double=parseInt(document.getElementById('tsDouble').value)||0;
        let extra=parseInt(document.getElementById('tsExtra').value)||0;
        let prices={};
        document.querySelectorAll('#tsTypePrices input').forEach(inp=>{ prices[inp.dataset.type]=parseInt(inp.value)||0; });
        if(!start||!end){ showToast('ساعت وارد کن','error'); return; }
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
        if(!confirm('حذف شود؟')) return;
        tariffSchedules=tariffSchedules.filter(x=>x.id!==id);
        saveTariffSchedules(); renderTariffSchedules(); updateActiveTariffDisplay();
    }
    function clearTariffSchedules(){
        if(!confirm('همه بازه‌ها حذف شوند؟')) return;
        tariffSchedules=[]; saveTariffSchedules(); renderTariffSchedules();
    }
    function updateActiveTariffDisplay(){
        let now=new Date();
        let el1=document.getElementById('currentHourDisplay'); if(el1) el1.textContent=now.toLocaleTimeString('fa-IR');
        let active=getActiveTariff();
        let el2=document.getElementById('activeTariffDisplay');
        if(!el2) return;
        if(active) el2.textContent=active.name+' - تک:'+active.single.toLocaleString()+' دو:'+active.double.toLocaleString();
        else el2.textContent='تعرفه عادی - تک:'+tariffs.single.toLocaleString()+' دو:'+tariffs.double.toLocaleString();
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
    function createBackup(){
        let data={
            clients, tariffs, sessions, reservations, services, expenses, tariffSchedules, sales, clientServiceMap, stationTypes,
            payments: safeParse(localStorage.getItem('alvand_payments')||'[]'),
            roundingMode, date: new Date().toISOString()
        };
        localStorage.setItem('alvand_backup', JSON.stringify(data));
        localStorage.setItem('alvand_lastBackup', Date.now().toString());
        updateBackupDisplay();
        showToast('بکاپ ذخیره شد','success');
    }
    function downloadBackupFile(){
        let data=localStorage.getItem('alvand_backup');
        if(!data){ createBackup(); data=localStorage.getItem('alvand_backup'); }
        let blob=new Blob([data], {type:'application/json'});
        let url=URL.createObjectURL(blob);
        let a=document.createElement('a'); a.href=url; a.download='gamenet-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
        URL.revokeObjectURL(url);
        showToast('فایل بکاپ دانلود شد','success');
    }
    function restoreBackup(input){
        let file=input.files[0];
        if(!file) return;
        let reader=new FileReader();
        reader.onload=function(e){
            try{
                let data=safeParse(e.target.result);
                if(data.clients) localStorage.setItem('alvand_clients', JSON.stringify(data.clients));
                if(data.tariffs) localStorage.setItem('alvand_tariffs', JSON.stringify(data.tariffs));
                if(data.sessions) localStorage.setItem('alvand_sessions', JSON.stringify(data.sessions));
                if(data.reservations) localStorage.setItem('alvand_reservations', JSON.stringify(data.reservations));
                if(data.services) localStorage.setItem('alvand_services', JSON.stringify(data.services));
                if(data.expenses) localStorage.setItem('alvand_expenses', JSON.stringify(data.expenses));
                if(data.tariffSchedules) localStorage.setItem('alvand_tariffSchedules', JSON.stringify(data.tariffSchedules));
                if(data.sales) localStorage.setItem('alvand_sales', JSON.stringify(data.sales));
                if(data.clientServiceMap) localStorage.setItem('alvand_clientServiceMap', JSON.stringify(data.clientServiceMap));
                if(data.stationTypes && data.stationTypes.length){ stationTypes=data.stationTypes; localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes)); }
                if(data.payments) localStorage.setItem('alvand_payments', JSON.stringify(data.payments));
                if(data.roundingMode) localStorage.setItem('alvand_rounding', data.roundingMode);
                showToast('بازگردانی شد - صفحه رفرش میشود','success');
                setTimeout(()=> location.reload(), 1500);
            }catch(err){ showToast('فایل خراب','error'); }
        };
        reader.readAsText(file);
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
            let todayStr=new Date().toDateString();
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
    }
    function applyPerms(){
        if(!currentOperator || currentOperator.role==='admin'){
            document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('operator-locked'));
            let navOp=document.getElementById('navOperators'); if(navOp) navOp.style.display='flex';
            let subLic=document.getElementById('settingsSubLicense'); if(subLic) subLic.style.display='';
            return;
        }
        // lock nav
        let map={clients:'clients', buffet:'buffet', reservations:'reservations', reports:'reports', income:'income', expenses:'expenses', customers:'customers', backup:'backup', operators:'operators', tariffSchedule:'tariffs'};
        document.querySelectorAll('.nav-item').forEach(el=>{
            let sec=el.getAttribute('onclick')?.match(/showSection\('([^']+)'/);
            if(sec){
                let s=sec[1];
                if(!hasPerm(s)) el.classList.add('operator-locked');
                else el.classList.remove('operator-locked');
            }
        });
        let navOp=document.getElementById('navOperators'); if(navOp) navOp.style.display='none';
        let subLic2=document.getElementById('settingsSubLicense'); if(subLic2) subLic2.style.display = hasPerm('license') ? '' : 'none';
    }
    function openOperatorModal(){
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
        document.getElementById('opPass').value=op.password;
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
        document.getElementById('operatorModal').classList.add('show');
    }
    function saveOperator(){
        let id=document.getElementById('opId').value;
        let username=document.getElementById('opUser').value.trim();
        let password=document.getElementById('opPass').value.trim();
        let role=document.getElementById('opRole').value;
        if(!username||!password){ showToast('نام و رمز','error'); return; }
        let perms={
            clients:document.getElementById('permClients').checked,
            buffet:document.getElementById('permBuffet').checked,
            reservations:document.getElementById('permReservations').checked,
            reports:document.getElementById('permReports').checked,
            income:document.getElementById('permIncome').checked,
            expenses:document.getElementById('permExpenses').checked,
            customers:document.getElementById('permCustomers').checked,
            backup:document.getElementById('permBackup').checked,
            operators:false, tariffs:true
        };
        if(id){
            let op=operators.find(x=>x.id===parseInt(id));
            Object.assign(op,{username,password,role,perms});
        } else {
            if(operators.find(x=>x.username===username)){ showToast('نام تکراری','error'); return; }
            operators.push({id:Date.now(), username,password,role,perms});
        }
        localStorage.setItem('alvand_operators', JSON.stringify(operators));
        closeModal('operatorModal');
        renderOperators();
        showToast('اپراتور ذخیره شد','success');
    }
    function deleteOperator(id){
        if(id===1){ showToast('مدیر اصلی حذف نمیشود','error'); return; }
        if(!confirm('حذف شود؟')) return;
        operators=operators.filter(x=>x.id!==id);
        localStorage.setItem('alvand_operators', JSON.stringify(operators));
        renderOperators();
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
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="editOperator(${op.id})">✏️</button>
                    <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteOperator(${op.id})">🗑️</button>
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
                        <p style="font-size:0.75rem; margin-top:4px;"><span class="${rank.cls}" style="padding:2px 8px; border-radius:50px; font-size:0.7rem; font-weight:800;">${rank.name}</span> <span style="color:#22c55e;">${rank.discount}% تخفیف</span> | 🕒 ${Math.floor(c.totalHours||0)}h | 💰 ${ (c.totalSpent||0).toLocaleString()} تومان</p>
                    </div>
                    <div style="text-align:left;">
                        <p style="font-size:0.75rem; color:rgba(255,255,255,0.5);">کیف پول</p>
                        <p style="font-weight:900; color:${(c.wallet||0)<0?'#ef4444':'#22c55e'};">${(c.wallet||0).toLocaleString()} تومان</p>
                        ${(c.debt||0)>0?`<p style="font-size:0.7rem; color:#ef4444;">بدهی: ${c.debt.toLocaleString()}</p>`:''}
                    </div>
                </div>
                <div style="display:flex; gap:6px; margin-top:12px; flex-wrap:wrap;">
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="openCustomerModal(${c.id})">✏️ ویرایش</button>
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem; background:rgba(34,197,94,0.15);" onclick="quickCharge(${c.id})">💰 شارژ</button>
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="openShareModalForCustomer('${c.name.replace(/'/g,"\'")}','${escapeHtml(c.phone)}','${escapeHtml(c.email)}')">📤 ارسال</button>
                    <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteCustomer(${c.id})">🗑️</button>
                </div>
            </div>`;
        }).join('') + `</div>`;
    }
    // Override old renderCustomers
    function renderCustomers(){ renderCustomersEnhanced(); renderOperators(); }
    function openCustomerModal(id=null){
        if(id){
            let c=customers.find(x=>x.id===id);
            if(!c) return;
            document.getElementById('custId').value=c.id;
            document.getElementById('custName').value=c.name;
            document.getElementById('custPhone').value=c.phone||'';
            document.getElementById('custEmail').value=c.email||'';
            document.getElementById('custSocial').value=c.telegram||c.rubika||'';
            document.getElementById('custBirthday').value=c.birthday||'';
            document.getElementById('custWalletDisplay').textContent=(c.wallet||0).toLocaleString()+' تومان';
            document.getElementById('custHoursDisplay').textContent=Math.floor(c.totalHours||0)+'h';
            let rank=getRank(c.totalHours||0);
            document.getElementById('custRankDisplay').innerHTML='<span class="'+rank.cls+'" style="padding:2px 8px; border-radius:50px; font-size:0.7rem;">'+rank.name+'</span>';
            // history
            let hist=walletHistory.filter(h=>h.customerId===c.id).slice(-8).reverse();
            document.getElementById('custHistory').innerHTML = hist.length? hist.map(h=>`<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.05);"><span>${new Date(h.date).toLocaleDateString('fa-IR')} ${h.action}</span><span style="color:${h.amount>0?'#22c55e':'#ef4444'};">${h.amount.toLocaleString()}</span></div>`).join('') : '<p style="color:rgba(255,255,255,0.4); text-align:center;">تاریخچه‌ای نیست</p>';
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
            Object.assign(c,{name,phone,email, telegram:social, rubika:social, birthday});
        } else {
            customers.push({id:Date.now(), name,phone,email, telegram:social, rubika:social, birthday, wallet:0, debt:0, totalHours:0, totalSpent:0, createdAt:new Date().toISOString()});
        }
        localStorage.setItem('alvand_customers', JSON.stringify(customers));
        closeModal('customerModal');
        renderCustomersEnhanced();
        showToast('مشتری ذخیره شد','success');
    }
    function deleteCustomer(id){
        if(!confirm('حذف شود؟')) return;
        customers=customers.filter(c=>c.id!==id);
        localStorage.setItem('alvand_customers', JSON.stringify(customers));
        renderCustomersEnhanced();
        showToast('حذف شد','success');
    }
    function quickCharge(id){
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
        let amount=parseInt(document.getElementById('chargeAmount').value);
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
        let id=parseInt(document.getElementById('custId').value);
        if(!id){ showToast('اول مشتری را ذخیره کن','error'); return; }
        let amount=parseInt(document.getElementById('walletAmount').value)||0;
        let action=document.getElementById('walletAction').value;
        if(!amount){ showToast('مبلغ وارد کن','error'); return; }
        let c=customers.find(x=>x.id===id);
        if(action==='charge'){ c.wallet=(c.wallet||0)+amount; }
        else if(action==='deduct'){ c.wallet=(c.wallet||0)-amount; }
        else if(action==='debt'){ c.debt=(c.debt||0)+amount; c.wallet=(c.wallet||0)-amount; }
        else if(action==='payDebt'){ c.debt=Math.max(0,(c.debt||0)-amount); c.wallet=(c.wallet||0)+amount; }
        walletHistory.push({customerId:id, amount: action==='deduct'||action==='debt' ? -amount : amount, action, date:new Date().toISOString()});
        localStorage.setItem('alvand_customers', JSON.stringify(customers));
        localStorage.setItem('alvand_walletHistory', JSON.stringify(walletHistory));
        localStorage.setItem('alvand_theme', currentTheme);
        localStorage.setItem('alvand_alarmSound', alarmSound);
        localStorage.setItem('alvand_alarmRepeat', alarmRepeat.toString());
        document.getElementById('custWalletDisplay').textContent=(c.wallet||0).toLocaleString()+' تومان';
        document.getElementById('walletAmount').value='';
        renderCustomersEnhanced();
        showToast('انجام شد','success');
    }
    function checkBirthdays(){
        let now=new Date();
        let month=now.getMonth();
        let todays=customers.filter(c=> c.birthday && new Date(c.birthday).getMonth()===month);
        if(todays.length>0){
            // show once per day
            let last=localStorage.getItem('alvand_birthdayShown');
            let todayStr=now.toDateString();
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
    confirmPayment = function(){
        // check if customer selected for discount
        if(pendingPayment){
            // find customer by name if exists
            let cust=customers.find(c=> pendingPayment.clientName.includes(c.name) || c.name.includes(pendingPayment.clientName) || c.phone===pendingPayment.phone);
            // if not found try to find by pending customer
            // apply rank discount
            if(cust){
                let rank=getRank(cust.totalHours||0);
                if(rank.discount>0){
                    let disc=Math.round(pendingPayment.total * rank.discount/100);
                    pendingPayment.total -= disc;
                    showToast('🏆 تخفیف '+rank.name+' '+rank.discount+'% : -'+disc.toLocaleString(),'success');
                }
                // birthday discount
                if(cust.birthday && new Date(cust.birthday).getMonth()===new Date().getMonth()){
                    let bDisc=Math.round(pendingPayment.total*0.10);
                    pendingPayment.total -= bDisc;
                    showToast('🎂 تخفیف تولد 10% : -'+bDisc.toLocaleString(),'success');
                }
                // try wallet payment
                if(cust.wallet && cust.wallet >= pendingPayment.total){
                    if(confirm('کیف پول '+cust.name+' موجودی کافی دارد ('+cust.wallet.toLocaleString()+') از کیف پول کسر شود؟')){
                        cust.wallet -= pendingPayment.total;
                        walletHistory.push({customerId:cust.id, amount:-pendingPayment.total, action:'پرداخت بازی', date:new Date().toISOString()});
                        showToast('از کیف پول کسر شد','success');
                    }
                }
                // update customer stats
                cust.totalHours = (cust.totalHours||0) + (pendingPayment.duration/3600);
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
        {id:'club', name:'کلوپ', bg:'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'},
        {id:'ocean', name:'اقیانوس', bg:'linear-gradient(135deg, #001f3f 0%, #003366 50%, #00509d 100%)'},
        {id:'forest', name:'جنگل', bg:'linear-gradient(135deg, #0d1b0d 0%, #1a3a1a 50%, #2d5a2d 100%)'},
        {id:'sunset', name:'غروب', bg:'linear-gradient(135deg, #4a0e0e 0%, #8b2500 50%, #ff6b35 100%)'},
        {id:'neon', name:'نئون', bg:'linear-gradient(135deg, #0f0c29 0%, #ff00cc 50%, #333399 100%)'},
        {id:'gold', name:'طلایی', bg:'linear-gradient(135deg, #1a1a0d 0%, #3d3d0d 50%, #b8860b 100%)'},
        {id:'cyber', name:'سایبر', bg:'linear-gradient(135deg, #000000 0%, #1a1a2e 50%, #0f3460 100%)'},
        {id:'candy', name:'آبنباتی', bg:'linear-gradient(135deg, #ff6b9d 0%, #c44dff 50%, #6a82fb 100%)'},
        {id:'arctic', name:'قطبی', bg:'linear-gradient(135deg, #e0f7fa 0%, #80deea 50%, #00838f 100%)'},
        {id:'volcano', name:'آتشفشان', bg:'linear-gradient(135deg, #1a0000 0%, #4a0000 50%, #8b0000 100%)'},
        {id:'midnight', name:'نیمه‌شب', bg:'linear-gradient(135deg, #000000 0%, #0f0f0f 50%, #1a1a1a 100%)'},
        {id:'emerald', name:'زمرد', bg:'linear-gradient(135deg, #004d40 0%, #00796b 50%, #00bfa5 100%)'},
        {id:'royal', name:'سلطنتی', bg:'linear-gradient(135deg, #1a0033 0%, #4a148c 50%, #7c4dff 100%)'},
        {id:'fire', name:'آتش', bg:'linear-gradient(135deg, #ff3d00 0%, #ff6d00 50%, #ff9e00 100%)'},
        {id:'ice', name:'یخی', bg:'linear-gradient(135deg, #0d47a1 0%, #1976d2 50%, #64b5f6 100%)'},
        {id:'matrix', name:'ماتریکس', bg:'linear-gradient(135deg, #001100 0%, #003300 50%, #00ff00 100%)'},
        {id:'luxury', name:'لوکس', bg:'linear-gradient(135deg, #212121 0%, #424242 50%, #bdbdbd 100%)'},
        {id:'retro', name:'رترو', bg:'linear-gradient(135deg, #3e2723 0%, #5d4037 50%, #8d6e63 100%)'},
        {id:'galaxy', name:'کهکشان', bg:'linear-gradient(135deg, #0b0c2a 0%, #1a1a40 50%, #4a148c 100%)'},
        {id:'desert', name:'کویر', bg:'linear-gradient(135deg, #3e2723 0%, #bf360c 50%, #ffab40 100%)'}
    ];
    function applyTheme(id){
        currentTheme=id;
        document.body.className = document.body.className.replace(/theme-\w+/g,'').trim();
        document.body.classList.add('theme-'+id);
        localStorage.setItem('alvand_theme', id);
        renderThemeGrid();
    }
    function renderThemeGrid(){
        let grid=document.getElementById('themeGrid');
        if(!grid) return;
        grid.innerHTML=themes.map(t=>`
            <div class="theme-card ${t.id===currentTheme?'active':''}" style="background:${t.bg};" onclick="applyTheme('${t.id}')">
                <span>${escapeHtml(t.name)}</span>
            </div>
        `).join('');
    }
    function loadAlarmSettings(){
        let s1=document.getElementById('alarmSoundSelect'); if(s1) s1.value=alarmSound;
        let s2=document.getElementById('alarmRepeat'); if(s2) s2.value=alarmRepeat.toString();
    }
    function renderStationHours(){
        let container=document.getElementById('stationHoursList');
        if(!container) return;
        let todayStr=new Date().toDateString();
        let stats=clients.map(c=>{
            let todaySessions=sessions.filter(s=> s.clientId===c.id && new Date(s.date).toDateString()===todayStr);
            let sessHours=todaySessions.reduce((sum,s)=>sum+s.duration/3600,0);
            let currentHours= c.status==='online' ? (c.elapsed||0)/3600 : 0;
            let total=sessHours + currentHours;
            return {name:c.name, hours:total, status:c.status};
        }).sort((a,b)=> b.hours - a.hours);
        let maxHours=Math.max(...stats.map(s=>s.hours), 1);
        let totalAll=stats.reduce((s,x)=>s+x.hours,0);
        let avg=stats.length? totalAll/stats.length:0;
        let most=stats[0];
        container.innerHTML=stats.map(st=>`
            <div class="glass" style="padding:16px; display:flex; justify-content:space-between; align-items:center; ${st.hours>6?'border-color:rgba(34,197,94,0.3);':''}">
                <div style="flex:1;">
                    <p style="font-weight:800;">${escapeHtml(st.name)} <span style="font-size:0.7rem; padding:2px 6px; border-radius:50px; background:${st.status==='online'?'#22c55e':st.status==='paused'?'#f59e0b':'#64748b'}; color:white;">${st.status==='online'?'فعال':st.status==='paused'?'متوقف':'آفلاین'}</span></p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${Math.min(100,(st.hours/8)*100)}%;"></div></div>
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
        if(!chart||!labels) return;
        // show if reports section visible or always prepare
        let now=new Date();
        let months=[];
        for(let i=0;i<12;i++){
            let m=new Date(now.getFullYear(), i, 1);
            let inc=sessions.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===now.getFullYear() && d.getMonth()===i; }).reduce((sum,s)=>sum+(s.cost||0),0);
            let buff=sales.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===now.getFullYear() && d.getMonth()===i; }).reduce((sum,s)=>sum+s.price*s.qty,0);
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
        let m1=document.getElementById('compareMonth1').value;
        let m2=document.getElementById('compareMonth2').value;
        if(!m1||!m2){ showToast('دو ماه انتخاب کن','error'); return; }
        let d1=new Date(m1+'-01'); let d2=new Date(m2+'-01');
        let inc1=sessions.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d1.getFullYear() && d.getMonth()===d1.getMonth(); }).reduce((sum,s)=>sum+(s.cost||0),0) + sales.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d1.getFullYear() && d.getMonth()===d1.getMonth(); }).reduce((sum,s)=>sum+s.price*s.qty,0);
        let inc2=sessions.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d2.getFullYear() && d.getMonth()===d2.getMonth(); }).reduce((sum,s)=>sum+(s.cost||0),0) + sales.filter(s=>{ let d=new Date(s.date); return d.getFullYear()===d2.getFullYear() && d.getMonth()===d2.getMonth(); }).reduce((sum,s)=>sum+s.price*s.qty,0);
        let exp1=expenses.filter(e=>{ let d=new Date(e.date); return d.getFullYear()===d1.getFullYear() && d.getMonth()===d1.getMonth(); }).reduce((sum,e)=>sum+e.amount,0);
        let exp2=expenses.filter(e=>{ let d=new Date(e.date); return d.getFullYear()===d2.getFullYear() && d.getMonth()===d2.getMonth(); }).reduce((sum,e)=>sum+e.amount,0);
        let max=Math.max(inc1,inc2,exp1,exp2,1);
        let cont=document.getElementById('compareChartContainer');
        let chart=document.getElementById('compareChart');
        cont.style.display='block';
        chart.innerHTML=`
            <div style="flex:1; text-align:center;">
                <h4 style="margin-bottom:8px;">${m1}</h4>
                <div style="background:rgba(99,102,241,0.15); border-radius:12px; padding:12px; margin-bottom:8px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">درآمد</p>
                    <p style="font-weight:900; color:#22c55e;">${inc1.toLocaleString()}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(inc1/max)*100}%; background:linear-gradient(90deg, #6366f1, #22c55e);"></div></div>
                </div>
                <div style="background:rgba(239,68,68,0.12); border-radius:12px; padding:12px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">هزینه</p>
                    <p style="font-weight:900; color:#ef4444;">${exp1.toLocaleString()}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(exp1/max)*100}%; background:linear-gradient(90deg, #ef4444, #f59e0b);"></div></div>
                </div>
                <p style="margin-top:8px; font-weight:800; color:${inc1-exp1>=0?'#22c55e':'#ef4444'};">سود: ${(inc1-exp1).toLocaleString()}</p>
            </div>
            <div style="flex:1; text-align:center;">
                <h4 style="margin-bottom:8px;">${m2}</h4>
                <div style="background:rgba(99,102,241,0.15); border-radius:12px; padding:12px; margin-bottom:8px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">درآمد</p>
                    <p style="font-weight:900; color:#22c55e;">${inc2.toLocaleString()}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(inc2/max)*100}%; background:linear-gradient(90deg, #6366f1, #22c55e);"></div></div>
                </div>
                <div style="background:rgba(239,68,68,0.12); border-radius:12px; padding:12px;">
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">هزینه</p>
                    <p style="font-weight:900; color:#ef4444;">${exp2.toLocaleString()}</p>
                    <div class="hours-bar"><div class="hours-fill" style="width:${(exp2/max)*100}%; background:linear-gradient(90deg, #ef4444, #f59e0b);"></div></div>
                </div>
                <p style="margin-top:8px; font-weight:800; color:${inc2-exp2>=0?'#22c55e':'#ef4444'};">سود: ${(inc2-exp2).toLocaleString()}</p>
            </div>
        `;
        // also show diff
        let diff=inc2-inc1;
        showToast((diff>=0?'📈 رشد ':'📉 افت ')+Math.abs(diff).toLocaleString()+' تومان','success');
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
                <div class="glass" style="padding:16px; text-align:center;"><p style="color:rgba(255,255,255,0.5);">درآمد کل سال</p><p style="font-size:1.5rem; font-weight:900; color:#22c55e;">${total.toLocaleString()} تومان</p></div>
            </div>`;
            document.getElementById('reportContent').innerHTML=html;
            renderYearlyChart();
            return;
        }
        return origGenerateReport(type);
    };

    
    // ========== LICENSE SYSTEM ==========
    function licSecret(){ return ['ALV','AND','-20','26'].join('') + '-PRO'; }
    function licHash(str){
        let h1=0xdeadbeef, h2=0x41c6ce57;
        for(let i=0;i<str.length;i++){ let ch=str.charCodeAt(i); h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677); }
        h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
        h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
        return (h2>>>0).toString(36).toUpperCase() + (h1>>>0).toString(36).toUpperCase();
    }
    function licPrice(cap){
        cap=parseInt(cap)||3;
        if(cap<=3) return 1000000;
        return 1000000 + (cap-3)*200000;
    }
    function updateGenPrice(){
        let cap=parseInt(document.getElementById('genCapacity').value)||3;
        document.getElementById('genPrice').textContent=licPrice(cap).toLocaleString()+' تومان';
    }
    function makeLicenseKey(capacity, months){
        // DISABLED FOR SECURITY: licenses are issued ONLY by the seller tool (license-tools/).
        // The app verifies RSA signatures; it must never mint keys (old scheme was forgeable).
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
    async function getIP(){
        try{
            let ctl=new AbortController(); setTimeout(()=>ctl.abort(),6000);
            let r=await fetch('https://api.ipify.org?format=json',{signal:ctl.signal});
            let j=await r.json();
            return j.ip||'unknown';
        }catch(e){ return 'unknown'; }
    }
    async function checkInternet(){
        if(!navigator.onLine) return false;
        try{
            let ctl=new AbortController(); setTimeout(()=>ctl.abort(),5000);
            await fetch('https://api.ipify.org?format=json',{signal:ctl.signal, mode:'cors'});
            return true;
        }catch(e){
            try{ await fetch('https://alvandcode.github.io/',{mode:'no-cors', signal:ctl.signal}); return true; }catch(e2){ return false; }
        }
    }
    async function initLicenseGate(){
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
        let serverDevs=[];
        try { const s=await fbLoadActivations(p.id); if(s&&Array.isArray(s.devices)) serverDevs=s.devices; } catch(_e){}
        const devKey=(d)=>String((d&&(d.fp||d.id))||'');
        const known=new Set();
        serverDevs.forEach(d=>{ if(devKey(d)) known.add(devKey(d)); });
        let rec=allLicenses.find(l=>l.keyId===p.id);
        const localDevs=(rec&&Array.isArray(rec.devices))?rec.devices:[];
        localDevs.forEach(d=>{ if(devKey(d)) known.add(devKey(d)); });
        const already=serverDevs.concat(localDevs).some(d=>devKey(d)===String(fp));
        if(!already){ known.add(String(fp)); }
        if(!already && known.size>p.maxDev){ licCapacityError(); return; }
        // revoked on server?
        try { const meta=await fbLoadLicenseMeta(p.id); if(meta&&meta.revoked){ if(err){ err.textContent='این لایسنس توسط فروشنده باطل شده.'; err.style.display='block'; } return; } } catch(_e){}
        let ip='unknown';
        try{ ip=await getIP(); }catch(_e){}
        activeLicense={token, id:p.id, customer:p.customer, phone:p.phone, capacity:p.cap, months:p.months, exp:p.exp, maxDev:p.maxDev, fp, activatedAt:new Date().toISOString()};
        try{ localStorage.setItem('alvand_license', JSON.stringify(activeLicense)); }catch(_e){}
        const merged=[...serverDevs, ...localDevs];
        if(!merged.some(d=>devKey(d)===String(fp))) merged.push({fp:String(fp), id:String(fp), ip, date:new Date().toISOString()});
        if(rec){ rec.devices=merged.slice(-100); rec.customer=p.customer; rec.phone=p.phone; }
        else { allLicenses.push({key:token, keyId:p.id, capacity:p.cap, months:p.months, exp:p.exp, maxDev:p.maxDev, price:licPrice(p.cap), customer:p.customer, phone:p.phone, createdAt:new Date().toISOString(), devices:merged.slice(-100)}); }
        try{ localStorage.setItem('alvand_allLicenses', JSON.stringify(allLicenses)); }catch(_e){}
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
        if(!lastGeneratedLicense){ showToast('اول بساز','error'); return; }
        navigator.clipboard.writeText(lastGeneratedLicense).then(()=>showToast('کپی شد','success'));
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
                info.innerHTML=`🔑 <span style="font-family:monospace; direction:ltr;">${escapeHtml(p.id)}</span><br>👤 ${escapeHtml(p.customer||'-')} | 📞 ${escapeHtml(p.phone||'-')}<br>👥 ظرفیت: <b>${used} از ${p.maxDev} دستگاه</b> | 📅 ${expTxt}${dlTxt}<br>🚀 فعال‌سازی: <b>${actDate}</b>`;
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
                        <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="copyLicense(${realIdx})">📋</button>
                        <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteLicense(${realIdx})">🗑️</button>
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
    async function fbSaveLicense(rec){
        if(!firebaseReady) return;
        try{
            await firebase.database().ref('licenses/'+firebaseKey(rec.key)).set({
                capacity: rec.capacity, months: rec.months, expiry: rec.expiry||null,
                price: rec.price||licPrice(rec.capacity), customer: rec.customer||'', phone: rec.phone||'',
                createdAt: rec.createdAt, devices: arrayToObj(rec.devices)
            });
        }catch(e){ console.log('fb save fail', e); }
    }
    function arrayToObj(arr){
        let o={}; (arr||[]).forEach(d=>{ o[d.id.replace(/[^A-Za-z0-9]/g,'_')]={id:d.id, ip:d.ip, date:d.date}; });
        return o;
    }
    function objToArray(o){
        if(!o) return [];
        return Object.values(o);
    }
    async function fbLoadLicense(key){
        if(!firebaseReady) return null;
        try{
            let snap=await firebase.database().ref('licenses/'+firebaseKey(key)).once('value');
            let v=snap.val();
            if(!v) return null;
            return {key, capacity:v.capacity, months:v.months, expiry:v.expiry, price:v.price, customer:v.customer, phone:v.phone||'', createdAt:v.createdAt, devices:objToArray(v.devices)};
        }catch(e){ console.log('fb load fail', e); return null; }
    }
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
    const APP_VERSION = "1.8.1";
    let latestRelease = null;
    function toggleSettingsMenu(el){
        let sub=document.getElementById('settingsSubmenu');
        let arrow=document.getElementById('settingsArrow');
        let isOpen=sub.classList.toggle('open');
        if(arrow) arrow.textContent = isOpen ? '▼' : '◀';
        showSection('settings', el||document.getElementById('navSettings'));
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
            let r=await fetch('https://api.github.com/repos/Alvandcode/gamenet-windows-pro/releases/latest');
            if(!r.ok) throw new Error('http '+r.status);
            let j=await r.json();
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
            updateUpdateUI('error');
            if(manual) showToast('خطا در بررسی آپدیت','error');
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
        else if(state==='offline'){ st.textContent='⛔ آفلاین - برای بررسی وصل شو'; st.style.color='#ef4444'; btn.disabled=true; }
        else if(state==='error'){ st.textContent='⚠️ خطا در بررسی - بعدا دوباره امتحان کن'; st.style.color='#ef4444'; btn.disabled=true; }
        else if(state==='latest'){ st.textContent='✅ به‌روزی - نسخه '+APP_VERSION; st.style.color='#22c55e'; btn.disabled=true; if(notes) notes.style.display='none'; }
        else if(state==='available'){
            let tag=window._relVer || (latestRelease? latestRelease.tag_name : '');
            st.innerHTML='🎉 نسخه جدید <b>'+tag+'</b> منتشر شده!'; st.style.color='#22c55e'; btn.disabled=false;
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
        "بدهی": {en:"Debt", ar:"دين"}
    };
    const I18N_KEYS = Object.keys(I18N).sort((a,b)=>b.length-a.length);
    const _i18nOrig = new WeakMap();
    function translateNodeText(node){
        let orig = _i18nOrig.get(node);
        if(orig === undefined){ orig = node.nodeValue; _i18nOrig.set(node, orig); }
        if(appLang==='fa'){ if(node.nodeValue!==orig) node.nodeValue=orig; return; }
        let txt = orig;
        for(let k of I18N_KEYS){ if(txt.includes(k)){ txt = txt.split(k).join(I18N[k][appLang]||k); } }
        if(txt!==node.nodeValue) node.nodeValue=txt;
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
            nodes.forEach(translateNodeText);
            root.querySelectorAll && root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el=>{
                if(el._phOrig===undefined) el._phOrig=el.getAttribute('placeholder')||'';
                let ph=el._phOrig;
                if(appLang!=='fa'){ for(let k of I18N_KEYS){ if(ph.includes(k)){ ph=ph.split(k).join(I18N[k][appLang]||k); } } }
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
                window._i18nObs=new MutationObserver(()=>{
                    clearTimeout(_i18nTimer);
                    _i18nTimer=setTimeout(()=>translateRoot(document.body), 250);
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

    
    // ========== Owner-only license generator ==========
    const _op=[49,52,48,53].map(c=>String.fromCharCode(c)).join('');
    function isOwner(){ try{ return sessionStorage.getItem('alvand_owner')==='1'; }catch(e){ return window._isOwner===true; } }
    function askOwnerPin(){
        if(isOwner()){ try{ renderLicenseSection(); }catch(e){} return true; }
        let m=document.getElementById('ownerPinModal');
        let inp=document.getElementById('ownerPinInput');
        let err=document.getElementById('ownerPinError');
        if(err) err.style.display='none';
        if(inp) inp.value='';
        if(m){ m.classList.add('show'); setTimeout(()=>{ try{ inp.focus(); }catch(e){} }, 300); }
        return false;
    }
    function submitOwnerPin(){
        let inp=document.getElementById('ownerPinInput');
        let err=document.getElementById('ownerPinError');
        let v=inp? String(inp.value).trim() : '';
        if(v===_op){
            try{ sessionStorage.setItem('alvand_owner','1'); }catch(e){ window._isOwner=true; }
            closeModal('ownerPinModal');
            showToast('👑 خوش آمدی سازنده - حالا دوباره دکمه ساخت را بزن','success');
            try{ renderLicenseSection(); }catch(e){}
        } else {
            if(err){ err.textContent='رمز اشتباه است'; err.style.display='block'; }
        }
    }
    function licCapacityError(){
        let err=document.getElementById('licenseError');
        let msg='⛔ این لایسنس به حد نصاب فعال‌سازی رسیده است.<br>برای خرید لایسنس جدید با سازنده تماس بگیرید.<br><a href="https://github.com/Alvandcode/gamenet-windows-pro" target="_blank" style="color:#818cf8; text-decoration:underline;">🔗 تماس با سازنده در گیت‌هاب</a>';
        if(err){ err.innerHTML=msg; err.style.display='block'; }
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
                    <input type="number" value="${t.price}" onchange="saveStationTypePrice('${t.id}', this.value)" style="text-align:center; font-weight:800;">
                    <button class="glass-btn glass-btn-danger" style="padding:8px 10px; font-size:0.75rem;" onclick="deleteStationType('${t.id}')">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }
    function saveStationTypePrice(id, val){
        let t=stationTypes.find(x=>x.id===id); if(!t) return;
        t.price=parseInt(val)||0;
        localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes));
        renderClients(); updateStats();
        showToast('تعرفه '+t.name+' ذخیره شد','success');
    }
    function addStationType(){
        let name=document.getElementById('newTypeName').value.trim();
        let price=parseInt(document.getElementById('newTypePrice').value)||0;
        if(!name){ showToast('نام نوع را وارد کن','error'); return; }
        stationTypes.push({id:'t'+Date.now(), name, icon:'🎮', price});
        localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes));
        document.getElementById('newTypeName').value='';
        document.getElementById('newTypePrice').value='';
        renderStationTypes();
        showToast('نوع جدید اضافه شد','success');
    }
    function deleteStationType(id){
        let used=clients.filter(c=>c.stationType===id).length;
        if(used>0){ showToast('این نوع '+used+' دستگاه دارد، اول نوع آنها را عوض کن','error'); return; }
        if(!confirm('حذف شود؟')) return;
        stationTypes=stationTypes.filter(t=>t.id!==id);
        localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes));
        renderStationTypes();
        showToast('حذف شد','success');
    }
    function changeClientType(idx, val){
        clients[idx].stationType = val||null;
        saveData();
        renderClients();
        showToast('نوع دستگاه تغییر کرد','success');
    }
    function fillClientTypeSelect(){
        let sel=document.getElementById('newClientType');
        if(!sel) return;
        sel.innerHTML=stationTypes.map(t=>`<option value="${t.id}">${t.icon} ${escapeHtml(t.name)} - ${t.price>0? t.price.toLocaleString()+' تومان' : 'تعرفه پایه'}</option>`).join('');
    }
    function renderTypeFilter(){
        let bar=document.getElementById('typeFilterBar');
        if(!bar) return;
        let btn=(id,label)=>`<button class="glass-btn ${clientTypeFilter===id?'glass-btn-success':''}" style="padding:8px 14px; font-size:0.8rem;" onclick="filterClientsByType('${id}')">${label}</button>`;
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
                <p style="font-weight:900; color:#22c55e;">${map[k].total.toLocaleString()} تومان</p>
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
    async function agentPoll(){
        let changed=false;
        for(let c of clients){
            if(!c.ip) continue;
            try{ const s=await agentFetch(c.ip, '/status'); const on=!!(s&&s.ok); if(c.online!==on){ c.online=on; changed=true; } }
            catch(e){ if(c.online!==false){ c.online=false; changed=true; } }
        }
        if(changed){ saveData(); renderClients(); }
    }
    setInterval(agentPoll, 30000);

    // Initialize
    function init() {
        createParticles();
        updateDateTime();
        setInterval(updateDateTime, 1000);
        setInterval(updateTimers, 1000);
        requestNotificationPermission();
        renderClients();
        updateStats();
        renderWeeklyChart();
        updateIncome(); try{renderTypeBreakdown();}catch(e){}
        loadTariffs();
        renderReservations();
        renderCustomers();
        updateReservationBadge();
        renderServices();
        renderExpenses();
        renderTariffSchedules();
        updateBuffetStats();
        updateExpenseStats();
        updateCashCardStats();
        loadRoundingMode();
        checkAutoBackup();
        setInterval(checkAutoBackup, 60000);
        updateActiveTariffDisplay();
        setInterval(updateActiveTariffDisplay, 60000);
        checkLogin();
        renderCustomersEnhanced();
        checkBirthdays();
        setInterval(checkBirthdays, 3600000);
        applyTheme(currentTheme);
        renderThemeGrid();
        loadAlarmSettings();
        renderStationHours();
        setInterval(renderStationHours, 30000);
        initLicenseGate();
        setTimeout(()=>{ try{ checkForUpdate(false); }catch(e){} }, 8000);
        setInterval(()=>{ try{ checkForUpdate(false); }catch(e){} }, 6*3600*1000);
        try{ applyAppLang(); }catch(e){}
        setTimeout(updateFirebaseStatus, 1500);
        // migrate reservations clientName
        reservations.forEach(r=>{ if(!r.clientName){ let cl=clients.find(c=>c.id===r.clientId); if(cl) r.clientName=cl.name; }});
        saveReservations();
        // setup date default
        let d=document.getElementById('resDate'); if(d && !d.value) d.valueAsDate=new Date();
        let t=document.getElementById('resStartTime'); if(t && !t.value) t.value = new Date().toTimeString().slice(0,5);
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

    function hasPerm(section){
        if(!currentOperator) return true;
        if(currentOperator.role==='admin') return true;
        let p=currentOperator.perms||{};
        let map={dashboard:true, clients:'clients', buffet:'buffet', reservations:'reservations', reports:'reports', income:'income', expenses:'expenses', customers:'customers', backup:'backup', operators:'operators', tariffSchedule:'tariffs', tariffs:'tariffs', license:'operators', stationHours:true, settings:true};
        let key=map[section];
        if(key===true) return true;
        if(!key) return true;
        return !!p[key];
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
        if (el) el.classList.add('active');
        if (window.innerWidth <= 768) closeSidebar();

        if (section === 'dashboard') { updateStats(); renderActiveClients(); renderWeeklyChart(); }
        if (section === 'clients') renderClients();
        if (section === 'tariffs') { try{renderStationTypes();}catch(e){} }
        if (section === 'income') updateIncome(); try{renderTypeBreakdown();}catch(e){}
        if (section === 'reservations') renderReservations();
        if (section === 'customers') renderCustomers();
        if (section === 'buffet') { renderServices(); updateBuffetStats(); }
        if (section === 'expenses') { renderExpenses(); updateExpenseStats(); updateCashCardStats(); }
        if (section === 'tariffSchedule') { renderTariffSchedules(); updateActiveTariffDisplay(); }
        if (section === 'backup') { updateBackupDisplay(); }
        if (section === 'license') { renderLicenseSection(); }
        if (section === 'settings') { try{renderThemeGrid();}catch(e){} try{loadAlarmSettings();}catch(e){} try{updateUpdateUI();}catch(e){} }
        if (section === 'reports') {}
    }

    function showToast(msg, type='success'){
        let toast=document.getElementById('toast');
        toast.textContent=msg;
        toast.className='toast show toast-'+type;
        setTimeout(()=>toast.classList.remove('show'),3500);
    }

    // ========== Client Management ==========
    function renderClients() {
        const grid = document.getElementById('clientsGrid');
        if(!grid) return;
        try{renderTypeFilter();}catch(e){}
        if (clients.length === 0) {
            grid.innerHTML = '<div class="glass" style="grid-column: 1/-1; text-align: center; padding: 60px;"><p style="font-size: 3rem; margin-bottom: 16px;">&#128123;</p><p>هیچ کلاینتی ثبت نشده</p><p style="color:rgba(255,255,255,0.4); font-size:0.85rem; margin-top:8px;">برای شروع یک کلاینت جدید اضافه کنید</p></div>';
            return;
        }

        let shownIdx = clients.map((c,i)=>i).filter(i=> !clientTypeFilter || (clients[i].stationType||'none')===clientTypeFilter);
        if(shownIdx.length===0){
            grid.innerHTML = '<div class="glass" style="grid-column: 1/-1; text-align: center; padding: 60px;"><p>در این دسته دستگاهی نیست</p></div>';
            return;
        }
        grid.innerHTML = shownIdx.map((i) => { const c=clients[i];
            const statusClass = c.status === 'online' ? 'status-online' : c.status === 'paused' ? 'status-paused' : 'status-offline';
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
                <div class="glass client-card ${isReserved?'reserved-card':''} ${timerEnabled && remainingSec<=300 && c.status==='online' ? 'shake':''}" style="padding: 24px; position: relative; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: ${c.status === 'online' ? '#22c55e' : c.status === 'paused' ? '#f59e0b' : '#ef4444'};"></div>
                    ${isReserved? `<div style="position:absolute; top:10px; left:12px;" class="reservation-badge">🔒 رزرو: ${escapeHtml(reserved.customerName)} - ${reserved.startTime} (${reserved.duration}د)</div>`:''}
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px; margin-top:${isReserved?'22px':'0'};">
                        <div>
                            <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 4px;">${escapeHtml(c.name)}</h3>
                            <span class="tariff-badge ${tariffClass}">${tariffLabel}</span>
                            ${c.extra > 0 ? `<span class="tariff-badge tariff-extra" style="margin-right: 6px;">+${c.extra} نفر</span>` : ''}
                            ${(()=>{ let st=getStationType(c.stationType); return st? `<span class="tariff-badge" style="margin-right:6px; background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3);">${st.icon} ${escapeHtml(st.name)}</span>` : ''; })()}
                            ${timerEnabled? `<span class="tariff-badge" style="margin-right:6px; background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.3);">⏱️ ${c.timerDuration}د</span>`:''}
                        </div>
                        <span class="status-dot ${statusClass}" title="${c.status}"></span>
                    </div>

                    <div style="text-align: center; margin: 16px 0;">
                        <p style="font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-bottom: 4px;">زمان سپری شده</p>
                        <p style="font-size: 1.8rem; font-weight: 900; font-variant-numeric: tabular-nums; ${timerEnabled && c.status==='online' && remainingSec<=300 ? 'color:#ef4444;':''}">${timeStr}</p>
                        ${timerEnabled? `<div style="margin-top:6px;"><span class="countdown-badge" style="${remainingSec<=300 && c.status==='online'?'background:rgba(239,68,68,0.25); color:#fff;':''}">${c.status==='online'? '⏳ باقی‌مانده: '+remainingStr : '⏱️ تایمر: '+c.timerDuration+' دقیقه'}</span></div>` : ''}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 16px;">
                        <span style="color: rgba(255,255,255,0.6);">هزینه فعلی:</span>
                        <span style="font-weight: 900; color: #22c55e; font-size: 1.1rem;">${cost.toLocaleString()} تومان</span>
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
                        <span style="font-size:0.75rem; color:rgba(255,255,255,0.6);">🌐 ${c.ip||'بدون IP'} <span class="status-dot ${c.online===true?'status-online':(c.online===false?'status-offline':'status-paused')}" title="${c.online===true?'متصل':(c.online===false?'قطع':'نامشخص')}"></span></span>
                        <span style="display:flex; gap:6px;">
                            <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" title="باز کردن" onclick="agentCmd(${i},'unlock')">🔓</button>
                            <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" title="قفل" onclick="agentCmd(${i},'lock')">🔒</button>
                            <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" title="هشدار" onclick="agentCmd(${i},'warn')">⚠️</button>
                            <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" title="خاموش" onclick="agentShutdown(${i})">⏻</button>
                        </span>
                    </div>
                    ${(() => {
                        let svc = clientServiceMap[c.id]||[];
                        let svcCost = svc.reduce((sum, it)=>{ let s=services.find(x=>x.id===it.serviceId); return sum + (s? s.price*it.qty:0); },0);
                        return svcCost>0? `<div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); border-radius:12px; padding:8px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:0.75rem; color:#fbbf24;">🍿 بوفه: ${svc.length} قلم</span><span style="font-weight:800; color:#fbbf24; font-size:0.85rem;">${svcCost.toLocaleString()} تومان</span></div>`:'';
                    })()}
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom:8px;">
                        <button class="glass-btn" style="padding: 10px 12px; font-size: 0.8rem;" onclick="openTimeModal(${i})">&#9201; زمان</button>
                        <button class="glass-btn" style="padding: 10px 12px; font-size: 0.8rem; background: rgba(99,102,241,0.18);" onclick="openAmountModal(${i})">💰 مبلغ->زمان</button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom:8px;">
                        <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem; background: rgba(245,158,11,0.18);" onclick="openReservationModal(${i})">&#128197; رزرو</button>
                        <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem; background: rgba(34,197,94,0.18);" onclick="openAddServiceToClient(${i})">🍿 بوفه</button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="openShareModalForClient(${i})">📤 ارسال</button>
                        <button class="glass-btn" style="padding: 8px 10px; font-size: 0.78rem;" onclick="generatePdfForClient(${i})">📄 PDF</button>
                        <button class="glass-btn glass-btn-danger" style="padding: 8px 10px; font-size: 0.78rem;" onclick="deleteClient(${i})">&#128465; حذف</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function openAddClientModal() {
        try{fillClientTypeSelect();}catch(e){}
        document.getElementById('addClientModal').classList.add('show');
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('show');
        if(id==='timerEndModal'){ stopAlarmSound(); }
    }

    function addClient() {
        const name = document.getElementById('newClientName').value.trim();
        const ip = (document.getElementById('newClientIP') && document.getElementById('newClientIP').value.trim()) || '';
        const tariff = document.getElementById('newClientTariff').value;
        const extra = parseInt(document.getElementById('newClientExtra').value) || 0;
        const timerMin = parseInt(document.getElementById('newClientTimer')?.value) || 0;

        if (!name) { showToast('لطفاً نام کلاینت را وارد کنید','error'); return; }

        clients.push({
            id: Date.now(),
            name,
            tariff,
            extra,
            stationType: (document.getElementById('newClientType') && document.getElementById('newClientType').value) || 'pc',
            ip: (document.getElementById('newClientIP') && document.getElementById('newClientIP').value.trim()) || '',
            status: 'offline',
            elapsed: 0,
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
        if (confirm('آیا از حذف این کلاینت اطمینان دارید؟')) {
            let cid=clients[index].id;
            clients.splice(index, 1);
            // also remove reservations for this client
            reservations = reservations.filter(r=>r.clientId!==cid);
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
        let mins=parseInt(document.getElementById('timerDurationInput').value)||0;
        if(mins<=0){ showToast('زمان معتبر وارد کنید','error'); return;}
        setTimerPreset(mins);
        document.getElementById('timerDurationInput').value='';
    }

    function startTimer() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
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
        c._warned5=false;
        if(c.ip){ agentFetch(c.ip,'/unlock').then(()=>{ c.online=true; }).catch(()=>{ c.online=false; showToast('⚠️ ایجنت جواب نداد ولی تایمر شروع شد','warning'); }); }
        showToast(`تایمر ${escapeHtml(c.name)} شروع شد`,'success');
    }

    function pauseTimer() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        if (c.status !== 'online') return;

        c.status = 'paused';
        c.elapsed = Math.floor((Date.now() - c.startTime) / 1000);
        c.startTime = null;
        saveData();
        renderClients();
        updateStats();
        showToast('تایمر متوقف شد','warning');
    }

    function stopTimer() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        if (c.status === 'online') {
            c.elapsed = Math.floor((Date.now() - c.startTime) / 1000);
        }
        // calculate costs including buffet
        let gameCost = calculateCost(c);
        let buffetCost = 0;
        let svc = clientServiceMap[c.id]||[];
        svc.forEach(it=>{ let s=services.find(x=>x.id===it.serviceId); if(s) buffetCost += s.price*it.qty; });
        let total = applyRounding(gameCost + buffetCost);
        pendingPayment = {
            clientIdx: currentTimeClient,
            clientId: c.id,
            clientName: c.name,
            duration: c.elapsed,
            gameCost, buffetCost, total,
            tariff: c.tariff, extra: c.extra,
            stationType: c.stationType||null,
            services: safeParse(JSON.stringify(svc))
        };
        document.getElementById('paymentClientName').textContent = c.name + ' - ' + formatTime(c.elapsed);
        document.getElementById('payDuration').textContent = formatTime(c.elapsed);
        document.getElementById('payGameCost').textContent = gameCost.toLocaleString() + ' تومان';
        document.getElementById('payBuffetCost').textContent = buffetCost.toLocaleString() + ' تومان';
        document.getElementById('payTotal').textContent = total.toLocaleString() + ' تومان';
        let roundingInfo = document.getElementById('payRoundingInfo');
        if(roundingMode!=='none') roundingInfo.textContent = 'رند: '+roundingMode+' (اصلی: '+(gameCost+buffetCost).toLocaleString()+')';
        else roundingInfo.textContent = '';
        closeModal('timeModal');
        document.getElementById('paymentModal').classList.add('show');
    }
    function confirmPayment(){
        if(!pendingPayment) return;
        let c = clients[pendingPayment.clientIdx];
        let method = document.getElementById('payMethod').value;
        let total = pendingPayment.total;
        // record session
        sessions.push({
            clientId: pendingPayment.clientId,
            clientName: pendingPayment.clientName,
            duration: pendingPayment.duration,
            cost: total,
            gameCost: pendingPayment.gameCost,
            buffetCost: pendingPayment.buffetCost,
            tariff: pendingPayment.tariff,
            extra: pendingPayment.extra,
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
                sales.push({serviceId:s.id, name:s.name, qty:it.qty, price:s.price, cost:s.cost, profit:(s.price-s.cost)*it.qty, date:new Date().toISOString()});
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
        c.notified=false;
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
        showToast(`تسویه ${escapeHtml(pendingPayment.clientName)} - ${total.toLocaleString()} تومان (${method==='cash'?'نقد':method==='card'?'کارت':'نصف/نصف'})`,'success');
        let idx=sessions.length-1;
        pendingPayment=null;
        setTimeout(()=> openShareModalForSession(idx), 600);
    }

    function resetTimer() {
        if (currentTimeClient === null) return;
        const c = clients[currentTimeClient];
        c.elapsed = 0;
        c.startTime = null;
        c.status = 'offline';
        c.notified=false;
        saveData();
        updateTimeDisplay();
        renderClients();
        updateStats();
        showToast('تایمر ریست شد','success');
    }

    function addTime() {
        if (currentTimeClient === null) return;
        const mins = parseInt(document.getElementById('timeAdjust').value) || 0;
        clients[currentTimeClient].elapsed = (clients[currentTimeClient].elapsed || 0) + mins * 60;
        saveData();
        updateTimeDisplay();
        renderClients();
    }

    function subTime() {
        if (currentTimeClient === null) return;
        const mins = parseInt(document.getElementById('timeAdjust').value) || 0;
        clients[currentTimeClient].elapsed = Math.max(0, (clients[currentTimeClient].elapsed || 0) - mins * 60);
        saveData();
        updateTimeDisplay();
        renderClients();
    }

    function updateTimers() {
        let changed = false;
        let now=Date.now();
        clients.forEach((c, idx) => {
            if (c.status === 'online' && c.startTime) {
                c.elapsed = Math.floor((now - c.startTime) / 1000);
                changed = true;
                // check timer end
                if(c.timerDuration && c.timerDuration>0 && !c.notified){
                    let remaining = c.timerDuration*60 - c.elapsed;
                    if(remaining<=0){
                        c.notified=true;
                        try{ saveData(); window._lastPersist=Date.now(); }catch(e){}
                        triggerAlarm(idx);
                    } else if(remaining===300){ // 5 min warning
                        showToast(`⏰ ${escapeHtml(c.name)}: 5 دقیقه تا پایان`,'warning');
                        if(c.ip && !c._warned5){ c._warned5=true; agentFetch(c.ip,'/warn?msg='+encodeURIComponent(c.name+': 5 دقیقه تا پایان وقت')).catch(()=>{}); }
                        if('Notification' in window && Notification.permission==='granted'){
                            new Notification('هشدار زمان', {body: `${escapeHtml(c.name)}: 5 دقیقه باقی مانده`});
                        }
                    } else if(remaining===60){
                        showToast(`⏰ ${escapeHtml(c.name)}: 1 دقیقه تا پایان`,'warning');
                    }
                }
            }
        });
        if (changed) {
            // FIXED: persist at most every 15s (was every 1s -> SSD wear + UI jank + corruption window).
            var __now = Date.now();
            window._lastPersist = window._lastPersist || 0;
            window._lastFullRender = window._lastFullRender || 0;
            if (__now - window._lastPersist > 15000) { window._lastPersist = __now; try { saveData(); } catch(e){} }
            if (__now - window._lastFullRender > 5000) {
                window._lastFullRender = __now;
                try {
                    if (document.getElementById('clients-section')?.style.display !== 'none') renderClients();
                    if (document.getElementById('dashboard-section')?.style.display !== 'none') renderActiveClients();
                    renderStationHours();
                } catch(e){}
            }
        }
        if (currentTimeClient !== null) updateTimeDisplay();
        // update reservation badge periodically
        if(changed && Math.floor(now/10000)%6===0) updateReservationBadge();
    }

    function triggerAlarm(clientIdx){
        alarmClientIndex=clientIdx;
        let c=clients[clientIdx];
        document.getElementById('timerEndText').innerHTML=`کلاینت <b>${escapeHtml(c.name)}</b> به زمان تعیین شده (${c.timerDuration} دقیقه) رسید.<br>زمان سپری شده: <b>${formatTime(c.elapsed)}</b><br>هزینه فعلی: <b>${calculateCost(c).toLocaleString()} تومان</b>`;
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
        try{ stopAlarmSound(); }catch(e){}
        try{
            let reps = (parseInt(alarmRepeat)===0) ? 99999 : Math.max(1, parseInt(alarmRepeat)||3);
            if(customAlarmData && alarmSound==='custom'){
                let audio=new Audio(customAlarmData);
                audio.volume=0.8;
                let count=0;
                audio.onended=()=>{ count++; if(count<reps){ try{audio.currentTime=0; audio.play();}catch(e){} } };
                audio.play().catch(()=>{});
                window._customAudio=audio;
                return;
            }
            let AudioCtx=window.AudioContext||window.webkitAudioContext;
            if(!AudioCtx) return;
            let ctx=new AudioCtx();
            window._alarmCtx=ctx;
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
            document.getElementById('resRubika').value='';
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
        let dur=parseInt(document.getElementById('resDuration').value);
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
        let rubika=document.getElementById('resRubika').value.trim();
        let date=document.getElementById('resDate').value;
        let startTime=document.getElementById('resStartTime').value;
        let duration=parseInt(document.getElementById('resDuration').value);
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
            Object.assign(r,{clientId, clientName:client?client.name:'', customerName, phone, email, telegram, rubika, date, startTime, duration, notes});
            showToast('رزرو بروزرسانی شد','success');
        } else {
            reservations.push({
                id: Date.now(),
                clientId,
                clientName: client?client.name:'',
                customerName, phone, email, telegram, rubika, date, startTime, duration, notes,
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
        document.getElementById('resRubika').value=r.rubika||'';
        document.getElementById('resDate').value=r.date;
        document.getElementById('resStartTime').value=r.startTime;
        document.getElementById('resDuration').value=r.duration;
        document.getElementById('resNotes').value=r.notes||'';
        document.getElementById('reservationConflictWarning').style.display='none';
        document.getElementById('reservationModal').classList.add('show');
    }
    function deleteReservation(id){
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
        let todayStr=now.toISOString().slice(0,10);
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
                        <p style="font-size:0.8rem; color:rgba(255,255,255,0.5); margin-top:4px;">📞 ${escapeHtml(r.phone||'-')} | ✈️ ${escapeHtml(r.telegram||'-')} | 🔴 ${escapeHtml(r.rubika||'-')} | 📧 ${escapeHtml(r.email||'-')}</p>
                        ${r.notes? `<p style="font-size:0.8rem; color:#fbbf24; margin-top:6px;">📝 ${escapeHtml(r.notes)}</p>`:''}
                    </div>
                    <span style="padding:6px 12px; border-radius:50px; background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}44; font-size:0.75rem; font-weight:700;">${statusText}</span>
                </div>
                <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
                    <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" onclick="editReservation(${r.id})">✏️ ویرایش</button>
                    <button class="glass-btn glass-btn-success" style="padding:8px 14px; font-size:0.8rem;" onclick="completeReservation(${r.id})">✅ تکمیل</button>
                    <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" onclick="openShareModalForReservation(${r.id})">📤 ارسال</button>
                    <button class="glass-btn glass-btn-danger" style="padding:8px 14px; font-size:0.8rem;" onclick="deleteReservation(${r.id})">🗑️ حذف</button>
                </div>
            </div>`;
        }).join('');
    }
    function filterReservations(f){ renderReservations(f); }

    function renderCustomers(){
        let container=document.getElementById('customersList');
        if(!container) return;
        // collect unique customers from reservations + sessions
        let map=new Map();
        reservations.forEach(r=>{
            let key=r.customerName+'|'+r.phone;
            if(!map.has(key)) map.set(key,{name:r.customerName, phone:r.phone, email:r.email, telegram:r.telegram, rubika:r.rubika, count:0, total:0});
            map.get(key).count++;
        });
        sessions.forEach(s=>{
            // sessions may not have customer info, skip
        });
        // also add from reservations
        let customers=[...map.values()];
        if(customers.length===0){
            container.innerHTML=`<p style="color:rgba(255,255,255,0.5); text-align:center; padding:20px;">هنوز مشتری ثبت نشده - با رزرو کردن مشتری اضافه میشود</p>`;
            return;
        }
        container.innerHTML=`<div style="display:grid; gap:10px;">`+customers.map(c=>`
            <div class="glass" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <h4 style="font-weight:700;">${escapeHtml(c.name)}</h4>
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">📞 ${escapeHtml(c.phone||'-')} | 📧 ${escapeHtml(c.email||'-')} | ✈️ ${c.telegram||'-'} | 🔴 ${c.rubika||'-'}</p>
                    <p style="font-size:0.75rem; color:rgba(255,255,255,0.4);">${c.count} رزرو</p>
                </div>
                <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" onclick="openShareModalForCustomer('${c.name.replace(/'/g,"\\'")}','${escapeHtml(c.phone)}','${escapeHtml(c.email)}')">📤 ارسال گزارش</button>
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
`هزینه: ${cost.toLocaleString()} تومان
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
`هزینه: ${s.cost.toLocaleString()} تومان
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
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">هزینه</td><td style="padding:10px; border:1px solid #e2e8f0; color:#16a34a; font-weight:800;">${cost.toLocaleString()} تومان</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">وضعیت</td><td style="padding:10px; border:1px solid #e2e8f0;">${c.status==='online'?'🟢 فعال':c.status==='paused'?'🟡 متوقف':'🔴 آفلاین'}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">تاریخ</td><td style="padding:10px; border:1px solid #e2e8f0;">${new Date().toLocaleString('fa-IR')}</td></tr>
            </table>
            <p style="color:#64748b; font-size:12px; margin-top:20px;">قیمت پایه: تک نفره ${tariffs.single.toLocaleString()} / دو نفره ${tariffs.double.toLocaleString()} / نفر اضافه ${tariffs.extra.toLocaleString()} تومان بر ساعت</p>
        `;
        setPdfContent(html, `client-${escapeHtml(c.name)}-${Date.now()}.pdf`);
    }
    function preparePdfForSession(s){
        let html=`
            <h2 style="color:#1e293b; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">رسید سشن: ${escapeHtml(s.clientName)}</h2>
            <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">کلاینت</td><td style="padding:10px; border:1px solid #e2e8f0;">${escapeHtml(s.clientName)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">مدت</td><td style="padding:10px; border:1px solid #e2e8f0; direction:ltr; text-align:right;">${formatTime(s.duration)}</td></tr>
                <tr><td style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; font-weight:700;">هزینه</td><td style="padding:10px; border:1px solid #e2e8f0; color:#16a34a; font-weight:800;">${s.cost.toLocaleString()} تومان</td></tr>
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
    async function generatePdfBlob(){
        try{
            let element=document.getElementById('pdfTemplate');
            let opt={ margin:10, filename:currentPdfFilename, image:{type:'jpeg', quality:0.98}, html2canvas:{scale:2, useCORS:true}, jsPDF:{unit:'mm', format:'a4', orientation:'portrait'}};
            // html2pdf returns promise when using .output
            let worker=(window.html2pdf?html2pdf():{set:()=>({from:()=>({save:()=>{showToast('کتابخانه PDF آفلاین در دسترس نیست','error')}})})}).set(opt).from(element);
            let pdfBlob=await worker.outputPdf('blob');
            currentPdfBlob=pdfBlob;
        }catch(e){
            console.log('pdf blob err',e);
            currentPdfBlob=null;
        }
    }
    async function downloadCurrentPdf(){
        try{
            let element=document.getElementById('pdfTemplate');
            let opt={ margin:10, filename:currentPdfFilename||'report.pdf', image:{type:'jpeg', quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'mm', format:'a4', orientation:'portrait'}};
            await (window.html2pdf?html2pdf():{set:()=>({from:()=>({save:()=>{showToast('کتابخانه PDF آفلاین در دسترس نیست','error')}})})}).set(opt).from(element).save();
            showToast('PDF دانلود شد','success');
        }catch(e){
            showToast('خطا در تولید PDF','error');
            console.error(e);
        }
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
        } else if(platform==='rubika'){
            // Rubika has no web share, copy to clipboard
            navigator.clipboard.writeText(text).then(()=>{
                showToast('متن کپی شد - در روبیکا پیست کنید','success');
            }).catch(()=>{
                // fallback prompt
                prompt('متن را کپی کنید و در روبیکا ارسال کنید:', text);
            });
            // try rubika intent if installed
            try{ window.location.href=`rubika://share?text=${encoded}`; }catch(e){}
        } else if(platform==='email'){
            if(!email){ email=prompt('ایمیل گیرنده را وارد کنید:'); if(!email) return; }
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
        if(type==='daily'){ filtered=sessions.filter(s=> new Date(s.date).toDateString()===now.toDateString()); title='گزارش روزانه - '+now.toLocaleDateString('fa-IR');}
        else if(type==='weekly'){ let w=new Date(now-7*24*60*60*1000); filtered=sessions.filter(s=> new Date(s.date)>=w); title='گزارش هفتگی';}
        else { let m=new Date(now-30*24*60*60*1000); filtered=sessions.filter(s=> new Date(s.date)>=m); title='گزارش ماهانه';}
        let total=filtered.reduce((sum,s)=>sum+s.cost,0);
        let html=`<h2 style="color:#1e293b; text-align:center;">${title}</h2>
        <p style="text-align:center; color:#64748b;">تعداد سشن: ${filtered.length} | جمع درآمد: ${total.toLocaleString()} تومان</p>
        <table style="width:100%; border-collapse:collapse; margin-top:16px; font-size:12px;">
        <thead><tr style="background:#4f46e5; color:white;"><th style="padding:8px; border:1px solid #ddd;">کلاینت</th><th style="padding:8px; border:1px solid #ddd;">مدت</th><th style="padding:8px; border:1px solid #ddd;">هزینه</th><th style="padding:8px; border:1px solid #ddd;">تاریخ</th></tr></thead><tbody>
        `+filtered.map(s=>`<tr><td style="padding:6px; border:1px solid #e2e8f0;">${escapeHtml(s.clientName)}</td><td style="padding:6px; border:1px solid #e2e8f0; direction:ltr;">${formatTime(s.duration)}</td><td style="padding:6px; border:1px solid #e2e8f0;">${s.cost.toLocaleString()}</td><td style="padding:6px; border:1px solid #e2e8f0; font-size:10px;">${new Date(s.date).toLocaleString('fa-IR')}</td></tr>`).join('')+`</tbody></table>`;
        setPdfContent(html, `report-${type}-${Date.now()}.pdf`);
        setTimeout(()=>downloadCurrentPdf(),800);
    }

    // Tariff Management
    function loadTariffs() {
        let a=document.getElementById('tariffSingle'); if(a) a.value = tariffs.single;
        let b=document.getElementById('tariffDouble'); if(b) b.value = tariffs.double;
        let c=document.getElementById('tariffExtra'); if(c) c.value = tariffs.extra;
    }

    function updateTariff(type, value) {
        tariffs[type] = parseInt(value) || 0;
        localStorage.setItem('alvand_tariffs', JSON.stringify(tariffs));
        showToast('تعرفه بروز شد','success');
    }

    // Cost Calculation - with time-based tariff and rounding
    function getActiveTariff(){
        let now = new Date();
        let curMin = now.getHours()*60 + now.getMinutes();
        for(let ts of tariffSchedules){
            let s = ts.start.split(':').map(Number); let e = ts.end.split(':').map(Number);
            let sMin = s[0]*60+s[1]; let eMin = e[0]*60+e[1];
            let inRange = false;
            if(sMin <= eMin) inRange = curMin>=sMin && curMin<eMin;
            else inRange = curMin>=sMin || curMin<eMin; // overnight
            if(inRange) return ts;
        }
        return null;
    }
    function getStationType(id){ return (stationTypes||[]).find(t=>t.id===id); }
    function getTariffForClient(client){
        let active = getActiveTariff();
        let tid = client.stationType||null;
        if(tid){
            if(active && active.prices && active.prices[tid]>0) return active.prices[tid];
            let st=getStationType(tid);
            if(st && st.price>0) return st.price;
        }
        if(active){
            if(client.tariff==='single') return active.single;
            else return active.double;
        }
        return client.tariff === 'single' ? tariffs.single : tariffs.double;
    }
    function getExtraRate(){
        let active = getActiveTariff();
        return active ? active.extra : tariffs.extra;
    }
    function calculateCost(client) {
        const hours = (client.elapsed || 0) / 3600;
        let rate = getTariffForClient(client);
        rate += (client.extra || 0) * getExtraRate();
        let cost = Math.round(hours * rate);
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
        if(roundingMode==='none') return amount;
        if(roundingMode==='up') return Math.ceil(amount/1000)*1000;
        if(roundingMode==='down') return Math.floor(amount/1000)*1000;
        if(roundingMode==='nearest') return Math.round(amount/1000)*1000;
        return amount;
    }

    // Stats
    function updateStats() {
        const active = clients.filter(c => c.status === 'online').length;
        const paused = clients.filter(c => c.status === 'paused').length;
        const total = clients.length;

        const todayIncome = sessions.filter(s => {
            const d = new Date(s.date);
            const now = new Date();
            return d.toDateString() === now.toDateString();
        }).reduce((sum, s) => sum + s.cost, 0);

        let a=document.getElementById('statActive'); if(a) a.textContent = active;
        let b=document.getElementById('statPaused'); if(b) b.textContent = paused;
        let c=document.getElementById('statTotal'); if(c) c.textContent = total;
        let d2=document.getElementById('statIncome'); if(d2) d2.textContent = todayIncome.toLocaleString() + ' تومان';

        renderActiveClients();
    }

    function renderActiveClients() {
        const container = document.getElementById('activeClientsList');
        if(!container) return;
        const active = clients.filter(c => c.status === 'online');

        if (active.length === 0) {
            container.innerHTML = '<div class="glass" style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.5);"><p>هیچ کلاینت فعالی وجود ندارد</p></div>';
            return;
        }

        container.innerHTML = active.map(c => {
            let remaining='';
            if(c.timerDuration && c.timerDuration>0){
                let rem=c.timerDuration*60 - (c.elapsed||0);
                if(rem<0) rem=0;
                remaining=`<p style="color:${rem<=300?'#fca5a5':'#fbbf24'}; font-size:0.8rem;">⏳ باقی‌مانده: ${formatTime(rem)}</p>`;
            }
            return `
            <div class="glass" style="padding: 20px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <h4 style="font-weight: 700; margin-bottom: 4px;">${escapeHtml(c.name)}</h4>
                    <span class="tariff-badge ${c.tariff === 'single' ? 'tariff-single' : 'tariff-double'}">${c.tariff === 'single' ? 'تک نفره' : 'دو نفره'}</span>
                    ${remaining}
                </div>
                <div style="text-align: left;">
                    <p style="font-size: 1.4rem; font-weight: 900; font-variant-numeric: tabular-nums; color: ${c.timerDuration && (c.timerDuration*60 - c.elapsed)<=300?'#ef4444':'#22c55e'};">${formatTime(c.elapsed || 0)}</p>
                    <p style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">${calculateCost(c).toLocaleString()} تومان</p>
                </div>
            </div>
        `}).join('');
    }

    // Reports - enhanced with PDF button
    function generateReport(type) {
        let a=document.getElementById('btnDaily'); if(a) a.classList.remove('glass-btn-success');
        let b=document.getElementById('btnWeekly'); if(b) b.classList.remove('glass-btn-success');
        let c=document.getElementById('btnMonthly'); if(c) c.classList.remove('glass-btn-success');
        let btn=document.getElementById('btn' + type.charAt(0).toUpperCase() + type.slice(1));
        if(btn) btn.classList.add('glass-btn-success');

        const now = new Date();
        let filtered = [];
        let title = '';

        if (type === 'daily') {
            filtered = sessions.filter(s => new Date(s.date).toDateString() === now.toDateString());
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
                    <button class="glass-btn glass-btn-success" style="padding:8px 14px; font-size:0.8rem;" onclick="generatePdfForReport('${type}')">📄 PDF</button>
                    <button class="glass-btn" style="padding:8px 14px; font-size:0.8rem;" onclick="openShareModal('${title}', \`${filtered.length} سشن - ${totalCost.toLocaleString()} تومان - ${title}\`, {})">📤 اشتراک</button>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: rgba(255,255,255,0.5);">تعداد نشست‌ها</p>
                    <p style="font-size: 1.8rem; font-weight: 900; color: #818cf8;">${filtered.length}</p>
                </div>
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: rgba(255,255,255,0.5);">درآمد کل</p>
                    <p style="font-size: 1.8rem; font-weight: 900; color: #22c55e;">${totalCost.toLocaleString()} تومان</p>
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
                        <td style="padding: 12px; font-weight: 700; color: #22c55e;">${s.cost.toLocaleString()}</td>
                        <td style="padding: 12px; color: rgba(255,255,255,0.6); font-size: 0.85rem;">${new Date(s.date).toLocaleString('fa-IR')}</td>
                        <td style="padding: 12px; text-align:center;">
                            <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="generatePdfForSession(${origIdx})">PDF</button>
                            <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="openShareModalForSession(${origIdx})">📤</button>
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
        let pdfHtml=`<h2 style="text-align:center; color:#4f46e5;">${reportHtmlTitle}</h2><p style="text-align:center;">${filtered.length} سشن - ${totalCost.toLocaleString()} تومان</p>`;
        // we don't auto set here, generatePdfForReport will do
    }

    // Income
    function updateIncome() {
        const now = new Date();

        const today = sessions.filter(s => new Date(s.date).toDateString() === now.toDateString()).reduce((sum, s) => sum + s.cost, 0);
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const week = sessions.filter(s => new Date(s.date) >= weekAgo).reduce((sum, s) => sum + s.cost, 0);
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const month = sessions.filter(s => new Date(s.date) >= monthAgo).reduce((sum, s) => sum + s.cost, 0);
        const total = sessions.reduce((sum, s) => sum + s.cost, 0);

        let a=document.getElementById('incomeToday'); if(a) a.textContent = today.toLocaleString() + ' تومان';
        let b=document.getElementById('incomeWeek'); if(b) b.textContent = week.toLocaleString() + ' تومان';
        let c=document.getElementById('incomeMonth'); if(c) c.textContent = month.toLocaleString() + ' تومان';
        let d=document.getElementById('incomeTotal'); if(d) d.textContent = total.toLocaleString() + ' تومان';

        // Breakdown
        const byTariff = { single: 0, double: 0, extra: 0 };
        sessions.forEach(s => {
            if (s.tariff === 'single') byTariff.single += s.cost;
            else byTariff.double += s.cost;
            byTariff.extra += (s.extra || 0) * tariffs.extra * (s.duration / 3600);
        });

        let br=document.getElementById('incomeBreakdown');
        if(br) br.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: #60a5fa; margin-bottom: 8px;">تک نفره</p>
                    <p style="font-size: 1.5rem; font-weight: 900;">${Math.round(byTariff.single).toLocaleString()} تومان</p>
                </div>
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: #c084fc; margin-bottom: 8px;">دو نفره</p>
                    <p style="font-size: 1.5rem; font-weight: 900;">${Math.round(byTariff.double).toLocaleString()} تومان</p>
                </div>
                <div class="glass" style="padding: 20px; text-align: center;">
                    <p style="color: #fbbf24; margin-bottom: 8px;">نفرات اضافه</p>
                    <p style="font-size: 1.5rem; font-weight: 900;">${Math.round(byTariff.extra).toLocaleString()} تومان</p>
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
            const income = sessions.filter(s => new Date(s.date).toDateString() === d.toDateString()).reduce((sum, s) => sum + s.cost, 0);
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
        if(!amount) amount = parseInt(document.getElementById('amountInput').value)||0;
        else document.getElementById('amountInput').value = amount;
        if(amount<=0){ showToast('مبلغ وارد کن','error'); return; }
        if(currentTimeClient===null) return;
        let c = clients[currentTimeClient];
        let dur = calculateDurationFromAmountRaw(amount, c.tariff, c.extra, c.stationType);
        document.getElementById('amountResult').style.display='block';
        document.getElementById('amountResultText').textContent = formatTime(dur) + '  ('+Math.round(dur/60)+' دقیقه)';
        window._calcDur = dur;
    }
    document.getElementById('amountInput')?.addEventListener('input', function(){ if(this.value) calculateDurationFromAmount(parseInt(this.value)); });
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
                        <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">خرید: ${s.cost.toLocaleString()} - فروش: ${s.price.toLocaleString()}</p>
                        <p class="profit-badge" style="display:inline-block; margin-top:6px;">سود: ${(s.price-s.cost).toLocaleString()} تومان</p>
                    </div>
                    <span class="${s.stock<10?'stock-low':'stock-ok'}" style="font-size:0.85rem;">موجودی: ${s.stock}</span>
                </div>
                <div style="display:flex; gap:6px; margin-top:12px;">
                    <button class="glass-btn" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="editService(${s.id})">✏️ ویرایش</button>
                    <button class="glass-btn glass-btn-danger" style="flex:1; padding:6px 8px; font-size:0.75rem;" onclick="deleteService(${s.id})">🗑️ حذف</button>
                </div>
            </div>
        `).join('');
        updateBuffetStats();
    }
    function filterServices(f){ serviceFilter=f; renderServices(); }
    function openServiceModal(){
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
        let price=parseInt(document.getElementById('servicePrice').value)||0;
        let cost=parseInt(document.getElementById('serviceCost').value)||0;
        let stock=parseInt(document.getElementById('serviceStock').value)||0;
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
        if(!confirm('حذف شود؟')) return;
        services=services.filter(s=>s.id!==id);
        saveServices(); renderServices(); showToast('حذف شد','success');
    }
    function updateBuffetStats(){
        let today=new Date().toDateString();
        let todaySales=sales.filter(s=> new Date(s.date).toDateString()===today);
        let income=todaySales.reduce((sum,s)=>sum+s.price*s.qty,0);
        let profit=todaySales.reduce((sum,s)=>sum+s.profit,0);
        let low=services.filter(s=>s.stock<10).length;
        let el1=document.getElementById('buffetIncomeToday'); if(el1) el1.textContent=income.toLocaleString()+' تومان';
        let el2=document.getElementById('buffetProfitToday'); if(el2) el2.textContent=profit.toLocaleString()+' تومان';
        let el3=document.getElementById('lowStockCount'); if(el3) el3.textContent=low+' قلم';
        // sales list
        let list=document.getElementById('buffetSalesList');
        if(list){
            if(todaySales.length===0) list.innerHTML='<p style="text-align:center; color:rgba(255,255,255,0.4); padding:20px;">فروشی امروز نداشته‌اید</p>';
            else list.innerHTML=todaySales.slice(-10).reverse().map(s=>`<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.85rem;"><span>${escapeHtml(s.name)} x${s.qty}</span><span style="color:#22c55e;">${(s.price*s.qty).toLocaleString()} تومان</span></div>`).join('');
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
                    <p style="font-size:0.8rem; color:#22c55e;">${s.price.toLocaleString()} تومان</p>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="addServiceToClientQty(${s.id}, -1)">-</button>
                    <span id="svcQty-${s.id}" style="min-width:24px; text-align:center; font-weight:800;">${((clientServiceMap[c.id]||[]).find(x=>x.serviceId===s.id)?.qty||0)}</span>
                    <button class="glass-btn glass-btn-success" style="padding:4px 8px; font-size:0.8rem;" onclick="addServiceToClientQty(${s.id}, 1)">+</button>
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
        document.getElementById('svcTotalForClient').textContent=total.toLocaleString()+' تومان';
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
                    <p style="font-weight:700;">${escapeHtml(e.title)} <span style="font-size:0.7rem; padding:2px 6px; border-radius:50px; background:rgba(255,255,255,0.08);">${e.category}</span></p>
                    <p style="font-size:0.8rem; color:rgba(255,255,255,0.5);">${new Date(e.date).toLocaleDateString('fa-IR')}</p>
                </div>
                <div style="text-align:left;">
                    <p style="font-weight:800; color:#ef4444;">${e.amount.toLocaleString()} تومان</p>
                    <div style="display:flex; gap:6px; margin-top:4px;">
                        <button class="glass-btn" style="padding:4px 8px; font-size:0.7rem;" onclick="editExpense(${e.id})">✏️</button>
                        <button class="glass-btn glass-btn-danger" style="padding:4px 8px; font-size:0.7rem;" onclick="deleteExpense(${e.id})">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    function openExpenseModal(){
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
        let amount=parseInt(document.getElementById('expenseAmount').value)||0;
        let category=document.getElementById('expenseCategory').value;
        let date=document.getElementById('expenseDate').value;
        if(!title||!amount||!date){ showToast('همه فیلدها','error'); return; }
        if(id){
            let e=expenses.find(x=>x.id===parseInt(id));
            Object.assign(e,{title,amount,category,date});
        } else {
            expenses.push({id:Date.now(), title,amount,category,date});
        }
        saveExpenses();
        closeModal('expenseModal');
        renderExpenses(); updateExpenseStats(); updateCashCardStats();
        showToast('هزینه ثبت شد','success');
    }
    function deleteExpense(id){
        if(!confirm('حذف شود؟')) return;
        expenses=expenses.filter(e=>e.id!==id);
        saveExpenses(); renderExpenses(); updateExpenseStats();
        showToast('حذف شد','success');
    }
    function updateExpenseStats(){
        let today=new Date().toDateString();
        let todayExp=expenses.filter(e=> new Date(e.date).toDateString()===today).reduce((s,e)=>s+e.amount,0);
        let month=new Date().getMonth();
        let monthExp=expenses.filter(e=> new Date(e.date).getMonth()===month).reduce((s,e)=>s+e.amount,0);
        let todayIncome=sessions.filter(s=> new Date(s.date).toDateString()===today).reduce((s,x)=>s+(x.cost||0),0);
        let buffetToday=sales.filter(s=> new Date(s.date).toDateString()===today).reduce((s,x)=>s+x.price*x.qty,0);
        todayIncome+=buffetToday;
        let el1=document.getElementById('expenseToday'); if(el1) el1.textContent=todayExp.toLocaleString()+' تومان';
        let el2=document.getElementById('expenseMonth'); if(el2) el2.textContent=monthExp.toLocaleString()+' تومان';
        let el3=document.getElementById('netProfitToday'); if(el3) el3.textContent=(todayIncome - todayExp).toLocaleString()+' تومان';
        if(el3) el3.style.color = (todayIncome - todayExp)>=0 ? '#22c55e':'#ef4444';
    }
    function updateCashCardStats(){
        let today=new Date().toDateString();
        let pays=safeParse(localStorage.getItem('alvand_payments')||'[]');
        let cash=pays.filter(p=> new Date(p.date).toDateString()===today && p.method==='cash').reduce((s,p)=>s+p.amount,0);
        let card=pays.filter(p=> new Date(p.date).toDateString()===today && p.method==='card').reduce((s,p)=>s+p.amount,0);
        let el1=document.getElementById('cashToday'); if(el1) el1.textContent=cash.toLocaleString()+' تومان';
        let el2=document.getElementById('cardToday'); if(el2) el2.textContent=card.toLocaleString()+' تومان';
        let el3=document.getElementById('totalCashCardToday'); if(el3) el3.textContent=(cash+card).toLocaleString()+' تومان';
    }

    // Tariff Schedule
    function renderTariffSchedules(){
        let list=document.getElementById('tariffSchedulesList');
        if(!list) return;
        if(tariffSchedules.length===0) list.innerHTML='<div class="glass" style="padding:20px; text-align:center; color:rgba(255,255,255,0.5);">بازه‌ای ثبت نشده - تعرفه ثابت استفاده میشود</div>';
        else list.innerHTML=tariffSchedules.map(ts=>`
            <div class="glass ${isTariffActive(ts)?'tariff-active':''}" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <h4 style="font-weight:800;">${escapeHtml(ts.name)} <span style="font-size:0.8rem; color:#818cf8;">${ts.start} تا ${ts.end}</span> ${isTariffActive(ts)?'<span style="background:#22c55e; color:white; padding:2px 8px; border-radius:50px; font-size:0.7rem;">فعال الان</span>':''}</h4>
                    <p style="font-size:0.85rem; color:rgba(255,255,255,0.6);">تک:${ts.single.toLocaleString()} دو:${ts.double.toLocaleString()} اضافه:${ts.extra.toLocaleString()}</p>
                    ${(ts.prices && Object.keys(ts.prices).filter(k=>ts.prices[k]>0).length) ? `<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">`+Object.keys(ts.prices).filter(k=>ts.prices[k]>0).map(tid=>{ let st=getStationType(tid); return `<span class="tariff-badge tariff-extra">${st?st.icon+' '+st.name:tid}: ${(ts.prices[tid]||0).toLocaleString()}</span>`; }).join('')+`</div>` : ''}
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="glass-btn" style="padding:6px 10px; font-size:0.75rem;" onclick="editTariffSchedule(${ts.id})">✏️</button>
                    <button class="glass-btn glass-btn-danger" style="padding:6px 10px; font-size:0.75rem;" onclick="deleteTariffSchedule(${ts.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    }
    function isTariffActive(ts){
        let now=new Date(); let cur=now.getHours()*60+now.getMinutes();
        let s=ts.start.split(':').map(Number); let e=ts.end.split(':').map(Number);
        let sMin=s[0]*60+s[1]; let eMin=e[0]*60+e[1];
        if(sMin<=eMin) return cur>=sMin && cur<eMin;
        else return cur>=sMin || cur<eMin;
    }
    function openTariffScheduleModal(){
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
        let single=parseInt(document.getElementById('tsSingle').value)||0;
        let double=parseInt(document.getElementById('tsDouble').value)||0;
        let extra=parseInt(document.getElementById('tsExtra').value)||0;
        let prices={};
        document.querySelectorAll('#tsTypePrices input').forEach(inp=>{ prices[inp.dataset.type]=parseInt(inp.value)||0; });
        if(!start||!end){ showToast('ساعت وارد کن','error'); return; }
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
        if(!confirm('حذف شود؟')) return;
        tariffSchedules=tariffSchedules.filter(x=>x.id!==id);
        saveTariffSchedules(); renderTariffSchedules(); updateActiveTariffDisplay();
    }
    function clearTariffSchedules(){
        if(!confirm('همه بازه‌ها حذف شوند؟')) return;
        tariffSchedules=[]; saveTariffSchedules(); renderTariffSchedules();
    }
    function updateActiveTariffDisplay(){
        let now=new Date();
        let el1=document.getElementById('currentHourDisplay'); if(el1) el1.textContent=now.toLocaleTimeString('fa-IR');
        let active=getActiveTariff();
        let el2=document.getElementById('activeTariffDisplay');
        if(!el2) return;
        if(active) el2.textContent=active.name+' - تک:'+active.single.toLocaleString()+' دو:'+active.double.toLocaleString();
        else el2.textContent='تعرفه عادی - تک:'+tariffs.single.toLocaleString()+' دو:'+tariffs.double.toLocaleString();
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
    function createBackup(){
        let data={
            clients, tariffs, sessions, reservations, services, expenses, tariffSchedules, sales, clientServiceMap, stationTypes,
            payments: safeParse(localStorage.getItem('alvand_payments')||'[]'),
            roundingMode, date: new Date().toISOString()
        };
        localStorage.setItem('alvand_backup', JSON.stringify(data));
        localStorage.setItem('alvand_lastBackup', Date.now().toString());
        updateBackupDisplay();
        showToast('بکاپ ذخیره شد','success');
    }
    function downloadBackupFile(){
        let data=localStorage.getItem('alvand_backup');
        if(!data){ createBackup(); data=localStorage.getItem('alvand_backup'); }
        let blob=new Blob([data], {type:'application/json'});
        let url=URL.createObjectURL(blob);
        let a=document.createElement('a'); a.href=url; a.download='gamenet-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
        URL.revokeObjectURL(url);
        showToast('فایل بکاپ دانلود شد','success');
    }
    function restoreBackup(input){
        let file=input.files[0];
        if(!file) return;
        let reader=new FileReader();
        reader.onload=function(e){
            try{
                let data=safeParse(e.target.result);
                if(data.clients) localStorage.setItem('alvand_clients', JSON.stringify(data.clients));
                if(data.tariffs) localStorage.setItem('alvand_tariffs', JSON.stringify(data.tariffs));
                if(data.sessions) localStorage.setItem('alvand_sessions', JSON.stringify(data.sessions));
                if(data.reservations) localStorage.setItem('alvand_reservations', JSON.stringify(data.reservations));
                if(data.services) localStorage.setItem('alvand_services', JSON.stringify(data.services));
                if(data.expenses) localStorage.setItem('alvand_expenses', JSON.stringify(data.expenses));
                if(data.tariffSchedules) localStorage.setItem('alvand_tariffSchedules', JSON.stringify(data.tariffSchedules));
                if(data.sales) localStorage.setItem('alvand_sales', JSON.stringify(data.sales));
                if(data.clientServiceMap) localStorage.setItem('alvand_clientServiceMap', JSON.stringify(data.clientServiceMap));
                if(data.stationTypes && data.stationTypes.length){ stationTypes=data.stationTypes; localStorage.setItem('alvand_stationTypes', JSON.stringify(stationTypes)); }
                if(data.payments) localStorage.setItem('alvand_payments', JSON.stringify(data.payments));
                if(data.roundingMode) localStorage.setItem('alvand_rounding', data.roundingMode);
                showToast('بازگردانی شد - صفحه رفرش میشود','success');
                setTimeout(()=> location.reload(), 1500);
            }catch(err){ showToast('فایل خراب','error'); }
        };
        reader.readAsText(file);
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
            let todayStr=new Date().toDateString();
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

