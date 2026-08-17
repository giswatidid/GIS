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
    if executable: options['executable_path']=executable
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1000,'height':720})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content('''<!doctype html><html><body><div id="host"></div><script>
      window.__layers=[{id:'source',name:'Only polygon layer',tableOnly:false,features:[
        {id:'a',geometryType:'Polygon',properties:{name:'A'},filtered:false},
        {id:'b',geometryType:'Polygon',properties:{name:'B'},filtered:false}
      ]}];
    </script></body></html>''')
    page.add_style_tag(path=str(ROOT/'docs/assets/gis-processing.css'))
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-processing-registry.js'))
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-processing-core.js'))
    page.add_script_tag(content='''
      window.EditPolygonGIS={
        getEditableLayers:()=>window.__layers,
        getSelection:()=>({ids:[],count:0,index:-1}),
        previewProcessingRequest:request=>EditPolygonGISProcessingCore.preflight(request,{layers:window.__layers,selectionIds:[]})
      };
    ''')
    page.add_script_tag(path=str(ROOT/'docs/assets/gis-processing.js'))
    page.evaluate("EditPolygonGISProcessingUI.mount(document.getElementById('host'),{layerId:'source',toolId:'symmetric-difference',api:EditPolygonGIS})")

    overlay=page.locator('[data-processing-input="overlay"]')
    assert overlay.input_value()==''
    assert overlay.locator('option').all_inner_texts()==['Choose layer']
    preflight=page.locator('.gis-processing-preflight').inner_text()
    assert 'Choose second polygon layer' in preflight,preflight
    assert page.locator('[data-processing-action="run"]').is_disabled()

    # Even a programmatic same-layer request is rejected by the shared core.
    invalid=page.evaluate('''()=>EditPolygonGISProcessingCore.preflight({
      toolId:'symmetric-difference',
      inputs:{source:{layerId:'source',scope:'all'},overlay:{layerId:'source',scope:'all'}}
    },{layers:window.__layers,selectionIds:[]})''')
    assert invalid['valid'] is False
    assert 'two different layers' in ' '.join(invalid['errors']).lower()

    assert not errors,errors
    browser.close()

print('Processing overlay distinct-input browser smoke test passed.')
