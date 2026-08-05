(function(){
'use strict';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let layerId=null;
let selected=new Set();
let sorts=[];
let filterDraft=null;
let editingField='';
let fieldConversionPreview=null;
let calculatorType='text';
let search='';
let page=0;
let pageSize=100;
let crsExportFormat='geojson';
let styleCodeDraft='';
let styleSavedCode='';
let styleCodeLayerId=null;
let stylePreviewActive=false;
let styleCodeTimer=0;
let styleSimpleTimer=0;
let processRunning=false;
let lastStats=null;
let lastCalculationPreview=[];

function api(){return window.EditPolygonGIS;}
function core(){return window.EditPolygonGISDataCore;}
function styleCore(){return window.EditPolygonGISStyleCore;}
function schemaCore(){return window.EditPolygonGISSchemaCore;}
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function layers(){return api()?.getEditableLayers?.()||[];}
function active(){return layerId?api()?.getEditableLayer?.(layerId):null;}
function selectedOption(value,current){return value===current?'selected':'';}

function ensureButtons(){
  document.querySelectorAll('.gis-layer-row[data-layer-key^="editable:"]').forEach(row=>{
    if(row.querySelector('.gis-data-open'))return;
    const id=row.dataset.layerKey.split(':')[1];
    const secondary=row.querySelector('.gis-layer-secondary')||row;
    const button=document.createElement('button');
    button.type='button';
    button.className='gis-mini gis-data-open';
    button.textContent='Table';
    button.title='Open attribute table and GIS tools';
    button.addEventListener('click',()=>open(id));
    secondary.appendChild(button);
  });
}

function modal(){
  let element=$('gisDataModal');
  if(element)return element;
  element=document.createElement('div');
  element.id='gisDataModal';
  element.className='gis-data-modal';
  element.innerHTML=`<div class="gis-data-shell"><header><div><strong id="gisDataTitle">Layer data</strong><span id="gisDataSummary"></span></div><nav><button data-tab="table" class="active">Attributes</button><button data-tab="select">Select</button><button data-tab="filter">Filter</button><button data-tab="style">Style & labels</button><button data-tab="fields">Fields & stats</button><button data-tab="crs">CRS</button><button data-tab="process">Process</button></nav><button id="gisDataClose" aria-label="Close">×</button></header><main id="gisDataBody"></main><footer><span id="gisDataStatus">All processing stays in this browser.</span><button id="gisDataDone">Done</button></footer></div>`;
  document.body.appendChild(element);
  element.addEventListener('click',click);
  element.addEventListener('change',change);
  element.addEventListener('input',input);
  $('gisDataClose').onclick=close;
  $('gisDataDone').onclick=close;
  return element;
}

function resetStyleState(layer){
  const engine=styleCore();
  styleCodeLayerId=layer?.id||null;
  const activeStyle=layer?.style||layer?.activeStyle||{};styleSavedCode=engine?engine.stringifyStyle(activeStyle):JSON.stringify(activeStyle,null,2);
  styleCodeDraft=styleSavedCode;
  stylePreviewActive=false;
}
function open(id,initialTab='table'){
  if(layerId&&stylePreviewActive)api()?.clearStylePreview?.(layerId);
  layerId=id;
  selected.clear();
  const globalSelection=new Set(api()?.getSelection?.().ids||[]);
  const openingLayer=layers().find(item=>item.id===id);
  for(const feature of openingLayer?.features||[])if(globalSelection.has(feature.id))selected.add(feature.id);
  page=0;
  const layer=active();
  filterDraft=clone(layer?.filter)||null;editingField='';fieldConversionPreview=null;lastCalculationPreview=[];
  resetStyleState(layer);
  modal().classList.add('active');
  render(initialTab);
}
function close(){
  if(layerId&&stylePreviewActive)api()?.clearStylePreview?.(layerId);
  stylePreviewActive=false;
  $('gisDataModal')?.classList.remove('active');
}
function status(text,kind=''){
  const target=$('gisDataStatus');if(!target)return;
  target.textContent=text;
  target.dataset.kind=kind;
}
function tab(){return $('gisDataModal')?.querySelector('nav button.active')?.dataset.tab||'table';}
function render(which=tab()){
  const layer=active();if(!layer)return;
  if(styleCodeLayerId!==layer.id)resetStyleState(layer);
  modal().querySelectorAll('nav button').forEach(button=>button.classList.toggle('active',button.dataset.tab===which));
  $('gisDataTitle').textContent=layer.name;
  $('gisDataSummary').textContent=`${layer.features.length.toLocaleString()} features · ${layer.crs}`;
  updateFilterTabState(layer);
  $('gisDataBody').innerHTML=which==='select'?selectionView(layer):which==='filter'?filterView(layer):which==='style'?styleView(layer):which==='fields'?fieldsView(layer):which==='crs'?crsView(layer):which==='process'?processView(layer):tableView(layer);
  if(which==='style')requestAnimationFrame(()=>{updateStyleControlVisibility();updateStyleCodeFeedback();});
}

function refreshAfterHistory(event){
  const dialog=$('gisDataModal');
  if(!dialog?.classList.contains('active'))return;
  const layer=active();
  if(!layer){close();return;}
  const which=tab();
  const body=$('gisDataBody');
  const scrollTop=body?.scrollTop||0;
  const names=new Set(schemaFields(layer).map(field=>field.name));
  sorts=sorts.filter(rule=>names.has(rule.field));
  if(editingField&&!names.has(editingField)){
    editingField='';
    fieldConversionPreview=null;
  }
  if(which==='filter')filterDraft=clone(layer.filter)||{version:1,logic:'and',conditions:[blankCondition(layer)]};
  if(which==='style')resetStyleState(layer);
  render(which);
  requestAnimationFrame(()=>{
    const next=$('gisDataBody');
    if(next)next.scrollTop=Math.min(scrollTop,Math.max(0,next.scrollHeight-next.clientHeight));
  });
  const direction=event?.detail?.direction==='redo'?'Redo':'Undo';
  status(`${direction} applied. The data view has been refreshed.`,'ok');
}

function schemaFields(layer){return layer?.schema?.fields||core().fields(layer.features).map(field=>({name:field.name,alias:field.name,type:field.type==='number'?'decimal':field.type==='boolean'?'boolean':'text',nullable:true,required:false,readOnly:false}));}
function schemaField(layer,name){return schemaFields(layer).find(field=>field.name===name)||{name,alias:name,type:'text',nullable:true};}
function fieldNames(layer){return schemaFields(layer).map(field=>field.name);}
function activeFilterState(layer){
  const filter=layer?.filter;
  const conditions=(Array.isArray(filter?.conditions)?filter.conditions:[]).filter(condition=>condition&&condition.field&&condition.op);
  const total=Number(layer?.count??layer?.features?.length??0);
  const shown=Number(layer?.visibleCount??total);
  return {active:conditions.length>0,total,shown,hidden:Math.max(0,total-shown),conditions:conditions.length,logic:filter?.logic==='or'?'OR':'AND'};
}
function updateFilterTabState(layer){
  const button=$('gisDataModal')?.querySelector('nav button[data-tab="filter"]');if(!button)return;
  const state=activeFilterState(layer);
  button.classList.toggle('has-active-filter',state.active);
  button.setAttribute('aria-label',state.active?`Filter active. ${state.shown} of ${state.total} features shown.`:'Filter');
  button.innerHTML=state.active?`Filter <span class="gis-tab-badge">${state.shown}/${state.total}</span>`:'Filter';
}
function fieldLabel(field){return field.alias&&field.alias!==field.name?`${field.alias} (${field.name})`:field.name;}
function typeOptions(current){return (schemaCore()?.FIELD_TYPES||['text','integer','decimal','boolean','date','datetime']).map(type=>`<option value="${type}" ${type===current?'selected':''}>${esc(schemaCore()?.TYPE_LABELS?.[type]||type)}</option>`).join('');}
function datetimeLocalValue(value){if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return String(value).replace(/Z$/,'').slice(0,19);const pad=number=>String(number).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;}
function cellInput(feature,field){
  const value=feature.properties?.[field.name],disabled=field.readOnly?'disabled':'',isNull=value==null,common=`data-field="${esc(field.name)}" ${disabled} aria-label="${esc(fieldLabel(field))}"`;
  let control='';
  if(field.type==='boolean')control=`<select ${common}><option value="__null__" ${isNull?'selected':''}>NULL</option><option value="true" ${value===true?'selected':''}>True</option><option value="false" ${value===false?'selected':''}>False</option></select>`;
  else{const type=field.type==='integer'||field.type==='decimal'?'number':field.type==='date'?'date':field.type==='datetime'?'datetime-local':'text';const step=field.type==='integer'?'1':field.type==='decimal'?'any':field.type==='datetime'?'1':'';let display=value??'';if(field.type==='datetime'&&value)display=datetimeLocalValue(value);control=`<input type="${type}" ${step?`step="${step}"`:''} value="${esc(display)}" placeholder="${isNull?'NULL':''}" ${common}>`;}
  return `<div class="gis-typed-cell ${isNull?'is-null':''} ${field.readOnly?'is-readonly':''}">${control}${!field.readOnly?`<button type="button" class="gis-cell-null" data-action="cell-null" title="Set NULL" aria-label="Set ${esc(fieldLabel(field))} to null">∅</button>`:''}</div>`;
}
function filteredRows(layer){
  let rows=layer.features.filter(feature=>!feature.filtered);
  if(search){const query=search.toLowerCase();rows=rows.filter(feature=>Object.values(feature.properties||{}).some(value=>String(value??'').toLowerCase().includes(query)));}
  return schemaCore()?.sortRows?schemaCore().sortRows(rows,sorts,layer.schema):rows;
}
function sortMark(field){const index=sorts.findIndex(rule=>rule.field===field);if(index<0)return '';return `${sorts[index].dir>0?' ▲':' ▼'}${sorts.length>1?` ${index+1}`:''}`;}
function tableView(layer){
  const fields=schemaFields(layer),rows=filteredRows(layer),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);const shown=rows.slice(page*pageSize,(page+1)*pageSize),filterState=activeFilterState(layer);
  const filterNotice=filterState.active?`<div class="gis-table-filter-state" role="status"><div><strong>Filter active</strong><span>${filterState.shown.toLocaleString()} of ${filterState.total.toLocaleString()} records shown · ${filterState.hidden.toLocaleString()} hidden</span></div><div><button data-action="open-filter">Edit filter</button><button data-action="clear-filter">Clear filter</button></div></div>`:'';
  return `${filterNotice}<section class="gis-data-toolbar gis-table-toolbar"><input id="gisTableSearch" placeholder="Search visible records" value="${esc(search)}"><button data-action="add-field">Add field</button><button data-action="calculate">Field calculator</button><label>Rows<select id="gisPageSize"><option ${pageSize===50?'selected':''}>50</option><option ${pageSize===100?'selected':''}>100</option><option ${pageSize===250?'selected':''}>250</option></select></label><label>Export scope<select id="gisQuickExportScope"><option value="filtered">Filtered records</option><option value="selected">Selected records</option><option value="visible">Visible records</option><option value="all">Entire layer</option></select></label><label>Format<select id="gisQuickExportFormat"><option value="geojson">GeoJSON</option><option value="csv">CSV + WKT</option></select></label><button data-action="export-records">Export</button><span>${rows.length.toLocaleString()} visible</span></section><div class="gis-table-sort-help">Click a heading to sort. Shift-click adds another sort field.</div><div class="gis-table-wrap"><table><thead><tr><th><input id="gisSelectAll" type="checkbox"></th><th>#</th>${fields.map(field=>`<th><button data-sort="${esc(field.name)}"><span>${esc(field.alias||field.name)}</span><small>${esc(field.type)}${field.readOnly?' · read-only':''}</small>${sortMark(field.name)}</button></th>`).join('')}</tr></thead><tbody>${shown.map((feature,index)=>`<tr data-feature="${feature.id}" class="${selected.has(feature.id)?'selected':''}"><td><input class="gis-row-check" type="checkbox" ${selected.has(feature.id)?'checked':''}></td><td><button data-action="zoom-row">${page*pageSize+index+1}</button></td>${fields.map(field=>`<td data-field-cell="${esc(field.name)}" class="${layer.schema?.invalid?.[field.name]?'has-schema-invalid':''}">${cellInput(feature,field)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><section class="gis-pager"><button data-action="prev" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1} of ${pages}</span><button data-action="next" ${page>=pages-1?'disabled':''}>Next</button></section>`;
}
function blankCondition(layer){const field=fieldNames(layer)[0]||'';return {field,op:'eq',value:'',value2:''};}
function currentFilterDraft(layer){if(!filterDraft)filterDraft=clone(layer.filter)||{version:1,logic:'and',conditions:[blankCondition(layer)]};if(!filterDraft.conditions?.length)filterDraft.conditions=[blankCondition(layer)];return filterDraft;}
function operatorOptions(type,current){const base=[['eq','equals'],['neq','does not equal'],['empty','is NULL / empty'],['notempty','is populated']];const text=[['contains','contains'],['notcontains','does not contain'],['starts','starts with'],['ends','ends with'],['in','is one of']];const ordered=[['gt','greater than'],['gte','at least'],['lt','less than'],['lte','at most'],['between','between'],['in','is one of']];const options=type==='text'?[...base.slice(0,2),...text,...base.slice(2)]:type==='boolean'?base:[...base.slice(0,2),...ordered,...base.slice(2)];return options.map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`).join('');}
function filterValueControl(field,condition,part){const value=condition?.[part]??'',op=condition?.op||'eq';if(part==='value'&&field.type==='boolean'&&!['empty','notempty','in'].includes(op))return `<select data-filter-part="${part}"><option value="true" ${String(value)==='true'?'selected':''}>True</option><option value="false" ${String(value)==='false'?'selected':''}>False</option></select>`;const type=['integer','decimal'].includes(field.type)&&op!=='in'?'number':field.type==='date'?'date':field.type==='datetime'?'datetime-local':'text',step=field.type==='integer'?'1':field.type==='decimal'?'any':field.type==='datetime'?'1':'';return `<input type="${type}" ${step?`step="${step}"`:''} data-filter-part="${part}" value="${esc(value)}" ${part==='value'&&['empty','notempty'].includes(op)?'disabled':''}>`; }
function conditionHtml(layer,condition,index){const field=schemaField(layer,condition.field),needsSecond=condition.op==='between';return `<div class="gis-filter-condition" data-filter-index="${index}"><label>Field<select data-filter-part="field">${schemaFields(layer).map(item=>`<option value="${esc(item.name)}" ${item.name===condition.field?'selected':''}>${esc(fieldLabel(item))}</option>`).join('')}</select></label><label>Operator<select data-filter-part="op">${operatorOptions(field.type,condition.op)}</select></label><label>Value${filterValueControl(field,condition,'value')}</label><label class="${needsSecond?'':'gis-filter-second-hidden'}">Second value${filterValueControl(field,condition,'value2')}</label><button type="button" data-action="filter-remove" ${currentFilterDraft(layer).conditions.length===1?'disabled':''}>Remove</button></div>`;}
function readFilterDraft(){const root=$('gisFilterConditions');if(!root)return filterDraft;const conditions=[...root.querySelectorAll('.gis-filter-condition')].map(row=>({field:row.querySelector('[data-filter-part="field"]')?.value||'',op:row.querySelector('[data-filter-part="op"]')?.value||'eq',value:row.querySelector('[data-filter-part="value"]')?.value??'',value2:row.querySelector('[data-filter-part="value2"]')?.value??''}));return {version:1,logic:$('gisFilterLogic')?.value||'and',conditions};}
function filterView(layer){
  const draft=currentFilterDraft(layer),saved=layer.savedFilters||[],state=activeFilterState(layer);
  const stateBanner=state.active?`<div class="gis-filter-state active" role="status"><div><strong>Filter active</strong><span>${state.shown.toLocaleString()} of ${state.total.toLocaleString()} features shown · ${state.hidden.toLocaleString()} hidden · ${state.conditions} condition${state.conditions===1?'':'s'} (${state.logic})</span></div><div><button data-action="view-filtered-records">View matching records</button><button data-action="clear-filter">Clear filter</button></div></div>`:`<div class="gis-filter-state inactive"><div><strong>No active filter</strong><span>All ${state.total.toLocaleString()} features are currently included.</span></div></div>`;
  return `${stateBanner}<section class="gis-tool-card gis-filter-builder"><div class="gis-tool-heading"><div><h3>Filter features</h3><p>Build one or more type-aware conditions. Records that do not match are hidden from the map, table and processing outputs until the filter is cleared.</p></div><strong>${state.shown.toLocaleString()} / ${state.total.toLocaleString()}</strong></div><label>Match<select id="gisFilterLogic"><option value="and" ${draft.logic!=='or'?'selected':''}>All conditions (AND)</option><option value="or" ${draft.logic==='or'?'selected':''}>Any condition (OR)</option></select></label><div id="gisFilterConditions">${draft.conditions.map((condition,index)=>conditionHtml(layer,condition,index)).join('')}</div><div class="gis-button-row"><button data-action="filter-add">Add condition</button><button class="primary" data-action="apply-filter">${state.active?'Update active filter':'Apply filter'}</button><button data-action="clear-filter" ${state.active?'':'disabled'}>Clear active filter</button></div><div class="gis-saved-filter-create"><label>Saved filter name<input id="gisSavedFilterName" placeholder="For example Active high priority"></label><button data-action="save-filter">Save current filter</button></div></section><section class="gis-tool-card"><h3>Saved filters</h3>${saved.length?`<div class="gis-saved-filter-list">${saved.map(item=>`<div><div><strong>${esc(item.name)}</strong><span>${item.filter?.conditions?.length||0} condition(s)</span></div><button data-action="apply-saved-filter" data-filter-id="${esc(item.id)}">Apply</button><button data-action="delete-saved-filter" data-filter-id="${esc(item.id)}">Delete</button></div>`).join('')}</div>`:'<p class="gis-empty-result">No filters have been saved for this layer.</p>'}</section>`;
}

function styleGeometryFamily(layer){return styleCore().geometryFamily(layer.features.map(feature=>feature.geometryType));}
function styleTargetOptions(family,current,type){
  const options=[['color',family==='polygon'?'Fill colour':family==='line'?'Line colour':family==='point'?'Point colour':'Feature colour']];
  if(type!=='categorized'&&family==='point')options.push(['radius','Point size']);
  if(type!=='categorized'&&(family==='line'||family==='polygon'))options.push(['weight',family==='line'?'Line width':'Outline width']);
  return options.map(([value,label])=>`<option value="${value}" ${selectedOption(value,current)}>${label}</option>`).join('');
}
function styleFieldSummary(layer,field){
  if(!field)return '<span>Choose an attribute to see its distribution.</span>';
  const summary=styleCore().fieldSummary(layer.features,field);
  const parts=[`${summary.nonNull.toLocaleString()} values`,`${summary.uniqueCount.toLocaleString()} unique`];
  if(summary.numericCount)parts.push(`range ${esc(styleCore().fmt(summary.min))}–${esc(styleCore().fmt(summary.max))}`);
  if(summary.missing)parts.push(`${summary.missing.toLocaleString()} null`);
  if(summary.invalidNumeric)parts.push(`${summary.invalidNumeric.toLocaleString()} non-numeric`);
  return parts.map(part=>`<span>${part}</span>`).join('');
}
function styleLegendHtml(style){
  const model=styleCore().legendModel(style);
  if(model.type==='continuous'){
    const nullEntry=model.nullCount?`<div class="gis-style-legend gis-style-null-entry"><span>${styleLegendMark({color:model.nullSymbol?.fillColor},'color')}<b>Null / invalid</b><small>${model.nullCount.toLocaleString()}</small></span></div>`:'';
    if(model.target==='color')return `<div class="gis-style-gradient" style="background:linear-gradient(90deg,${model.colorRamp.map((color,index)=>`${color} ${Math.round(index*100/Math.max(1,model.colorRamp.length-1))}%`).join(',')})"></div><div class="gis-style-range"><span>${esc(styleCore().fmt(model.min))}</span><strong>${esc(model.title)}</strong><span>${esc(styleCore().fmt(model.max))}</span></div>${nullEntry}`;
    return `<div class="gis-style-legend gis-style-size-legend"><span>${styleLegendMark({value:model.outputRange[0]},model.target)}${esc(styleCore().fmt(model.min))}</span><span>${styleLegendMark({value:model.outputRange[1]},model.target)}${esc(styleCore().fmt(model.max))}</span></div>${nullEntry}`;
  }
  const entries=[...(model.entries||[])];if(model.nullCount)entries.push({label:'Null / invalid',count:model.nullCount,color:model.nullSymbol?.fillColor});
  return `<div class="gis-style-legend">${entries.slice(0,50).map(entry=>`<span>${styleLegendMark(entry,entry.label==='Null / invalid'?'color':model.target)}<b>${esc(entry.label)}</b>${Number.isFinite(entry.count)?`<small>${entry.count.toLocaleString()}</small>`:''}</span>`).join('')}</div>`;
}
function styleLegendMark(entry,target){
  if(target==='radius'){const size=Math.max(6,Math.min(22,Number(entry.value)||8));return `<i class="gis-style-circle" style="width:${size}px;height:${size}px"></i>`;}
  if(target==='weight'){const width=Math.max(1,Math.min(10,Number(entry.value)||2));return `<i class="gis-style-line" style="border-top-width:${width}px"></i>`;}
  return `<i style="background:${esc(entry.color||'#b6bec9')}"></i>`;
}
function styleView(layer){
  const engine=styleCore(),parsed=engine.parseStyleCode(styleCodeDraft),saved=engine.normaliseStyle(layer.style||{}),working=parsed.valid?parsed.style:saved;
  const config=engine.simpleConfig(working),fields=fieldNames(layer),family=styleGeometryFamily(layer),type=config.type||'single',activeMode=layer.styleMode||'simple';
  const labels=layer.labels||{},advancedSaved=!!layer.advancedStyleAvailable;
  const paletteOptions=Object.entries(engine.PALETTES).map(([name,colors])=>`<option value="${esc(name)}" data-start="${colors[0]}" data-end="${colors.at(-1)}">${esc(name)}</option>`).join('');
  const modeNotice=activeMode==='advanced'?`<div class="gis-style-mode-banner advanced"><strong>Advanced styling is active</strong><span>${esc(layer.styleLabel||'Data-driven style')}</span><small>The simple layer colour and ordinary Inspector controls cannot edit this classification. Use this editor, or explicitly switch to Single symbol.</small></div>`:`<div class="gis-style-mode-banner simple"><strong>Single-symbol styling is active</strong><span>The simple layer controls and this Single symbol mode edit the same layer symbol.</span>${advancedSaved?'<small>Your previous advanced configuration is retained.</small><button type="button" data-action="style-restore-advanced">Load saved advanced style</button>':''}</div>`;
  return `<section class="gis-tool-card gis-style-editor-card">${modeNotice}<div class="gis-style-heading"><div><h3>Style & labels</h3><p>Build the layer style visually, then inspect or edit the declarative JSON below.</p></div><span class="gis-style-family">${esc(family)} layer</span></div><div class="gis-style-simple"><h4>Visual editor</h4><div class="gis-form-grid gis-style-form"><label>Mode<select id="gisStyleMode"><option value="single" ${selectedOption('single',type)}>Single symbol</option><option value="categorized" ${selectedOption('categorized',type)}>Unique categories</option><option value="graduated" ${selectedOption('graduated',type)}>Numeric classes</option><option value="continuous" ${selectedOption('continuous',type)}>Continuous numeric scale</option></select></label><label data-style-driven>Attribute<select id="gisStyleField"><option value="">Choose field</option>${fields.map(field=>`<option value="${esc(field)}" ${selectedOption(field,config.field)}>${esc(field)}</option>`).join('')}</select></label><label data-style-driven>Visual property<select id="gisStyleTarget">${styleTargetOptions(family,type==='categorized'?'color':config.target,type)}</select></label><label data-style-graduated>Classification<select id="gisStyleMethod"><option value="equalInterval" ${selectedOption('equalInterval',config.method)}>Equal interval</option><option value="quantile" ${selectedOption('quantile',config.method)}>Quantile</option><option value="manual" ${selectedOption('manual',config.method)}>Manual boundaries</option></select></label><label data-style-graduated>Classes<input id="gisStyleClasses" type="number" min="2" max="9" value="${config.classCount||5}"></label><label class="gis-span-2" data-style-manual>Manual upper boundaries<input id="gisStyleManualBreaks" placeholder="For example 100, 500, 2000" value="${esc(config.manualBreaks||'')}"></label><label data-style-colour>Colour ramp<select id="gisStylePalette"><option value="custom">Custom endpoints</option>${paletteOptions}</select></label><label data-style-colour>Start colour<input id="gisStyleStartColor" type="color" value="${esc(config.startColor)}"></label><label data-style-colour>End colour<input id="gisStyleEndColor" type="color" value="${esc(config.endColor)}"></label><label data-style-output>Minimum size<input id="gisStyleOutputMin" type="number" min="0" max="80" step="0.5" value="${config.outputMin}"></label><label data-style-output>Maximum size<input id="gisStyleOutputMax" type="number" min="0" max="80" step="0.5" value="${config.outputMax}"></label><label>Base colour<input id="gisStyleBaseColor" type="color" value="${esc(config.symbol.fillColor)}"></label><label>Outline / line width<input id="gisStyleWeight" type="number" min="0" max="30" step="0.5" value="${config.symbol.weight}"></label><label>Point size<input id="gisStyleRadius" type="number" min="1" max="80" step="0.5" value="${config.symbol.radius}"></label><label>Fill opacity<input id="gisStyleFill" type="range" min="0" max="100" value="${Math.round(config.symbol.fillOpacity*100)}"><output id="gisStyleFillOutput">${Math.round(config.symbol.fillOpacity*100)}%</output></label><label>Null / invalid colour<input id="gisStyleNullColor" type="color" value="${esc(config.nullSymbol.fillColor)}"></label></div><div id="gisStyleFieldStats" class="gis-style-stats">${styleFieldSummary(layer,config.field)}</div><button data-action="style-regenerate">Regenerate code from visual editor</button></div><div class="gis-style-preview"><div><h4>Legend preview</h4><span>Advanced styles create a map legend automatically.</span></div><div id="gisStyleLegend">${styleLegendHtml(working)}</div></div><div class="gis-style-code-panel"><div class="gis-style-code-head"><div><h4>Style code</h4><span>Edit the JSON directly. Invalid code is never applied.</span></div><button data-action="style-format">Format code</button><button data-action="style-load-simple">Load code into visual editor</button></div><textarea id="gisStyleCode" spellcheck="false" aria-label="Layer style JSON">${esc(styleCodeDraft)}</textarea><div id="gisStyleCodeError" class="gis-style-code-status" aria-live="polite"></div></div><div class="gis-style-actions"><button data-action="style-revert">Revert</button><button data-action="style-preview">Preview on map</button><button class="primary" data-action="style-apply">Apply ${type==='single'?'single symbol':'advanced style'}</button></div></section><section class="gis-tool-card"><h3>Labels</h3><div class="gis-form-grid"><label class="gis-check"><input id="gisLabelsEnabled" type="checkbox" ${labels.enabled?'checked':''}> Show labels</label><label>Label field<select id="gisLabelField"><option value="">Choose field</option>${fields.map(field=>`<option ${labels.field===field?'selected':''}>${esc(field)}</option>`).join('')}</select></label></div><button data-action="apply-labels">Apply labels</button></section>`;
}
function currentSimpleConfig(layer){
  const type=$('gisStyleMode')?.value||'single';
  const target=type==='categorized'?'color':($('gisStyleTarget')?.value||'color');
  let ramp=[$('gisStyleStartColor')?.value||'#eff3ff',$('gisStyleEndColor')?.value||'#08519c'];
  const baseColor=$('gisStyleBaseColor')?.value||'#1664d6';
  return {
    type,
    field:$('gisStyleField')?.value||'',
    target,
    method:$('gisStyleMethod')?.value||'equalInterval',
    classCount:Number($('gisStyleClasses')?.value||5),
    manualBreaks:String($('gisStyleManualBreaks')?.value||'').split(/[;,\s]+/).map(Number).filter(Number.isFinite),
    colorRamp:ramp,
    outputRange:[Number($('gisStyleOutputMin')?.value||4),Number($('gisStyleOutputMax')?.value||18)],
    symbol:{color:baseColor,fillColor:baseColor,weight:Number($('gisStyleWeight')?.value||2),fillOpacity:Number($('gisStyleFill')?.value||35)/100,opacity:1,radius:Number($('gisStyleRadius')?.value||5)},
    nullSymbol:{color:$('gisStyleNullColor')?.value||'#8b95a5',fillColor:$('gisStyleNullColor')?.value||'#b6bec9',weight:1.5,fillOpacity:.5,opacity:.85,radius:5}
  };
}
function regenerateStyleCode(layer,{announce=false}={}){
  try{
    const style=styleCore().buildStyle(currentSimpleConfig(layer),layer.features);
    styleCodeDraft=styleCore().stringifyStyle(style);
    const textarea=$('gisStyleCode');if(textarea)textarea.value=styleCodeDraft;
    const stats=$('gisStyleFieldStats');if(stats)stats.innerHTML=styleFieldSummary(layer,currentSimpleConfig(layer).field);
    updateStyleCodeFeedback();
    if(announce)status('Style code regenerated from the simple editor.','ok');
    return style;
  }catch(error){
    const target=$('gisStyleCodeError');if(target){target.textContent=error.message;target.dataset.kind='error';}
    if(announce)status(error.message,'error');
    return null;
  }
}
function updateStyleControlVisibility(){
  const mode=$('gisStyleMode')?.value||'single',target=mode==='categorized'?'color':($('gisStyleTarget')?.value||'color'),method=$('gisStyleMethod')?.value||'equalInterval';
  document.querySelectorAll('[data-style-driven]').forEach(element=>element.hidden=mode==='single');
  document.querySelectorAll('[data-style-graduated]').forEach(element=>element.hidden=mode!=='graduated');
  document.querySelectorAll('[data-style-manual]').forEach(element=>element.hidden=mode!=='graduated'||method!=='manual');
  document.querySelectorAll('[data-style-colour]').forEach(element=>element.hidden=mode==='single'||target!=='color');
  document.querySelectorAll('[data-style-output]').forEach(element=>element.hidden=mode==='single'||target==='color');
  const targetSelect=$('gisStyleTarget');if(targetSelect&&mode==='categorized'&&targetSelect.value!=='color')targetSelect.value='color';
  const fill=$('gisStyleFill'),output=$('gisStyleFillOutput');if(fill&&output)output.value=`${fill.value}%`;
}
function updateStyleCodeFeedback(){
  const engine=styleCore(),textarea=$('gisStyleCode');if(textarea)styleCodeDraft=textarea.value;
  const parsed=engine.parseStyleCode(styleCodeDraft),message=$('gisStyleCodeError'),legend=$('gisStyleLegend');
  if(message){
    message.textContent=parsed.valid?'Valid style code. Ready to preview or apply.':parsed.errors.join(' ');
    message.dataset.kind=parsed.valid?'ok':'error';
  }
  if(legend&&parsed.valid)legend.innerHTML=styleLegendHtml(parsed.style);
  return parsed;
}
function parseCurrentStyle(){
  const parsed=updateStyleCodeFeedback();
  if(!parsed.valid)throw new Error(parsed.errors.join(' '));
  return parsed.style;
}

function crsView(layer){
  const info=api().getLayerCrsInfo?.(layerId)||{source:layer.sourceCrs||layer.crs,storage:'EPSG:4326',native:layer.crs,exportCrs:layer.exportCrs||layer.crs,recommendedMetricCrs:layer.recommendedMetricCrs||'—'};
  const catalog=api().getCrsCatalog?.()||[];
  const optionList=(current,details)=>{const list=[...catalog];if(current&&!list.some(item=>item.code===current))list.unshift({code:current,name:details?.name||'Current layer CRS'});return list.map(item=>`<option value="${esc(item.code)}" ${current===item.code?'selected':''}>${esc(item.code)} — ${esc(item.name)}</option>`).join('');};
  const options=optionList(info.native,info.nativeInfo),exportOptions=optionList(info.exportCrs,info.exportInfo);
  const sample=info.sampleNative?info.sampleNative.slice(0,2).map(value=>Number(value).toLocaleString(undefined,{maximumFractionDigits:4})).join(', '):'—';
  return `<section class="gis-tool-card"><h3>Coordinate reference system</h3><p>EditPolygon keeps map geometry internally in WGS 84 longitude/latitude so every layer can be drawn together. A layer can retain a different source/native CRS and export back to it.</p><div class="gis-crs-summary"><div><span>Original/source CRS</span><strong>${esc(info.source||'Unknown')}</strong></div><div><span>Internal map storage</span><strong>${esc(info.storage||'EPSG:4326')}</strong></div><div><span>Native coordinate display</span><strong>${esc(info.native||'EPSG:4326')}</strong></div><div><span>Preferred export CRS</span><strong>${esc(info.exportCrs||'EPSG:4326')}</strong></div><div><span>Suggested metric CRS</span><strong>${esc(info.recommendedMetricCrs||'—')}</strong></div></div>${info.needsAssignment?'<div class="gis-warning"><strong>Coordinates appear outside longitude/latitude range.</strong> Choose the CRS these numeric coordinates currently use, then use Interpret and reproject.</div>':''}${info.datumApproximation?'<div class="gis-warning">GDA94/GDA2020 transformations in this browser build use the CRS ellipsoid and a zero-parameter datum approximation. This is suitable for general GIS display and editing, but not survey-grade cadastral transformation requiring official grid files.</div>':''}<div class="gis-form-grid"><label class="gis-span-2">Source/native CRS<select id="gisCrs">${options}</select></label><label class="gis-span-2">Or enter a supported EPSG code<input id="gisCrsCustom" placeholder="For example EPSG:28356"></label></div><div class="gis-button-row"><button class="${info.needsAssignment?'':'primary'}" data-action="apply-crs">Assign metadata only</button><button class="${info.needsAssignment?'primary':'danger'}" data-action="interpret-crs">Interpret current coordinates and reproject to map</button></div><div class="gis-warning">Use <strong>Assign metadata only</strong> when the layer is already in the correct map position. Use <strong>Interpret and reproject</strong> only when projected easting/northing values were mistakenly treated as longitude/latitude.</div></section><section class="gis-tool-card"><h3>CRS-aware coordinates and export</h3><p>Sample coordinate in ${esc(info.native||'the native CRS')}: <strong>${esc(sample)}</strong></p><div class="gis-form-grid"><label>Export CRS<select id="gisExportCrs">${exportOptions}</select></label><label>Format<select id="gisCrsExportFormat"><option value="geojson" ${crsExportFormat==='geojson'?'selected':''}>GeoJSON</option><option value="shp" ${crsExportFormat==='shp'?'selected':''}>Shapefile ZIP + .prj</option><option value="wkt" ${crsExportFormat==='wkt'?'selected':''}>WKT</option><option value="csv" ${crsExportFormat==='csv'?'selected':''}>CSV + geometry WKT</option></select></label></div><div class="gis-button-row"><button data-action="set-export-crs">Save export CRS</button><button class="primary" data-action="export-crs-geojson">Download layer</button></div><div class="gis-note">GeoJSON exported in a projected CRS includes a legacy <code>crs</code> member. RFC 7946 GeoJSON is always WGS 84; choose EPSG:4326 for maximum interoperability.</div></section>`;
}
function selectionModeOptions(current='replace'){return [['replace','Replace selection'],['add','Add to selection'],['remove','Remove from selection'],['intersect','Keep only matching selected']].map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`).join('');}
function selectionView(layer){
  const info=api()?.getSelection?.()||{count:0,index:-1,ids:[]},fields=fieldNames(layer),others=layers().filter(item=>item.id!==layer.id);
  const selectedIds=new Set(info.ids||[]),layerSelected=(layer.features||[]).filter(feature=>selectedIds.has(feature.id)).length;
  return `<section class="gis-tool-card gis-selection-card"><div class="gis-tool-heading"><div><h3>Selection</h3><p>Select features on the map, by attributes, or by their spatial relationship to another layer.</p></div><strong>${info.count.toLocaleString()} selected</strong></div><div class="gis-selection-summary"><span>${info.count?`Viewing ${Math.max(1,info.index+1)} of ${info.count}`:'No active selection'}${info.count&&layerSelected!==info.count?` · ${layerSelected.toLocaleString()} in this layer`:''}</span><div><button data-action="selection-prev" ${info.count<2?'disabled':''}>Previous</button><button data-action="selection-next" ${info.count<2?'disabled':''}>Next</button><button data-action="selection-clear" ${!info.count?'disabled':''}>Clear</button></div></div><div class="gis-selection-save"><label>New layer name<input id="gisSelectionLayerName" value="${esc(layer.name)} — selection"></label><button data-action="selection-save" ${!layerSelected?'disabled':''}>Save ${layerSelected.toLocaleString()} selected as new layer</button></div></section>
  <section class="gis-tool-card gis-map-selection-entry"><h3>Select on the map</h3><p>Rectangle, polygon and lasso tools are available from the main <strong>Select</strong> button on the left toolbar. They display a live boundary, area and distance while you draw.</p><button class="primary" data-action="open-select-menu">Open map selection tools</button></section>
  <section class="gis-tool-card"><h3>Select by attribute</h3><div class="gis-form-grid"><label>Field<select id="gisSelectAttributeField">${fields.map(field=>`<option value="${esc(field)}">${esc(field)}</option>`).join('')}</select></label><label>Operator<select id="gisSelectAttributeOp"><option value="eq">equals</option><option value="neq">does not equal</option><option value="contains">contains</option><option value="notcontains">does not contain</option><option value="starts">starts with</option><option value="ends">ends with</option><option value="gt">greater than</option><option value="gte">at least</option><option value="lt">less than</option><option value="lte">at most</option><option value="between">between</option><option value="in">is one of (comma separated)</option><option value="empty">is empty</option><option value="notempty">is not empty</option></select></label><label>Value<input id="gisSelectAttributeValue"></label><label>Second value<input id="gisSelectAttributeValue2" placeholder="Used for between"></label><label>How to apply<select id="gisAttributeSelectionMode">${selectionModeOptions()}</select></label></div><button class="primary" data-action="select-attribute">Select matching features</button></section>
  <section class="gis-tool-card"><h3>Select by location</h3><p>Select features in this layer according to their relationship with features in another layer.</p><div class="gis-form-grid"><label>Comparison layer<select id="gisLocationLayer"><option value="">Choose layer</option>${others.map(item=>`<option value="${item.id}">${esc(item.name)} · ${item.count.toLocaleString()}</option>`).join('')}</select></label><label>Relationship<select id="gisLocationPredicate"><option value="intersects">intersects</option><option value="within">is within</option><option value="contains">contains</option><option value="touches">touches</option><option value="within-distance">is within distance of</option></select></label><label>Distance<input id="gisLocationDistance" type="number" min="0" step="0.1" value="1"></label><label>Units<select id="gisLocationUnits"><option value="meters">metres</option><option value="kilometers" selected>kilometres</option><option value="miles">miles</option></select></label><label>How to apply<select id="gisLocationSelectionMode">${selectionModeOptions()}</select></label><label class="gis-check"><input id="gisLocationSelectedOnly" type="checkbox"> Use only selected comparison features</label></div><button class="primary" data-action="select-location" ${others.length?'':'disabled'}>Run spatial selection</button></section>`;
}
function statsHtml(stats){
  if(!stats)return '<p class="gis-empty-result">Choose a field and calculate statistics.</p>';
  const numeric=stats.numericCount?`<div class="gis-stat-grid"><div><span>Minimum</span><strong>${esc(Number(stats.min).toLocaleString(undefined,{maximumFractionDigits:3}))}</strong></div><div><span>Maximum</span><strong>${esc(stats.max)}</strong></div><div><span>Sum</span><strong>${esc(Number(stats.sum).toLocaleString(undefined,{maximumFractionDigits:3}))}</strong></div><div><span>Mean</span><strong>${esc(Number(stats.mean).toLocaleString(undefined,{maximumFractionDigits:3}))}</strong></div><div><span>Median</span><strong>${esc(Number(stats.median).toLocaleString(undefined,{maximumFractionDigits:3}))}</strong></div><div><span>Std. deviation</span><strong>${esc(Number(stats.stddev).toLocaleString(undefined,{maximumFractionDigits:3}))}</strong></div><div><span>Q1</span><strong>${esc(Number(stats.q1).toLocaleString(undefined,{maximumFractionDigits:3}))}</strong></div><div><span>Q3</span><strong>${esc(Number(stats.q3).toLocaleString(undefined,{maximumFractionDigits:3}))}</strong></div></div>`:'<p class="gis-note">This field has no numeric values. Category counts are shown below.</p>';
  return `<div class="gis-stat-grid gis-stat-overview"><div><span>Records</span><strong>${stats.total.toLocaleString()}</strong></div><div><span>Populated</span><strong>${stats.populated.toLocaleString()}</strong></div><div><span>Missing</span><strong>${stats.missing.toLocaleString()}</strong></div><div><span>Unique</span><strong>${stats.uniqueCount.toLocaleString()}</strong></div><div><span>Numeric</span><strong>${stats.numericCount.toLocaleString()}</strong></div><div><span>Non-numeric</span><strong>${stats.nonNumericCount.toLocaleString()}</strong></div></div>${numeric}<h4>Most common values</h4><div class="gis-value-list">${(stats.topValues||[]).slice(0,12).map(row=>`<span><b>${esc(row.value)}</b><small>${row.count.toLocaleString()}</small></span>`).join('')||'<span>No populated values.</span>'}</div>`;
}
function calculationPreviewHtml(preview){
  const rows=Array.isArray(preview)?preview:preview?.rows||[];if(!rows.length)return '<p class="gis-empty-result">Preview results will appear here.</p>';
  return `<div class="gis-calc-preview-summary">${preview?.invalid?`<strong class="error">${preview.invalid} invalid result(s)</strong>`:`<strong>${preview?.total??rows.length} result(s) valid for the selected type</strong>`}</div><div class="gis-calc-preview">${rows.map((row,index)=>`<div class="${row.ok===false?'invalid':''}"><span>${index+1}</span><code>${esc(row.value===null?'NULL':row.value??row.raw??'NULL')}</code>${row.error?`<small>${esc(row.error)}</small>`:''}</div>`).join('')}</div>`;
}
function fieldDefaultValue(field){return field.defaultValue==null?'':field.type==='boolean'?(field.defaultValue?'true':'false'):String(field.defaultValue);}
function schemaRows(layer){return schemaFields(layer).map(field=>`<tr class="${layer.schema?.invalid?.[field.name]?'invalid':''}"><td><strong>${esc(field.alias||field.name)}</strong>${field.alias&&field.alias!==field.name?`<small>${esc(field.name)}</small>`:''}</td><td><span class="gis-field-type">${esc(schemaCore()?.TYPE_LABELS?.[field.type]||field.type)}</span></td><td>${field.required?'Required':field.nullable?'Nullable':'Not nullable'}${field.readOnly?' · Read-only':''}</td><td>${layer.schema?.invalid?.[field.name]?`<strong class="gis-schema-error">${layer.schema.invalid[field.name]} invalid</strong>`:'Valid'}</td><td><button data-action="schema-edit" data-field-name="${esc(field.name)}">Edit</button><button data-action="schema-delete" data-field-name="${esc(field.name)}" ${field.system?'disabled':''}>Delete</button></td></tr>`).join('');}
function conversionPreviewHtml(preview){if(!preview)return '<p class="gis-empty-result">Preview a change to check every existing value before applying it.</p>';return `<div class="gis-schema-preview ${preview.invalid?'has-invalid':''}"><div><span>Records</span><strong>${preview.total.toLocaleString()}</strong></div><div><span>Convertible</span><strong>${preview.convertible.toLocaleString()}</strong></div><div><span>Invalid</span><strong>${preview.invalid.toLocaleString()}</strong></div><div><span>Null / empty</span><strong>${preview.nulls.toLocaleString()}</strong></div></div>${preview.examples?.length?`<div class="gis-schema-examples"><strong>Examples requiring attention</strong>${preview.examples.map(item=>`<span><code>${esc(item.value)}</code>${esc(item.error)}</span>`).join('')}</div>`:''}`;}
function fieldEditCard(layer){const field=editingField?schemaField(layer,editingField):null;if(!field)return '';
  return `<section class="gis-tool-card gis-field-editor"><div class="gis-tool-heading"><div><h3>Edit field</h3><p>Changing a type converts every value. Preview first; incompatible values are never silently changed.</p></div><button data-action="schema-edit-cancel">Close</button></div><div class="gis-form-grid"><label>Field name<input id="gisEditFieldName" value="${esc(field.name)}" ${field.system?'disabled':''}></label><label>Alias<input id="gisEditFieldAlias" value="${esc(field.alias||field.name)}"></label><label>Type<select id="gisEditFieldType" ${field.system?'disabled':''}>${typeOptions(field.type)}</select></label><label>Default value<input id="gisEditFieldDefault" value="${esc(fieldDefaultValue(field))}"></label><label class="gis-span-2">Description<textarea id="gisEditFieldDescription" rows="2">${esc(field.description||'')}</textarea></label><label class="gis-check"><input id="gisEditFieldNullable" type="checkbox" ${field.nullable?'checked':''} ${field.system?'disabled':''}> Allow NULL values</label><label class="gis-check"><input id="gisEditFieldRequired" type="checkbox" ${field.required?'checked':''} ${field.system?'disabled':''}> Required</label><label class="gis-check"><input id="gisEditFieldReadOnly" type="checkbox" ${field.readOnly?'checked':''}> Read-only</label><label class="gis-check"><input id="gisEditInvalidToNull" type="checkbox" ${fieldConversionPreview?.invalid?'':'disabled'}> Set incompatible values to NULL</label></div><div class="gis-button-row"><button data-action="schema-preview">Preview change</button><button class="primary" data-action="schema-apply">Apply field changes</button></div><div id="gisFieldConversionPreview">${conversionPreviewHtml(fieldConversionPreview)}</div></section>`;}
function fieldsView(layer){
  const fields=schemaFields(layer),editableFields=fields.filter(field=>!field.readOnly),existing=editableFields.find(field=>field.name===$('gisCalculatorField')?.value);
  return `<section class="gis-tool-card gis-schema-card"><div class="gis-tool-heading"><div><h3>Field schema</h3><p>Each attribute has an explicit type and editing rules. Legacy and imported layers are inferred conservatively.</p></div><strong>${fields.length} fields</strong></div><div class="gis-schema-table-wrap"><table class="gis-schema-table"><thead><tr><th>Field</th><th>Type</th><th>Rules</th><th>Values</th><th>Actions</th></tr></thead><tbody>${schemaRows(layer)}</tbody></table></div><h4>Add a field</h4><div class="gis-form-grid"><label>Name<input id="gisAddFieldName" placeholder="new_field"></label><label>Alias<input id="gisAddFieldAlias" placeholder="Display label"></label><label>Type<select id="gisAddFieldType">${typeOptions('text')}</select></label><label>Default value<input id="gisAddFieldDefault"></label><label class="gis-check"><input id="gisAddFieldNullable" type="checkbox" checked> Allow NULL values</label><label class="gis-check"><input id="gisAddFieldRequired" type="checkbox"> Required</label><label class="gis-check"><input id="gisAddFieldReadOnly" type="checkbox"> Read-only</label><label class="gis-span-2">Description<input id="gisAddFieldDescription"></label></div><button class="primary" data-action="schema-add">Add field</button></section>${fieldEditCard(layer)}
  <section class="gis-tool-card gis-fields-card"><h3>Field statistics</h3><p>Summarise all records, visible records, or only the current selection.</p><div class="gis-form-grid"><label>Field<select id="gisStatsField">${fields.map(field=>`<option value="${esc(field.name)}">${esc(fieldLabel(field))}</option>`).join('')}</select></label><label>Scope<select id="gisStatsScope"><option value="all">All records</option><option value="visible">Visible / filtered records</option><option value="selected">Selected records</option></select></label></div><button class="primary" data-action="show-statistics">Calculate statistics</button><div id="gisStatisticsResult" class="gis-stat-result">${statsHtml(lastStats)}</div></section>
  <section class="gis-tool-card gis-fields-card"><h3>Type-safe field calculator</h3><p>References use <code>[field]</code>. Functions include <code>if()</code>, <code>coalesce()</code>, <code>upper()</code>, <code>lower()</code>, <code>round()</code>, <code>date()</code>, <code>year()</code> and <code>now()</code>.</p><div class="gis-form-grid"><label>Output field<input id="gisCalculatorField" list="gisCalculatorFields" placeholder="Field to create or update"><datalist id="gisCalculatorFields">${editableFields.map(field=>`<option value="${esc(field.name)}">`).join('')}</datalist></label><label>Output type<select id="gisCalculatorType">${typeOptions(calculatorType)}</select></label><label>Scope<select id="gisCalculatorScope"><option value="all">All records</option><option value="visible">Visible / filtered records</option><option value="selected">Selected records</option></select></label><label class="gis-check"><input id="gisCalculatorNullable" type="checkbox" checked> Allow NULL results</label><label class="gis-span-2">Expression<textarea id="gisCalculatorExpression" rows="4" spellcheck="false">[name]</textarea></label></div><div class="gis-button-row"><button data-action="preview-calculation">Preview results</button><button class="primary" data-action="apply-calculation">Apply calculation</button></div><div id="gisCalculationPreview">${calculationPreviewHtml(lastCalculationPreview)}</div></section>`;
}
function readEditFieldPatch(){return {name:$('gisEditFieldName')?.value,alias:$('gisEditFieldAlias')?.value,type:$('gisEditFieldType')?.value,defaultValue:$('gisEditFieldDefault')?.value,description:$('gisEditFieldDescription')?.value,nullable:!!$('gisEditFieldNullable')?.checked,required:!!$('gisEditFieldRequired')?.checked,readOnly:!!$('gisEditFieldReadOnly')?.checked};}
function readAddFieldDefinition(){return {name:$('gisAddFieldName')?.value,alias:$('gisAddFieldAlias')?.value,type:$('gisAddFieldType')?.value,defaultValue:$('gisAddFieldDefault')?.value,description:$('gisAddFieldDescription')?.value,nullable:!!$('gisAddFieldNullable')?.checked,required:!!$('gisAddFieldRequired')?.checked,readOnly:!!$('gisAddFieldReadOnly')?.checked};}
function calculatorOptions(){return {scope:$('gisCalculatorScope')?.value||'all',type:$('gisCalculatorType')?.value||calculatorType,nullable:!!$('gisCalculatorNullable')?.checked,limit:10};}

function processView(layer){
  const others=layers().filter(item=>item.id!==layer.id);
  return `<section class="gis-tool-card gis-process-card"><h3>Worker-based processing</h3><p>Long-running buffer, dissolve, union, clip and intersection operations run away from the map interface in a browser worker. Outputs are new editable layers. The source layer is unchanged.</p><div class="gis-form-grid"><label>Operation<select id="gisProcessOp"><option value="buffer">Buffer</option><option value="dissolve">Dissolve polygons</option><option value="union">Union polygons</option><option value="clip">Clip by polygon layer</option><option value="intersection">Intersection with polygon layer</option><option value="centroid">Centroids</option><option value="point-on-feature">Points on surface</option><option value="convex-hull">Convex hull</option><option value="bbox">Bounding rectangle</option></select></label><label>Output name<input id="gisProcessName" value="${esc(layer.name)} — output"></label><label>Overlay layer<select id="gisProcessOverlay"><option value="">Choose for clip/intersection</option>${others.map(item=>`<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label><label>Distance<input id="gisProcessDistance" type="number" value="1" step="0.1"></label><label>Units<select id="gisProcessUnits"><option value="meters">metres</option><option value="kilometers" selected>kilometres</option><option value="miles">miles</option></select></label><label>Output colour<input id="gisProcessColor" type="color" value="#7c3aed"></label><label class="gis-check"><input id="gisProcessSelectedOnly" type="checkbox"> Process only selected source features</label></div><div class="gis-process-progress" id="gisProcessProgress" hidden><div><span></span></div><strong>Preparing…</strong></div><div class="gis-button-row"><button class="primary" data-action="run-process" ${processRunning?'disabled':''}>${processRunning?'Processing…':'Run and create layer'}</button><button data-action="cancel-process" ${processRunning?'':'disabled'}>Cancel</button></div></section>`;
}

function click(event){
  const target=event.target.closest('[data-tab],[data-action],[data-sort]');if(!target)return;
  if(target.dataset.tab){
    if(tab()==='style'&&target.dataset.tab!=='style'&&stylePreviewActive){api().clearStylePreview?.(layerId);stylePreviewActive=false;}
    render(target.dataset.tab);return;
  }
  const action=target.dataset.action,layer=active();
  if(target.dataset.sort){const field=target.dataset.sort,index=sorts.findIndex(rule=>rule.field===field);if(event.shiftKey){if(index<0)sorts.push({field,dir:1});else if(sorts[index].dir>0)sorts[index].dir=-1;else sorts.splice(index,1);}else{const dir=index===0&&sorts.length===1?-sorts[0].dir:1;sorts=[{field,dir}];}render('table');return;}
  if(action==='prev'){page--;render('table');}
  else if(action==='next'){page++;render('table');}
  else if(action==='zoom-row'){const id=target.closest('tr').dataset.feature;api().selectFeature(layerId,id);api().zoomFeature(layerId,id);}
  else if(action==='add-field'){render('fields');requestAnimationFrame(()=>$('gisAddFieldName')?.focus());}
  else if(action==='delete-field'){render('fields');}
  else if(action==='calculate'){render('fields');requestAnimationFrame(()=>$('gisCalculatorField')?.focus());}
  else if(action==='cell-null'){const row=target.closest('tr'),field=target.closest('td')?.dataset.fieldCell;try{api().setAttribute(layerId,row.dataset.feature,field,null);status('Value set to NULL.','ok');render('table');}catch(error){status(error.message,'error');}}
  else if(action==='export-records'){try{const result=api().exportLayerRecords(layerId,{scope:$('gisQuickExportScope').value,format:$('gisQuickExportFormat').value});status(`Exported ${result.count} record(s).`,'ok');}catch(error){status(error.message,'error');}}
  else if(action==='selection-prev'){api().navigateSelection(-1);render('select');}
  else if(action==='selection-next'){api().navigateSelection(1);render('select');}
  else if(action==='selection-clear'){api().clearSelection();selected.clear();render('select');}
  else if(action==='selection-save'){try{const output=api().saveSelectionAsLayer(layerId,{name:$('gisSelectionLayerName').value});status(`Created ${output.name} with ${output.features.length} feature(s).`,'ok');layerId=output.id;resetStyleState(output);render('table');}catch(error){status(error.message,'error');}}
  else if(action==='open-select-menu'){close();window.EditPolygonSelectionTools?.open?.({layerId});}
  else if(action==='map-select-rectangle'||action==='map-select-polygon'){try{api().startMapSelection({kind:action.endsWith('polygon')?'polygon':'rectangle',fileId:layerId,mode:$('gisMapSelectionMode').value});close();}catch(error){status(error.message,'error');}}
  else if(action==='select-attribute'){try{const matches=api().selectByAttribute(layerId,{field:$('gisSelectAttributeField').value,op:$('gisSelectAttributeOp').value,value:$('gisSelectAttributeValue').value,value2:$('gisSelectAttributeValue2').value},$('gisAttributeSelectionMode').value);status(`${matches.length} feature(s) matched.`,'ok');render('select');}catch(error){status(error.message,'error');}}
  else if(action==='select-location'){try{const matches=api().selectByLocation(layerId,{comparisonFileId:$('gisLocationLayer').value,predicate:$('gisLocationPredicate').value,mode:$('gisLocationSelectionMode').value,comparisonSelectedOnly:$('gisLocationSelectedOnly').checked,distance:Number($('gisLocationDistance').value),units:$('gisLocationUnits').value});status(`${matches.length} feature(s) matched the spatial relationship.`,'ok');render('select');}catch(error){status(error.message,'error');}}
  else if(action==='show-statistics'){try{lastStats=api().getLayerStatistics(layerId,$('gisStatsField').value,{scope:$('gisStatsScope').value});$('gisStatisticsResult').innerHTML=statsHtml(lastStats);status('Statistics calculated.','ok');}catch(error){status(error.message,'error');}}
  else if(action==='schema-add'){try{const result=api().addSchemaField(layerId,readAddFieldDefinition());status(`Added ${result.field.alias||result.field.name} (${result.field.type}).`,'ok');render('fields');}catch(error){status(error.message,'error');}}
  else if(action==='schema-edit'){editingField=target.dataset.fieldName;fieldConversionPreview=null;render('fields');requestAnimationFrame(()=>$('gisEditFieldAlias')?.focus());}
  else if(action==='schema-edit-cancel'){editingField='';fieldConversionPreview=null;render('fields');}
  else if(action==='schema-preview'){try{fieldConversionPreview=api().previewSchemaChange(layerId,editingField,readEditFieldPatch());render('fields');status(fieldConversionPreview.invalid?`${fieldConversionPreview.invalid} value(s) need attention.`:'Every value can be converted.','ok');}catch(error){status(error.message,'error');}}
  else if(action==='schema-apply'){try{const result=api().updateSchemaField(layerId,editingField,readEditFieldPatch(),{invalidPolicy:$('gisEditInvalidToNull')?.checked?'null':'abort'});editingField=result.field.name;fieldConversionPreview=null;status(`Updated ${result.field.alias||result.field.name}.`,'ok');render('fields');}catch(error){status(error.message,'error');}}
  else if(action==='schema-delete'){const name=target.dataset.fieldName,field=schemaField(layer,name);if(confirm(`Delete “${field.alias||name}” from every feature? Styles, labels and filters using it will also be updated.`)){try{api().deleteSchemaField(layerId,name);status(`Deleted ${field.alias||name}.`,'ok');render('fields');}catch(error){status(error.message,'error');}}}
  else if(action==='preview-calculation'){try{calculatorType=$('gisCalculatorType').value;lastCalculationPreview=api().previewFieldCalculation(layerId,$('gisCalculatorExpression').value,calculatorOptions());$('gisCalculationPreview').innerHTML=calculationPreviewHtml(lastCalculationPreview);status(lastCalculationPreview.invalid?'Preview contains invalid results.':'Calculation preview is valid.','ok');}catch(error){status(error.message,'error');}}
  else if(action==='apply-calculation'){try{const field=$('gisCalculatorField').value.trim();if(!field)throw Error('Enter an output field name.');calculatorType=$('gisCalculatorType').value;const result=api().calculateFieldAdvanced(layerId,field,$('gisCalculatorExpression').value,calculatorOptions());status(`Calculated ${result.count} record(s) as ${result.field.type}.`,'ok');lastStats=null;lastCalculationPreview=[];render('fields');}catch(error){status(error.message,'error');}}
  else if(action==='open-filter'){render('filter');}
  else if(action==='view-filtered-records'){render('table');}
  else if(action==='filter-add'){filterDraft=readFilterDraft();filterDraft.conditions.push(blankCondition(layer));render('filter');}
  else if(action==='filter-remove'){filterDraft=readFilterDraft();filterDraft.conditions.splice(Number(target.closest('.gis-filter-condition')?.dataset.filterIndex||0),1);render('filter');}
  else if(action==='apply-filter'){try{filterDraft=readFilterDraft();const result=api().setFilter(layerId,filterDraft);filterDraft=clone(result.filter)||{version:1,logic:'and',conditions:[blankCondition(layer)]};status(`${result.count} of ${result.total} features match.`,'ok');render('filter');}catch(error){status(error.message,'error');}}
  else if(action==='clear-filter'){const returnTab=tab();api().setFilter(layerId,null);filterDraft={version:1,logic:'and',conditions:[blankCondition(layer)]};status('Filter cleared. All features are included again.','ok');render(returnTab==='table'?'table':'filter');}
  else if(action==='save-filter'){try{filterDraft=readFilterDraft();api().saveFilter(layerId,$('gisSavedFilterName').value,filterDraft);status('Saved filter.','ok');render('filter');}catch(error){status(error.message,'error');}}
  else if(action==='apply-saved-filter'){try{const result=api().applySavedFilter(layerId,target.dataset.filterId);filterDraft=clone(result.filter);status(`${result.count} records match the saved filter.`,'ok');render('filter');}catch(error){status(error.message,'error');}}
  else if(action==='delete-saved-filter'){if(confirm('Delete this saved filter?')){api().deleteSavedFilter(layerId,target.dataset.filterId);status('Saved filter deleted.','ok');render('filter');}}
  else if(action==='style-regenerate'){regenerateStyleCode(layer,{announce:true});}
  else if(action==='style-format'){try{const style=parseCurrentStyle();styleCodeDraft=styleCore().stringifyStyle(style);$('gisStyleCode').value=styleCodeDraft;updateStyleCodeFeedback();status('Style code formatted and validated.','ok');}catch(error){status(error.message,'error');}}
  else if(action==='style-load-simple'){try{parseCurrentStyle();render('style');status('Loaded valid style code into the simple editor.','ok');}catch(error){status(error.message,'error');}}
  else if(action==='style-preview'){try{const style=parseCurrentStyle();api().previewStyle(layerId,style);stylePreviewActive=true;status('Previewing this style on the map. Apply it to save the change.','ok');}catch(error){status(error.message,'error');}}
  else if(action==='style-apply'){try{const style=parseCurrentStyle();const updated=api().setStyle(layerId,style);stylePreviewActive=false;styleSavedCode=styleCore().stringifyStyle(updated.style);styleCodeDraft=styleSavedCode;status(styleCore().normaliseStyle(style).type==='single'?'Single-symbol style is now active.':'Advanced layer styling is now active.','ok');render('style');}catch(error){status(error.message,'error');}}
  else if(action==='style-revert'){api().clearStylePreview?.(layerId);stylePreviewActive=false;styleCodeDraft=styleSavedCode;render('style');status('Reverted to the last applied style.','ok');}
  else if(action==='style-restore-advanced'){const layer=active();if(!layer?.advancedStyle)status('No saved advanced style is available.','error');else{styleCodeDraft=styleCore().stringifyStyle(layer.advancedStyle);render('style');status('Loaded the saved advanced style. Preview or apply it to activate it.','ok');}}
  else if(action==='apply-labels'){api().setLabels(layerId,{enabled:$('gisLabelsEnabled').checked,field:$('gisLabelField').value});status('Labels updated.','ok');render('style');}
  else if(action==='apply-crs'){const value=$('gisCrsCustom').value.trim()||$('gisCrs').value;if(value){try{api().assignCrs(layerId,value);status(`Assigned ${value} metadata without changing coordinates.`,'ok');render('crs');}catch(error){status(error.message,'error');}}}
  else if(action==='interpret-crs'){const value=$('gisCrsCustom').value.trim()||$('gisCrs').value;if(value&&confirm(`Interpret the layer's current numeric coordinates as ${value} and transform them to WGS 84 for the map? Use this only if the layer is currently misplaced.`)){try{api().interpretCoordinates(layerId,value);status(`Reprojected coordinates from ${value}.`,'ok');render('crs');}catch(error){status(error.message,'error');}}}
  else if(action==='set-export-crs'){try{const value=$('gisExportCrs').value;api().setExportCrs(layerId,value);status(`Export CRS set to ${value}.`,'ok');render('crs');}catch(error){status(error.message,'error');}}
  else if(action==='export-crs-geojson'){const value=$('gisExportCrs').value,format=$('gisCrsExportFormat').value;Promise.resolve(api().exportLayerCrs(layerId,value,format)).then(()=>status(`Downloaded ${format.toUpperCase()} in ${value}.`,'ok')).catch(error=>status(error.message,'error'));}
  else if(action==='run-process'){
    if(processRunning)return;const operation=$('gisProcessOp').value,params={name:$('gisProcessName').value,distance:Number($('gisProcessDistance').value),units:$('gisProcessUnits').value,color:$('gisProcessColor').value,overlayFileId:$('gisProcessOverlay').value,selectedOnly:$('gisProcessSelectedOnly').checked};
    const useWorker=['buffer','dissolve','union','clip','intersection'].includes(operation);processRunning=true;const progress=$('gisProcessProgress');if(progress){progress.hidden=false;progress.querySelector('strong').textContent='Starting worker…';progress.querySelector('span').style.width='0%';}target.disabled=true;
    const task=useWorker?api().processAsync(layerId,operation,params,update=>{const p=$('gisProcessProgress');if(p){p.hidden=false;p.querySelector('span').style.width=`${update.percent||0}%`;p.querySelector('strong').textContent=`${(update.done||0).toLocaleString()} of ${(update.total||0).toLocaleString()} processed`;}}):Promise.resolve().then(()=>api().process(layerId,operation,params));
    Promise.resolve(task).then(output=>{processRunning=false;status(`Created ${output.name} with ${output.features.length} feature(s).`,'ok');layerId=output.id;resetStyleState(output);render('table');}).catch(error=>{processRunning=false;status(error.message,'error');render('process');});
  }
  else if(action==='cancel-process'){api().cancelProcessing?.();processRunning=false;status('Processing cancelled.','error');render('process');}
}

function styleControlChanged(target){
  if(target.id==='gisStyleMode'&&target.value==='single'){
    const simple=active()?.simpleStyle||{};
    if($('gisStyleBaseColor'))$('gisStyleBaseColor').value=simple.fillColor||simple.color||'#1664d6';
    if($('gisStyleWeight'))$('gisStyleWeight').value=Number(simple.weight)||2;
    if($('gisStyleRadius'))$('gisStyleRadius').value=Number(simple.radius)||5;
    if($('gisStyleFill'))$('gisStyleFill').value=Math.round((Number(simple.fillOpacity)??.35)*100);
  }
  if(target.id==='gisStylePalette'&&target.value!=='custom'){
    const option=target.selectedOptions[0];
    if(option?.dataset.start)$('gisStyleStartColor').value=option.dataset.start;
    if(option?.dataset.end)$('gisStyleEndColor').value=option.dataset.end;
  }
  updateStyleControlVisibility();
  regenerateStyleCode(active());
}
function change(event){
  const target=event.target;
  if(target.id==='gisCrsExportFormat')crsExportFormat=target.value;
  else if(target.classList.contains('gis-row-check')){const id=target.closest('tr').dataset.feature;target.checked?selected.add(id):selected.delete(id);target.closest('tr').classList.toggle('selected',target.checked);api()?.setSelection?.([...selected],target.checked?id:[...selected].at(-1)||null);}
  else if(target.id==='gisSelectAll')document.querySelectorAll('.gis-row-check').forEach(checkbox=>{checkbox.checked=target.checked;checkbox.dispatchEvent(new Event('change',{bubbles:true}));});
  else if(target.id==='gisPageSize'){pageSize=Number(target.value)||100;page=0;render('table');}
  else if(target.matches('.gis-typed-cell [data-field]')){const row=target.closest('tr'),field=target.dataset.field;let value=target.value;if(target.tagName==='SELECT')value=value==='__null__'?null:value==='true';else{const definition=schemaField(active(),field);if(value===''&&definition.type!=='text')value=null;}try{api().setAttribute(layerId,row.dataset.feature,field,value);status('Attribute saved.','ok');render('table');}catch(error){status(error.message,'error');render('table');}}
  else if(target.dataset.filterPart==='field'||target.dataset.filterPart==='op'){filterDraft=readFilterDraft();render('filter');}
  else if(target.id==='gisCalculatorType')calculatorType=target.value;
  else if(target.id?.startsWith('gisStyle')&&target.id!=='gisStyleCode')styleControlChanged(target);
}
function input(event){
  const target=event.target;
  if(target.id==='gisTableSearch'){search=target.value;page=0;render('table');}
  else if(target.id==='gisCalculatorField'){const field=schemaFields(active()).find(item=>item.name===target.value);if(field&&$('gisCalculatorType')){$('gisCalculatorType').value=field.type;calculatorType=field.type;$('gisCalculatorNullable').checked=field.nullable;}}
  else if(target.id==='gisStyleCode'){styleCodeDraft=target.value;clearTimeout(styleCodeTimer);styleCodeTimer=setTimeout(updateStyleCodeFeedback,180);}
  else if(target.id?.startsWith('gisStyle')){updateStyleControlVisibility();clearTimeout(styleSimpleTimer);styleSimpleTimer=setTimeout(()=>regenerateStyleCode(active()),120);}
}

let ensureQueued=false;
function queueEnsureButtons(){
  if(ensureQueued)return;
  ensureQueued=true;
  requestAnimationFrame(()=>{ensureQueued=false;ensureButtons();});
}
function initialise(){
  ensureButtons();
  const target=document.body||document.documentElement;
  if(target){
    const observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        if(mutation.type!=='childList'||!mutation.addedNodes.length)continue;
        for(const node of mutation.addedNodes){
          if(node.nodeType!==1)continue;
          if(node.matches?.('.gis-layer-row[data-layer-key^="editable:"]')||node.querySelector?.('.gis-layer-row[data-layer-key^="editable:"]')){queueEnsureButtons();return;}
        }
      }
    });
    observer.observe(target,{childList:true,subtree:true});
  }
}

window.EditPolygonGISDataTools=Object.freeze({open,openLayer:open,ensureButtons:queueEnsureButtons});
window.addEventListener('editpolygon:gis-changed',queueEnsureButtons);
window.addEventListener('editpolygon:gis-rendered',queueEnsureButtons);
window.addEventListener('editpolygon:gis-selection-changed',()=>{if($('gisDataModal')?.classList.contains('active')&&tab()==='select')render('select');});
window.addEventListener('editpolygon:history-restored',refreshAfterHistory);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialise,{once:true});
else initialise();
})();
