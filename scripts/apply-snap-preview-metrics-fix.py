from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / 'docs/assets/gis-processing.js'
TEST = ROOT / 'tests/processing-preview-interactive.test.mjs'
OLD_KEY = '20260820-v1561-processing-preview-v8'
NEW_KEY = '20260820-v1561-processing-preview-v9'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


ui = UI.read_text(encoding='utf-8')

anchor = "function previewVertexPositions(features=[]){const out=[];for(const feature of features||[])geometryVertexPositions(feature?.geometry,out);return out;}"
helpers = r'''
function geometryVertexSequences(geometry,out=[]){
  if(!geometry)return out;
  const valid=value=>value&&typeof value==='object'&&Number.isFinite(Number(value.length))&&value.length>=2&&Number.isFinite(Number(value[0]))&&Number.isFinite(Number(value[1]));
  const sequence=(coordinates,ring=false)=>{
    const items=(coordinates||[]).filter(valid).map(value=>[Number(value[0]),Number(value[1])]);
    if(ring&&items.length>1&&items[0][0]===items.at(-1)[0]&&items[0][1]===items.at(-1)[1])items.pop();
    if(items.length)out.push(items);
  };
  if(geometry.type==='Point'){if(valid(geometry.coordinates))out.push([[Number(geometry.coordinates[0]),Number(geometry.coordinates[1])]]);}
  else if(geometry.type==='MultiPoint')for(const coordinate of geometry.coordinates||[])if(valid(coordinate))out.push([[Number(coordinate[0]),Number(coordinate[1])]]);
  else if(geometry.type==='LineString')sequence(geometry.coordinates);
  else if(geometry.type==='MultiLineString')for(const line of geometry.coordinates||[])sequence(line);
  else if(geometry.type==='Polygon')for(const ring of geometry.coordinates||[])sequence(ring,true);
  else if(geometry.type==='MultiPolygon')for(const polygon of geometry.coordinates||[])for(const ring of polygon||[])sequence(ring,true);
  else if(geometry.type==='GeometryCollection')for(const child of geometry.geometries||[])geometryVertexSequences(child,out);
  return out;
}
function applySnapVertexMatch(metrics,before,after){
  const distance=coordinateDistanceM(before,after);
  if(distance>.001){metrics.verticesMoved++;metrics.maxDisplacementM=Math.max(metrics.maxDisplacementM,distance);}
}
function greedySnapSequenceAlignment(before=[],after=[],toleranceM=0){
  const tolerance=Math.max(.001,Number(toleranceM)||.001),metrics={verticesMoved:0,verticesInserted:0,verticesRemovedBySnap:0,maxDisplacementM:0};
  let i=0,j=0;
  while(i<before.length&&j<after.length){
    const direct=coordinateDistanceM(before[i],after[j]);
    if(direct<=tolerance*1.000001){applySnapVertexMatch(metrics,before[i],after[j]);i++;j++;continue;}
    const remainingBefore=before.length-i,remainingAfter=after.length-j,lookAhead=Math.min(24,Math.max(remainingBefore,remainingAfter)-1);
    let best=null;
    for(let skip=1;skip<=lookAhead&&j+skip<after.length;skip++){
      const distance=coordinateDistanceM(before[i],after[j+skip]);
      if(distance<=tolerance*1.000001){const score=skip+distance/tolerance;if(!best||score<best.score)best={kind:'insert',skip,score};break;}
    }
    for(let skip=1;skip<=lookAhead&&i+skip<before.length;skip++){
      const distance=coordinateDistanceM(before[i+skip],after[j]);
      if(distance<=tolerance*1.000001){const score=skip+distance/tolerance;if(!best||score<best.score)best={kind:'remove',skip,score};break;}
    }
    if(best?.kind==='insert'){metrics.verticesInserted+=best.skip;j+=best.skip;continue;}
    if(best?.kind==='remove'){metrics.verticesRemovedBySnap+=best.skip;i+=best.skip;continue;}
    if(remainingAfter>remainingBefore){metrics.verticesInserted++;j++;}else{metrics.verticesRemovedBySnap++;i++;}
  }
  metrics.verticesInserted+=Math.max(0,after.length-j);
  metrics.verticesRemovedBySnap+=Math.max(0,before.length-i);
  return metrics;
}
function snapSequenceAlignment(before=[],after=[],toleranceM=0){
  const tolerance=Math.max(.001,Number(toleranceM)||.001),n=before.length,m=after.length;
  if(!n)return {verticesMoved:0,verticesInserted:m,verticesRemovedBySnap:0,maxDisplacementM:0};
  if(!m)return {verticesMoved:0,verticesInserted:0,verticesRemovedBySnap:n,maxDisplacementM:0};
  const cells=(n+1)*(m+1);
  if(cells>1500000)return greedySnapSequenceAlignment(before,after,tolerance);
  const width=m+1,gapCost=1.05,trace=new Uint8Array((n+1)*width),previous=new Float64Array(width),current=new Float64Array(width);
  for(let j=1;j<=m;j++){previous[j]=j*gapCost;trace[j]=3;}
  for(let i=1;i<=n;i++){
    current[0]=i*gapCost;trace[i*width]=2;
    for(let j=1;j<=m;j++){
      const distance=coordinateDistanceM(before[i-1],after[j-1]),match=distance<=tolerance*1.000001?previous[j-1]+distance/tolerance:Number.POSITIVE_INFINITY,remove=previous[j]+gapCost,insert=current[j-1]+gapCost;
      let cost=match,code=1;
      if(insert<cost-1e-12){cost=insert;code=3;}
      if(remove<cost-1e-12){cost=remove;code=2;}
      current[j]=cost;trace[i*width+j]=code;
    }
    previous.set(current);
  }
  const metrics={verticesMoved:0,verticesInserted:0,verticesRemovedBySnap:0,maxDisplacementM:0};
  let i=n,j=m;
  while(i>0||j>0){
    const code=trace[i*width+j];
    if(i>0&&j>0&&code===1){applySnapVertexMatch(metrics,before[i-1],after[j-1]);i--;j--;}
    else if(i>0&&(code===2||j===0)){metrics.verticesRemovedBySnap++;i--;}
    else if(j>0){metrics.verticesInserted++;j--;}
    else break;
  }
  return metrics;
}
'''.strip()
if 'function snapSequenceAlignment(' not in ui:
    ui = replace_once(ui, anchor, anchor + '\n' + helpers, 'Snap alignment helper insertion')

