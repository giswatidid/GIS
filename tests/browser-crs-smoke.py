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
    launch_options = {
        'headless': True,
        'args': ['--no-sandbox', '--disable-dev-shm-usage']
    }
    if executable:
        launch_options['executable_path'] = executable
    browser = p.chromium.launch(**launch_options)
    page=browser.new_page()
    page.set_content('''<!doctype html><html><body>
    <div class="gis-layer-row" data-layer-key="editable:layer1"><div class="gis-layer-secondary"></div></div>
    <script>
    window.__calls=[];
    const layer={id:'layer1',name:'Test MGA layer',crs:'EPSG:7856',sourceCrs:'EPSG:7856',storageCrs:'EPSG:4326',exportCrs:'EPSG:7856',recommendedMetricCrs:'EPSG:7856',features:[{id:'f1',properties:{name:'Test'},filtered:false}],filter:null,style:{mode:'single'},labels:{enabled:false}};
    window.EditPolygonGISDataCore={fields:()=>[{name:'name'}],filter:(f)=>f,uniqueValues:()=>[],classifyBreaks:()=>[]};
    window.EditPolygonGIS={
      getEditableLayers:()=>[{id:'layer1'}],getEditableLayer:()=>layer,
      getLayerCrsInfo:()=>({source:'EPSG:7856',storage:'EPSG:4326',native:'EPSG:7856',exportCrs:'EPSG:7856',recommendedMetricCrs:'EPSG:7856',sampleNative:[500000,7013563],needsAssignment:false,datumApproximation:true}),
      getCrsCatalog:()=>[{code:'EPSG:4326',name:'WGS 84'},{code:'EPSG:7856',name:'GDA2020 / MGA zone 56'}],
      assignCrs:(id,v)=>__calls.push(['assign',id,v]),interpretCoordinates:(id,v)=>__calls.push(['interpret',id,v]),setExportCrs:(id,v)=>__calls.push(['exportCrs',id,v]),exportLayerCrs:(id,v,f)=>{__calls.push(['download',id,v,f]);return Promise.resolve({});},
      setAttribute:()=>{},addField:()=>{},deleteField:()=>{},calculateField:()=>({count:0}),setFilter:()=>({count:1,total:1}),setStyle:()=>{},setLabels:()=>{},selectFeature:()=>{},zoomFeature:()=>{},process:()=>layer
    };
    </script></body></html>''')
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-crs-core.js'))
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-data-tools.js'))
    page.wait_for_selector('.gis-data-open')
    page.locator('.gis-data-open').click()
    page.locator('[data-tab="crs"]').click()
    body=page.locator('#gisDataBody').inner_text()
    assert 'Internal map storage' in body
    assert 'EPSG:7856' in body
    page.locator('[data-action="apply-crs"]').click()
    page.once('dialog',lambda d:d.accept())
    page.locator('[data-action="interpret-crs"]').click()
    page.locator('#gisCrsExportFormat').select_option('wkt')
    page.locator('[data-action="set-export-crs"]').click()
    page.locator('[data-action="export-crs-geojson"]').click()
    page.wait_for_timeout(50)
    calls=page.evaluate('window.__calls')
    assert any(c[0]=='assign' for c in calls),calls
    assert any(c[0]=='interpret' for c in calls),calls
    assert any(c[0]=='exportCrs' for c in calls),calls
    assert any(c[0]=='download' and c[3]=='wkt' for c in calls),calls
    easting=page.evaluate("EditPolygonCRS.transformCoordinate([153,-27],'EPSG:4326','EPSG:7856')[0]")
    assert abs(easting-500000)<.02,easting
    browser.close()
print('CRS browser smoke test passed.')
