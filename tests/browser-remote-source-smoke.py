from pathlib import Path
import os
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def chromium_path():
    configured = os.environ.get('CHROMIUM_PATH')
    if configured and Path(configured).exists():
        return configured
    for candidate in ('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'):
        found = shutil.which(candidate)
        if found:
            return found
    return None

with sync_playwright() as p:
    executable = chromium_path()
    launch_options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
    if executable:
        launch_options['executable_path'] = executable
    browser = p.chromium.launch(**launch_options)
    page = browser.new_page()
    page.set_content('''<!doctype html><html><body>
      <button id="fitAllBtn">Fit</button>
      <div class="compact-topbar"></div>
      <div class="sidebar"></div>
      <div class="statusbar"></div>
      <script>
      window.__remoteCalls=[];
      window.EditPolygonGIS={
        getWorkspaceMode:()=> 'advanced',setWorkspaceMode:()=>{},getLayers:()=>[],getGroups:()=>[],localDataSummary:()=>({editableLayers:0,editableFeatures:0,referenceLayers:0,imageLayers:0,customRemoteLayers:0}),
        discoverRemoteData:async({url})=>{
          __remoteCalls.push(['discover',url]);
          if(url.endsWith('/rest/services'))return {kind:'choose-service',title:'ArcGIS services directory',name:'services',services:[{name:'Outages',serviceType:'FeatureServer',url:'https://example.test/Outages/FeatureServer'}],folders:[]};
          if(url.endsWith('/FeatureServer'))return {kind:'choose-layer',title:'Outages',name:'Outages',layers:[{name:'Current outages',url:'https://example.test/Outages/FeatureServer/0',geometryLabel:'Points'}]};
          return {kind:'ready',sourceType:'arcgis-layer',name:'Current outages',title:'Current outages',url,importUrl:url,layerUrl:url,geometryLabel:'Points',featureCount:17,sourceCrs:'EPSG:4326'};
        },
        importRemoteGeoJson:async(args)=>{__remoteCalls.push(['import',args.discovery.name,args.mode]);return {file:{features:Array.from({length:17},(_,i)=>({id:i}))}};},
        addRemoteLayer:async()=>{},openLocalFiles:()=>{},openImageOverlay:()=>{},openReferenceOverlay:()=>{},exportSourceDefinitions:()=>{},getLayerUiSnapshot:()=>[]
      };
      </script>
    </body></html>''')
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-workspace.js'))
    page.locator('[data-gis-tab="add"]').click()
    page.locator('#gisRemoteUrl').fill('https://example.test/ArcGIS/rest/services')
    page.locator('#gisRemoteGeoJsonForm button[type="submit"]').click()
    page.wait_for_selector('#gisRemoteChoice')
    assert 'Outages' in page.locator('#gisRemoteChoice').inner_text()
    page.locator('[data-gis-action="remote-continue"]').click()
    page.wait_for_function("document.querySelector('#gisRemoteChoice') && document.querySelector('#gisRemoteChoice').textContent.includes('Current outages')")
    page.locator('[data-gis-action="remote-continue"]').click()
    page.wait_for_selector('[data-gis-action="remote-import"]')
    assert '17 features' in page.locator('.gis-remote-facts').inner_text()
    assert page.locator('#gisRemoteName').input_value() == 'Current outages'
    page.locator('[data-gis-action="remote-import"]').click()
    page.wait_for_function("window.__remoteCalls.some(call => call[0] === 'import')")
    calls = page.evaluate('window.__remoteCalls')
    assert [call[0] for call in calls].count('discover') == 3, calls
    assert any(call[0] == 'import' and call[1] == 'Current outages' for call in calls), calls
    browser.close()
print('Remote-source browser smoke test passed.')