new_snap = r'''function snapComparison(before=[],after=[],toleranceM=0){
  const byId=new Map((after||[]).map((feature,index)=>[feature?.id??`#${index}`,feature]));
  const metrics={verticesMoved:0,verticesInserted:0,verticesRemovedBySnap:0,maxDisplacementM:0,featuresUnchanged:0,featuresChanged:0};
  (before||[]).forEach((source,index)=>{
    const output=byId.get(source?.id??`#${index}`)||after?.[index];
    if(!output){metrics.featuresChanged++;metrics.verticesRemovedBySnap+=geometryVertexCount(source?.geometry);return;}
    if(JSON.stringify(source?.geometry||null)===JSON.stringify(output?.geometry||null)){metrics.featuresUnchanged++;return;}
    metrics.featuresChanged++;
    const sourceSequences=geometryVertexSequences(source?.geometry,[]),outputSequences=geometryVertexSequences(output?.geometry,[]),count=Math.max(sourceSequences.length,outputSequences.length);
    for(let sequenceIndex=0;sequenceIndex<count;sequenceIndex++){
      const sourceSequence=sourceSequences[sequenceIndex]||[],outputSequence=outputSequences[sequenceIndex]||[],aligned=snapSequenceAlignment(sourceSequence,outputSequence,toleranceM);
      metrics.verticesMoved+=aligned.verticesMoved;
      metrics.verticesInserted+=aligned.verticesInserted;
      metrics.verticesRemovedBySnap+=aligned.verticesRemovedBySnap;
      metrics.maxDisplacementM=Math.max(metrics.maxDisplacementM,aligned.maxDisplacementM);
    }
  });
  return metrics;
}'''
pattern = r"function snapComparison\(before=\[\],after=\[\]\)\{.*?\n\}\nfunction previewComparisonMetrics"
if re.search(pattern, ui, flags=re.S):
    ui = re.sub(pattern, new_snap + '\nfunction previewComparisonMetrics', ui, count=1, flags=re.S)
