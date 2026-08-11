from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists(): return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:return found
    return None

with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    executable=chromium_path()
    if executable:options['executable_path']=executable
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content(r'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Arial,sans-serif}.app{display:grid;width:100%;height:100%}
      button,select,input{font:inherit}.compact-topbar{display:flex}.topbar-brand{display:flex;align-items:center}.topbar-core{display:flex}.tool-rail{display:flex}
      .sidebar,.selected-section{background:#fff}.sidebar{display:flex;flex-direction:column}.sidebar-section{overflow:auto}.project-section{min-height:120px}.files-section{flex:1}
      #map{background:#dce8ef}.rail-btn{display:flex;flex-direction:column;align-items:center;justify-content:center}.ico svg{fill:none;stroke:currentColor}
      .gis-workspace-panel{display:none}.gis-workspace-panel.active{display:flex}.statusbar{display:flex}
    </style></head><body>
    <div class="app">
      <header class="compact-topbar">
        <div class="topbar-brand"><span class="title">EditPolygon</span></div>
        <div class="topbar-core"><button id="openBtn">Open</button><input id="fileInput" type="file"><button id="gisWorkspaceToggle" aria-pressed="false">Advanced GIS</button></div>
        <div class="topbar-more-wrap"><button id="topMoreBtn" class="topbar-more-btn" aria-expanded="false">More</button><div id="topMoreMenu"></div></div>
      </header>
      <aside class="sidebar">
        <section id="projectSection" class="sidebar-section project-section"><div class="section-title"><span>Project</span></div><div class="dropzone">Import files</div></section>
        <section id="filesSection" class="sidebar-section files-section"><div class="section-title"><span>Layers</span><button class="v135-new-group-button">+ New group</button><button class="v133-layer-sort-button">Sort</button></div><div id="fileList"></div></section>
      </aside>
      <main id="map"><div class="ol-control ol-zoom"><button>+</button></div></main>
      <aside id="selectedSection" class="selected-section"><div class="section-title">Inspector</div><div id="selectedPanel"><p>Nothing selected</p></div></aside>
      <nav id="toolRail" class="tool-rail"><button class="rail-btn active" data-rail="select"><span class="ico">S</span><span class="lbl">Select</span></button><button class="rail-btn" data-rail="draw"><span class="ico">D</span><span class="lbl">Draw</span></button></nav>
      <footer class="statusbar"><span id="statusText">Ready.</span><span id="dirtyState">Saved</span></footer>
    </div>
    <span id="selectedState">No selection</span>
    <select id="exportScope"><option value="all">All</option></select><select id="exportFormat"><option value="geojson">GeoJSON</option></select><select id="basemap"><option value="osm">OSM</option></select>
    <input id="locationSearchInput"><button id="locationSearchBtn">Go</button><button id="themeToggleBtn">Theme</button>
    <button id="saveBtn">Save</button><button id="undoBtn">Undo</button><button id="redoBtn">Redo</button><button id="fitAllBtn">Fit</button><button id="exportBtn">Export</button>
    <button id="restoreAutosaveBtn">Restore</button><button id="converterOpenBtn">Convert</button><button id="validatorOpenBtn">Validate</button><button id="topMenuCommandProxy">Commands</button><button id="aboutEditPolygonBtn">About</button><button id="clearBtn">Clear</button>
    <section id="gisWorkspacePanel" class="gis-workspace-panel"><header class="gis-panel-head"><div><div class="gis-panel-title">Advanced GIS</div><div class="gis-panel-subtitle">Browser-local GIS</div></div><button>×</button></header><nav class="gis-tabs"><button>Layers</button><button>Add data</button><button>Basemaps</button><button>Project</button></nav><div class="gis-panel-body"><section class="gis-layer-section"><div class="gis-section-head"><h3>Layers</h3></div><div class="gis-layer-row"><div class="gis-layer-primary"><button class="gis-eye">◉</button><div class="gis-layer-main"><div class="gis-layer-name">Demo layer</div></div><button class="gis-mini">⋮</button></div><div class="gis-layer-secondary"><label class="gis-group-select">Group<select><option>None</option></select></label></div></div></section></div></section>
    <script>
      const gisToggle=document.getElementById('gisWorkspaceToggle');
      gisToggle.addEventListener('click',()=>{
        const open=gisToggle.getAttribute('aria-pressed')!=='true';
        gisToggle.setAttribute('aria-pressed',open?'true':'false');
        document.getElementById('gisWorkspacePanel').classList.toggle('active',open);
        window.dispatchEvent(new Event('editpolygon:gis-changed'));
      });
    </script>
    </body></html>''')
    page.add_style_tag(path=str(ROOT/'docs/assets/editpolygon-mobile.css'))
    page.add_script_tag(path=str(ROOT/'docs/assets/editpolygon-mobile.js'))
    page.wait_for_timeout(150)

    initial=page.evaluate('''()=>({
      mobile:document.body.classList.contains('v151-mobile-layout'),
      version:window.EditPolygonMobile?.version,
      gisButtons:[...document.querySelectorAll('[data-v155-action="gis"]')].length,
      oldNotice:!!document.getElementById('mobileDesktopNotice'),
      docWidth:document.documentElement.scrollWidth,
      viewport:document.documentElement.clientWidth,
      openHeight:document.getElementById('openBtn').getBoundingClientRect().height,
      moreHeight:document.getElementById('topMoreBtn').getBoundingClientRect().height,
      olSize:[document.querySelector('.ol-control button').getBoundingClientRect().width,document.querySelector('.ol-control button').getBoundingClientRect().height]
    })''')
    assert initial['mobile'] is True,initial
    assert initial['version']=='1.55.7.4',initial
    assert initial['gisButtons']==1,initial
    assert initial['oldNotice'] is False,initial
    assert initial['docWidth']<=initial['viewport']+1,initial
    assert initial['openHeight']>=40 and initial['moreHeight']>=40,initial
    assert initial['olSize'][0]>=40 and initial['olSize'][1]>=40,initial

    page.locator('[data-v155-action="gis"]').click()
    page.wait_for_timeout(60)
    gis=page.evaluate('''()=>({
      active:document.getElementById('gisWorkspacePanel').classList.contains('active'),
      pressed:document.querySelector('[data-v155-action="gis"]').getAttribute('aria-pressed'),
      tabHeight:document.querySelector('.gis-tabs button').getBoundingClientRect().height,
      eyeSize:[document.querySelector('.gis-eye').getBoundingClientRect().width,document.querySelector('.gis-eye').getBoundingClientRect().height]
    })''')
    assert gis['active'] is True and gis['pressed']=='true',gis
    assert gis['tabHeight']>=44,gis
    assert gis['eyeSize'][0]>=36 and gis['eyeSize'][1]>=36,gis

    page.locator('[data-v151-drawer="layers"]').click()
    page.wait_for_timeout(50)
    layers=page.evaluate('''()=>({
      open:document.querySelector('.sidebar').classList.contains('v151-mobile-drawer-open'),
      width:document.querySelector('.sidebar').getBoundingClientRect().width,
      viewport:document.documentElement.clientWidth,
      closeSize:[document.querySelector('.sidebar .v151-mobile-drawer-close').getBoundingClientRect().width,document.querySelector('.sidebar .v151-mobile-drawer-close').getBoundingClientRect().height]
    })''')
    assert layers['open'] is True,layers
    assert abs(layers['width']-layers['viewport'])<=1,layers
    assert layers['closeSize'][0]>=44 and layers['closeSize'][1]>=44,layers

    page.locator('.sidebar .v151-mobile-drawer-close').click()
    page.locator('#topMoreBtn').click()
    page.wait_for_timeout(50)
    project=page.evaluate('''()=>({
      active:document.getElementById('v151MobileProjectMenu').classList.contains('active'),
      gisAction:document.getElementById('v155MobileGisProjectAction')?.textContent,
      closeSize:[document.querySelector('#v151MobileProjectMenu .v151-mobile-sheet-close').getBoundingClientRect().width,document.querySelector('#v151MobileProjectMenu .v151-mobile-sheet-close').getBoundingClientRect().height],
      width:document.getElementById('v151MobileProjectMenu').getBoundingClientRect().width,
      viewport:document.documentElement.clientWidth
    })''')
    assert project['active'] is True,project
    assert project['gisAction']=='Return to simple editor',project
    assert project['closeSize'][0]>=44 and project['closeSize'][1]>=44,project
    assert project['width']<=project['viewport']+1,project

    assert not errors,errors
    browser.close()
print('Mobile parity browser smoke test passed.')
