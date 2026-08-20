(function(){
  'use strict';

  const byId=id=>document.getElementById(id);
  const html=value=>String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const pct=value=>`${Math.round((Number(value)||0)*100)}%`;
  let api=null;
  let panel=null;
  let activeTab='layers';
  let renderQueued=false;
  let remoteDiscovery=null;
  let remoteDiscoveryTrail=[];
  let remoteDiscoveryBusy=false;
  let remoteDiscoveryRequestId=0;
  let remoteSelectedLayerUrls=new Set();
  let remoteForm={name:'Remote data',mode:'editable',url:'',color:'#1664d6'};
  let remoteNameEdited=false;
  let remoteStatus={message:'',kind:'',scope:''};

  function status(message,kind=''){
    const el=byId('gisWorkspaceStatus');
    if(!el)return;
    el.textContent=message||'';
    el.dataset.kind=kind;
  }

  function ensureApi(){
    api=window.EditPolygonGIS||null;
    return !!api;
  }

  function createToggle(){
    if(byId('gisWorkspaceToggle'))return;
    const fit=byId('fitAllBtn');
    const button=document.createElement('button');
    button.id='gisWorkspaceToggle';
    button.type='button';
    button.className='gis-workspace-toggle';
    button.title='Switch between the simple editor and Advanced GIS workspace';
    button.addEventListener('click',()=>{
      const next=api.getWorkspaceMode()==='advanced'?'simple':'advanced';
      api.setWorkspaceMode(next);
      render();
    });
    if(fit)fit.insertAdjacentElement('afterend',button);
    else document.querySelector('.topbar-core')?.appendChild(button);
  }

  function createPanel(){
    if(byId('gisWorkspacePanel')){panel=byId('gisWorkspacePanel');return;}
    panel=document.createElement('aside');
    panel.id='gisWorkspacePanel';
    panel.className='gis-workspace-panel';
    panel.setAttribute('aria-label','Advanced GIS workspace');
    panel.innerHTML=`
      <div class="gis-panel-head">
        <div>
          <div class="gis-panel-title">Advanced GIS</div>
          <div class="gis-panel-subtitle">Browser-local editing and direct map sources</div>
        </div>
        <button type="button" id="gisWorkspaceClose" title="Return to the simple workspace">×</button>
      </div>
      <div class="gis-tabs" role="tablist" aria-label="Advanced GIS sections">
        <button type="button" role="tab" data-gis-tab="layers">Layers</button>
        <button type="button" role="tab" data-gis-tab="add">Add data</button>
        <button type="button" role="tab" data-gis-tab="basemaps">Basemaps</button>
        <button type="button" role="tab" data-gis-tab="project">Project</button>
      </div>
      <div class="gis-panel-body" id="gisPanelBody"></div>
      <div class="gis-panel-status" id="gisWorkspaceStatus" aria-live="polite"></div>`;
    document.body.appendChild(panel);
    byId('gisWorkspaceClose').addEventListener('click',()=>{api.setWorkspaceMode('simple');render();});
    panel.querySelector('.gis-tabs').addEventListener('click',event=>{
      const button=event.target.closest('[data-gis-tab]');
      if(!button)return;
      activeTab=button.dataset.gisTab;
      render();
    });
    panel.addEventListener('click',handlePanelClick);
    panel.addEventListener('change',handlePanelChange);
    panel.addEventListener('input',handlePanelInput);
    panel.addEventListener('submit',handlePanelSubmit);
  }

  function roleLabel(layer){
    if(layer.role==='basemap')return 'Basemap';
    if(layer.kind==='editable')return 'Editable';
    if(layer.kind==='image')return 'Image';
    if(layer.kind==='reference')return 'Reference';
    return 'Remote layer';
  }

  function sourceLabel(type){
    const labels={xyz:'XYZ tiles',tms:'TMS tiles',wms:'WMS',tilejson:'TileJSON','remote-geojson':'Remote GeoJSON',geojson:'GeoJSON',geotiff:'GeoTIFF',image:'Image',project:'Project',validator:'Validated result'};
    return labels[type]||String(type||'Layer');
  }

  function layerRow(layer,groups){
    const isBase=layer.role==='basemap';
    const canOpacity=!isBase||layer.kind==='custom';
    const groupOptions=['<option value="">No custom group</option>',...groups.map(group=>`<option value="${html(group.id)}" ${layer.groupId===group.id?'selected':''}>${html(group.name)}</option>`)].join('');
    return `<div class="gis-layer-row ${layer.visible?'is-visible':'is-hidden'}" data-layer-key="${html(layer.key)}">
      <div class="gis-layer-primary">
        <button type="button" class="gis-eye ${layer.visible?'active':''}" data-gis-action="visibility" title="${layer.visible?'Hide layer':'Show layer'}" aria-pressed="${layer.visible?'true':'false'}">${layer.visible?'●':'○'}</button>
        <div class="gis-layer-main">
          <div class="gis-layer-name" title="${html(layer.name)}">${html(layer.name)}</div>
          <div class="gis-layer-meta"><span>${html(roleLabel(layer))}</span><span>${html(sourceLabel(layer.sourceType))}</span><span class="gis-network ${layer.network==='remote'?'remote':'local'}">${layer.network==='remote'?'Remote request':'Local data'}</span>${layer.featureCount!=null?`<span>${Number(layer.featureCount).toLocaleString()} features</span>`:''}</div>
        </div>
        <button type="button" class="gis-mini" data-gis-action="zoom" title="Zoom to layer">⌖</button>
        <button type="button" class="gis-mini" data-gis-action="rename" title="Rename layer">✎</button>
        ${layer.removable?'<button type="button" class="gis-mini danger" data-gis-action="remove" title="Remove layer">×</button>':''}
      </div>
      <div class="gis-layer-secondary">
        ${canOpacity?`<label class="gis-opacity">Opacity <input type="range" min="5" max="100" step="1" value="${Math.round((layer.opacity??1)*100)}" data-gis-opacity><span>${pct(layer.opacity??1)}</span></label>`:'<span class="gis-base-active-note">Select to activate this basemap</span>'}
        ${!isBase?'<div class="gis-layer-order"><button type="button" class="gis-mini" data-gis-action="up" title="Move layer up">↑</button><button type="button" class="gis-mini" data-gis-action="down" title="Move layer down">↓</button></div>':''}
        ${!isBase?`<label class="gis-group-select">Group <select data-gis-group>${groupOptions}</select></label>`:''}
      </div>
    </div>`;
  }

  function groupSection(title,layers,groups,extra=''){
    if(!layers.length)return '';
    return `<section class="gis-layer-section"><div class="gis-section-head"><h3>${html(title)}</h3><span>${layers.length}</span></div>${extra}${layers.map(layer=>layerRow(layer,groups)).join('')}</section>`;
  }

  function renderLayers(){
    const layers=api.getLayers();
    const groups=api.getGroups();
    const basemaps=layers.filter(layer=>layer.role==='basemap');
    const grouped=new Set();
    const groupHtml=groups.map(group=>{
      const children=layers.filter(layer=>layer.role!=='basemap'&&layer.groupId===group.id);
      children.forEach(layer=>grouped.add(layer.key));
      return `<section class="gis-layer-section gis-user-group" data-group-id="${html(group.id)}">
        <div class="gis-section-head"><h3>${html(group.name)}</h3><div><span>${children.length}</span><button type="button" class="gis-mini" data-gis-group-action="rename" title="Rename group">✎</button><button type="button" class="gis-mini danger" data-gis-group-action="remove" title="Remove group">×</button></div></div>
        ${children.length?children.map(layer=>layerRow(layer,groups)).join(''):'<div class="gis-empty-small">Assign layers to this group using the Group dropdown.</div>'}
      </section>`;
    }).join('');
    const editable=layers.filter(layer=>layer.role!=='basemap'&&layer.kind==='editable'&&!grouped.has(layer.key));
    const localContext=layers.filter(layer=>layer.role!=='basemap'&&['reference','image'].includes(layer.kind)&&!grouped.has(layer.key));
    const remote=layers.filter(layer=>layer.role!=='basemap'&&layer.kind==='custom'&&!grouped.has(layer.key));
    return `<div class="gis-pane-intro"><div><strong>Unified layers</strong><p>Editable files, browser-local overlays, basemaps and remote services are managed together here. The original simple Layers panel remains available.</p></div><button type="button" class="primary" data-gis-action="new-group">New group</button></div>
      ${groupSection('Basemaps',basemaps,groups,'<div class="gis-section-note">Only one basemap is active. Remote basemaps are requested directly from their provider.</div>')}
      ${groupHtml}
      ${groupSection('Editable data',editable,groups)}
      ${groupSection('Reference and image layers',localContext,groups)}
      ${groupSection('Remote service layers',remote,groups)}
      ${layers.length===0?'<div class="gis-empty">No layers yet. Open a local file or add a remote source.</div>':''}`;
  }

  function renderRemoteDiscovery(){
    const result=remoteDiscovery;
    if(!result)return '';
    const count=result.featureCount==null?'Feature count available when imported':`${Number(result.featureCount).toLocaleString()} feature${Number(result.featureCount)===1?'':'s'}`;
    if(result.kind==='ready'){
      return `<div class="gis-remote-result is-ready">
        <div class="gis-remote-result-head"><div><strong>${html(result.name||result.title||'Web data')}</strong><span>${html(result.sourceType==='arcgis-layer'?'ArcGIS feature layer':'GeoJSON data')}</span></div><span class="gis-found-badge">Found</span></div>
        <div class="gis-remote-facts"><span>${html(result.geometryLabel||result.geometryType||'Spatial features')}</span><span>${html(count)}</span>${result.sourceCrs?`<span>${html(result.sourceCrs)}</span>`:''}</div>
        ${result.item?.title?`<p class="gis-help">Resolved from ArcGIS item: ${html(result.item.title)}</p>`:''}
        <div class="gis-remote-actions"><button type="button" class="primary" data-gis-action="remote-import">Import layer</button>${remoteDiscoveryTrail.length?'<button type="button" data-gis-action="remote-back">Choose another layer</button>':''}<button type="button" data-gis-action="remote-reset">Use another link</button></div>
      </div>`;
    }
    if(result.kind==='choose-layer'){
      const selectedCount=result.layers.filter(layer=>remoteSelectedLayerUrls.has(layer.url)).length;
      return `<div class="gis-remote-result">
        <div class="gis-remote-result-head"><div><strong>${html(result.title||result.name||'ArcGIS service')}</strong><span>${result.layers.length.toLocaleString()} available layer${result.layers.length===1?'':'s'} · choose one, several or all</span></div><span class="gis-found-badge">Service</span></div>
        <div class="gis-remote-choice-title"><strong>Choose a layer</strong><span>Select one, several or all</span></div><div class="gis-remote-layer-select-actions"><button type="button" data-gis-action="remote-select-all">Select all</button><button type="button" data-gis-action="remote-select-none">Clear</button><span>${selectedCount.toLocaleString()} selected</span></div>
        <div class="gis-remote-layer-list" role="group" aria-label="Available ArcGIS layers">${result.layers.map((layer,index)=>`<label class="gis-remote-layer-option"><input type="checkbox" data-gis-remote-layer value="${html(layer.url)}" ${remoteSelectedLayerUrls.has(layer.url)?'checked':''}><span><strong>${html(layer.name||`Layer ${index+1}`)}</strong><small>${html(layer.geometryLabel||layer.geometryType||'Spatial layer')}${layer.layerId!=null?` · Layer ${html(layer.layerId)}`:''}</small></span></label>`).join('')}</div>
        <div class="gis-remote-actions"><button type="button" class="primary" data-gis-action="remote-import-selected" ${selectedCount?'':'disabled'}>Import selected${selectedCount?` (${selectedCount})`:''}</button>${selectedCount===1?'<button type="button" data-gis-action="remote-preview-selected">Preview selected layer</button>':''}${remoteDiscoveryTrail.length?'<button type="button" data-gis-action="remote-back">Back to services</button>':''}<button type="button" data-gis-action="remote-reset">Use another link</button></div>
      </div>`;
    }
    if(result.kind==='choose-service'){
      const serviceOptions=result.services.map(service=>`<option value="${html(service.url)}">${html(service.name)} — ${html(service.serviceType)}</option>`).join('');
      const folderOptions=result.folders.map(folder=>`<option value="${html(folder.url)}">Folder: ${html(folder.name)}</option>`).join('');
      return `<div class="gis-remote-result">
        <div class="gis-remote-result-head"><div><strong>${html(result.title||'ArcGIS services directory')}</strong><span>${result.services.length.toLocaleString()} service${result.services.length===1?'':'s'}${result.folders.length?` · ${result.folders.length.toLocaleString()} folder${result.folders.length===1?'':'s'}`:''}</span></div><span class="gis-found-badge">Directory</span></div>
        <label class="gis-remote-choice">Choose a service or folder<select id="gisRemoteChoice">${serviceOptions}${folderOptions}</select></label>
        <div class="gis-remote-actions"><button type="button" class="primary" data-gis-action="remote-continue">Find layers</button>${remoteDiscoveryTrail.length?'<button type="button" data-gis-action="remote-back">Back</button>':''}<button type="button" data-gis-action="remote-reset">Use another link</button></div>
      </div>`;
    }
    return '';
  }

  function renderAddData(){
    return `<div class="gis-privacy-callout"><strong>Data boundary</strong><p>Local files and their geometry remain inside this browser. Remote tiles and services are contacted directly by your browser only when you add or display them. EditPolygon does not proxy these requests.</p></div>
      <section class="gis-add-section"><h3>Local browser data</h3><div class="gis-quick-actions"><button type="button" class="primary" data-gis-action="open-files">Open GIS files</button><button type="button" data-gis-action="open-image">Add image</button><button type="button" data-gis-action="open-overlays">Existing overlay tools</button></div><p class="gis-help">Use the browser-local importer for GeoJSON, KML/KMZ, GML, GeoPackage, Shapefile ZIP, zipped File Geodatabase, CSV, WKT, TopoJSON and project files.</p></section>
      <form class="gis-add-section" id="gisTileForm"><h3>XYZ, TMS or TileJSON</h3><div class="gis-form-grid">
        <label>Name<input id="gisTileName" required value="Custom tiles"></label>
        <label>Source type<select id="gisTileType"><option value="xyz">XYZ tiles</option><option value="tms">TMS tiles</option><option value="tilejson">TileJSON URL</option></select></label>
        <label class="gis-span-2">URL<input id="gisTileUrl" required placeholder="https://server/{z}/{x}/{y}.png"></label>
        <label>Use as<select id="gisTileRole"><option value="basemap">Basemap</option><option value="reference">Overlay</option></select></label>
        <label>Opacity<input id="gisTileOpacity" type="range" min="5" max="100" value="100"><span class="gis-range-value">100%</span></label>
        <label>Maximum zoom<input id="gisTileMaxZoom" type="number" min="1" max="30" value="22"></label>
        <label>Minimum zoom<input id="gisTileMinZoom" type="number" min="0" max="30" value="0"></label>
        <label class="gis-span-2">Attribution<input id="gisTileAttribution" placeholder="Required by many providers"></label>
      </div><div class="gis-form-actions"><button type="submit" class="primary">Add tile source</button><span class="gis-inline-status" id="gisTileStatus"></span></div></form>
      <form class="gis-add-section" id="gisWmsForm"><h3>WMS map service</h3><div class="gis-form-grid">
        <label>Name<input id="gisWmsName" required value="WMS layer"></label>
        <label>Use as<select id="gisWmsRole"><option value="reference">Overlay</option><option value="basemap">Basemap</option></select></label>
        <label class="gis-span-2">Service URL<input id="gisWmsUrl" required placeholder="https://example.com/geoserver/wms"></label>
        <label class="gis-span-2">Layer names<input id="gisWmsLayers" required placeholder="workspace:layer_name"></label>
        <label>Image format<select id="gisWmsFormat"><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option></select></label>
        <label>WMS version<select id="gisWmsVersion"><option value="1.3.0">1.3.0</option><option value="1.1.1">1.1.1</option></select></label>
        <label>Opacity<input id="gisWmsOpacity" type="range" min="5" max="100" value="80"><span class="gis-range-value">80%</span></label>
        <label class="gis-check"><input id="gisWmsTransparent" type="checkbox" checked> Transparent background</label>
      </div><div class="gis-form-actions"><button type="submit" class="primary">Add WMS</button><span class="gis-inline-status" id="gisWmsStatus"></span></div></form>
      <form class="gis-add-section" id="gisRemoteGeoJsonForm"><h3>Add web data</h3><div class="gis-form-grid">
        <label>Name<input id="gisRemoteName" value="${html(remoteForm.name)}"></label>
        <label>Import as<select id="gisRemoteMode"><option value="editable" ${remoteForm.mode==='editable'?'selected':''}>Editable local copy</option><option value="reference" ${remoteForm.mode==='reference'?'selected':''}>Read-only reference copy</option></select></label>
        <label class="gis-span-2">Paste a web data link<input id="gisRemoteUrl" required value="${html(remoteForm.url)}" placeholder="ArcGIS directory, service, layer, item page, query or GeoJSON URL"></label>
        <label>Layer colour<input id="gisRemoteColor" type="color" value="${html(remoteForm.color)}"></label>
      </div><p class="gis-help">Paste the link you have. EditPolygon will identify ArcGIS directories, services, layers, item pages and queries, build the data request, and retrieve all available records in batches. You do not need to add <code>/query</code> or JSON parameters yourself.</p>
      ${renderRemoteDiscovery()}
      ${(()=>{
        // A valid discovery card is the authoritative result. Never leave an
        // earlier discovery/parser error visible beside it. Import errors are
        // kept because they relate to the user's next action, not discovery.
        const visibleStatus=remoteDiscovery&&remoteStatus.scope==='discovery'?'':remoteStatus.message;
        const visibleKind=visibleStatus?remoteStatus.kind:'';
        const showActions=!remoteDiscovery||remoteDiscoveryBusy||!!visibleStatus;
        return showActions?`<div class="gis-form-actions">${!remoteDiscovery?`<button type="submit" class="primary" ${remoteDiscoveryBusy?'disabled':''}>${remoteDiscoveryBusy?'Finding data…':'Find data'}</button>`:''}<span class="gis-inline-status" id="gisRemoteStatus" data-kind="${html(visibleKind)}">${html(visibleStatus)}</span></div>`:'';
      })()}</form>`;
  }

  function renderBasemaps(){
    const basemaps=api.getLayers().filter(layer=>layer.role==='basemap');
    return `<div class="gis-pane-intro"><div><strong>Basemap manager</strong><p>Choose a built-in basemap or any custom XYZ, TMS, TileJSON or WMS source added as a basemap.</p></div><button type="button" class="primary" data-gis-action="go-add-basemap">Add basemap</button></div>
      <div class="gis-basemap-grid">${basemaps.map(layer=>`<article class="gis-basemap-card ${layer.visible?'active':''}" data-layer-key="${html(layer.key)}"><div class="gis-basemap-preview"><span>${html(sourceLabel(layer.sourceType))}</span></div><div class="gis-basemap-body"><strong>${html(layer.name)}</strong><div class="gis-layer-meta"><span class="gis-network ${layer.network==='remote'?'remote':'local'}">${layer.network==='remote'?'Remote request':'No network'}</span>${layer.kind==='custom'?'<span>Custom</span>':'<span>Built in</span>'}</div><div class="gis-basemap-actions"><button type="button" class="${layer.visible?'active':'primary'}" data-gis-action="visibility">${layer.visible?'Active':'Use basemap'}</button>${layer.removable?'<button type="button" class="danger" data-gis-action="remove">Remove</button>':''}</div></div></article>`).join('')}</div>`;
  }

  function renderProject(){
    const summary=api.localDataSummary();
    const remote=api.getLayers().filter(layer=>layer.network==='remote'&&layer.kind==='custom');
    return `<div class="gis-project-metrics"><div><strong>${summary.editableLayers}</strong><span>Editable layers</span></div><div><strong>${summary.editableFeatures.toLocaleString()}</strong><span>Features</span></div><div><strong>${summary.referenceLayers+summary.imageLayers}</strong><span>Local context layers</span></div><div><strong>${summary.customRemoteLayers}</strong><span>Custom remote sources</span></div></div>
      <section class="gis-add-section"><h3>Privacy architecture</h3><div class="gis-privacy-table"><div><span>Imported files and geometry</span><strong>Browser only</strong></div><div><span>Geometry processing and export</span><strong>Browser only</strong></div><div><span>Autosave and recovery</span><strong>This browser</strong></div><div><span>Remote tiles and services</span><strong>Direct to provider</strong></div><div><span>EditPolygon processing proxy</span><strong>Not used</strong></div></div><p class="gis-help">A remote provider can receive normal request information such as IP address and requested map tiles. Imported polygon coordinates are not included in tile requests.</p></section>
      <section class="gis-add-section"><h3>Remote source inventory</h3>${remote.length?remote.map(layer=>`<div class="gis-source-record"><div><strong>${html(layer.name)}</strong><span>${html(sourceLabel(layer.sourceType))}</span></div><span class="gis-network remote">Direct provider request</span></div>`).join(''):'<div class="gis-empty-small">No custom remote sources have been added.</div>'}</section>
      <section class="gis-add-section"><h3>Project tools</h3><div class="gis-quick-actions"><button type="button" data-gis-action="export-sources">Export source definitions</button><button type="button" data-gis-action="simple-workspace">Return to simple workspace</button></div><p class="gis-help">Source-definition export contains URLs and display settings, but no imported feature geometry.</p></section>`;
  }

  function renderBody(){
    if(!panel)return;
    const body=byId('gisPanelBody');
    if(!body)return;
    const content=activeTab==='add'?renderAddData():activeTab==='basemaps'?renderBasemaps():activeTab==='project'?renderProject():renderLayers();
    body.innerHTML=content;
    panel.querySelectorAll('[data-gis-tab]').forEach(button=>{
      const selected=button.dataset.gisTab===activeTab;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-selected',selected?'true':'false');
    });
  }

  function updatePanelGeometry(){
    if(!panel)return;
    const toolbar=document.querySelector('.compact-topbar')||document.querySelector('.toolbar');
    const sidebar=document.querySelector('.sidebar');
    const statusbar=document.querySelector('.statusbar');
    const top=Math.max(0,Math.round(toolbar?.getBoundingClientRect().bottom||49));
    const left=Math.max(0,Math.round(sidebar?.getBoundingClientRect().right||0));
    const bottom=Math.max(0,Math.round(window.innerHeight-(statusbar?.getBoundingClientRect().top||window.innerHeight)));
    panel.style.top=`${top}px`;panel.style.left=`${left}px`;panel.style.bottom=`${bottom}px`;
  }

  function render(){
    if(!ensureApi())return;
    createToggle();createPanel();
    const advanced=api.getWorkspaceMode()==='advanced';
    const toggle=byId('gisWorkspaceToggle');
    if(toggle){toggle.textContent=advanced?'Simple editor':'Advanced GIS';toggle.classList.toggle('active',advanced);toggle.setAttribute('aria-pressed',advanced?'true':'false');}
    panel.classList.toggle('active',advanced);
    updatePanelGeometry();
    if(advanced)renderBody();
  }

  function queueRender(){
    if(renderQueued)return;
    renderQueued=true;
    requestAnimationFrame(()=>{renderQueued=false;render();});
  }

  function layerKeyFrom(target){return target.closest('[data-layer-key]')?.dataset.layerKey||'';}

  function syncRemoteForm(){
    if(byId('gisRemoteName'))remoteForm.name=byId('gisRemoteName').value;
    if(byId('gisRemoteMode'))remoteForm.mode=byId('gisRemoteMode').value;
    if(byId('gisRemoteUrl'))remoteForm.url=byId('gisRemoteUrl').value;
    if(byId('gisRemoteColor'))remoteForm.color=byId('gisRemoteColor').value;
  }

  function setRemoteStatus(message='',kind='',scope=''){
    remoteStatus={message:String(message||''),kind:String(kind||''),scope:String(scope||'')};
    inlineStatus('gisRemoteStatus',remoteStatus.message,remoteStatus.kind);
  }

  function clearRemoteStatus(scope=''){
    if(scope&&remoteStatus.scope&&remoteStatus.scope!==scope)return;
    setRemoteStatus('','','');
  }

  async function discoverRemoteUrl(url,{preserveInput=false,pushCurrent=false,resetTrail=false}={}){
    syncRemoteForm();
    const target=String(url||remoteForm.url||'').trim();
    if(!target){setRemoteStatus('Paste a web data link first.','error','discovery');return;}
    if(resetTrail)remoteDiscoveryTrail=[];
    const previous=remoteDiscovery;
    if(pushCurrent&&previous)remoteDiscoveryTrail.push(previous);
    const requestId=++remoteDiscoveryRequestId;
    remoteDiscoveryBusy=true;
    remoteDiscovery=null;
    setRemoteStatus('Checking the address and looking for spatial data…','','discovery');
    render();
    try{
      const result=await api.discoverRemoteData({url:target});
      if(requestId!==remoteDiscoveryRequestId)return;
      remoteDiscovery=result;
      if(result.kind==='choose-layer'){
        const available=new Set((result.layers||[]).map(layer=>layer.url));
        remoteSelectedLayerUrls=new Set([...remoteSelectedLayerUrls].filter(url=>available.has(url)));
        if(!remoteSelectedLayerUrls.size&&result.layers?.[0]?.url)remoteSelectedLayerUrls.add(result.layers[0].url);
      }else if(result.kind!=='ready')remoteSelectedLayerUrls=new Set();
      if(!preserveInput)remoteForm.url=target;
      if(result.kind==='ready'&&!remoteNameEdited&&result?.name)remoteForm.name=result.name;
      // The card/chooser is now the authoritative successful state.
      clearRemoteStatus('discovery');
    }catch(error){
      if(requestId!==remoteDiscoveryRequestId)return;
      if(pushCurrent&&remoteDiscoveryTrail.length)remoteDiscovery=remoteDiscoveryTrail.pop();
      else remoteDiscovery=null;
      setRemoteStatus(error?.message||String(error),'error','discovery');
    }finally{
      if(requestId===remoteDiscoveryRequestId){
        remoteDiscoveryBusy=false;
        render();
      }
    }
  }

  async function importRemoteResult(){
    if(!remoteDiscovery||remoteDiscovery.kind!=='ready')return;
    syncRemoteForm();
    remoteDiscoveryBusy=true;
    setRemoteStatus('Importing the selected data…','','import');
    render();
    try{
      const result=await api.importRemoteGeoJson({
        url:remoteForm.url,
        name:remoteForm.name,
        mode:remoteForm.mode,
        color:remoteForm.color,
        discovery:remoteDiscovery,
        onProgress:progress=>{
          const loaded=Number(progress?.loaded||0),total=Number(progress?.total||0);
          setRemoteStatus(total?`Downloading ${loaded.toLocaleString()} of ${total.toLocaleString()} features…`:`Downloading features…`,'','import');
        }
      });
      const count=result.file?.features?.length||result.item?.data?.features?.length||0;
      setRemoteStatus(`Imported ${count.toLocaleString()} feature${count===1?'':'s'}.`,'ok','import');
      remoteDiscovery=null;
      remoteDiscoveryTrail=[];
      remoteForm={name:'Remote data',mode:remoteForm.mode,url:'',color:remoteForm.color};
      remoteNameEdited=false;
      activeTab='layers';
      setTimeout(render,200);
    }catch(error){
      setRemoteStatus(error?.message||String(error),'error','import');
    }finally{
      remoteDiscoveryBusy=false;
      if(activeTab==='add')render();
    }
  }


  async function importSelectedRemoteLayers(){
    if(!remoteDiscovery||remoteDiscovery.kind!=='choose-layer')return;
    syncRemoteForm();
    const selected=(remoteDiscovery.layers||[]).filter(layer=>remoteSelectedLayerUrls.has(layer.url));
    if(!selected.length){setRemoteStatus('Choose at least one layer to import.','error','import');render();return;}
    remoteDiscoveryBusy=true;
    setRemoteStatus(`Preparing ${selected.length} selected layer${selected.length===1?'':'s'}…`,'','import');
    render();
    try{
      const result=await api.importRemoteLayers({
        layers:selected,
        mode:remoteForm.mode,
        color:remoteForm.color,
        onProgress:progress=>{
          const layerNumber=Number(progress?.layerIndex||0)+1,layerCount=Number(progress?.layerCount||selected.length);
          const label=progress?.layerName||`Layer ${layerNumber}`;
          if(progress?.error)setRemoteStatus(`${label} failed: ${progress.error}`,'warn','import');
          else if(progress?.layerComplete)setRemoteStatus(`Completed ${layerNumber} of ${layerCount}: ${label}`,'','import');
          else{
            const loaded=Number(progress?.loaded||0),total=Number(progress?.total||0);
            setRemoteStatus(total?`Layer ${layerNumber} of ${layerCount}: ${label} — ${loaded.toLocaleString()} of ${total.toLocaleString()} features`:`Layer ${layerNumber} of ${layerCount}: ${label} — downloading…`,'','import');
          }
        }
      });
      const failed=result.failures?.length||0;
      setRemoteStatus(`Imported ${result.layerCount.toLocaleString()} layer${result.layerCount===1?'':'s'} and ${result.featureCount.toLocaleString()} feature${result.featureCount===1?'':'s'}${failed?`; ${failed} layer${failed===1?'':'s'} failed`:''}.`,failed?'warn':'ok','import');
      remoteDiscovery=null;remoteDiscoveryTrail=[];remoteSelectedLayerUrls=new Set();
      remoteForm={name:'Remote data',mode:remoteForm.mode,url:'',color:remoteForm.color};remoteNameEdited=false;activeTab='layers';setTimeout(render,250);
    }catch(error){setRemoteStatus(error?.message||String(error),'error','import');}
    finally{remoteDiscoveryBusy=false;if(activeTab==='add')render();}
  }

  async function handlePanelClick(event){
    if(!api)return;
    const groupAction=event.target.closest('[data-gis-group-action]');
    if(groupAction){
      const groupId=groupAction.closest('[data-group-id]')?.dataset.groupId;
      if(!groupId)return;
      if(groupAction.dataset.gisGroupAction==='rename'){
        const group=api.getGroups().find(item=>item.id===groupId);const name=prompt('Layer group name',group?.name||'Layer group');if(name)api.renameGroup(groupId,name);
      }else if(groupAction.dataset.gisGroupAction==='remove'&&confirm('Remove this group? Layers will remain in the project.'))api.removeGroup(groupId);
      return;
    }
    const button=event.target.closest('[data-gis-action]');
    if(!button)return;
    const action=button.dataset.gisAction;
    const key=layerKeyFrom(button);
    if(action==='visibility'&&key){const layer=api.getLayers().find(item=>item.key===key);if(layer)api.setLayerVisibility(key,!layer.visible);}
    else if(action==='zoom'&&key){if(!api.zoomLayer(key))status('This layer has no known bounds.','warn');}
    else if(action==='rename'&&key){const layer=api.getLayers().find(item=>item.key===key);const name=prompt('Layer name',layer?.name||'');if(name)api.renameLayer(key,name);}
    else if(action==='remove'&&key){const layer=api.getLayers().find(item=>item.key===key);if(layer&&confirm(`Remove “${layer.name}” from this project?`))api.removeLayer(key);}
    else if(action==='up'&&key)api.moveLayer(key,-1);
    else if(action==='down'&&key)api.moveLayer(key,1);
    else if(action==='new-group'){const name=prompt('New layer group name','New group');if(name)api.addGroup(name);}
    else if(action==='open-files')api.openLocalFiles();
    else if(action==='open-image')api.openImageOverlay();
    else if(action==='open-overlays')api.openReferenceOverlay();
    else if(action==='go-add-basemap'){activeTab='add';render();setTimeout(()=>byId('gisTileName')?.focus(),0);}
    else if(action==='export-sources')api.exportSourceDefinitions();
    else if(action==='simple-workspace')api.setWorkspaceMode('simple');
    else if(action==='remote-continue'){
      const choice=byId('gisRemoteChoice')?.value;
      if(choice)await discoverRemoteUrl(choice,{preserveInput:true,pushCurrent:true});
    }
    else if(action==='remote-select-all'){
      remoteSelectedLayerUrls=new Set((remoteDiscovery?.layers||[]).map(layer=>layer.url));render();
    }
    else if(action==='remote-select-none'){
      remoteSelectedLayerUrls=new Set();render();
    }
    else if(action==='remote-preview-selected'){
      const choice=[...remoteSelectedLayerUrls][0];
      if(choice)await discoverRemoteUrl(choice,{preserveInput:true,pushCurrent:true});
    }
    else if(action==='remote-import-selected')await importSelectedRemoteLayers();
    else if(action==='remote-back'){
      syncRemoteForm();
      if(remoteDiscoveryTrail.length){
        remoteDiscoveryRequestId++;
        remoteDiscovery=remoteDiscoveryTrail.pop();
        if(remoteDiscovery?.kind==='choose-layer'){const available=new Set((remoteDiscovery.layers||[]).map(layer=>layer.url));remoteSelectedLayerUrls=new Set([...remoteSelectedLayerUrls].filter(url=>available.has(url)));if(!remoteSelectedLayerUrls.size&&remoteDiscovery.layers?.[0]?.url)remoteSelectedLayerUrls.add(remoteDiscovery.layers[0].url);}else remoteSelectedLayerUrls=new Set();
        remoteStatus={message:'',kind:'',scope:''};
        render();
      }
    }
    else if(action==='remote-import')await importRemoteResult();
    else if(action==='remote-reset'){
      syncRemoteForm();remoteDiscoveryRequestId++;remoteDiscovery=null;remoteDiscoveryTrail=[];remoteSelectedLayerUrls=new Set();remoteStatus={message:'',kind:'',scope:''};remoteForm.url='';if(!remoteNameEdited)remoteForm.name='Remote data';render();setTimeout(()=>byId('gisRemoteUrl')?.focus(),0);
    }
  }

  function handlePanelChange(event){
    const opacity=event.target.closest('[data-gis-opacity]');
    if(opacity){const key=layerKeyFrom(opacity);if(key)api.setLayerOpacity(key,Number(opacity.value)/100);return;}
    const group=event.target.closest('[data-gis-group]');
    if(group){const key=layerKeyFrom(group);if(key)api.assignLayer(key,group.value||null);return;}
    if(event.target.id==='gisTileType'){
      const input=byId('gisTileUrl');
      if(input)input.placeholder=event.target.value==='tilejson'?'https://server/style/tilejson.json':'https://server/{z}/{x}/{y}.png';
    }
    if(event.target.id==='gisRemoteMode')remoteForm.mode=event.target.value;
    if(event.target.matches('[data-gis-remote-layer]')){
      if(event.target.checked)remoteSelectedLayerUrls.add(event.target.value);else remoteSelectedLayerUrls.delete(event.target.value);
      render();
    }
  }

  function handlePanelInput(event){
    const opacity=event.target.closest('[data-gis-opacity]');
    if(opacity){
      opacity.parentElement.querySelector('span').textContent=`${opacity.value}%`;
      return;
    }
    if(['gisTileOpacity','gisWmsOpacity'].includes(event.target.id)){
      const span=event.target.parentElement.querySelector('.gis-range-value');if(span)span.textContent=`${event.target.value}%`;
    }
    if(event.target.id==='gisRemoteName'){remoteForm.name=event.target.value;remoteNameEdited=true;}
    else if(event.target.id==='gisRemoteUrl'){
      const nextUrl=event.target.value;
      const changed=nextUrl.trim()!==String(remoteForm.url||'').trim();
      remoteForm.url=nextUrl;
      if(remoteDiscovery&&changed){
        remoteDiscoveryRequestId++;remoteDiscoveryBusy=false;remoteDiscovery=null;remoteDiscoveryTrail=[];remoteSelectedLayerUrls=new Set();remoteStatus={message:'Link changed. Click Find data to check it.',kind:'',scope:'discovery'};
        panel?.querySelector('.gis-remote-result')?.remove();
        inlineStatus('gisRemoteStatus',remoteStatus.message,'');
      }
    }
    else if(event.target.id==='gisRemoteColor')remoteForm.color=event.target.value;
  }

  function inlineStatus(id,message,kind=''){
    const el=byId(id);if(!el)return;el.textContent=message;el.dataset.kind=kind;
  }

  async function handlePanelSubmit(event){
    event.preventDefault();
    if(event.target.id==='gisTileForm'){
      inlineStatus('gisTileStatus','Adding source…');
      try{
        const selectedRole=byId('gisTileRole').value;
        await api.addRemoteLayer({source:{type:byId('gisTileType').value,name:byId('gisTileName').value,url:byId('gisTileUrl').value,attribution:byId('gisTileAttribution').value,minZoom:Number(byId('gisTileMinZoom').value),maxZoom:Number(byId('gisTileMaxZoom').value)},layer:{name:byId('gisTileName').value,role:selectedRole,opacity:Number(byId('gisTileOpacity').value)/100}});
        inlineStatus('gisTileStatus','Added.','ok');activeTab=selectedRole==='basemap'?'basemaps':'layers';setTimeout(render,200);
      }catch(err){inlineStatus('gisTileStatus',err.message||String(err),'error');}
    }else if(event.target.id==='gisWmsForm'){
      inlineStatus('gisWmsStatus','Adding WMS…');
      try{
        const selectedRole=byId('gisWmsRole').value;
        await api.addRemoteLayer({source:{type:'wms',name:byId('gisWmsName').value,url:byId('gisWmsUrl').value,wmsLayers:byId('gisWmsLayers').value,wmsFormat:byId('gisWmsFormat').value,wmsVersion:byId('gisWmsVersion').value,transparent:byId('gisWmsTransparent').checked,maxZoom:22},layer:{name:byId('gisWmsName').value,role:selectedRole,opacity:Number(byId('gisWmsOpacity').value)/100}});
        inlineStatus('gisWmsStatus','Added.','ok');activeTab=selectedRole==='basemap'?'basemaps':'layers';setTimeout(render,200);
      }catch(err){inlineStatus('gisWmsStatus',err.message||String(err),'error');}
    }else if(event.target.id==='gisRemoteGeoJsonForm'){
      syncRemoteForm();
      await discoverRemoteUrl(remoteForm.url,{resetTrail:true});
    }
  }

  function init(){
    if(!ensureApi()){
      setTimeout(init,50);
      return;
    }
    createToggle();createPanel();
    window.addEventListener('editpolygon:gis-changed',queueRender);
    window.addEventListener('resize',updatePanelGeometry);
    if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(updatePanelGeometry);const toolbar=document.querySelector('.compact-topbar')||document.querySelector('.toolbar');const sidebar=document.querySelector('.sidebar');if(toolbar)observer.observe(toolbar);if(sidebar)observer.observe(sidebar);panel.__gisResizeObserver=observer;}
    render();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