elif 'function snapComparison(before=[],after=[],toleranceM=0)' not in ui:
    raise RuntimeError('Could not locate existing Snap comparison implementation')

ui = ui.replace("snapComparison(source,features));", "snapComparison(source,features,Number(task.parameters?.tolerance)||0));")

moved_line = "  if(m.verticesMoved!=null)detail.push(`${Number(m.verticesMoved).toLocaleString()} ${Number(m.verticesMoved)===1?'vertex':'vertices'} moved`);"
insert_lines = "  if(Number.isFinite(m.verticesInserted)&&m.verticesInserted>0)detail.push(`${Number(m.verticesInserted).toLocaleString()} ${Number(m.verticesInserted)===1?'vertex inserted':'vertices inserted'}`);\n  if(Number.isFinite(m.verticesRemovedBySnap)&&m.verticesRemovedBySnap>0)detail.push(`${Number(m.verticesRemovedBySnap).toLocaleString()} ${Number(m.verticesRemovedBySnap)===1?'vertex removed':'vertices removed'}`);\n" + moved_line
if 'm.verticesInserted)&&m.verticesInserted>0' not in ui:
    ui = replace_once(ui, moved_line, insert_lines, 'Snap inserted/removed metric rendering')

UI.write_text(ui.rstrip() + '\n', encoding='utf-8')

# Reproduce the index-shift bug in the same VM realm as the Processing module.
test_text = TEST.read_text(encoding='utf-8')
marker = "test('Snap preview metrics align inserted output vertices without inflating displacement'"
if marker not in test_text:
    test_text += r'''

test('Snap preview metrics align inserted output vertices without inflating displacement',()=>{
  const uiSource=fs.readFileSync(new URL('../docs/assets/gis-processing.js',import.meta.url),'utf8');
  const window={};
  const context=vm.createContext({window,globalThis:window,Object,Map,Set,JSON,String,Array,Number,Math,Date,URL,Error,Promise,Uint8Array,Float64Array});
  vm.runInContext(uiSource,context);
  const task=vm.runInContext(`({toolId:'snap',inputs:{source:[{id:'a',geometry:{type:'LineString',coordinates:[[0,0],[1,0],[2,0]]}}]},parameters:{tolerance:20000}})`,context);
  const output=vm.runInContext(`[{id:'a',geometry:{type:'LineString',coordinates:[[0,0],[0.5,0],[1.1,0],[2,0]]}}]`,context);
  const metrics=window.__editPolygonGISProcessingPreview.comparisonMetrics(task,{kind:'layer'},output);
  assert.equal(metrics.inputVertices,3);
  assert.equal(metrics.outputVertices,4);
  assert.equal(metrics.verticesInserted,1);
  assert.equal(metrics.verticesRemovedBySnap,0);
  assert.equal(metrics.verticesMoved,1);
  assert.ok(metrics.maxDisplacementM>10000&&metrics.maxDisplacementM<12000,`unexpected displacement ${metrics.maxDisplacementM}`);
  assert.ok(metrics.maxDisplacementM<=task.parameters.tolerance,'reported displacement must not exceed the Snap tolerance');
});
'''
TEST.write_text(test_text.rstrip() + '\n', encoding='utf-8')

# Advance the deployment cache contract consistently so Pages cannot serve v8.
result = subprocess.run(['git', 'grep', '-l', OLD_KEY], cwd=ROOT, text=True, capture_output=True, check=False)
for relative in [line.strip() for line in result.stdout.splitlines() if line.strip()]:
    path = ROOT / relative
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    if OLD_KEY in text:
        path.write_text(text.replace(OLD_KEY, NEW_KEY), encoding='utf-8')

print('Applied Snap preview metric alignment fix and cache-key bump.')
