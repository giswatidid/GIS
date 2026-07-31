(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tech=/^(objectid|globalid|fid|shape(_length|_area)?|shape\.length|shape\.area|created_user|last_edited_user)$/i;
let inspectorBusy=false, layerBusy=false, menu=null, refreshRaf=0;
function api(){return window.EditPolygonGIS}
function dataTools(){return window.EditPolygonGISDataTools}
function fieldEntries(details){
  const entries=Object.entries(details?.properties||{});
  const priority=['name','Name','title','Title','label','Label','requesttype','requestType','type','Type','status','Status','severity','description','Description'];
  return entries.sort(([a],[b])=>{
    const ai=priority.indexOf(a),bi=priority.indexOf(b);
    if(ai>=0||bi>=0)return (ai<0?999:ai)-(bi<0?999:bi);
    if(tech.test(a)!==tech.test(b))return tech.test(a)?1:-1;
    return a.localeCompare(b);
  });
}
function formatValue(v){if(v==null||v==='')return '<span class="gis-ui-empty">—</span>';if(typeof v==='object')return esc(JSON.stringify(v));return esc(v)}
function inspectorPanel(){return document.getElementById('selectedPanel')}
function injectInspector(){
  if(inspectorBusy)return;const panel=inspectorPanel();if(!panel||panel.querySelector('.gis-inspector-attributes'))return;
  const d=api()?.getSelectedFeature?.();if(!d)return;
  inspectorBusy=true;
  try{
    const section=document.createElement('section');section.className='gis-inspector-attributes';
    const fields=fieldEntries(d),summary=fields.filter(([k,v])=>!tech.test(k)&&v!=null&&v!=='').slice(0,8);
    const nativeCoord=Array.isArray(d.coordinateNative)?d.coordinateNative.slice(0,2).map(v=>Number(v).toLocaleString(undefined,{maximumFractionDigits:4})).join(', '):'';const wgsCoord=Array.isArray(d.coordinateWgs84)?d.coordinateWgs84.slice(0,2).map(v=>Number(v).toFixed(6)).join(', '):'';section.innerHTML=`<div class="gis-inspector-head"><div><strong>Attributes</strong><span>${esc(d.layerName)} · ${esc(d.crs)}</span></div><button type="button" class="gis-inspector-toggle">${fields.length>8?'Show all':'Collapse'}</button></div>${nativeCoord?`<div class="gis-inspector-crs"><span>${esc(d.crs)} coordinate</span><strong>${esc(nativeCoord)}</strong>${d.crs!=='EPSG:4326'&&wgsCoord?`<small>Map: ${esc(wgsCoord)} · EPSG:4326</small>`:''}</div>`:''}<div class="gis-inspector-summary">${summary.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${formatValue(v)}</strong></div>`).join('')||'<p>No populated attributes.</p>'}</div><div class="gis-inspector-all" hidden>${fields.map(([k,v])=>`<div class="${tech.test(k)?'technical':''}"><span>${esc(k)}</span><strong>${formatValue(v)}</strong></div>`).join('')}</div><div class="gis-inspector-actions"><button type="button" data-gis-inspector="edit">Edit attributes</button><button type="button" data-gis-inspector="table">Open table</button><button type="button" data-gis-inspector="zoom">Zoom</button></div>`;
    panel.prepend(section);
    section.querySelector('.gis-inspector-toggle').onclick=()=>{const all=section.querySelector('.gis-inspector-all'),sum=section.querySelector('.gis-inspector-summary');const show=all.hidden;all.hidden=!show;sum.hidden=show;section.querySelector('.gis-inspector-toggle').textContent=show?'Show summary':'Show all';};
    section.querySelector('[data-gis-inspector="table"]').onclick=()=>dataTools()?.openLayer?.(d.fileId,'table');
    section.querySelector('[data-gis-inspector="zoom"]').onclick=()=>api()?.zoomFeature?.(d.fileId,d.featureId);
    section.querySelector('[data-gis-inspector="edit"]').onclick=()=>editAttributes(section,d);
  }finally{inspectorBusy=false;}
}
function editAttributes(section,d){
  const fields=fieldEntries(d);const body=section.querySelector('.gis-inspector-summary');
  body.hidden=false;section.querySelector('.gis-inspector-all').hidden=true;
  body.innerHTML=`<div class="gis-inspector-form">${fields.map(([k,v])=>`<label><span>${esc(k)}</span>${typeof v==='boolean'?`<select data-field="${esc(k)}"><option value="true" ${v?'selected':''}>true</option><option value="false" ${!v?'selected':''}>false</option></select>`:`<input data-field="${esc(k)}" value="${esc(v??'')}">`}</label>`).join('')}</div><div class="gis-inspector-actions"><button type="button" class="primary" data-save>Save</button><button type="button" data-cancel>Cancel</button></div>`;
  section.querySelector('[data-save]').onclick=()=>{const values={};section.querySelectorAll('[data-field]').forEach(el=>{values[el.dataset.field]=el.tagName==='SELECT'?el.value==='true':el.value;});api().setFeatureAttributes(d.fileId,d.featureId,values);};
  section.querySelector('[data-cancel]').onclick=()=>{section.remove();injectInspector();};
}
function layerCards(){return document.querySelectorAll('.file-card[data-v133-file]')}
function enhanceLayers(){
  if(layerBusy)return;layerBusy=true;
  try{
    const snapshots=new Map((api()?.getLayerUiSnapshot?.()||[]).map(x=>[x.id,x]));
    layerCards().forEach(card=>{
      const id=card.dataset.v133File,s=snapshots.get(id);if(!s)return;
      card.classList.toggle('gis-dataset-layer',s.featureCount>20||s.sourceFormat==='remote-geojson');
      const head=card.querySelector('.file-head');if(!head)return;
      let meta=head.querySelector('.gis-layer-inline-meta');if(!meta){meta=document.createElement('span');meta.className='gis-layer-inline-meta';head.querySelector('.file-main')?.appendChild(meta);}
      meta.textContent=`${s.visibleCount}/${s.featureCount}${s.filter?' · filtered':''}`;
      let btn=head.querySelector('.gis-layer-actions-btn');if(!btn){btn=document.createElement('button');btn.type='button';btn.className='gis-layer-actions-btn';btn.textContent='GIS';btn.title='Layer data, styling and processing';btn.onclick=e=>openLayerMenu(e,id,s);head.appendChild(btn);}
      const selected=s.selectedFeatureId,hidden=new Set(s.hiddenFeatureIds||[]),locked=new Set(s.lockedFeatureIds||[]);
      card.querySelectorAll('.feature-row').forEach(row=>{const featureId=row.dataset.v133Feature||row.dataset.v54Feature||'';const isSelected=!!selected&&featureId===selected,isHidden=hidden.has(featureId),isLocked=locked.has(featureId);row.classList.toggle('gis-selected-child',isSelected);row.classList.toggle('gis-hidden-child',isHidden);row.classList.toggle('gis-locked-child',isLocked);row.classList.toggle('gis-persistent-child',isSelected||isHidden||isLocked);if(isHidden){row.setAttribute('data-gis-state','hidden');row.title='Hidden feature — use the eye control to show it again';}else if(isLocked){row.setAttribute('data-gis-state','locked');row.title='Locked feature';}else{row.removeAttribute('data-gis-state');}});
    });
  }finally{layerBusy=false;}
}
function openLayerMenu(e,id,s){
  e.preventDefault();e.stopPropagation();menu?.remove();menu=document.createElement('div');menu.className='gis-layer-action-menu';
  const hiddenCount=(s.hiddenFeatureIds||[]).length,lockedCount=(s.lockedFeatureIds||[]).length;
  menu.innerHTML=`<div><strong>${esc(s.name)}</strong><span>${s.featureCount} features · ${esc(s.crs)}${hiddenCount?` · ${hiddenCount} hidden`:''}${lockedCount?` · ${lockedCount} locked`:''}</span></div>${[['table','Attribute table'],['filter','Filter'],['style','Style & labels'],['crs','CRS'],['process','Processing']].map(([tab,label])=>`<button type="button" data-tab="${tab}">${label}</button>`).join('')}<button type="button" data-layer-display>Display field: ${esc(s.displayField)}</button>${hiddenCount?'<button type="button" data-show-hidden>Show all hidden features</button>':''}${hiddenCount||lockedCount?'<button type="button" data-clear-overrides>Clear feature visibility/lock overrides</button>':''}`;
  document.body.appendChild(menu);const r=e.currentTarget.getBoundingClientRect();menu.style.left=Math.min(innerWidth-menu.offsetWidth-8,r.left)+'px';menu.style.top=Math.min(innerHeight-menu.offsetHeight-8,r.bottom+4)+'px';
  menu.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{dataTools()?.openLayer?.(id,b.dataset.tab);menu.remove();});
  menu.querySelector('[data-layer-display]').onclick=()=>{const layer=api().getEditableLayer(id),fields=['name',...new Set(layer.features.flatMap(f=>Object.keys(f.properties||{})))];const value=prompt(`Display field\nAvailable: ${fields.join(', ')}`,s.displayField);if(value&&fields.includes(value))api().setDisplayField(id,value);menu.remove();};
  menu.querySelector('[data-show-hidden]')?.addEventListener('click',()=>{api()?.showAllHidden?.(id);menu.remove();menu=null;});
  menu.querySelector('[data-clear-overrides]')?.addEventListener('click',()=>{if(confirm('Show all hidden features and unlock all individually locked features in this layer?'))api()?.clearFeatureOverrides?.(id);menu.remove();menu=null;});
}
function closeMenu(e){if(menu&&!menu.contains(e.target)&&!e.target.closest('.gis-layer-actions-btn')){menu.remove();menu=null;}}
function refresh(){
  if(refreshRaf)return;
  refreshRaf=requestAnimationFrame(()=>{
    refreshRaf=0;
    injectInspector();
    enhanceLayers();
  });
}
const observer=new MutationObserver(refresh);
function init(){
  // Observe only the controls that this integration enhances. Observing the
  // entire document also catches Leaflet canvas/tile mutations during map
  // movement and can repeatedly rescan large datasets while the user pans.
  const targets=[document.getElementById('fileList'),document.getElementById('selectedPanel')].filter(Boolean);
  targets.forEach(target=>observer.observe(target,{childList:true,subtree:true}));
  document.addEventListener('click',closeMenu,true);
  window.addEventListener('editpolygon:gis-changed',refresh);
  window.addEventListener('editpolygon:gis-rendered',refresh);
  refresh();
}
window.EditPolygonGISUI=Object.freeze({refresh,injectInspector,enhanceLayers});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
