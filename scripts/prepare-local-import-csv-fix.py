from pathlib import Path

path=Path(__file__).resolve().parent/'apply-local-import-csv-fix.py'
text=path.read_text(encoding='utf-8')
start=text.index('export_pattern = ')
end=text.index("APP.write_text(app, encoding='utf-8')",start)
replacement="""export_start=\"function exportLayerRecords(fileId,{scope='all',format='geojson',featureIds=null}={}){\"
export_end='  const previousSaveSelection='
start_index=app.find(export_start)
end_index=app.find(export_end,start_index)
if start_index<0 or end_index<=start_index:
    raise RuntimeError('attribute-table export: stable source markers were not found')
new_export=r'''function exportLayerRecords(fileId,{scope='all',format='geojson',featureIds=null}={}){
    const file=gisEditableFile(fileId);if(!file)throw Error('Layer not found.');ensureSchema(file);
    const features=recordsForScope(file,scope,featureIds);if(!features.length)throw Error('No records match this export scope.');
    const safe=String(file.name||'layer').replace(/[^\\w.-]+/g,'_');
    const fields=file.gisSchema.fields,quote=value=>`\"${String(value??'').replace(/\"/g,'\"\"')}\"`;
    if(format==='csv-attributes'){
      const lines=[fields.map(field=>field.name).map(quote).join(',')];
      for(const feature of features)lines.push(fields.map(field=>feature.properties?.[field.name]).map(quote).join(','));
      downloadText(`${safe}_${scope}.csv`,`\\uFEFF${lines.join('\\r\\n')}`,'text/csv;charset=utf-8');
    }else if(format==='csv'){
      const lines=[[...fields.map(field=>field.name),'geometry_wkt'].map(quote).join(',')];
      for(const feature of features)lines.push([...fields.map(field=>feature.properties?.[field.name]),(getDisplayGeometry(feature)?geomToWKT(getDisplayGeometry(feature)):'')].map(quote).join(','));
      downloadText(`${safe}_${scope}_wkt.csv`,`\\uFEFF${lines.join('\\r\\n')}`,'text/csv;charset=utf-8');
    }else if(format==='geojson'){
      const collection={type:'FeatureCollection',features:features.map(featJSON),editpolygonSchema:clone(file.gisSchema)};
      downloadText(`${safe}_${scope}.geojson`,JSON.stringify(collection,null,2),'application/geo+json;charset=utf-8');
    }else throw Error(`Unsupported table export format: ${format}.`);
    return {count:features.length,scope,format};
  }

  '''
app=app[:start_index]+new_export+app[end_index:]
"""
text=text[:start]+replacement+text[end:]
path.write_text(text,encoding='utf-8')
print('Prepared stable attribute-table export replacement.')
