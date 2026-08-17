/* v126-point-line-geometry-code-v2:start */
(function(){
  'use strict';
  const VERSION='1.0.0';
  const TYPES=Object.freeze(['Point','MultiPoint','LineString','MultiLineString']);
  const TYPE_SET=new Set(TYPES);
  const OPEN_STATE=new Map();
  let observer=null,queued=false;

  const cloneValue=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const family=type=>type==='Point'||type==='MultiPoint'?'point':type==='LineString'||type==='MultiLineString'?'line':'';
  const pretty=value=>JSON.stringify(value,null,2);
  const keyFor=r=>`${r?.file?.id||''}:${r?.feature?.id||''}`;
  function currentRef(){try{return typeof ref==='function'?ref():null;}catch(_){return null;}}
  function currentGeometry(r){try{return r&&typeof getDisplayGeometry==='function'?getDisplayGeometry(r.feature):r?.feature?.geometry||null;}catch(_){return r?.feature?.geometry||null;}}
  function issue(severity,code,message,path=''){return {severity,code,message,path};}

  function normalisePosition(raw,path,changes,issues){
    if(!Array.isArray(raw)||raw.length<2){issues.push(issue('error','INVALID_POSITION',`${path} must contain longitude and latitude.`,path));return null;}
    const x=Number(raw[0]),y=Number(raw[1]);
    if(!Number.isFinite(x)||!Number.isFinite(y)){issues.push(issue('error','NON_NUMERIC_COORDINATE',`${path} contains a non-numeric coordinate.`,path));return null;}
    if(x < -180 || x > 180 || y < -90 || y > 90){issues.push(issue('error','COORDINATE_RANGE',`${path} is outside longitude/latitude storage range.`,path));return null;}
    if(typeof raw[0]!=='number'||typeof raw[1]!=='number')changes.push({code:'NUMERIC_STRINGS',message:'Numeric coordinate strings will be stored as numbers.'});
    if(raw.length>2)changes.push({code:'EXTRA_ORDINATES',message:'Extra Z/M coordinate values will be removed because EditPolygon stores editable geometry in 2D.'});
    return [x,y];
  }

  function normaliseGeometry(raw,expectedType){
    const issues=[],changes=[];
    let input=raw;
    if(Array.isArray(input))input={type:expectedType,coordinates:input};
    if(input&&input.type==='Feature')input=input.geometry;
    if(input&&['FeatureCollection','GeometryCollection'].includes(input.type)){
      issues.push(issue('error','COLLECTION_INPUT','Paste one Point/MultiPoint/LineString/MultiLineString geometry (or one Feature), not a collection.'));
      return {valid:false,issues,changes,proposal:null};
    }
    if(!input||typeof input!=='object'||!TYPE_SET.has(input.type)){
      issues.push(issue('error','UNSUPPORTED_TYPE','Geometry code for a point or line must use Point, MultiPoint, LineString, or MultiLineString.'));
      return {valid:false,issues,changes,proposal:null};
    }
    const expectedFamily=family(expectedType),actualFamily=family(input.type);
    if(!expectedFamily||actualFamily!==expectedFamily){
      issues.push(issue('error','GEOMETRY_FAMILY_MISMATCH',`A ${expectedFamily||'selected'} feature cannot be replaced with ${input.type} geometry.`));
      return {valid:false,issues,changes,proposal:null};
    }

    let coordinates=null;
    if(input.type==='Point'){
      coordinates=normalisePosition(input.coordinates,'coordinates',changes,issues);
    }else if(input.type==='MultiPoint'){
      if(!Array.isArray(input.coordinates)||!input.coordinates.length)issues.push(issue('error','EMPTY_MULTIPOINT','MultiPoint requires at least one point.','coordinates'));
      else coordinates=input.coordinates.map((position,index)=>normalisePosition(position,`coordinates[${index}]`,changes,issues));
    }else if(input.type==='LineString'){
      if(!Array.isArray(input.coordinates)||input.coordinates.length<2)issues.push(issue('error','SHORT_LINE','LineString requires at least two vertices.','coordinates'));
      else coordinates=input.coordinates.map((position,index)=>normalisePosition(position,`coordinates[${index}]`,changes,issues));
    }else if(input.type==='MultiLineString'){
      if(!Array.isArray(input.coordinates)||!input.coordinates.length)issues.push(issue('error','EMPTY_MULTILINE','MultiLineString requires at least one line.','coordinates'));
      else coordinates=input.coordinates.map((line,lineIndex)=>{
        if(!Array.isArray(line)||line.length<2){issues.push(issue('error','SHORT_LINE',`coordinates[${lineIndex}] requires at least two vertices.`,`coordinates[${lineIndex}]`));return null;}
        return line.map((position,index)=>normalisePosition(position,`coordinates[${lineIndex}][${index}]`,changes,issues));
      });
    }
    if(issues.some(item=>item.severity==='error'))return {valid:false,issues,changes,proposal:null};
    const proposal={type:input.type,coordinates};
    try{
      if(typeof validateCollectionGeometry==='function'){
        const report=validateCollectionGeometry({type:'Feature',properties:{name:'Manual geometry'},geometry:proposal});
        for(const item of report?.issues||[]){
          const severity=item.severity||'info';
          if(severity==='error')issues.push(issue('error',item.code||'GEOMETRY_HEALTH',item.message||'Geometry Health found an error.',item.path||''));
          else if(severity==='warning')issues.push(issue('warning',item.code||'GEOMETRY_HEALTH',item.message||'Geometry Health found a warning.',item.path||''));
        }
      }
    }catch(error){issues.push(issue('warning','GEOMETRY_HEALTH_UNAVAILABLE',`Geometry Health could not complete this check: ${String(error?.message||error)}`));}
    const uniqueChanges=[];const seen=new Set();
    for(const change of changes){const token=`${change.code}:${change.message}`;if(!seen.has(token)){seen.add(token);uniqueChanges.push(change);}}
    return {valid:!issues.some(item=>item.severity==='error'),issues,changes:uniqueChanges,proposal};
  }

  function analyze(text,expectedType){
    let raw;
    try{raw=JSON.parse(String(text??''));}catch(error){return {valid:false,parseError:String(error.message||error),issues:[issue('error','JSON_PARSE',`Invalid JSON: ${String(error.message||error)}`)],changes:[],proposal:null};}
    const result=normaliseGeometry(raw,expectedType);
    return {...result,parseError:null};
  }

  function readonlyReason(r){
    if(typeof isLocked==='function'&&isLocked(r.file,r.feature))return 'This feature is locked. Unlock it before applying geometry code.';
    if(typeof V!=='undefined'&&V?.active)return 'Finish vertex editing before applying geometry code.';
    try{if(window.EditPolygonPointEditing?.active?.())return 'Finish point editing before applying geometry code.';}catch(_){ }
    return '';
  }

  function renderReport(host,report){
    if(!host)return;
    const errors=(report?.issues||[]).filter(item=>item.severity==='error');
    const warnings=(report?.issues||[]).filter(item=>item.severity==='warning');
    if(report?.parseError){host.className='plgce-report error';host.innerHTML=`<strong>Invalid JSON.</strong><span>${escapeHtml(report.parseError)}</span>`;return;}
    if(errors.length){host.className='plgce-report error';host.innerHTML=`<strong>${errors.length} error${errors.length===1?'':'s'} — not safe to apply.</strong>${errors.slice(0,5).map(item=>`<span>${escapeHtml(item.message)}</span>`).join('')}`;return;}
    const changes=report?.changes||[];
    host.className='plgce-report ok';
    host.innerHTML=`<strong>Geometry is valid for this ${family(report?.proposal?.type)} feature.</strong>${warnings.slice(0,4).map(item=>`<span>Warning: ${escapeHtml(item.message)}</span>`).join('')}${changes.map(item=>`<span>${escapeHtml(item.message)}</span>`).join('')||'<span>No normalisation changes are required.</span>'}`;
  }
  function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

  function mountEditor(r,details){
    if(!r||!details)return;
    const body=details.querySelector('.plgce-body');if(!body)return;
    const geom=currentGeometry(r);if(!geom||!TYPE_SET.has(geom.type))return;
    const source=pretty(geom),familyLabel=family(geom.type);
    body.innerHTML=`
      <div class="plgce-meta">
        <div><span>Editable format</span><strong>GeoJSON geometry</strong></div>
        <div><span>Geometry family</span><strong>${familyLabel}</strong></div>
        <div><span>Selected type</span><strong>${escapeHtml(geom.type)}</strong></div>
      </div>
      <div class="plgce-note"><strong>Coordinate order:</strong> [longitude, latitude]. You may use ${familyLabel==='point'?'Point or MultiPoint':'LineString or MultiLineString'} within the same geometry family.</div>
      <textarea class="plgce-code" spellcheck="false" aria-label="Selected ${familyLabel} GeoJSON geometry"></textarea>
      <div class="plgce-foot"><span class="plgce-count"></span><span>Ctrl+Enter applies</span></div>
      <div class="plgce-report" hidden></div>
      <div class="plgce-actions">
        <button type="button" data-plgce="check">Check geometry</button>
        <button type="button" data-plgce="format">Format JSON</button>
        <button type="button" data-plgce="copy">Copy code</button>
        <button type="button" data-plgce="reset">Reset editor</button>
        <button type="button" class="primary" data-plgce="apply">Apply geometry</button>
      </div>`;
    const textarea=body.querySelector('.plgce-code'),count=body.querySelector('.plgce-count'),reportHost=body.querySelector('.plgce-report');
    textarea.value=source;
    const updateCount=()=>{count.textContent=`${textarea.value.length.toLocaleString()} characters`;};updateCount();
    const clearReport=()=>{reportHost.hidden=true;reportHost.innerHTML='';reportHost.className='plgce-report';};
    const check=()=>{const current=currentRef(),currentGeom=currentGeometry(current);const result=analyze(textarea.value,currentGeom?.type||geom.type);reportHost.hidden=false;renderReport(reportHost,result);return result;};
    const apply=()=>{
      const current=currentRef(),currentGeom=currentGeometry(current);
      if(!current||current.feature.id!==r.feature.id||!currentGeom||!TYPE_SET.has(currentGeom.type)){setStatus('The selected feature changed. Reopen Geometry code before applying.','error');return;}
      const reason=readonlyReason(current);if(reason){setStatus(reason,'error');return;}
      const result=analyze(textarea.value,currentGeom.type);reportHost.hidden=false;renderReport(reportHost,result);if(!result.valid||!result.proposal){setStatus('Geometry code contains errors and was not applied.','error');return;}
      try{
        pushHistory([current.feature.id]);
        addEdit(current.feature,'manual',{geometry:cloneValue(result.proposal),source:'geometry-code-point-line-v2',editorVersion:VERSION,repairSummary:(result.changes||[]).map(item=>item.message)});
        clearFeatureCaches(current.feature);setDirty(true);
        try{logOperation('geometry-code-applied',{featureId:current.feature.id,type:result.proposal.type,source:'point-line-v2'});}catch(_){ }
        setStatus(`${result.proposal.type} geometry updated from Geometry code.`);
        renderAll();
      }catch(error){setStatus(`Could not apply geometry code: ${String(error?.message||error)}`,'error');}
    };
    textarea.addEventListener('input',()=>{updateCount();clearReport();});
    textarea.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();apply();}});
    body.querySelector('[data-plgce="check"]').addEventListener('click',check);
    body.querySelector('[data-plgce="format"]').addEventListener('click',()=>{try{textarea.value=pretty(JSON.parse(textarea.value));updateCount();clearReport();}catch(error){reportHost.hidden=false;renderReport(reportHost,{parseError:String(error.message||error),issues:[]});}});
    body.querySelector('[data-plgce="copy"]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(textarea.value);setStatus('Geometry code copied.');}catch(_){textarea.focus();textarea.select();try{document.execCommand('copy');setStatus('Geometry code copied.');}catch(error){setStatus('Could not copy Geometry code.','error');}}});
    body.querySelector('[data-plgce="reset"]').addEventListener('click',()=>{const current=currentRef(),fresh=currentGeometry(current);if(current&&current.feature.id===r.feature.id&&fresh){textarea.value=pretty(fresh);updateCount();clearReport();}});
    body.querySelector('[data-plgce="apply"]').addEventListener('click',apply);
  }

  function createSection(r){
    const geom=currentGeometry(r);if(!r||!geom||!TYPE_SET.has(geom.type))return null;
    const panel=document.getElementById('selectedPanel');if(!panel)return null;
    const existing=panel.querySelector('[data-plgce-section="code"]');if(existing)return existing;
    const details=document.createElement('details');
    details.className='inspector-card plgce-section';details.dataset.plgceSection='code';
    const stateKey=keyFor(r);details.open=OPEN_STATE.get(stateKey)===true;
    details.innerHTML='<summary><strong>Geometry code</strong><span>GeoJSON · edit</span></summary><div class="plgce-body"><div class="plgce-note">Open this section to edit the selected point or line as GeoJSON.</div></div>';
    details.addEventListener('toggle',()=>{
      OPEN_STATE.set(stateKey,details.open);
      if(details.open){const current=currentRef(),fresh=currentGeometry(current);if(current&&fresh&&TYPE_SET.has(fresh.type)&&current.feature.id===r.feature.id)mountEditor(current,details);}
    });
    const cards=Array.from(panel.querySelectorAll('.inspector-card'));
    const geometryCard=cards.find(card=>card.querySelector('h3')?.textContent.trim()==='Geometry')||cards[0]||null;
    if(geometryCard)geometryCard.insertAdjacentElement('afterend',details);else panel.prepend(details);
    if(details.open)mountEditor(r,details);
    return details;
  }

  function ensureSection(){
    queued=false;
    const panel=document.getElementById('selectedPanel');if(!panel)return null;
    const r=currentRef(),geom=currentGeometry(r),supported=!!(r&&geom&&TYPE_SET.has(geom.type));
    const existing=panel.querySelector('[data-plgce-section="code"]');
    if(!supported){if(existing)existing.remove();return null;}
    return existing||createSection(r);
  }
  function queueEnsure(){if(queued)return;queued=true;Promise.resolve().then(ensureSection);}
  function installObserver(){
    const panel=document.getElementById('selectedPanel');if(!panel)return;
    observer?.disconnect?.();observer=new MutationObserver(queueEnsure);observer.observe(panel,{childList:true,subtree:true});
    queueEnsure();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installObserver,{once:true});else installObserver();
  window.addEventListener?.('editpolygon:gis-selection-changed',queueEnsure);
  window.__pointLineGeometryCodeV2=Object.freeze({version:VERSION,supportedTypes:[...TYPES],analyze,ensureNow:ensureSection});
})();
/* v126-point-line-geometry-code-v2:end */
