/* EditPolygon mobile compatibility controller · v1.51.2
   Map-first mobile shell, stable project menu, off-canvas drawers and compact
   context controls. Desktop behaviour is left to the main application. */
(()=>{
  'use strict';

  const VERSION='1.51.2';
  const MOBILE_QUERY='(max-width: 860px), (pointer: coarse) and (max-width: 1024px)';
  const mq=window.matchMedia?window.matchMedia(MOBILE_QUERY):null;
  const $=id=>document.getElementById(id);
  const body=document.body;
  const app=document.querySelector('.app');
  const rail=$('toolRail');
  const sidebar=document.querySelector('.sidebar');
  const inspector=$('selectedSection');
  const inspectorPanel=$('selectedPanel');
  const selectedState=$('selectedState');
  const desktopTopMenu=$('topMoreMenu');
  const topMenuButton=$('topMoreBtn');
  if(!body||!app||!rail||!sidebar||!inspector)return;

  let activeDrawer=null;
  let lastDrawerTrigger=null;
  let projectMenuOpen=false;
  let contextSheetOpen=false;
  let layoutRaf=0;
  let contextRaf=0;
  let previousSelectedState=(selectedState?.textContent||'').trim();

  function isMobile(){return !!(mq&&mq.matches);}
  function scheduleLayoutRefresh(){
    if(layoutRaf)return;
    layoutRaf=requestAnimationFrame(()=>{
      layoutRaf=0;
      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    });
  }
  function scheduleContextRefresh(){
    if(contextRaf)return;
    contextRaf=requestAnimationFrame(()=>{
      contextRaf=0;
      updateMobileContext();
    });
  }
  function closeRailFlyouts(){
    document.querySelectorAll('.rail-flyout.active').forEach(node=>node.classList.remove('active'));
  }
  function closeDesktopTopMenu(){
    desktopTopMenu?.classList.remove('active');
    if(!projectMenuOpen)topMenuButton?.setAttribute('aria-expanded','false');
  }
  function drawerFor(name){return name==='layers'?sidebar:name==='inspector'?inspector:null;}
  function drawerButton(name){return rail.querySelector(`[data-v151-drawer="${name}"]`);}

  function updateDrawerA11y(){
    for(const name of ['layers','inspector']){
      const panel=drawerFor(name),button=drawerButton(name),open=activeDrawer===name&&isMobile();
      panel?.classList.toggle('v151-mobile-drawer-open',open);
      panel?.setAttribute('aria-hidden',open?'false':'true');
      if(open){panel?.setAttribute('role','dialog');panel?.setAttribute('aria-modal','true');}
      else{panel?.removeAttribute('aria-modal');if(!isMobile())panel?.removeAttribute('role');}
      button?.setAttribute('aria-expanded',open?'true':'false');
    }
    body.classList.toggle('v151-mobile-drawer-active',!!activeDrawer&&isMobile());
  }
  function closeDrawer({restoreFocus=false}={}){
    if(!activeDrawer)return;
    const focusTarget=lastDrawerTrigger;
    activeDrawer=null;
    updateDrawerA11y();
    scheduleLayoutRefresh();
    if(restoreFocus&&focusTarget instanceof HTMLElement){
      requestAnimationFrame(()=>focusTarget.focus({preventScroll:true}));
    }
  }
  function resetDrawerScroll(name){
    const panel=drawerFor(name);
    if(!panel)return;
    panel.scrollTop=0;
    const scrollers=name==='layers'
      ? [panel.querySelector('#projectSection'),panel.querySelector('#filesSection')]
      : [panel.querySelector('#selectedPanel')];
    scrollers.forEach(node=>{if(node)node.scrollTop=0;});
  }
  function openDrawer(name,trigger=null){
    if(!isMobile())return;
    const panel=drawerFor(name);if(!panel)return;
    closeRailFlyouts();
    closeProjectMenu();
    closeContextSheet();
    activeDrawer=name;
    lastDrawerTrigger=trigger||drawerButton(name);
    resetDrawerScroll(name);
    updateDrawerA11y();
    scheduleLayoutRefresh();
    requestAnimationFrame(()=>panel.querySelector('.v151-mobile-drawer-close')?.focus({preventScroll:true}));
  }
  function toggleDrawer(name,trigger){
    activeDrawer===name?closeDrawer({restoreFocus:true}):openDrawer(name,trigger);
  }

  function makeDrawerHeader(panel,title,name){
    let head=panel.querySelector(':scope > .v151-mobile-drawer-head');
    if(head)return head;
    head=document.createElement('div');
    head.className='v151-mobile-drawer-head';
    head.innerHTML=`<span class="v151-mobile-drawer-title"><strong>${title}</strong><small data-v151-drawer-state></small></span><button class="v151-mobile-drawer-close" type="button" aria-label="Close ${title}">×</button>`;
    head.querySelector('button').addEventListener('click',()=>closeDrawer({restoreFocus:true}));
    panel.insertBefore(head,panel.firstChild);
    head.dataset.v151DrawerHead=name;
    return head;
  }

  function mobileButton(name,label,svg){
    const button=document.createElement('button');
    button.type='button';
    button.className='rail-btn v151-mobile-only v151-mobile-drawer-button';
    button.dataset.v151Drawer=name;
    button.title=`Open ${label}`;
    button.setAttribute('aria-label',`Open ${label}`);
    button.setAttribute('aria-expanded','false');
    button.innerHTML=`<span class="ico">${svg}</span><span class="lbl">${label}</span><span class="v151-mobile-badge" aria-hidden="true"></span>`;
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleDrawer(name,button);});
    return button;
  }
  function installDockButtons(){
    if(rail.querySelector('[data-v151-drawer="layers"]'))return;
    const layers=mobileButton('layers','Layers','<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"></path><path d="M7 4v4M12 10v4M17 16v4"></path></svg>');
    const inspect=mobileButton('inspector','Inspector','<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"></circle><path d="M15.5 15.5L21 21"></path><path d="M11 8v6M8 11h6"></path></svg>');
    rail.insertBefore(layers,rail.firstChild);
    const select=rail.querySelector('[data-rail="select"]');
    if(select?.nextSibling)rail.insertBefore(inspect,select.nextSibling);else rail.appendChild(inspect);
  }

  function safeClick(id){
    const target=$(id);
    if(!target||target.disabled)return false;
    target.click();
    return true;
  }
  function copyOptions(source,target){
    if(!source||!target)return;
    target.innerHTML='';
    for(const option of source.options){
      const clone=option.cloneNode(true);
      target.appendChild(clone);
    }
    target.value=source.value;
    target.addEventListener('change',()=>{
      source.value=target.value;
      source.dispatchEvent(new Event('change',{bubbles:true}));
    });
    source.addEventListener('change',()=>{target.value=source.value;});
  }

  /* Mobile project menu is deliberately separate from the desktop dropdown.
     This avoids inherited desktop menu layout, stale scroll positions and the
     malformed partial menu seen on narrow Android browsers. */
  function installProjectMenu(){
    if($('v151MobileProjectMenu'))return;
    const backdrop=document.createElement('div');
    backdrop.id='v151MobileProjectBackdrop';
    backdrop.className='v151-mobile-project-backdrop';
    backdrop.setAttribute('aria-hidden','true');

    const panel=document.createElement('section');
    panel.id='v151MobileProjectMenu';
    panel.className='v151-mobile-project-menu';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-labelledby','v151MobileProjectTitle');
    panel.setAttribute('aria-hidden','true');
    panel.innerHTML=`
      <header class="v151-mobile-sheet-head">
        <span><strong id="v151MobileProjectTitle">Project actions</strong><small>Save, export and application tools</small></span>
        <button type="button" class="v151-mobile-sheet-close" aria-label="Close project actions">×</button>
      </header>
      <div class="v151-mobile-sheet-body" id="v151MobileProjectBody">
        <section class="v151-mobile-menu-section">
          <h3>Project</h3>
          <div class="v151-mobile-action-grid">
            <button type="button" data-v151-proxy="saveBtn">Save</button>
            <button type="button" data-v151-proxy="undoBtn">Undo</button>
            <button type="button" data-v151-proxy="redoBtn">Redo</button>
            <button type="button" data-v151-proxy="fitAllBtn">Fit map</button>
            <button type="button" data-v151-open-drawer="layers">Layers</button>
            <button type="button" data-v151-open-drawer="inspector">Inspector</button>
          </div>
        </section>
        <section class="v151-mobile-menu-section">
          <h3>Export</h3>
          <div class="v151-mobile-menu-fields">
            <label>Scope<select id="v151MobileExportScope"></select></label>
            <label>Format<select id="v151MobileExportFormat"></select></label>
          </div>
          <button class="primary v151-mobile-wide-action" type="button" data-v151-proxy="exportBtn">Export file</button>
        </section>
        <section class="v151-mobile-menu-section">
          <h3>Map</h3>
          <div class="v151-mobile-menu-fields">
            <label>Basemap<select id="v151MobileBasemap"></select></label>
            <button type="button" id="v151MobileThemeToggle">Day / night</button>
          </div>
          <label>Find a place or coordinate
            <span class="v151-mobile-location"><input id="v151MobileLocation" type="text" inputmode="search" placeholder="Place or lat, lng"><button class="primary" id="v151MobileLocationGo" type="button">Go</button></span>
          </label>
        </section>
        <section class="v151-mobile-menu-section">
          <h3>Tools</h3>
          <div class="v151-mobile-list-actions">
            <button type="button" data-v151-proxy="restoreAutosaveBtn">Restore autosave</button>
            <button type="button" data-v151-proxy="converterOpenBtn">Convert formats</button>
            <button type="button" data-v151-proxy="validatorOpenBtn">Validate / repair polygons</button>
            <button type="button" data-v151-proxy="topMenuCommandProxy">Command palette</button>
          </div>
        </section>
        <section class="v151-mobile-menu-section">
          <h3>Help</h3>
          <div class="v151-mobile-list-actions">
            <button type="button" data-v151-proxy="aboutEditPolygonBtn">Help, about &amp; privacy</button>
            <a href="mailto:feedback@editpolygon.com">Send feedback</a>
            <button class="danger" type="button" data-v151-proxy="clearBtn">Clear project</button>
          </div>
        </section>
      </div>`;
    document.body.append(backdrop,panel);

    panel.querySelector('.v151-mobile-sheet-close')?.addEventListener('click',()=>closeProjectMenu({restoreFocus:true}));
    backdrop.addEventListener('click',()=>closeProjectMenu({restoreFocus:true}));
    panel.querySelectorAll('[data-v151-proxy]').forEach(button=>button.addEventListener('click',()=>{
      const id=button.dataset.v151Proxy;
      closeProjectMenu();
      requestAnimationFrame(()=>safeClick(id));
    }));
    panel.querySelectorAll('[data-v151-open-drawer]').forEach(button=>button.addEventListener('click',()=>{
      const name=button.dataset.v151OpenDrawer;
      closeProjectMenu();
      requestAnimationFrame(()=>openDrawer(name,drawerButton(name)));
    }));

    copyOptions($('exportScope'),$('v151MobileExportScope'));
    copyOptions($('exportFormat'),$('v151MobileExportFormat'));
    copyOptions($('basemap'),$('v151MobileBasemap'));

    $('v151MobileThemeToggle')?.addEventListener('click',()=>safeClick('themeToggleBtn'));
    const mobileLocation=$('v151MobileLocation'),sourceLocation=$('locationSearchInput');
    const runLocation=()=>{
      if(sourceLocation&&mobileLocation)sourceLocation.value=mobileLocation.value;
      closeProjectMenu();
      requestAnimationFrame(()=>safeClick('locationSearchBtn'));
    };
    $('v151MobileLocationGo')?.addEventListener('click',runLocation);
    mobileLocation?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runLocation();}});
    sourceLocation?.addEventListener('input',()=>{
      if(mobileLocation&&document.activeElement!==mobileLocation)mobileLocation.value=sourceLocation.value;
    });
  }
  function openProjectMenu(){
    if(!isMobile())return;
    closeDrawer();
    closeRailFlyouts();
    closeContextSheet();
    closeDesktopTopMenu();
    const panel=$('v151MobileProjectMenu'),backdrop=$('v151MobileProjectBackdrop');
    if(!panel||!backdrop)return;
    projectMenuOpen=true;
    body.classList.add('v151-mobile-project-menu-active');
    panel.classList.add('active');
    backdrop.classList.add('active');
    panel.setAttribute('aria-hidden','false');
    backdrop.setAttribute('aria-hidden','false');
    topMenuButton?.setAttribute('aria-expanded','true');
    const bodyScroller=$('v151MobileProjectBody');
    if(bodyScroller)bodyScroller.scrollTop=0;
    requestAnimationFrame(()=>panel.querySelector('.v151-mobile-sheet-close')?.focus({preventScroll:true}));
  }
  function closeProjectMenu({restoreFocus=false}={}){
    if(!projectMenuOpen){closeDesktopTopMenu();return;}
    projectMenuOpen=false;
    body.classList.remove('v151-mobile-project-menu-active');
    const panel=$('v151MobileProjectMenu'),backdrop=$('v151MobileProjectBackdrop');
    panel?.classList.remove('active');
    backdrop?.classList.remove('active');
    panel?.setAttribute('aria-hidden','true');
    backdrop?.setAttribute('aria-hidden','true');
    topMenuButton?.setAttribute('aria-expanded','false');
    if(restoreFocus)requestAnimationFrame(()=>topMenuButton?.focus({preventScroll:true}));
  }
  function toggleProjectMenu(){projectMenuOpen?closeProjectMenu({restoreFocus:true}):openProjectMenu();}

  function buttonSpec(label,id,{primary=false,danger=false,disabled=false}={}){
    return {label,id,primary,danger,disabled};
  }
  function currentSelectionLabel(){
    const text=(selectedState?.textContent||'').trim();
    return text&&!/^(none|no selection)$/i.test(text)?text:'';
  }
  function isModeActive(){
    return body.classList.contains('draw-active')||body.classList.contains('mode-draw-active')||
      body.classList.contains('vertex-editing')||body.classList.contains('measure-active')||
      body.classList.contains('image-overlay-selected')||body.classList.contains('mode-geometry-preview');
  }
  function contextDefinition(){
    const modeBanner=$('modeBanner');
    const bannerTitle=($('modeBannerTitle')?.textContent||'').trim();
    const bannerHint=($('modeBannerHint')?.textContent||'').trim();
    const selection=currentSelectionLabel();

    if(body.classList.contains('mode-geometry-preview')){
      return {kind:'preview',title:bannerTitle||'Geometry preview',detail:bannerHint,actions:[buttonSpec('Run','geometryPreviewApplyBtn',{primary:true}),buttonSpec('Close','geometryPreviewCloseBtn')]};
    }
    if(body.classList.contains('vertex-editing')){
      return {kind:'vertex',title:selection?`Editing ${selection}`:'Editing polygon',detail:'Drag vertices on the map',actions:[buttonSpec('Midpoints','addVertexModeBtn'),{label:'More',sheet:'vertex'},buttonSpec('Done','doneVerticesBtn',{primary:true})]};
    }
    if(body.classList.contains('draw-active')||body.classList.contains('mode-draw-active')){
      return {kind:'draw',title:bannerTitle||($('drawModeLabel')?.textContent||'Drawing'),detail:bannerHint||($('drawModeHint')?.textContent||''),actions:[buttonSpec('Undo','undoDrawBtn'),buttonSpec('Finish','modeBannerFinishBtn',{primary:true}),buttonSpec('Cancel','modeBannerCancelBtn')]};
    }
    if(body.classList.contains('measure-active')){
      return {kind:'measure',title:($('measureModeLabel')?.textContent||'Measure').trim(),detail:'Tap the map to continue',actions:[buttonSpec('Finish','finishMeasureBtn',{primary:true}),buttonSpec('Save','saveMeasureBtn'),{label:'More',sheet:'measure'}]};
    }
    if(body.classList.contains('image-overlay-selected')){
      return {kind:'image',title:($('imageOverlayTitle')?.textContent||'Image overlay').trim(),detail:'Image selected',actions:[buttonSpec('Move','imageOverlayMoveBtn'),{label:'More',sheet:'image'},buttonSpec('Done','imageOverlayDeselectBtn',{primary:true})]};
    }
    if(modeBanner?.classList.contains('active')&&modeBanner.dataset.kind&&modeBanner.dataset.kind!=='select'){
      return {kind:'mode',title:bannerTitle||'Active tool',detail:bannerHint,actions:[buttonSpec('Finish','modeBannerFinishBtn',{primary:true}),buttonSpec('Cancel','modeBannerCancelBtn')]};
    }
    if(selection){
      return {kind:'selection',title:selection,detail:'Selected feature',actions:[buttonSpec('Edit','editVerticesBtn',{primary:true}),{label:'More',sheet:'selection'},buttonSpec('Inspector',null,{})]};
    }
    return null;
  }

  function installContextUi(){
    if($('v151MobileContextBar'))return;
    const bar=document.createElement('div');
    bar.id='v151MobileContextBar';
    bar.className='v151-mobile-context-bar';
    bar.setAttribute('aria-live','polite');
    bar.innerHTML=`<span class="v151-mobile-context-copy"><strong id="v151MobileContextTitle"></strong><small id="v151MobileContextDetail"></small></span><span class="v151-mobile-context-actions" id="v151MobileContextActions"></span>`;

    const backdrop=document.createElement('div');
    backdrop.id='v151MobileContextBackdrop';
    backdrop.className='v151-mobile-context-backdrop';
    backdrop.setAttribute('aria-hidden','true');

    const sheet=document.createElement('section');
    sheet.id='v151MobileContextSheet';
    sheet.className='v151-mobile-context-sheet';
    sheet.setAttribute('role','dialog');
    sheet.setAttribute('aria-modal','true');
    sheet.setAttribute('aria-hidden','true');
    sheet.innerHTML=`<header class="v151-mobile-sheet-head"><span><strong id="v151MobileContextSheetTitle">More actions</strong><small>Actions for the current map item</small></span><button type="button" class="v151-mobile-sheet-close" aria-label="Close actions">×</button></header><div class="v151-mobile-context-sheet-body" id="v151MobileContextSheetBody"></div>`;
    document.body.append(bar,backdrop,sheet);
    backdrop.addEventListener('click',()=>closeContextSheet());
    sheet.querySelector('.v151-mobile-sheet-close')?.addEventListener('click',()=>closeContextSheet({restoreFocus:true}));
  }
  function contextSheetActions(kind){
    if(kind==='selection')return [
      buttonSpec('Open Inspector',null),buttonSpec('Zoom to feature','zoomBtn'),buttonSpec('Duplicate','duplicateBtn'),
      buttonSpec('Copy style','polygonCtxCopyStyleBtn'),buttonSpec('Paste style','polygonCtxPasteStyleBtn'),buttonSpec('Solo feature','polygonCtxSoloBtn'),
      buttonSpec('Delete feature','deletePolygonBtn',{danger:true})
    ];
    if(kind==='vertex')return [
      buttonSpec('Lasso vertices','lassoBtn'),buttonSpec('Toggle midpoints','addVertexModeBtn'),buttonSpec('Toggle snapping','snapToggleBtn'),
      buttonSpec('Toggle topology','topologyToggleBtn'),buttonSpec('Clear vertex selection','clearVerticesBtn'),buttonSpec('Delete selected vertices','deleteVerticesBtn',{danger:true})
    ];
    if(kind==='image')return [
      buttonSpec('Move','imageOverlayMoveBtn'),buttonSpec('Resize','imageOverlayResizeBtn'),buttonSpec('Stretch','imageOverlayStretchBtn'),
      buttonSpec('Rotate','imageOverlayRotateBtn'),buttonSpec('Perspective','imageOverlayPerspectiveBtn'),buttonSpec('Zoom to image','imageOverlayFitBtn'),
      buttonSpec('Lock / unlock','imageOverlayLockBtn'),buttonSpec('Hide','imageOverlayHideBtn'),buttonSpec('Delete image','imageOverlayDeleteBtn',{danger:true})
    ];
    if(kind==='measure')return [
      buttonSpec('Text style','measureStyleToggleBtn'),buttonSpec('Save overlay','saveMeasureBtn'),buttonSpec('Delete measurement','deleteMeasureBtn',{danger:true}),buttonSpec('Cancel','cancelMeasureBtn')
    ];
    return [];
  }
  function openContextSheet(kind,trigger){
    if(!isMobile())return;
    const sheet=$('v151MobileContextSheet'),backdrop=$('v151MobileContextBackdrop'),container=$('v151MobileContextSheetBody');
    if(!sheet||!backdrop||!container)return;
    const actions=contextSheetActions(kind);
    container.innerHTML='';
    for(const action of actions){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=action.label;
      if(action.primary)button.classList.add('primary');
      if(action.danger)button.classList.add('danger');
      button.disabled=!!action.disabled;
      button.addEventListener('click',()=>{
        closeContextSheet();
        if(action.id)safeClick(action.id);
        else if(action.label==='Open Inspector')openDrawer('inspector',drawerButton('inspector'));
      });
      container.appendChild(button);
    }
    $('v151MobileContextSheetTitle').textContent=kind==='selection'?'Selected feature':kind==='vertex'?'Vertex editing':kind==='image'?'Image actions':'Measurement actions';
    contextSheetOpen=true;
    body.classList.add('v151-mobile-context-sheet-active');
    sheet.classList.add('active');backdrop.classList.add('active');
    sheet.setAttribute('aria-hidden','false');backdrop.setAttribute('aria-hidden','false');
    sheet.dataset.triggerId=trigger?.id||'';
    requestAnimationFrame(()=>sheet.querySelector('.v151-mobile-sheet-close')?.focus({preventScroll:true}));
  }
  function closeContextSheet({restoreFocus=false}={}){
    if(!contextSheetOpen)return;
    const sheet=$('v151MobileContextSheet'),backdrop=$('v151MobileContextBackdrop');
    const triggerId=sheet?.dataset.triggerId;
    contextSheetOpen=false;
    body.classList.remove('v151-mobile-context-sheet-active');
    sheet?.classList.remove('active');backdrop?.classList.remove('active');
    sheet?.setAttribute('aria-hidden','true');backdrop?.setAttribute('aria-hidden','true');
    if(restoreFocus&&triggerId)requestAnimationFrame(()=>$(`${triggerId}`)?.focus({preventScroll:true}));
  }
  function updateMobileContext(){
    const bar=$('v151MobileContextBar');
    if(!bar)return;
    if(!isMobile()){
      bar.classList.remove('active');
      body.classList.remove('v151-mobile-context-active');
      return;
    }
    const definition=contextDefinition();
    if(!definition){
      bar.classList.remove('active');
      body.classList.remove('v151-mobile-context-active');
      return;
    }
    $('v151MobileContextTitle').textContent=definition.title;
    $('v151MobileContextDetail').textContent=definition.detail||'';
    const actions=$('v151MobileContextActions');
    actions.innerHTML='';
    definition.actions.forEach((action,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.textContent=action.label;
      button.id=`v151MobileContextAction${index}`;
      if(action.primary)button.classList.add('primary');
      if(action.danger)button.classList.add('danger');
      button.disabled=!!action.disabled;
      button.addEventListener('click',()=>{
        if(action.sheet){openContextSheet(action.sheet,button);return;}
        if(action.label==='Inspector'){openDrawer('inspector',drawerButton('inspector'));return;}
        if(action.id)safeClick(action.id);
        scheduleContextRefresh();
      });
      actions.appendChild(button);
    });
    bar.dataset.kind=definition.kind;
    bar.classList.add('active');
    body.classList.add('v151-mobile-context-active');
  }

  function updateBadges(){
    const layersBadge=drawerButton('layers')?.querySelector('.v151-mobile-badge');
    const inspectorBadge=drawerButton('inspector')?.querySelector('.v151-mobile-badge');
    if(layersBadge){
      const count=document.querySelectorAll('#fileList .file-card').length||0;
      layersBadge.textContent=count>99?'99+':String(count);
      layersBadge.classList.toggle('active',count>0);
    }
    if(inspectorBadge){
      const state=currentSelectionLabel();
      inspectorBadge.textContent='1';
      inspectorBadge.classList.toggle('active',!!state);
    }
    const inspectorHead=inspector.querySelector(':scope > .v151-mobile-drawer-head [data-v151-drawer-state]');
    if(inspectorHead)inspectorHead.textContent=currentSelectionLabel()||'No selection';
  }

  function applyMode(){
    const mobile=isMobile();
    body.classList.toggle('v151-mobile-layout',mobile);
    if(!mobile){
      activeDrawer=null;
      closeProjectMenu();
      closeContextSheet();
      body.classList.remove('v151-mobile-drawer-active');
      for(const panel of [sidebar,inspector]){
        panel.classList.remove('v151-mobile-drawer-open');
        panel.removeAttribute('aria-hidden');
        panel.removeAttribute('aria-modal');
        panel.removeAttribute('role');
      }
      document.querySelectorAll('[data-v151-drawer]').forEach(button=>button.setAttribute('aria-expanded','false'));
    }else{
      sidebar.setAttribute('aria-hidden',activeDrawer==='layers'?'false':'true');
      inspector.setAttribute('aria-hidden',activeDrawer==='inspector'?'false':'true');
      closeDesktopTopMenu();
    }
    updateMobileContext();
    scheduleLayoutRefresh();
  }

  makeDrawerHeader(sidebar,'Project & layers','layers');
  makeDrawerHeader(inspector,'Inspector','inspector');
  installDockButtons();
  installProjectMenu();
  installContextUi();

  const drawerBackdrop=document.createElement('div');
  drawerBackdrop.id='v151MobileBackdrop';
  drawerBackdrop.className='v151-mobile-backdrop';
  drawerBackdrop.setAttribute('aria-hidden','true');
  drawerBackdrop.addEventListener('click',()=>closeDrawer({restoreFocus:true}));
  app.appendChild(drawerBackdrop);

  rail.addEventListener('click',event=>{
    if(event.target.closest('[data-rail]')){closeDrawer();closeProjectMenu();closeContextSheet();}
  },true);

  /* Capture phase prevents the desktop dropdown handler from running on mobile. */
  topMenuButton?.addEventListener('click',event=>{
    if(!isMobile())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleProjectMenu();
  },true);

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(contextSheetOpen){event.preventDefault();closeContextSheet({restoreFocus:true});return;}
    if(projectMenuOpen){event.preventDefault();closeProjectMenu({restoreFocus:true});return;}
    if(activeDrawer){event.preventDefault();closeDrawer({restoreFocus:true});}
  },true);

  document.addEventListener('focusin',event=>{
    if(!activeDrawer||!isMobile())return;
    const panel=drawerFor(activeDrawer);
    if(panel&&!panel.contains(event.target))panel.querySelector('.v151-mobile-drawer-close')?.focus({preventScroll:true});
  });

  const bodyClassObserver=new MutationObserver(()=>scheduleContextRefresh());
  bodyClassObserver.observe(body,{attributes:true,attributeFilter:['class']});

  const selectionObserver=new MutationObserver(()=>{
    updateBadges();
    scheduleContextRefresh();
    const current=(selectedState?.textContent||'').trim();
    if(current!==previousSelectedState){
      previousSelectedState=current;
      if(inspectorPanel)inspectorPanel.scrollTop=0;
    }
  });
  if(selectedState)selectionObserver.observe(selectedState,{childList:true,subtree:true,characterData:true});

  const modeBanner=$('modeBanner');
  if(modeBanner){
    const modeObserver=new MutationObserver(()=>scheduleContextRefresh());
    modeObserver.observe(modeBanner,{attributes:true,childList:true,subtree:true,characterData:true});
  }
  const fileList=$('fileList');
  if(fileList){
    const fileObserver=new MutationObserver(updateBadges);
    fileObserver.observe(fileList,{childList:true,subtree:true});
  }
  updateBadges();

  if(mq?.addEventListener)mq.addEventListener('change',applyMode);else mq?.addListener?.(applyMode);
  window.addEventListener('orientationchange',()=>setTimeout(()=>{
    closeDrawer();closeProjectMenu();closeContextSheet();applyMode();
  },100),{passive:true});
  window.addEventListener('resize',()=>{if(isMobile()){scheduleLayoutRefresh();scheduleContextRefresh();}},{passive:true});
  window.visualViewport?.addEventListener('resize',()=>{if(isMobile())scheduleLayoutRefresh();},{passive:true});
  applyMode();

  window.EditPolygonMobile=Object.freeze({
    version:VERSION,
    isMobile,
    openLayers:()=>openDrawer('layers',drawerButton('layers')),
    openInspector:()=>openDrawer('inspector',drawerButton('inspector')),
    openProjectMenu,
    closeDrawer,
    closeProjectMenu
  });
})();
