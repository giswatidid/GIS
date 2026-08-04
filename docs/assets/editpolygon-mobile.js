/* EditPolygon mobile compatibility controller · v1.51 */
(()=>{
  'use strict';

  const MOBILE_QUERY='(max-width: 860px), (pointer: coarse) and (max-width: 1024px)';
  const mq=window.matchMedia?window.matchMedia(MOBILE_QUERY):null;
  const $=id=>document.getElementById(id);
  const body=document.body;
  const app=document.querySelector('.app');
  const rail=$('toolRail');
  const sidebar=document.querySelector('.sidebar');
  const inspector=$('selectedSection');
  const topMenu=$('topMoreMenu');
  const topMenuButton=$('topMoreBtn');
  if(!body||!app||!rail||!sidebar||!inspector)return;

  let activeDrawer=null;
  let lastDrawerTrigger=null;
  let layoutRaf=0;

  function isMobile(){return !!(mq&&mq.matches);}
  function scheduleLayoutRefresh(){
    if(layoutRaf)return;
    layoutRaf=requestAnimationFrame(()=>{
      layoutRaf=0;
      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    });
  }
  function closeRailFlyouts(){
    document.querySelectorAll('.rail-flyout.active').forEach(node=>node.classList.remove('active'));
  }
  function closeTopMenu(){
    topMenu?.classList.remove('active');
    topMenuButton?.setAttribute('aria-expanded','false');
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
    if(restoreFocus&&focusTarget instanceof HTMLElement)requestAnimationFrame(()=>focusTarget.focus({preventScroll:true}));
  }
  function openDrawer(name,trigger=null){
    if(!isMobile())return;
    const panel=drawerFor(name);if(!panel)return;
    closeRailFlyouts();closeTopMenu();
    activeDrawer=name;
    lastDrawerTrigger=trigger||drawerButton(name);
    updateDrawerA11y();
    scheduleLayoutRefresh();
    requestAnimationFrame(()=>panel.querySelector('.v151-mobile-drawer-close')?.focus({preventScroll:true}));
  }
  function toggleDrawer(name,trigger){activeDrawer===name?closeDrawer({restoreFocus:true}):openDrawer(name,trigger);}

  function makeDrawerHeader(panel,title,name){
    let head=panel.querySelector(':scope > .v151-mobile-drawer-head');
    if(head)return;
    head=document.createElement('div');
    head.className='v151-mobile-drawer-head';
    head.innerHTML=`<strong>${title}</strong><button class="v151-mobile-drawer-close" type="button" aria-label="Close ${title}">×</button>`;
    head.querySelector('button').addEventListener('click',()=>closeDrawer({restoreFocus:true}));
    panel.insertBefore(head,panel.firstChild);
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

  function proxyClick(id){
    const target=$(id);if(!target)return;
    target.click();
    closeTopMenu();
  }
  function copyOptions(source,target){
    if(!source||!target)return;
    target.innerHTML=Array.from(source.options).map(option=>`<option value="${String(option.value).replace(/"/g,'&quot;')}">${option.textContent}</option>`).join('');
    target.value=source.value;
    target.addEventListener('change',()=>{source.value=target.value;source.dispatchEvent(new Event('change',{bubbles:true}));});
    source.addEventListener('change',()=>{target.value=source.value;});
  }
  function installMobileMenu(){
    if(!topMenu||$('v151MobileMenu'))return;
    const section=document.createElement('div');
    section.id='v151MobileMenu';
    section.className='v151-mobile-menu v151-mobile-only';
    section.innerHTML=`
      <div class="top-menu-section-title">Mobile project actions</div>
      <div class="v151-mobile-menu-grid">
        <button type="button" data-v151-proxy="saveBtn">Save</button>
        <button type="button" data-v151-proxy="undoBtn">Undo</button>
        <button type="button" data-v151-proxy="redoBtn">Redo</button>
        <button type="button" data-v151-proxy="fitAllBtn">Fit map</button>
        <button type="button" data-v151-open-drawer="layers">Layers</button>
        <button type="button" data-v151-open-drawer="inspector">Inspector</button>
      </div>
      <div class="v151-mobile-menu-fields">
        <label>Export scope<select id="v151MobileExportScope"></select></label>
        <label>Export format<select id="v151MobileExportFormat"></select></label>
      </div>
      <button class="primary" type="button" data-v151-proxy="exportBtn">Export</button>
      <label>Find a place or coordinate
        <span class="v151-mobile-location"><input id="v151MobileLocation" type="text" inputmode="search" placeholder="Place or lat, lng"><button class="primary" id="v151MobileLocationGo" type="button">Go</button></span>
      </label>`;
    topMenu.insertBefore(section,topMenu.firstChild);
    section.querySelectorAll('[data-v151-proxy]').forEach(button=>button.addEventListener('click',()=>proxyClick(button.dataset.v151Proxy)));
    section.querySelectorAll('[data-v151-open-drawer]').forEach(button=>button.addEventListener('click',()=>openDrawer(button.dataset.v151OpenDrawer,drawerButton(button.dataset.v151OpenDrawer))));
    copyOptions($('exportScope'),$('v151MobileExportScope'));
    copyOptions($('exportFormat'),$('v151MobileExportFormat'));
    const mobileLocation=$('v151MobileLocation'),sourceLocation=$('locationSearchInput');
    const runLocation=()=>{
      if(sourceLocation&&mobileLocation)sourceLocation.value=mobileLocation.value;
      proxyClick('locationSearchBtn');
    };
    $('v151MobileLocationGo')?.addEventListener('click',runLocation);
    mobileLocation?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();runLocation();}});
    sourceLocation?.addEventListener('input',()=>{if(mobileLocation&&document.activeElement!==mobileLocation)mobileLocation.value=sourceLocation.value;});
  }

  function updateBadges(){
    const layersBadge=drawerButton('layers')?.querySelector('.v151-mobile-badge');
    const inspectorBadge=drawerButton('inspector')?.querySelector('.v151-mobile-badge');
    if(layersBadge){
      const count=(document.querySelectorAll('#fileList .file-card').length||0);
      layersBadge.textContent=count>99?'99+':String(count);
      layersBadge.classList.toggle('active',count>0);
    }
    if(inspectorBadge){
      const state=($('selectedState')?.textContent||'').trim();
      const hasSelection=!!state&&!/^(none|no selection)$/i.test(state);
      inspectorBadge.textContent='1';
      inspectorBadge.classList.toggle('active',hasSelection);
    }
  }

  function applyMode(){
    const mobile=isMobile();
    body.classList.toggle('v151-mobile-layout',mobile);
    if(!mobile){
      activeDrawer=null;
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
    }
    scheduleLayoutRefresh();
  }

  makeDrawerHeader(sidebar,'Project & layers','layers');
  makeDrawerHeader(inspector,'Inspector','inspector');
  installDockButtons();
  installMobileMenu();
  const backdrop=document.createElement('div');
  backdrop.id='v151MobileBackdrop';
  backdrop.className='v151-mobile-backdrop';
  backdrop.setAttribute('aria-hidden','true');
  backdrop.addEventListener('click',()=>closeDrawer({restoreFocus:true}));
  app.appendChild(backdrop);

  rail.addEventListener('click',event=>{
    if(event.target.closest('[data-rail]'))closeDrawer();
  },true);
  topMenuButton?.addEventListener('click',()=>{if(isMobile())closeDrawer();},true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&activeDrawer){event.preventDefault();closeDrawer({restoreFocus:true});}
  },true);
  document.addEventListener('focusin',event=>{
    if(!activeDrawer||!isMobile())return;
    const panel=drawerFor(activeDrawer);
    if(panel&&!panel.contains(event.target))panel.querySelector('.v151-mobile-drawer-close')?.focus({preventScroll:true});
  });

  const badgeObserver=new MutationObserver(updateBadges);
  badgeObserver.observe($('fileList')||sidebar,{childList:true,subtree:true});
  if($('selectedState'))badgeObserver.observe($('selectedState'),{childList:true,characterData:true,subtree:true});
  updateBadges();

  if(mq?.addEventListener)mq.addEventListener('change',applyMode);else mq?.addListener?.(applyMode);
  window.addEventListener('orientationchange',()=>setTimeout(()=>{closeDrawer();applyMode();},80),{passive:true});
  window.addEventListener('resize',()=>{if(isMobile())scheduleLayoutRefresh();},{passive:true});
  applyMode();

  window.EditPolygonMobile=Object.freeze({
    version:'1.51.0',
    isMobile,
    openLayers:()=>openDrawer('layers',drawerButton('layers')),
    openInspector:()=>openDrawer('inspector',drawerButton('inspector')),
    closeDrawer
  });
})();
