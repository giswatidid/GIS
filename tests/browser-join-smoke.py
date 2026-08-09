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
    options = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
    if executable:
        options['executable_path'] = executable
    browser = p.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1360, 'height': 850})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('''<!doctype html><html><body>
      <script>
      window.__layers=[
        {id:'target',name:'Assets',count:2,visibleCount:2,crs:'EPSG:4326',tableOnly:false,
         schema:{version:1,fields:[{name:'site_id',alias:'Site ID',type:'text',nullable:true},{name:'region',alias:'Region',type:'text',nullable:true},{name:'value',alias:'Value',type:'integer',nullable:true}]},
         features:[
           {id:'t1',geometryType:'Point',geometry:{type:'Point',coordinates:[1,1]},properties:{site_id:'A',region:'North',value:10},filtered:false,visible:true},
           {id:'t2',geometryType:'Point',geometry:{type:'Point',coordinates:[8,8]},properties:{site_id:'B',region:'South',value:20},filtered:false,visible:true}
         ],filter:null,savedFilters:[],style:{type:'single'},labels:{enabled:false}},
        {id:'source',name:'Register',count:2,visibleCount:2,crs:'EPSG:4326',tableOnly:false,
         schema:{version:1,fields:[{name:'site_code',alias:'Site code',type:'text',nullable:true},{name:'status',alias:'Status',type:'text',nullable:true}]},
         features:[
           {id:'s1',geometryType:'Polygon',geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]]]},properties:{site_code:'A',status:'Ready'},filtered:false,visible:true},
           {id:'s2',geometryType:'Polygon',geometry:{type:'Polygon',coordinates:[[[6,6],[9,6],[9,9],[6,9],[6,6]]]},properties:{site_code:'C',status:'Closed'},filtered:false,visible:true}
         ],filter:null,savedFilters:[],style:{type:'single'},labels:{enabled:false}}
      ];
      window.__active='target';window.__joinCalls=[];
      window.EditPolygonGISDataCore={fields:features=>Object.keys(features[0]?.properties||{}).map(name=>({name,type:'text'})),statistics:()=>({})};
      </script>
    </body></html>''')
    page.add_script_tag(path=str(ROOT / 'docs/assets/gis-join-core.js'))
    page.add_script_tag(content='''
      const core=window.EditPolygonGISJoinCore;
      const clone=value=>JSON.parse(JSON.stringify(value));
      function layer(id){return __layers.find(item=>item.id===id);}
      function descriptor(item){return {id:item.id,name:item.name,kind:item.tableOnly?'table':'layer',tableOnly:!!item.tableOnly,count:item.features.length,geometryTypes:[...new Set(item.features.map(f=>f.geometryType).filter(Boolean))],schema:clone(item.schema),selectedCount:0};}
      function records(item){return item.features.map(f=>({id:f.id,properties:clone(f.properties),geometry:clone(f.geometry||null)}));}
      function output(name,rows,schema,tableOnly=false){const result={id:'out'+(__layers.length+1),name,count:rows.length,visibleCount:rows.length,crs:tableOnly?'':'EPSG:4326',tableOnly,schema:clone(schema),features:rows.map((row,index)=>({id:'o'+index,geometryType:row.geometry?.type||'',geometry:clone(row.geometry||null),properties:{name:name+' '+(index+1),...clone(row.properties)},filtered:false,visible:true})),filter:null,savedFilters:[],style:{type:'single'},labels:{enabled:false},join:{operation:tableOnly?'group_summary':name==='Spatial result'?'spatial_join':'attribute_join',sourceName:'Test source',diagnostics:{matchedTargets:rows.length,unmatchedTargets:0,groupCount:tableOnly?rows.length:undefined,totalMatches:name==='Spatial result'?rows.length:undefined}}};__layers.push(result);__active=result.id;return result;}
      window.EditPolygonGIS={
        getEditableLayers:()=>__layers,
        getEditableLayer:id=>layer(id||__active),
        getSelection:()=>({ids:[],count:0,index:-1}),
        getJoinSources:()=>__layers.map(descriptor),
        parseJoinLookupFile:(name,text)=>{const parsed=core.parseCsv(text);return {name,records:parsed.rows.map((properties,index)=>({id:'x'+index,properties})),schema:parsed.schema,tableOnly:true};},
        previewAttributeJoin:(id,config)=>{const target=layer(id),source=layer(config.sourceFileId);const result=core.previewAttributeJoin(records(target),records(source),{...config,targetSchema:target.schema,sourceSchema:source.schema});__joinCalls.push(['preview-attribute',result.valid]);return result;},
        executeAttributeJoin:(id,config,onProgress)=>{onProgress({stage:'Joining',percent:70,done:1,total:2});const target=layer(id),source=layer(config.sourceFileId),result=core.executeAttributeJoin(records(target),records(source),{...config,targetSchema:target.schema,sourceSchema:source.schema});__joinCalls.push(['run-attribute',result.rows.length]);return Promise.resolve(output(config.name,result.rows,result.schema,target.tableOnly));},
        previewGroupSummary:(id,config)=>{const target=layer(id),result=core.previewGroupSummary(records(target),{...config,schema:target.schema});__joinCalls.push(['preview-summary',result.valid]);return result;},
        executeGroupSummary:(id,config,onProgress)=>{onProgress({stage:'Summarizing',percent:80,done:2,total:2});const target=layer(id),result=core.executeGroupSummary(records(target),{...config,schema:target.schema});__joinCalls.push(['run-summary',result.rows.length]);return Promise.resolve(output(config.name,result.rows,result.schema,true));},
        previewSpatialJoin:()=>Promise.resolve({valid:true,errors:[],warnings:[],targetCount:2,sourceCount:2,matchedTargets:2,unmatchedTargets:0,expectedOutput:2,totalMatches:2,sample:[{status:'Ready'}]}),
        executeSpatialJoin:()=>Promise.resolve(output('Spatial result',records(layer('target')),layer('target').schema,false)),
        cancelJoinProcessing:()=>true,
        exportLayerRecords:()=>({count:1}),getLayerStatistics:()=>({}),setAttribute:()=>{},setSelection:()=>{},
        getCrsCatalog:()=>[],getLayerCrsInfo:()=>({source:'EPSG:4326',storage:'EPSG:4326',native:'EPSG:4326',exportCrs:'EPSG:4326'}),
        previewStyle:()=>{},clearStylePreview:()=>{},setStyle:()=>({style:{type:'single'}}),setLabels:()=>{}
      };
    ''')
    page.add_script_tag(path=str(ROOT / 'docs/assets/gis-data-tools.js'))
    page.evaluate("EditPolygonGISDataTools.openLayer('target','join')")
    page.wait_for_selector('#gisDataModal.active')

    assert page.locator('text=Join by matching fields').count() == 1
    page.locator('#gisJoinTargetKey').select_option('site_id')
    page.locator('#gisJoinSourceKey').select_option('site_code')
    page.locator('[data-action="join-preview-attribute"]').click()
    assert page.locator('text=Preview ready').count() == 1
    assert page.locator('[data-action="join-run-attribute"]').is_enabled()
    page.locator('[data-action="join-run-attribute"]').click()
    page.wait_for_selector('text=Assets + Register')
    assert page.locator('text=The original input data was not changed.').count() == 1
    assert page.evaluate("__joinCalls.some(call=>call[0]==='run-attribute')")

    page.evaluate("EditPolygonGISDataTools.openLayer('target','join')")
    page.locator('[data-join-mode="spatial"]').click()
    page.locator('#gisSpatialSource').select_option('source')
    page.locator('#gisSpatialPredicate').select_option('point-in-polygon')
    page.locator('[data-action="join-preview-spatial"]').click()
    page.wait_for_selector('text=Preview ready')
    assert page.locator('[data-action="join-run-spatial"]').is_enabled()
    page.locator('[data-action="join-run-spatial"]').click()
    page.wait_for_selector('text=Spatial result')

    page.evaluate("EditPolygonGISDataTools.openLayer('target','join')")
    page.locator('[data-join-mode="summary"]').click()
    page.locator('[data-summary-group="region"]').check()
    page.locator('[data-action="join-preview-summary"]').click()
    assert page.locator('text=Summary groups').count() == 1
    page.locator('[data-action="join-run-summary"]').click()
    page.wait_for_selector('text=Assets summary')
    assert page.locator('[data-tab="select"]').is_disabled()
    page.locator('[data-tab="join"]').click()
    assert page.locator('[data-join-mode="spatial"]').is_disabled()

    assert not errors, errors
    browser.close()

print('Join and summary browser smoke test passed.')
