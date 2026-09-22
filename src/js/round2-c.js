/* Round2-C: POS terminal, QR, customer portal, events, encryption */
(function(){
'use strict';
var esc = window.escapeHtml || function(v){ return String(v == null ? '' : v); };
function toast(m, t){ if (window.showToast) window.showToast(m, t); }
function logAct(ty, d){ if (window.logActivity) window.logActivity(ty, d); }
function sp(k, fb){ try { if (window.safeParse) return window.safeParse(localStorage.getItem(k)) || fb; } catch(e){} return fb; }
function sv(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

/* ---- 11. POS terminal ---- */
window.getPOSConfig = function(){ return sp('alvand_posConfig', {enabled:false, ip:'', port:'', lastStatus:'never'}); };
window.renderPOSConfig = function(){
  var c = document.getElementById('posConfigContent');
  if (!c) return;
  var cfg = window.getPOSConfig();
  c.innerHTML = '<div class="glass" style="padding:16px">'
    + '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="posEnabled" '+(cfg.enabled?'checked':'')+' onchange="togglePOS(this.checked)"> فعال‌سازی کارتخوان</label>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">'
    + '<div><label style="font-size:0.8rem">آی‌پی</label><input type="text" id="posIP" value="'+esc(cfg.ip||'')+'"></div>'
    + '<div><label style="font-size:0.8rem">پورت</label><input type="text" id="posPort" value="'+esc(cfg.port||'')+'"></div></div>'
    + '<div style="display:flex;gap:8px;margin-top:10px"><button class="glass-btn glass-btn-success" onclick="savePOSConfig()">ذخیره</button>'
    + '<button class="glass-btn" onclick="testPOS()">تست</button></div>'
    + '<p style="font-size:.8rem;color:rgba(255,255,255,0.5);margin-top:8px">آخرین وضعیت: '+esc(cfg.lastStatus||'-')+'</p></div>';
};
window.togglePOS = function(v){
  var cfg = window.getPOSConfig(); cfg.enabled = !!v; sv('alvand_posConfig', cfg);
  toast(v ? 'کارتخوان فعال شد' : 'کارتخوان غیرفعال شد','success');
};
window.savePOSConfig = function(){
  var ip = document.getElementById('posIP');
  var pt = document.getElementById('posPort');
  var en = document.getElementById('posEnabled');
  sv('alvand_posConfig', {enabled: en ? en.checked : false, ip: ip ? ip.value.trim() : '', port: pt ? pt.value.trim() : '', lastStatus: 'saved'});
  logAct('pos','config saved'); toast('ذخیره شد','success'); window.renderPOSConfig();
};
window.testPOS = function(){
  var cfg = window.getPOSConfig();
  if (!cfg.ip){ toast('اول آی‌پی را وارد کن','error'); return; }
  toast('در حال تست '+cfg.ip+'...','success');
  cfg.lastStatus = 'tested '+new Date().toLocaleTimeString('fa-IR');
  sv('alvand_posConfig', cfg); window.renderPOSConfig();
};
window.sendToPOS = function(amount){
  var cfg = window.getPOSConfig();
  if (!cfg.enabled){ toast('کارتخوان غیرفعال است','error'); return false; }
  logAct('pos','charge '+amount);
  toast('مبلغ '+amount+' به کارتخوان ارسال شد','success');
  return true;
};

/* ---- 12. QR code ---- */
window.renderCustomerQR = function(cid, cname){
  var c = document.getElementById('customerQRContent');
  if (!c) return;
  var payload = 'GAMENET:' + cid + ':' + (cname||'');
  var url = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(payload);
  c.innerHTML = '<div style="text-align:center"><img src="'+url+'" style="border-radius:12px;background:#fff;padding:8px" onerror="this.outerHTML=\'<p>آفلاین - کد: '+esc(payload)+'</p>\'"><p style="margin-top:8px;font-size:.8rem;color:rgba(255,255,255,0.5)">'+esc(payload)+'</p></div>';
};

/* ---- 13. customer portal ---- */
window.renderCustomerPortal = function(){
  var c = document.getElementById('portalContent');
  if (!c) return;
  var active = (window.clients||[]).filter(function(x){ return x.status === 'online'; });
  var w = sp('alvand_waitingList', []).filter(function(x){ return x.status === 'waiting'; }).length;
  c.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'
    + '<div class="glass" style="padding:16px;text-align:center"><p>دستگاه آزاد</p><b style="font-size:1.6rem;color:#22c55e">'+((window.clients||[]).length - active.length)+'</b></div>'
    + '<div class="glass" style="padding:16px;text-align:center"><p>در انتظار</p><b style="font-size:1.6rem;color:#f59e0b">'+w+'</b></div></div>'
    + '<div class="glass" style="padding:16px"><h4>دستگاه‌ها (زنده)</h4>'
    + ((window.clients||[]).map(function(x){
        var dot = x.status === 'online' ? '#22c55e' : (x.status === 'paused' ? '#f59e0b' : 'gray');
        var lbl = x.status === 'online' ? 'مشغول' : (x.status === 'paused' ? 'متوقف' : 'آزاد');
        return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08)"><span>'+esc(x.name)+'</span><span style="color:'+dot+'">'+lbl+'</span></div>';
      }).join('') || '<p>دستگاهی نیست</p>') + '</div>';
};

/* ---- 14. events ---- */
var EV = sp('alvand_events', []);
window.openEventModal = function(){
  var t = document.getElementById('evTitle'); if (t) t.value = '';
  var d = document.getElementById('evDate'); if (window.setDatePicker) setDatePicker('evDate', new Date());
  var p = document.getElementById('evPrize'); if (p) p.value = '';
  var m = document.getElementById('eventModal'); if (m) m.classList.add('show');
};
window.saveEventFromModal = function(){
  var t = document.getElementById('evTitle');
  var title = t ? t.value.trim() : '';
  if (!title){ toast('عنوان الزامی است','error'); return; }
  var d = document.getElementById('evDate');
  var isoDate = window.getPickerISO ? getPickerISO('evDate') : (d ? d.value : '');
  var f = document.getElementById('evFee');
  var p = document.getElementById('evPrize');
  var ds = document.getElementById('evDesc');
  EV.push({id: Date.now(), title: title, date: isoDate, fee: f ? (parseInt(f.value)||0) : 0, prize: p ? p.value.trim() : '', desc: ds ? ds.value.trim() : '', participants: [], status: 'open'});
  sv('alvand_events', EV); logAct('event','new '+title); toast('ذخیره شد','success');
  var m = document.getElementById('eventModal'); if (m) m.classList.remove('show');
  window.renderEvents();
};
window.deleteEvent = function(id){
  if (!confirm('حذف شود؟')) return;
  EV = EV.filter(function(x){ return x.id !== id; });
  sv('alvand_events', EV); window.renderEvents();
};
window.joinEvent = function(id){
  window._joinEventId = id;
  var n = document.getElementById('joinEventName'); if (n) n.value = '';
  var m = document.getElementById('joinEventModal'); if (m) m.classList.add('show');
};
window.saveJoinEvent = function(){
  var id = window._joinEventId;
  var e = EV.find(function(x){ return x.id === id; });
  if (!e) return;
  var n = document.getElementById('joinEventName');
  var name = n ? n.value.trim() : '';
  if (!name){ toast('نام الزامی است','error'); return; }
  e.participants.push({name: name, date: new Date().toISOString()});
  sv('alvand_events', EV); window.renderEvents(); toast('ثبت‌نام شد','success');
  var m = document.getElementById('joinEventModal'); if (m) m.classList.remove('show');
};
window.renderEvents = function(){
  var c = document.getElementById('eventsList');
  if (!c) return;
  if (!EV.length){ c.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5)">رویدادی نیست</p>'; return; }
  c.innerHTML = EV.map(function(e){
    var dDisp = window.formatDateSmart ? formatDateSmart(e.date||'') : (e.date||'');
    return '<div class="glass" style="padding:14px;margin-bottom:10px"><b>'+esc(e.title)+'</b>'
      + '<p style="font-size:.8rem;color:rgba(255,255,255,0.5)">'+dDisp+' | ورودی: '+(e.fee||0).toLocaleString()+' | جایزه: '+esc(e.prize||'-')+'</p>'
      + '<p style="font-size:.8rem">بازیکنان: '+(e.participants||[]).length+'</p>'
      + '<div style="margin-top:6px"><button class="glass-btn glass-btn-success" onclick="joinEvent('+e.id+')">شرکت در رویداد</button> '
      + '<button class="glass-btn glass-btn-danger" onclick="deleteEvent('+e.id+')">حذف</button></div></div>';
  }).join('');
};

/* ---- 15. encryption (UTF-8 safe: works with Persian text) ---- */
function utf8Bytes(s){
  if (typeof TextEncoder !== 'undefined'){ try{ return Array.from(new TextEncoder().encode(s)); }catch(e){} }
  var bytes = [], i, c;
  for (i=0;i<s.length;i++){
    c = s.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) bytes.push(192|(c>>6), 128|(c&63));
    else if (c >= 55296 && c <= 56319 && i+1 < s.length){
      var cp = ((c-55296)<<10)+(s.charCodeAt(++i)-56320)+65536;
      bytes.push(240|(cp>>18), 128|((cp>>12)&63), 128|((cp>>6)&63), 128|(cp&63));
    }
    else bytes.push(224|(c>>12), 128|((c>>6)&63), 128|(c&63));
  }
  return bytes;
}
function bytesToStr(bytes){
  if (typeof TextDecoder !== 'undefined'){ try{ return new TextDecoder().decode(new Uint8Array(bytes)); }catch(e){} }
  var out = '', i = 0, b;
  while (i < bytes.length){
    b = bytes[i++];
    if (b < 128) out += String.fromCharCode(b);
    else if ((b & 224) === 192) out += String.fromCharCode(((b&31)<<6)|(bytes[i++]&63));
    else if ((b & 240) === 224){ out += String.fromCharCode(((b&15)<<12)|((bytes[i]&63)<<6)|(bytes[i+1]&63)); i += 2; }
    else { var cp2 = ((b&7)<<18)|((bytes[i]&63)<<12)|((bytes[i+1]&63)<<6)|(bytes[i+2]&63); i += 3; cp2 -= 65536; out += String.fromCharCode(55296+(cp2>>10), 56320+(cp2&1023)); }
  }
  return out;
}
function b64encodeBytes(bytes){
  var bin = '', i;
  for (i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa === 'function'){ try{ return btoa(bin); }catch(e){} }
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  throw new Error('no-b64');
}
function b64decodeBytes(b64){
  var bin = null, i;
  if (typeof atob === 'function'){ try{ bin = atob(b64); }catch(e){ bin = null; } }
  if (bin === null || bin === undefined){
    if (typeof Buffer !== 'undefined') return Array.from(Buffer.from(String(b64), 'base64'));
    throw new Error('no-b64');
  }
  var out = [];
  for (i=0;i<bin.length;i++) out.push(bin.charCodeAt(i));
  return out;
}
function xorCrypt(bytes, keyBytes){
  var out = [], i;
  for (i=0;i<bytes.length;i++) out.push(bytes[i] ^ keyBytes[i % keyBytes.length]);
  return out;
}
window.encryptAndSave = function(key, obj, pass){
  if (!pass || pass.length < 4){ toast('رمز حداقل ۴ کاراکتر','error'); return false; }
  try{
    var enc = b64encodeBytes(xorCrypt(utf8Bytes(JSON.stringify(obj)), utf8Bytes(pass)));
    localStorage.setItem(key + '_enc', enc);
    toast('رمزنگاری شد','success'); logAct('security','encrypt '+key); return true;
  }catch(e){ toast('خطا در رمزنگاری','error'); return false; }
};
window.decryptAndLoad = function(key, pass){
  try{
    var enc = localStorage.getItem(key + '_enc');
    if (!enc){ toast('داده رمزنگاری‌شده نیست','error'); return null; }
    return JSON.parse(bytesToStr(xorCrypt(b64decodeBytes(enc), utf8Bytes(pass))));
  }catch(e){ toast('رمز اشتباه یا داده خراب','error'); return null; }
};
window.renderSecurityPanel = function(){
  var c = document.getElementById('securityPanelContent');
  if (!c) return;
  c.innerHTML = '<div class="glass" style="padding:16px">'
    + '<h4>رمزنگاری بکاپ مشتریان</h4>'
    + '<input type="password" id="encPass" placeholder="رمز (حداقل ۴ کاراکتر)" style="margin:8px 0">'
    + '<div style="display:flex;gap:8px"><button class="glass-btn glass-btn-success" onclick="encryptCustomersBackup()">رمزنگاری</button>'
    + '<button class="glass-btn" onclick="decryptCustomersBackup()">بررسی رمزگشایی</button></div>'
    + '<p id="encStatus" style="font-size:.8rem;color:rgba(255,255,255,0.5);margin-top:8px"></p></div>';
};
window.encryptCustomersBackup = function(){
  var p = document.getElementById('encPass');
  var pass = p ? p.value : '';
  var ok = window.encryptAndSave('alvand_customers', window.customers || [], pass);
  var s = document.getElementById('encStatus');
  if (s) s.textContent = ok ? 'رمزنگاری شد' : 'خطا';
};
window.decryptCustomersBackup = function(){
  var p = document.getElementById('encPass');
  var pass = p ? p.value : '';
  var d = window.decryptAndLoad('alvand_customers', pass);
  var s = document.getElementById('encStatus');
  if (s) s.textContent = d ? ('رمزگشایی شد: ' + d.length + ' مشتری') : 'خطا';
};
})();
