(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function datetimeLocalValue(value){if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return String(value).replace(/Z$/,'').slice(0,19);const pad=number=>String(number).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;}
const tech=/^(objectid|globalid|fid|shape(_length|_area)?|shape\.length|shape\.area|created_user|last_edited_user)$/i;
let inspectorBusy=false, layerBusy=false, menu=null, menuOpener=null, menuAnchorEvent=null, refreshRaf=0;
function api(){return window.EditPolygonGIS}
function dataTools(){return window.EditPolygonGISDataTools}
function schemaFields(details){return details?.schema?.fields||Object.keys(details?.properties||{}).map(name=>({name,alias:name,type:typeof details.properties[name]==='boolean'?'boolean':typeof details.properties[name]==='number'?'decimal':'text',nullable:true,readOnly:false}));}
function fieldEntries(details){
  const properties=details?.properties||{},schema=schemaFields(details),known=new Set(schema.map(field=>field.name));const entries=schema.map(field=>[field.name,properties[field.name],field]);
  for(const [name,value] of Object.entries(properties))if(!known.has(name))entries.push([name,value,{name,alias:name,type:'text',nullable:true,readOnly:false}]);return entries;
}
function formatValue(v,field){if(v==null)return '<span class="gis-ui-empty">NULL</span>';if(v==='')return '<span class="gis-ui-empty">Empty text</span>';if(field?.type==='boolean')return v?'True':'False';if(field?.type==='datetime'){const d=new Date(v);if(Number.isFinite(d.getTime()))return esc(d.toLocaleString());}if(typeof v==='object')return esc(JSON.stringify(v));return esc(v)}
function fieldTitle(field,name){return field?.alias&&field.alias!==name?`${field.alias} (${name})`:field?.alias||name;}
function typedInspectorControl(name,value,field){const disabled=field?.readOnly?'disabled':'',common=`data-field="${esc(name)}" ${disabled}`;if(field?.type==='boolean')return `<select ${common}><option value="__null__" ${value==null?'selected':''}>NULL</option><option value="true" ${value===true?'selected':''}>True</option><option value="false" ${value===false?'selected':''}>False</option></select>`;const type=field?.type==='integer'||field?.type==='decimal'?'number':field?.type==='date'?'date':field?.type==='datetime'?'datetime-local':'text',step=field?.type==='integer'?'1':field?.type==='decimal'?'any':field?.type==='datetime'?'1':'';let display=value??'';if(field?.type==='datetime'&&value)display=datetimeLocalValue(value);return `<input type="${type}" ${step?`step="${step}"`:''} ${common} value="${esc(display)}" placeholder="${value==null?'NULL':''}">`;}
function inspectorPanel(){return document.getElementById('selectedPanel')}
function injectInspector(){
  if(inspectorBusy)return;const panel=inspectorPanel();if(!panel||panel.querySelector('.gis-inspector-attributes'))return;
  const d=api()?.getSelectedFeature?.();if(!d)return;
  inspectorBusy=true;
  try{
    const section=document.createElement('section');section.className='gis-inspector-attributes';
    const fields=fieldEntries(d),summary=fields.filter(([k,v])=>!tech.test(k)&&v!=null&&v!=='').slice(0,8),selectionCount=Number(d.selectionCount||d.selectedIds?.length||0),selectionIndex=Number(d.selectionIndex??-1);
    const nativeCoord=Array.isArray(d.coordinateNative)?d.coordinateNative.slice(0,2).map(v=>Number(v).toLocaleString(undefined,{maximumFractionDigits:4})).join(', '):'';const wgsCoord=Array.isArray(d.coordinateWgs84)?d.coordinateWgs84.slice(0,2).map(v=>Number(v).toFixed(6)).join(', '):'';section.innerHTML=`${selectionCount>1?`<div class="gis-inspector-selection-nav"><button type="button" data-gis-inspector="previous" aria-label="Previous selected feature">‹</button><strong>${Math.max(1,selectionIndex+1)} of ${selectionCount} selected</strong><button type="button" data-gis-inspector="next" aria-label="Next selected feature">›</button></div>`:''}<div class="gis-inspector-head"><div><strong>Attributes</strong><span>${esc(d.layerName)} · ${esc(d.crs)}</span></div><button type="button" class="gis-inspector-toggle">${fields.length>8?'Show all':'Collapse'}</button></div>${nativeCoord?`<div class="gis-inspector-crs"><span>${esc(d.crs)} coordinate</span><strong>${esc(nativeCoord)}</strong>${d.crs!=='EPSG:4326'&&wgsCoord?`<small>Map: ${esc(wgsCoord)} · EPSG:4326</small>`:''}</div>`:''}<div class="gis-inspector-summary">${summary.map(([k,v,field])=>`<div><span>${esc(fieldTitle(field,k))}</span><strong>${formatValue(v,field)}</strong></div>`).join('')||'<p>No populated attributes.</p>'}</div><div class="gis-inspector-all" hidden>${fields.map(([k,v,field])=>`<div class="${tech.test(k)?'technical':''}"><span>${esc(fieldTitle(field,k))}<small>${esc(field.type||'text')}${field.readOnly?' · read-only':''}</small></span><strong>${formatValue(v,field)}</strong></div>`).join('')}</div><div class="gis-inspector-actions"><button type="button" data-gis-inspector="edit">Edit attributes</button><button type="button" data-gis-inspector="table">Open table</button><button type="button" data-gis-inspector="zoom">Zoom</button></div>`;
    panel.prepend(section);
    section.querySelector('.gis-inspector-toggle').onclick=()=>{const all=section.querySelector('.gis-inspector-all'),sum=section.querySelector('.gis-inspector-summary');const show=all.hidden;all.hidden=!show;sum.hidden=show;section.querySelector('.gis-inspector-toggle').textContent=show?'Show summary':'Show all';};
    section.querySelector('[data-gis-inspector="table"]').onclick=()=>dataTools()?.openLayer?.(d.fileId,'table');
    section.querySelector('[data-gis-inspector="zoom"]').onclick=()=>api()?.zoomFeature?.(d.fileId,d.featureId);
    section.querySelector('[data-gis-inspector="edit"]').onclick=()=>editAttributes(section,d);
    section.querySelector('[data-gis-inspector="previous"]')?.addEventListener('click',()=>api()?.navigateSelection?.(-1));
    section.querySelector('[data-gis-inspector="next"]')?.addEventListener('click',()=>api()?.navigateSelection?.(1));
  }finally{inspectorBusy=false;}
}
function editAttributes(section,d){
  const fields=fieldEntries(d);const body=section.querySelector('.gis-inspector-summary');
  body.hidden=false;section.querySelector('.gis-inspector-all').hidden=true;
  body.innerHTML=`<div class="gis-inspector-form">${fields.map(([k,v,field])=>`<label class="${field.readOnly?'is-readonly':''}"><span>${esc(fieldTitle(field,k))}<small>${esc(field.type||'text')}${field.readOnly?' · read-only':''}</small></span>${typedInspectorControl(k,v,field)}</label>`).join('')}</div><div class="gis-inspector-actions"><button type="button" class="primary" data-save>Save</button><button type="button" data-cancel>Cancel</button></div>`;
  section.querySelector('[data-save]').onclick=()=>{const values={};section.querySelectorAll('[data-field]:not([disabled])').forEach(el=>{let value=el.value;const field=schemaFields(d).find(item=>item.name===el.dataset.field);if(el.tagName==='SELECT')value=value==='__null__'?null:value==='true';else if(value===''&&field?.type!=='text')value=null;values[el.dataset.field]=value;});try{api().setFeatureAttributes(d.fileId,d.featureId,values);}catch(error){alert(error.message||error);}};
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
      meta.textContent=`${s.visibleCount}/${s.featureCount}${s.filter?' · filtered':''}${s.styleLabel?` · ${s.styleLabel}`:''}`;
      let btn=head.querySelector('.gis-layer-actions-btn');if(!btn){btn=document.createElement('button');btn.type='button';btn.className='gis-layer-actions-btn';btn.textContent='GIS';btn.title='Layer data, styling and processing';head.appendChild(btn);}btn.onclick=e=>openLayerMenu(e,id,s);
      const selected=s.selectedFeatureId,hidden=new Set(s.hiddenFeatureIds||[]),locked=new Set(s.lockedFeatureIds||[]);
      card.querySelectorAll('.feature-row').forEach(row=>{const featureId=row.dataset.v133Feature||row.dataset.v54Feature||'';const isSelected=!!selected&&featureId===selected,isHidden=hidden.has(featureId),isLocked=locked.has(featureId);row.classList.toggle('gis-selected-child',isSelected);row.classList.toggle('gis-hidden-child',isHidden);row.classList.toggle('gis-locked-child',isLocked);row.classList.toggle('gis-persistent-child',isSelected||isHidden||isLocked);if(isHidden){row.setAttribute('data-gis-state','hidden');row.title='Hidden feature — use the eye control to show it again';}else if(isLocked){row.setAttribute('data-gis-state','locked');row.title='Locked feature';}else{row.removeAttribute('data-gis-state');}});
    });
  }finally{layerBusy=false;}
}
function removeLayerMenu(restoreFocus=false){
  if(!menu)return;
  const opener=menuOpener||menu._v1533Anchor||null;
  opener?.setAttribute('aria-expanded','false');
  menu.remove();menu=null;menuAnchorEvent=null;menuOpener=null;
  if(restoreFocus)requestAnimationFrame(()=>opener?.focus?.());
}
function positionLayerMenu(){
  if(!menu||!menuAnchorEvent)return;
  const helper=window.EditPolygonPositionPopover;
  if(typeof helper==='function'){helper(menu,menuAnchorEvent);return;}
  const r=(menuOpener||menuAnchorEvent.currentTarget)?.getBoundingClientRect?.()||{left:8,right:8,top:8,bottom:8};
  const margin=8,gap=5,width=menu.offsetWidth||286,natural=menu.scrollHeight||menu.offsetHeight||120;
  const below=Math.max(80,innerHeight-r.bottom-gap-margin),above=Math.max(80,r.top-gap-margin);
  const useBelow=below>=above,available=Math.max(80,Math.min(innerHeight-margin*2,useBelow?below:above));
  menu.style.maxHeight=`${available}px`;
  menu.style.left=`${Math.max(margin,Math.min(r.right+gap,innerWidth-width-margin))}px`;
  menu.style.top=`${Math.max(margin,useBelow?r.bottom+gap:r.top-gap-Math.min(natural,available))}px`;
}
function menuSection(label,items){
  return `<section class="gis-layer-menu-section"><div class="gis-layer-menu-label">${esc(label)}</div>${items}</section>`;
}
function menuAction(tab,label,badge='',options={}){
  const disabled=options.disabled?' disabled':'';
  const title=options.title?` title="${esc(options.title)}"`:'';
  return `<button type="button" class="gis-layer-menu-action" data-tab="${tab}"${disabled}${title}><span>${esc(label)}</span>${badge?`<strong>${esc(badge)}</strong>`:''}</button>`;
}
function openLayerMenu(e,id,s){
  e.preventDefault();e.stopPropagation();removeLayerMenu();
  menuOpener=e.currentTarget instanceof Element?e.currentTarget:null;
  menuAnchorEvent=e;
  menu=document.createElement('div');menu.className='gis-layer-action-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',`${s.name} GIS tools`);
  menuOpener?.setAttribute('aria-haspopup','menu');menuOpener?.setAttribute('aria-expanded','true');
  const hiddenCount=(s.hiddenFeatureIds||[]).length,lockedCount=(s.lockedFeatureIds||[]).length;
  const countLabel=s.tableOnly?`${s.featureCount.toLocaleString()} records`:`${s.featureCount.toLocaleString()} features`;
  const filterBadge=s.filter?`${s.visibleCount.toLocaleString()} / ${s.featureCount.toLocaleString()}`:'';
  const styleBadge=s.styleMode==='advanced'?(s.styleLabel||'Advanced'):'Single symbol';
  const selectedBadge=s.selectedFeatureId?'1 selected':'';
  const dataItems=menuAction('table','Attributes')+menuAction('fields','Fields & statistics');
  const analysisItems=menuAction('select','Select features',selectedBadge)+menuAction('filter','Filter',filterBadge)+menuAction('join','Join & summarize')+menuAction('process','Processing');
  const presentationItems=menuAction('style','Style & labels',styleBadge)+(s.styleMode==='advanced'?`<button type="button" class="gis-layer-menu-secondary" data-style-simple>Switch to single symbol</button>`:s.advancedStyleAvailable?`<button type="button" class="gis-layer-menu-secondary" data-style-advanced>Restore saved advanced style</button>`:'');
  const crsItems=menuAction('crs','CRS',s.crs||'EPSG:4326');
  const recoveryItems=hiddenCount||lockedCount?`${hiddenCount?`<button type="button" class="gis-layer-menu-action" data-show-hidden><span>Show all hidden features</span><strong>${hiddenCount}</strong></button>`:''}<button type="button" class="gis-layer-menu-action" data-clear-overrides><span>Clear visibility and lock overrides</span><strong>${hiddenCount+lockedCount}</strong></button>`:'';
  menu.innerHTML=`<header class="gis-layer-menu-head"><strong>${esc(s.name)}</strong><span>${esc(countLabel)} · ${esc(s.crs)}${hiddenCount?` · ${hiddenCount} hidden`:''}${lockedCount?` · ${lockedCount} locked`:''}</span></header>${menuSection('Data',dataItems)}${menuSection('Query & analysis',analysisItems)}${menuSection('Presentation',presentationItems)}${menuSection('Coordinate system',crsItems)}${menuSection('Settings',`<button type="button" class="gis-layer-menu-setting" data-layer-display><span>Display field</span><strong>${esc(s.displayField||'name')}</strong><small>Change</small></button>`)}${recoveryItems?menuSection('Recovery',recoveryItems):''}`;
  document.body.appendChild(menu);positionLayerMenu();

  menu.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
    const tab=button.dataset.tab;removeLayerMenu();dataTools()?.openLayer?.(id,tab);
  }));
  menu.querySelector('[data-style-simple]')?.addEventListener('click',()=>{if(confirm('Switch to single-symbol styling? The advanced configuration will be retained.')){api()?.switchLayerStyleMode?.(id,'simple');removeLayerMenu();}});
  menu.querySelector('[data-style-advanced]')?.addEventListener('click',()=>{api()?.switchLayerStyleMode?.(id,'advanced');removeLayerMenu();});
  menu.querySelector('[data-layer-display]')?.addEventListener('click',()=>{
    const layer=api()?.getEditableLayer?.(id);if(!layer)return;
    const fields=['name',...new Set((layer.features||[]).flatMap(feature=>Object.keys(feature.properties||{})))];
    const value=prompt(`Display field\nAvailable: ${fields.join(', ')}`,s.displayField||'name');
    if(value&&fields.includes(value))api()?.setDisplayField?.(id,value);
    removeLayerMenu();
  });
  menu.querySelector('[data-show-hidden]')?.addEventListener('click',()=>{api()?.showAllHidden?.(id);removeLayerMenu();});
  menu.querySelector('[data-clear-overrides]')?.addEventListener('click',()=>{if(confirm('Show all hidden features and unlock all individually locked features in this layer?'))api()?.clearFeatureOverrides?.(id);removeLayerMenu();});
}
function closeMenu(e){if(menu&&!menu.contains(e.target)&&!e.target.closest('.gis-layer-actions-btn'))removeLayerMenu();}
function menuKeydown(e){if(e.key==='Escape'&&menu){e.preventDefault();e.stopPropagation();removeLayerMenu(true);}}
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
  document.addEventListener('keydown',menuKeydown,true);
  window.addEventListener('resize',positionLayerMenu,{passive:true});
  window.addEventListener('editpolygon:gis-changed',refresh);
  window.addEventListener('editpolygon:gis-rendered',refresh);
  window.addEventListener('editpolygon:gis-selection-changed',refresh);
  refresh();
}
window.EditPolygonGISUI=Object.freeze({refresh,injectInspector,enhanceLayers});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
