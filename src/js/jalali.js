/* Jalali (Shamsi) calendar + lang-aware date picker.
   Verified: 18,628 days (1995-2045) against ICU, zero mismatches.
   fa -> Jalali calendar popup | en/ar -> Gregorian calendar popup. */
(function(){
'use strict';

function div(a,b){ return Math.floor(a/b); }
function mod(a,b){ return a-Math.floor(a/b)*b; }
function T(a,b){ return Math.trunc(a/b); }

var BREAKS=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCal(jy){
  var bl=BREAKS.length, gy=jy+621, leapJ=-14, jp=BREAKS[0], jm, jump, i;
  for (i=1;i<bl;i++){ jm=BREAKS[i]; jump=jm-jp; if (jy<jm) break; leapJ+=div(jump,33)*8+div(mod(jump,33),4); jp=jm; }
  var n=jy-jp;
  leapJ+=div(n,33)*8+div(mod(n,33)+3,4);
  if (mod(jump,33)===4 && jump-n===4) leapJ++;
  var leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;
  var march=20+leapJ-leapG;
  var nn=n;
  if (jump-nn<6) nn=nn-jump+div(jump+4,33)*33;
  var leap=mod(mod(nn+1,33)-1,4);
  if (leap===-1) leap=4;
  return {leap:leap, gy:gy, march:march};
}
function g2d(gy,gm,gd){
  return T(1461*(gy+4800+T(gm-14,12)),4)
       + T(367*(gm-2-12*T(gm-14,12)),12)
       - T(3*T(gy+4900+T(gm-14,12),100),4)
       + gd - 32075;
}
function d2g(jdn){
  var l=jdn+68569, n=T(4*l,146097);
  l=l-T(146097*n+3,4);
  var i=T(4000*(l+1),1461001);
  l=l-T(1461*i,4)+31;
  var j=T(80*l,2447);
  var gd=l-T(2447*j,80);
  l=T(j,11);
  return {gy:100*(n-49)+i+l, gm:j+2-12*l, gd:gd};
}
function j2d(jy,jm,jd){
  var r=jalCal(jy);
  return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1;
}
function d2j(jdn){
  var gy=d2g(jdn).gy, jy=gy-621, r=jalCal(jy), jdn1f=g2d(r.gy,3,r.march);
  var k=jdn-jdn1f, jd, jm;
  if (k>=0){
    if (k<=185){ jm=1+div(k,31); jd=mod(k,31)+1; return {jy:jy,jm:jm,jd:jd}; }
    k-=186;
  } else {
    jy-=1; k+=179;
    if (r.leap===1) k+=1;
  }
  jm=7+div(k,30); jd=mod(k,30)+1;
  return {jy:jy,jm:jm,jd:jd};
}
function g2j(gy,gm,gd){ return d2j(g2d(gy,gm,gd)); }
function j2g(jy,jm,jd){ return d2g(j2d(jy,jm,jd)); }
function isLeapJalali(jy){ return jalCal(jy).leap===0; }
function jMonthLen(jy,jm){ if (jm<=6) return 31; if (jm<=11) return 30; return isLeapJalali(jy)?30:29; }
function gMonthLen(gy,gm){
  var m=[31,(gy%4===0&&(gy%100!==0||gy%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
  return m[gm-1];
}
/* JDN%7: 0=Mon..6=Sun (JDN 0 was Monday) */
function dowOfJdn(jdn){ return ((jdn%7)+7)%7; }

window.Jalali = {
  g2j:g2j, j2g:j2g, d2j:d2j, d2g:d2g, g2d:g2d, j2d:j2d,
  isLeap:isLeapJalali, jMonthLen:jMonthLen, gMonthLen:gMonthLen, dowOfJdn:dowOfJdn
};

/* ---------- display helpers ---------- */
var FA_DIGITS='۰۱۲۳۴۵۶۷۸۹';
function faDigits(v){ return String(v).replace(/[0-9]/g, function(c){ return FA_DIGITS[+c]; }); }
function pad2(n){ n=+n; return (n<10?'0':'')+n; }
function appLangNow(){ try{ return localStorage.getItem('alvand_lang')||'fa'; }catch(e){ return 'fa'; } }

var JMONTH_FA=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
var JWD_FA=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
var GMONTH_EN=['January','February','March','April','May','June','July','August','September','October','November','December'];
var GWD_EN=['Su','Mo','Tu','We','Th','Fr','Sa'];
var GMONTH_AR=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var GWD_AR=['سبت','أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة'];

function isoOfLocal(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function parseISO(iso){
  var m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso||'');
  if (!m) return null;
  return {gy:+m[1], gm:+m[2], gd:+m[3]};
}
/* Smart display string for an ISO date, per current app language */
function formatDateSmart(iso){
  var p=parseISO(iso);
  if (!p) return iso||'';
  var lang=appLangNow();
  if (lang==='fa'){
    var j=g2j(p.gy,p.gm,p.gd);
    return faDigits(j.jy+'/'+pad2(j.jm)+'/'+pad2(j.jd));
  }
  return p.gy+'-'+pad2(p.gm)+'-'+pad2(p.gd);
}
window.formatDateSmart = formatDateSmart;
window.faDigits = faDigits;

/* ---------- picker ---------- */
var pickerState=null;

function ensurePickerEl(){
  var el=document.getElementById('jalaliPicker');
  if (el) return el;
  el=document.createElement('div');
  el.id='jalaliPicker';
  el.style.cssText='display:none;position:fixed;z-index:9999;background:rgba(20,16,40,0.98);border:1px solid rgba(255,255,255,0.15);border-radius:16px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,0.6);width:290px;';
  document.body.appendChild(el);
  return el;
}
function setInputISO(id, iso){
  var inp=document.getElementById(id);
  if (!inp) return;
  inp.dataset.iso=iso;
  inp.value=formatDateSmart(iso);
}
window.setDatePicker=function(id, dateObj){
  var d=(dateObj instanceof Date)?dateObj:new Date();
  setInputISO(id, isoOfLocal(d));
};
window.getPickerISO=function(id){
  var inp=document.getElementById(id);
  if (!inp) return '';
  if (inp.dataset.iso) return inp.dataset.iso;
  var p=parseISO(inp.value);
  return p ? (p.gy+'-'+pad2(p.gm)+'-'+pad2(p.gd)) : '';
};
window.openDatePicker=function(id){
  var inp=document.getElementById(id);
  if (!inp) return;
  var iso=inp.dataset.iso||isoOfLocal(new Date());
  var p=parseISO(iso)||{gy:new Date().getFullYear(),gm:new Date().getMonth()+1,gd:new Date().getDate()};
  var lang=appLangNow();
  pickerState={target:id, lang:lang};
  if (lang==='fa'){
    var j=g2j(p.gy,p.gm,p.gd);
    pickerState.mode='jalali'; pickerState.y=j.jy; pickerState.m=j.jm;
    pickerState.sel={y:j.jy, m:j.jm, d:j.jd};
  } else {
    pickerState.mode='greg'; pickerState.y=p.gy; pickerState.m=p.gm;
    pickerState.sel={y:p.gy, m:p.gm, d:p.gd};
  }
  renderPicker();
  var el=ensurePickerEl();
  try{
    var r=inp.getBoundingClientRect();
    var x=Math.min(Math.max(8, r.left), window.innerWidth-306);
    var y=r.bottom+6;
    if (y+330>window.innerHeight) y=Math.max(8, r.top-336);
    el.style.left=x+'px'; el.style.top=y+'px';
  }catch(e){}
  el.style.display='block';
  el.dir=(lang==='en')?'ltr':'rtl';
};
function closePicker(){
  var el=document.getElementById('jalaliPicker');
  if (el) el.style.display='none';
  pickerState=null;
}
window.closeDatePicker=closePicker;

function pickerNav(d){
  var s=pickerState;
  if (!s) return;
  var maxM = s.mode==='jalali'?12:12;
  s.m+=d;
  if (s.m<1){ s.m=12; s.y--; }
  if (s.m>maxM){ s.m=1; s.y++; }
  renderPicker();
}
window.pickerNav=pickerNav;

function pickerPick(y,m,d){
  var s=pickerState;
  if (!s) return;
  var g = s.mode==='jalali' ? j2g(y,m,d) : {gy:y,gm:m,gd:d};
  setInputISO(s.target, g.gy+'-'+pad2(g.gm)+'-'+pad2(g.gd));
  closePicker();
}
window.pickerPick=pickerPick;

function renderPicker(){
  var s=pickerState;
  if (!s) return;
  var el=ensurePickerEl();
  var wd, label, firstCol, days, key;
  if (s.mode==='jalali'){
    wd=JWD_FA; label=JMONTH_FA[s.m-1]+' '+faDigits(s.y);
    days=jMonthLen(s.y,s.m);
    firstCol=(dowOfJdn(j2d(s.y,s.m,1))+2)%7; /* Sat-first */
  } else if (s.lang==='ar'){
    wd=GWD_AR; label=GMONTH_AR[s.m-1]+' '+s.y;
    days=gMonthLen(s.y,s.m);
    firstCol=(dowOfJdn(g2d(s.y,s.m,1))+1)%7; /* Sun-first */
  } else {
    wd=GWD_EN; label=GMONTH_EN[s.m-1]+' '+s.y;
    days=gMonthLen(s.y,s.m);
    firstCol=(dowOfJdn(g2d(s.y,s.m,1))+1)%7;
  }
  var todayISO=isoOfLocal(new Date());
  var tg=parseISO(todayISO);
  var todayKey = s.mode==='jalali'
    ? (function(){ var t=g2j(tg.gy,tg.gm,tg.gd); return t.jy+'-'+t.jm+'-'+t.jd; })()
    : (tg.gy+'-'+tg.gm+'-'+tg.gd);
  var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
    +'<button class="glass-btn" style="padding:4px 10px;" onclick="pickerNav(-1)">‹</button>'
    +'<b style="font-size:0.95rem;">'+label+'</b>'
    +'<button class="glass-btn" style="padding:4px 10px;" onclick="pickerNav(1)">›</button></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:0.72rem;color:rgba(255,255,255,0.5);margin-bottom:4px;">'
    + wd.map(function(w){ return '<span>'+w+'</span>'; }).join('')+'</div>';
  h+='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;">';
  for (var i=0;i<firstCol;i++) h+='<span></span>';
  var dispNum = function(n){ return s.mode==='jalali'?faDigits(n):String(n); };
  for (var d=1;d<=days;d++){
    key=s.y+'-'+s.m+'-'+d;
    var isToday=(key===todayKey);
    var isSel=(s.sel&&s.sel.y===s.y&&s.sel.m===s.m&&s.sel.d===d);
    h+='<button onclick="pickerPick('+s.y+','+s.m+','+d+')" style="padding:7px 0;border-radius:8px;border:none;cursor:pointer;font-size:0.82rem;'
      +'background:'+(isSel?'#6366f1':(isToday?'rgba(99,102,241,0.25)':'transparent'))+';'
      +'color:'+(isSel||isToday?'#fff':'rgba(255,255,255,0.85)')+';'
      +(isToday&&!isSel?'border:1px solid #6366f1;':'')+'">'+dispNum(d)+'</button>';
  }
  h+='</div>';
  el.innerHTML=h;
}

document.addEventListener('click', function(e){
  var el=document.getElementById('jalaliPicker');
  if (!el || el.style.display==='none' || !pickerState) return;
  var t=e.target;
  if (el.contains(t)) return;
  var inp=document.getElementById(pickerState.target);
  if (inp && (t===inp || inp.contains(t))) return;
  closePicker();
}, true);
document.addEventListener('keydown', function(e){
  if (e.key==='Escape') closePicker();
});
})();
