/* UI Zoom: Ctrl + mouse wheel or Ctrl + Plus/Minus/0. Persisted in localStorage. */
(function(){
'use strict';

var MIN_ZOOM = 60, MAX_ZOOM = 160, STEP = 5;
var KEY = 'alvand_uiZoom';

function getZoom(){
  try{
    var v = parseInt(localStorage.getItem(KEY), 10);
    if (isNaN(v)) return 100;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v));
  }catch(e){ return 100; }
}
function applyZoom(v){
  v = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(v)));
  try{ localStorage.setItem(KEY, String(v)); }catch(e){}
  try{
    if (document.body) document.body.style.zoom = v + '%';
    document.documentElement.style.setProperty('--ui-zoom', (v/100).toString());
  }catch(e){}
  return v;
}
window.getZoom = getZoom;
window.applyZoom = applyZoom;
window.zoomStep = STEP;

var lastToastAt = 0;
function toastZoom(v){
  var now = Date.now();
  if (now - lastToastAt < 800) return;
  lastToastAt = now;
  if (window.showToast) window.showToast('بزرگ‌نمایی: ' + v + '٪', 'success');
}
function zoomBy(d){
  var v = applyZoom(getZoom() + d);
  toastZoom(v);
}
function zoomReset(){
  var v = applyZoom(100);
  toastZoom(v);
}
window.zoomBy = zoomBy;
window.zoomReset = zoomReset;

/* Ctrl + wheel */
window.addEventListener('wheel', function(e){
  if (!e.ctrlKey) return;
  try{ e.preventDefault(); }catch(err){}
  zoomBy(e.deltaY < 0 ? STEP : -STEP);
}, {passive:false});

/* Ctrl + Plus / Minus / 0 */
window.addEventListener('keydown', function(e){
  if (!e.ctrlKey) return;
  var k = e.key;
  if (k === '+' || k === '=' || k === 'Add'){
    try{ e.preventDefault(); }catch(err){}
    zoomBy(STEP);
  } else if (k === '-' || k === 'Subtract' || k === 'ـ'){
    try{ e.preventDefault(); }catch(err){}
    zoomBy(-STEP);
  } else if (k === '0'){
    try{ e.preventDefault(); }catch(err){}
    zoomReset();
  }
});

/* apply saved zoom as early as possible */
try{ applyZoom(getZoom()); }catch(e){}
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){ try{ applyZoom(getZoom()); }catch(e){} });
}
})();
