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
    context = browser.new_context(viewport={'width': 1280, 'height': 800}, timezone_id='Australia/Brisbane')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('''<!doctype html><html><body>
      <div class="gis-layer-row" data-layer-key="editable:typed-layer"><div class="gis-layer-secondary"></div></div>
      <script>
      window.__typedCalls=[];
      window.__selection={ids:[],count:0,index:-1};
      window.__layer={
        id:'typed-layer',name:'Typed example',crs:'EPSG:4326',count:2,visibleCount:2,
        features:[
          {id:'f1',properties:{name:'Alpha',count:2,ratio:1.25,active:true,day:'2026-08-01',stamp:'2026-08-01T10:30:00.000Z',code:'A012'},filtered:false},
          {id:'f2',properties:{name:'Beta',count:10,ratio:2.5,active:false,day:'2026-08-02',stamp:'2026-08-02T11:45:00.000Z',code:'B100'},filtered:false}
        ],
        schema:{version:1,fields:[
          {name:'name',alias:'Name',type:'text',nullable:false,required:true,readOnly:false,system:true},
          {name:'count',alias:'Count',type:'integer',nullable:true,required:false,readOnly:false},
          {name:'ratio',alias:'Ratio',type:'decimal',nullable:true,required:false,readOnly:false},
          {name:'active',alias:'Active',type:'boolean',nullable:true,required:false,readOnly:false},
          {name:'day',alias:'Day',type:'date',nullable:true,required:false,readOnly:false},
          {name:'stamp',alias:'Timestamp',type:'datetime',nullable:true,required:false,readOnly:false},
          {name:'code',alias:'Code',type:'text',nullable:true,required:false,readOnly:true}
        ],invalid:{}},
        filter:null,savedFilters:[],style:{type:'single',mode:'single'},labels:{enabled:false}
      };
      function refreshCounts(){
        __layer.count=__layer.features.length;
        __layer.visibleCount=__layer.features.filter(feature=>!feature.filtered).length;
      }
      window.EditPolygonGISDataCore={
        fields:features=>Object.keys(features[0]?.properties||{}).map(name=>({name,type:'text'})),
        filter:features=>features,uniqueValues:()=>[],classifyBreaks:()=>[],statistics:()=>({})
      };
      </script>
    </body></html>''')
    page.add_script_tag(path=str(ROOT / 'docs/assets/gis-schema-core.js'))
    page.add_script_tag(content='''
      const schema=window.EditPolygonGISSchemaCore;
      window.EditPolygonGIS={
        getEditableLayers:()=>[window.__layer],
        getEditableLayer:()=>window.__layer,
        getSelection:()=>window.__selection,
        setSelection:ids=>{window.__selection={ids:[...ids],count:ids.length,index:ids.length?0:-1};},
        setAttribute:(layerId,featureId,fieldName,value)=>{
          const field=schema.getField(__layer.schema,fieldName);const result=schema.validateValue(value,field);
          if(!result.ok)throw Error(result.error);__layer.features.find(feature=>feature.id===featureId).properties[fieldName]=result.value;
          __typedCalls.push(['setAttribute',fieldName,result.value]);return result.value;
        },
        addSchemaField:(layerId,definition)=>{
          const field=schema.normaliseField(definition,definition.name);if(!field.name)throw Error('Field name is required.');
          __layer.schema.fields.push(field);for(const feature of __layer.features)feature.properties[field.name]=field.defaultValue;
          __typedCalls.push(['addSchemaField',field.name,field.type]);return {field};
        },
        previewSchemaChange:(layerId,name,patch)=>{
          const field={...schema.getField(__layer.schema,name),...patch};const preview=schema.previewConversion(__layer.features,name,field);
          __typedCalls.push(['previewSchemaChange',name,field.type,preview.invalid]);return preview;
        },
        updateSchemaField:(layerId,name,patch,options={})=>{
          const index=__layer.schema.fields.findIndex(field=>field.name===name);if(index<0)throw Error('Field not found.');
          const current=__layer.schema.fields[index],next=schema.normaliseField({...current,...patch},patch.name||name),preview=schema.previewConversion(__layer.features,name,next);
          if(preview.invalid&&options.invalidPolicy!=='null')throw Error(`${preview.invalid} value(s) cannot be converted.`);
          for(const feature of __layer.features){const converted=schema.validateValue(feature.properties[name],next);feature.properties[next.name]=converted.ok?converted.value:null;if(next.name!==name)delete feature.properties[name];}
          __layer.schema.fields[index]=next;__typedCalls.push(['updateSchemaField',name,next.name,next.type]);return {field:next,preview};
        },
        deleteSchemaField:(layerId,name)=>{__layer.schema.fields=__layer.schema.fields.filter(field=>field.name!==name);for(const feature of __layer.features)delete feature.properties[name];return {name};},
        setFilter:(layerId,filter)=>{
          __layer.filter=filter;for(const feature of __layer.features)feature.filtered=filter?!schema.matchesFilter(feature,filter,__layer.schema):false;refreshCounts();
          __typedCalls.push(['setFilter',filter?.logic||null,filter?.conditions?.length||0]);return {filter,count:__layer.visibleCount,total:__layer.count};
        },
        saveFilter:(layerId,name,filter)=>{if(!name.trim())throw Error('Enter a saved filter name.');const item={id:'saved-'+(__layer.savedFilters.length+1),name,filter:JSON.parse(JSON.stringify(filter))};__layer.savedFilters.push(item);__typedCalls.push(['saveFilter',name]);return item;},
        applySavedFilter:(layerId,id)=>{const item=__layer.savedFilters.find(filter=>filter.id===id);return window.EditPolygonGIS.setFilter(layerId,item.filter);},
        deleteSavedFilter:(layerId,id)=>{__layer.savedFilters=__layer.savedFilters.filter(filter=>filter.id!==id);},
        previewFieldCalculation:(layerId,expression,options)=>{const field={name:'preview',type:options.type,nullable:options.nullable};const result=schema.calculatePreview(__layer.features,expression,field,10);__typedCalls.push(['previewCalculation',options.type,result.invalid]);return result;},
        calculateFieldAdvanced:(layerId,name,expression,options)=>{
          let field=schema.fieldMap(__layer.schema).get(name);if(!field){field=schema.normaliseField({name,alias:name,type:options.type,nullable:options.nullable},name);__layer.schema.fields.push(field);}
          for(let index=0;index<__layer.features.length;index++){const feature=__layer.features[index],value=schema.evaluate(expression,feature.properties,index),result=schema.validateValue(value,field);if(!result.ok)throw Error(result.error);feature.properties[name]=result.value;}
          __typedCalls.push(['calculate',name,field.type]);return {count:__layer.features.length,field};
        },
        exportLayerRecords:(layerId,options)=>{__typedCalls.push(['export',options.scope,options.format]);return {count:__layer.visibleCount,data:{}};},
        getLayerStatistics:()=>({total:2,populated:2,missing:0,uniqueCount:2,numericCount:2,nonNumericCount:0,min:2,max:10,sum:12,mean:6,median:6,stddev:4,q1:2,q3:10,topValues:[]}),
        selectFeature:()=>{},zoomFeature:()=>{},getCrsCatalog:()=>[],getLayerCrsInfo:()=>({source:'EPSG:4326',storage:'EPSG:4326',native:'EPSG:4326',exportCrs:'EPSG:4326',recommendedMetricCrs:'EPSG:32756'}),
        setStyle:()=>({style:__layer.style}),setLabels:()=>{},previewStyle:()=>{},clearStylePreview:()=>{},process:()=>__layer
      };
    ''')
    page.add_script_tag(path=str(ROOT / 'docs/assets/gis-data-tools.js'))

    page.wait_for_selector('.gis-data-open')
    page.locator('.gis-data-open').click()
    page.wait_for_selector('#gisDataModal.active')

    # Typed table controls and schema metadata are visible.
    assert page.locator('td[data-field-cell="active"] select').count() == 2
    assert page.locator('td[data-field-cell="count"] input[type="number"][step="1"]').count() == 2
    assert page.locator('td[data-field-cell="day"] input[type="date"]').count() == 2
    assert page.locator('td[data-field-cell="stamp"] input[type="datetime-local"]').count() == 2
    assert page.locator('tr[data-feature="f1"] td[data-field-cell="stamp"] input').input_value() == '2026-08-01T20:30'
    assert page.locator('td[data-field-cell="code"] input:disabled').count() == 2

    # Datetime controls display local time and round-trip to canonical ISO values.
    stamp = page.locator('tr[data-feature="f1"] td[data-field-cell="stamp"] input')
    stamp.fill('2026-08-01T21:30')
    stamp.dispatch_event('change')
    assert page.evaluate("__layer.features.find(feature=>feature.id==='f1').properties.stamp") == '2026-08-01T11:30:00.000Z'

    # Typed cell editing is validated through the bridge.
    page.locator('tr[data-feature="f2"] td[data-field-cell="active"] select').select_option('true')
    assert page.evaluate("__layer.features.find(feature=>feature.id==='f2').properties.active") is True

    # Multi-column sorting shows ordered priorities.
    page.locator('[data-sort="count"]').click()
    page.locator('[data-sort="name"]').click(modifiers=['Shift'])
    assert '1' in page.locator('[data-sort="count"]').inner_text()
    assert '2' in page.locator('[data-sort="name"]').inner_text()

    # Schema editor adds a typed field.
    page.locator('[data-tab="fields"]').click()
    page.locator('#gisAddFieldName').fill('score')
    page.locator('#gisAddFieldAlias').fill('Score')
    page.locator('#gisAddFieldType').select_option('decimal')
    page.locator('#gisAddFieldDefault').fill('3.5')
    page.locator('[data-action="schema-add"]').click()
    assert page.evaluate("__layer.schema.fields.some(field=>field.name==='score'&&field.type==='decimal')")

    # A history restore must immediately remove the schema row and close an
    # editor whose field no longer exists. This reproduces the v1.52.1
    # phantom-field bug in the real Fields & stats interface.
    page.locator('[data-action="schema-edit"][data-field-name="score"]').click()
    assert page.locator('#gisEditFieldName').input_value() == 'score'
    page.evaluate("""() => {
      __layer.schema.fields=__layer.schema.fields.filter(field=>field.name!=='score');
      for(const feature of __layer.features)delete feature.properties.score;
      window.dispatchEvent(new CustomEvent('editpolygon:history-restored',{detail:{direction:'undo'}}));
    }""")
    page.wait_for_timeout(50)
    assert page.locator('[data-action="schema-edit"][data-field-name="score"]').count() == 0
    assert page.locator('#gisEditFieldName').count() == 0
    assert 'data view has been refreshed' in page.locator('#gisDataStatus').inner_text()

    # Type conversion preview reports incompatible values before mutation.
    page.locator('[data-action="schema-edit"][data-field-name="code"]').click()
    page.locator('#gisEditFieldType').select_option('integer')
    page.locator('[data-action="schema-preview"]').click()
    assert 'Invalid' in page.locator('#gisFieldConversionPreview').inner_text()

    # Deterministic calculator previews and applies typed output.
    page.locator('#gisCalculatorField').fill('double_count')
    page.locator('#gisCalculatorType').select_option('integer')
    page.locator('#gisCalculatorExpression').fill('[count] * 2')
    page.locator('[data-action="preview-calculation"]').click()
    assert 'result(s) valid' in page.locator('#gisCalculationPreview').inner_text()
    page.locator('[data-action="apply-calculation"]').click()
    assert page.evaluate("__layer.features.every(feature=>Number.isInteger(feature.properties.double_count))")

    # Compound filters use field types, can be saved, and update the visible count.
    page.locator('[data-tab="filter"]').click()
    page.locator('[data-filter-index="0"] [data-filter-part="field"]').select_option('count')
    page.locator('[data-filter-index="0"] [data-filter-part="op"]').select_option('gte')
    page.locator('[data-filter-index="0"] [data-filter-part="value"]').fill('5')
    page.locator('[data-action="filter-add"]').click()
    page.locator('[data-filter-index="1"] [data-filter-part="field"]').select_option('active')
    page.locator('[data-filter-index="1"] [data-filter-part="op"]').select_option('eq')
    page.locator('[data-filter-index="1"] [data-filter-part="value"]').select_option('true')
    page.locator('#gisFilterLogic').select_option('and')
    page.locator('[data-action="apply-filter"]').click()
    assert page.evaluate('__layer.visibleCount') == 1
    page.locator('#gisSavedFilterName').fill('Active high counts')
    page.locator('[data-action="save-filter"]').click()
    assert page.evaluate('__layer.savedFilters.length') == 1

    # Scoped export remains reachable from the typed table.
    page.locator('[data-tab="table"]').click()
    page.locator('#gisQuickExportScope').select_option('filtered')
    page.locator('#gisQuickExportFormat').select_option('csv')
    page.locator('[data-action="export-records"]').click()
    assert page.evaluate("__typedCalls.some(call=>call[0]==='export'&&call[1]==='filtered'&&call[2]==='csv')")

    assert not errors, errors
    browser.close()

print('Typed-data browser smoke test passed.')
