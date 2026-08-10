from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def chromium_path():
    configured=os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists():
        return configured
    for candidate in ('chromium','chromium-browser','google-chrome','google-chrome-stable'):
        found=shutil.which(candidate)
        if found:
            return found
    return None

with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
    executable=chromium_path()
    if executable:
        options['executable_path']=executable
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page.set_content(r'''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}.app{display:grid;width:100%;height:100%}
      .compact-topbar{display:flex}.topbar-brand{display:flex}.topbar-core{display:flex}.tool-rail{display:flex}.statusbar{display:flex}
      .sidebar,#selectedSection{background:white}.sidebar{display:flex;flex-direction:column}.sidebar-section{overflow:auto}.project-section{min-height:120px}.files-section{flex:1}
      #map{background:#dde8ef}.rail-btn{display:flex}.layer-menu{position:fixed;display:none;z-index:2600}.layer-menu.active{display:block}.gis-layer-action-menu{position:fixed;z-index:100050}
    </style></head><body><div class="app">
      <header class="compact-topbar">
        <div class="topbar-brand"><span class="title">EditPolygon</span></div>
        <div class="topbar-core"><button id="openBtn">Open</button><input id="fileInput" type="file"><button id="gisWorkspaceToggle" aria-pressed="false">Advanced GIS</button></div>
        <div class="topbar-more-wrap"><button id="topMoreBtn">More</button><div id="topMoreMenu"></div></div>
      </header>
      <aside class="sidebar">
        <section id="projectSection" class="sidebar-section project-section"><div class="section-title">Project</div></section>
        <section id="filesSection" class="sidebar-section files-section"><div class="section-title">Layers</div><div id="fileList"><div class="file-card"><div class="file-head"><button class="gis-layer-actions-btn" id="layerGis">GIS</button></div><div class="feature-row"><div class="feature-actions"><button class="layer-kebab" id="featureMore">⋮</button></div></div></div></div></section>
      </aside>
      <main id="map"></main>
      <aside id="selectedSection"><div class="section-title">Inspector</div><div id="selectedPanel"></div></aside>
      <nav id="toolRail" class="tool-rail"><button class="rail-btn" data-rail="select">Select</button></nav>
      <footer class="statusbar"><span id="statusText"></span><span id="dirtyState"></span></footer>
    </div>
    <span id="selectedState"></span>
    <select id="exportScope"><option>All</option></select><select id="exportFormat"><option>KML</option></select><select id="basemap"><option>OSM</option></select>
    <input id="locationSearchInput"><button id="locationSearchBtn"></button><button id="themeToggleBtn"></button>
    <button id="saveBtn"></button><button id="undoBtn"></button><button id="redoBtn"></button><button id="fitAllBtn"></button><button id="exportBtn"></button>
    <button id="restoreAutosaveBtn"></button><button id="converterOpenBtn"></button><button id="validatorOpenBtn"></button><button id="topMenuCommandProxy"></button><button id="aboutEditPolygonBtn"></button><button id="clearBtn"></button>
    <section id="gisWorkspacePanel"></section>
    <div id="layerMenu" class="layer-menu active"><button id="legacyMenuAction">Feature action</button></div>
    <div class="gis-layer-action-menu"><button id="gisMenuAction">GIS action</button></div>
    </body></html>''')
    page.add_style_tag(path=str(ROOT/'docs/assets/editpolygon-mobile.css'))
    page.add_script_tag(path=str(ROOT/'docs/assets/editpolygon-mobile.js'))
    page.wait_for_timeout(100)
    page.locator('[data-v151-drawer="layers"]').click()
    page.wait_for_timeout(50)
    result=page.evaluate('''()=>{
      const drawer=document.querySelector('.sidebar');
      const legacy=document.getElementById('layerMenu');
      const gis=document.querySelector('.gis-layer-action-menu');
      const gisTrigger=document.getElementById('layerGis').getBoundingClientRect();
      const moreTrigger=document.getElementById('featureMore').getBoundingClientRect();
      document.getElementById('gisMenuAction').focus();
      const gisFocus=document.activeElement.id;
      document.getElementById('legacyMenuAction').focus();
      const legacyFocus=document.activeElement.id;
      return {
        drawerZ:Number(getComputedStyle(drawer).zIndex)||0,
        legacyZ:Number(getComputedStyle(legacy).zIndex)||0,
        gisZ:Number(getComputedStyle(gis).zIndex)||0,
        gisTrigger:[gisTrigger.width,gisTrigger.height],
        moreTrigger:[moreTrigger.width,moreTrigger.height],
        gisFocus,
        legacyFocus
      };
    }''')
    assert result['legacyZ']>result['drawerZ'],result
    assert result['gisZ']>result['drawerZ'],result
    assert min(result['gisTrigger'])>=44,result
    assert min(result['moreTrigger'])>=44,result
    assert result['gisFocus']=='gisMenuAction',result
    assert result['legacyFocus']=='legacyMenuAction',result
    browser.close()
print('Mobile layer actions browser smoke test passed.')
