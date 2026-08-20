(function(global){
'use strict';

const VERSION='1.56.1';
const GEOPACKAGE_VERSION='4.2.8';
const GEOPACKAGE_DIST=`https://unpkg.com/@ngageoint/geopackage@${GEOPACKAGE_VERSION}/dist/`;
const GEOPACKAGE_SCRIPT=`${GEOPACKAGE_DIST}geopackage.min.js`;
// fileGDB.js 1.0.0 is intentionally pinned to the repository commit that
// produced the published browser bundle. The parser accepts zipped .gdb data
// and returns WGS84 GeoJSON in the browser.
const FILEGDB_COMMIT='db897f96ebc47c70d716077b3d2cf97819752e2b';
const FILEGDB_SCRIPT=`https://cdn.jsdelivr.net/gh/calvinmetcalf/fileGDB.js@${FILEGDB_COMMIT}/dist/fgdb.min.js`;
const scriptLoads=new Map();

const fc=features=>({type:'FeatureCollection',features:(features||[]).filter(Boolean)});
const safeName=value=>String(value||'').split('/').pop().replace(/\.[^.]+$/,'')||'Layer';
const report=(onProgress,message,percent)=>{try{onProgress?.(message,percent);}catch(_){ }};

function scriptLoaderAvailable(){return typeof document!=='undefined'&&document?.head;}
function loadScriptOnce(url,ready){
  if(ready())return Promise.resolve();
  if(scriptLoads.has(url))return scriptLoads.get(url);
  if(!scriptLoaderAvailable())return Promise.reject(new Error(`Browser parser dependency is not available: ${url}`));
  const promise=new Promise((resolve,reject)=>{
    let script=[...document.scripts].find(item=>item.src===url);
    const finish=()=>ready()?resolve():reject(new Error(`Parser library loaded but did not initialise: ${url}`));
    if(script){
      if(ready())return resolve();
      script.addEventListener('load',finish,{once:true});
      script.addEventListener('error',()=>reject(new Error(`Could not load parser library: ${url}`)),{once:true});
      return;
    }
    script=document.createElement('script');
    script.src=url;
    script.async=true;
    script.crossOrigin='anonymous';
    script.referrerPolicy='no-referrer';
    script.addEventListener('load',finish,{once:true});
    script.addEventListener('error',()=>reject(new Error(`Could not load parser library: ${url}`)),{once:true});
    document.head.appendChild(script);
  });
  scriptLoads.set(url,promise);
  promise.catch(()=>scriptLoads.delete(url));
  return promise;
}

function collectGeoJson(value,layerName,out){
  if(!value)return;
  if(value.type==='FeatureCollection'){
    for(const item of value.features||[])collectGeoJson(item,layerName,out);
    return;
  }
  if(value.type==='Feature'){
    const feature={...value,properties:{...(value.properties||{})}};
    if(layerName&&!Object.prototype.hasOwnProperty.call(feature.properties,'source_layer'))feature.properties.source_layer=layerName;
    out.push(feature);
    return;
  }
  if(Array.isArray(value)){
    for(const item of value)collectGeoJson(item,layerName,out);
  }
}

function normaliseLayerMap(value,sourceName='Layer'){
  const out=[];
  if(!value)return fc(out);
  if(value.type==='FeatureCollection'||value.type==='Feature'||Array.isArray(value)){
    collectGeoJson(value,sourceName,out);
    return fc(out);
  }
  if(typeof value==='object'){
    for(const [name,data] of Object.entries(value))collectGeoJson(data,name||sourceName,out);
  }
  return fc(out);
}

function stripSourceLayerWhenSingle(collection,layerNames){
  const names=[...new Set((layerNames||[]).filter(Boolean))];
  if(names.length!==1)return collection;
  for(const feature of collection.features||[]){
    if(feature?.properties?.source_layer===names[0])delete feature.properties.source_layer;
  }
  return collection;
}

function classifyZipEntries(names=[]){
  const files=(names||[]).filter(Boolean).filter(name=>!String(name).endsWith('/'));
  const gpkg=files.filter(name=>/\.gpkg$/i.test(name));
  const shp=files.filter(name=>/\.shp$/i.test(name));
  const gdbFiles=files.filter(name=>/(?:^|\/)[^/]+\.gdb\//i.test(name));
  const gdbRoots=[...new Set(gdbFiles.map(name=>{
    const match=String(name).match(/^(.*?\/)?([^/]+\.gdb)\//i);
    return match?`${match[1]||''}${match[2]}`:null;
  }).filter(Boolean))];
  return {gpkg,shp,gdbFiles,gdbRoots,files};
}

function detectManagedEncryption(buffer){
  try{
    const bytes=new Uint8Array(buffer,0,Math.min(buffer.byteLength,32));
    const text=new TextDecoder('ascii').decode(bytes);
    return /MSMAMARPCRYPT/i.test(text);
  }catch(_){return false;}
}

async function ensureGeoPackage(){
  await loadScriptOnce(GEOPACKAGE_SCRIPT,()=>!!global.GeoPackage?.GeoPackageAPI?.open||typeof global.GeoPackage?.open==='function');
  const lib=global.GeoPackage;
  if(typeof lib?.setSqljsWasmLocateFile==='function')lib.setSqljsWasmLocateFile(file=>`${GEOPACKAGE_DIST}${file}`);
  return lib;
}

function geoPackageFeaturesFromResult(result){
  if(!result)return [];
  if(Array.isArray(result))return result.filter(item=>item?.type==='Feature');
  if(result.type==='FeatureCollection')return result.features||[];
  if(result.type==='Feature')return [result];
  if(typeof result==='object'){
    const values=Object.values(result);
    return values.flatMap(value=>geoPackageFeaturesFromResult(value));
  }
  return [];
}

async function geoPackageTableFeatures(gpkg,lib,table){
  if(typeof gpkg.queryForGeoJSONFeaturesInTable==='function'){
    const result=await Promise.resolve(gpkg.queryForGeoJSONFeaturesInTable(table));
    const features=geoPackageFeaturesFromResult(result);
    if(features.length)return features;
  }
  // Compatibility fallback for GeoPackage JS releases where the convenience
  // query has a different return shape.
  const dao=gpkg.getFeatureDao?.(table);
  if(!dao?.queryForEach||!dao?.getRow||!lib?.GeoPackage?.parseFeatureRowIntoGeoJSON)return [];
  const features=[];
  for(const row of dao.queryForEach()){
    if(row==null)continue;
    const featureRow=dao.getRow(row);
    const item=lib.GeoPackage.parseFeatureRowIntoGeoJSON(featureRow,dao.srs);
    if(item){item.type='Feature';features.push(item);}
  }
  return features;
}

async function parseGeoPackageBytes(bytes,sourceName='GeoPackage',onProgress=()=>{}){
  report(onProgress,`Loading GeoPackage parser for ${sourceName}…`,28);
  const lib=await ensureGeoPackage();
  const open=lib?.GeoPackageAPI?.open||lib?.open;
  if(typeof open!=='function')throw new Error('GeoPackage parser did not expose an open() API.');
  report(onProgress,`Opening GeoPackage ${sourceName}…`,42);
  let gpkg;
  try{
    gpkg=await open.call(lib.GeoPackageAPI||lib,bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));
    const tables=await Promise.resolve(gpkg.getFeatureTables?.()||[]);
    if(!tables.length)throw new Error('GeoPackage contains no feature tables.');
    const features=[];
    for(let index=0;index<tables.length;index++){
      const table=tables[index];
      report(onProgress,`Reading GeoPackage layer ${table} (${index+1} of ${tables.length})…`,48+Math.round(((index+1)/tables.length)*32));
      const rows=await geoPackageTableFeatures(gpkg,lib,table);
      for(const feature of rows){
        const item={...feature,properties:{...(feature.properties||{})}};
        if(tables.length>1)item.properties.source_layer=table;
        features.push(item);
      }
    }
    if(!features.length)throw new Error('GeoPackage feature tables contain no readable features.');
    const collection=fc(features);
    collection.__editpolygonSource='geopackage';
    collection.__editpolygonLayers=[...tables];
    return collection;
  }catch(error){
    throw new Error(`Could not read GeoPackage “${sourceName}”: ${error?.message||error}`);
  }finally{
    try{gpkg?.close?.();}catch(_){ }
  }
}

async function parseGeoPackageFile(file,onProgress=()=>{}){
  report(onProgress,`Reading GeoPackage ${file.name}…`,20);
  return parseGeoPackageBytes(new Uint8Array(await file.arrayBuffer()),file.name,onProgress);
}

async function ensureFileGdb(){
  await loadScriptOnce(FILEGDB_SCRIPT,()=>typeof global.fgdb==='function');
  if(typeof global.fgdb!=='function')throw new Error('File Geodatabase parser did not initialise.');
  return global.fgdb;
}

async function repackFileGdb(zip,root,onProgress=()=>{}){
  const prefix=`${root.replace(/\/$/,'')}/`;
  const marker=prefix.toLowerCase();
  const cleanRoot=prefix.split('/').filter(Boolean).at(-1);
  const out=new global.JSZip();
  const files=Object.values(zip.files).filter(entry=>!entry.dir&&entry.name.toLowerCase().includes(marker));
  if(!files.length)throw new Error('The .gdb folder contains no readable files.');
  for(let index=0;index<files.length;index++){
    const entry=files[index];
    const lower=entry.name.toLowerCase();
    const start=lower.indexOf(marker);
    const relative=`${cleanRoot}/${entry.name.slice(start+prefix.length)}`;
    out.file(relative,await entry.async('uint8array'));
    if(index%10===0)report(onProgress,`Preparing File Geodatabase (${index+1} of ${files.length} files)…`,35+Math.round((index/files.length)*18));
  }
  return out.generateAsync({type:'arraybuffer',compression:'DEFLATE',compressionOptions:{level:3}});
}

async function parseFileGdbZip(zip,classification,sourceName,onProgress=()=>{}){
  if(!classification.gdbRoots.length)throw new Error('ZIP does not contain a .gdb folder.');
  const fgdb=await ensureFileGdb();
  const root=classification.gdbRoots[0];
  report(onProgress,`Preparing File Geodatabase ${root.split('/').pop()}…`,34);
  const buffer=await repackFileGdb(zip,root,onProgress);
  report(onProgress,`Reading File Geodatabase ${sourceName}…`,58);
  try{
    const result=await fgdb(buffer);
    const layerNames=result&&typeof result==='object'&&!Array.isArray(result)&&!result.type?Object.keys(result):[safeName(root)];
    const collection=stripSourceLayerWhenSingle(normaliseLayerMap(result,safeName(root)),layerNames);
    if(!collection.features.length)throw new Error('File Geodatabase contains no readable feature classes.');
    collection.__editpolygonSource='filegdb';
    collection.__editpolygonLayers=layerNames;
    return collection;
  }catch(error){
    throw new Error(`Could not read File Geodatabase “${sourceName}”: ${error?.message||error}`);
  }
}

async function parseZip(file,onProgress=()=>{}){
  if(!global.JSZip)throw new Error('ZIP import library is not loaded.');
  report(onProgress,`Inspecting ${file.name}…`,18);
  const buffer=await file.arrayBuffer();
  if(detectManagedEncryption(buffer))throw new Error('This file is encrypted by Microsoft Intune and cannot be opened. Export or download an unencrypted copy and try again.');
  let zip;
  try{zip=await global.JSZip.loadAsync(buffer);}
  catch(error){throw new Error(`Could not read ZIP archive “${file.name}”: ${error?.message||error}`);}
  const classification=classifyZipEntries(Object.keys(zip.files));
  if(classification.gpkg.length){
    const all=[];
    for(let index=0;index<classification.gpkg.length;index++){
      const name=classification.gpkg[index];
      report(onProgress,`Extracting GeoPackage ${name.split('/').pop()}…`,28);
      const bytes=await zip.file(name).async('uint8array');
      const collection=await parseGeoPackageBytes(bytes,name,onProgress);
      for(const feature of collection.features||[]){
        const item={...feature,properties:{...(feature.properties||{})}};
        if(classification.gpkg.length>1&&!item.properties.source_package)item.properties.source_package=name.split('/').pop();
        all.push(item);
      }
    }
    if(!all.length)throw new Error('The GeoPackage archive contains no readable features.');
    return fc(all);
  }
  if(classification.gdbFiles.length)return parseFileGdbZip(zip,classification,file.name,onProgress);
  if(classification.shp.length)return null; // authoritative existing shpjs path
  throw new Error('ZIP contains no supported spatial dataset. Expected a Shapefile (.shp), GeoPackage (.gpkg), or File Geodatabase (.gdb folder).');
}

const api=Object.freeze({
  version:VERSION,
  classifyZipEntries,
  parseGeoPackageFile,
  parseGeoPackageBytes,
  parseZip,
  _test:Object.freeze({collectGeoJson,normaliseLayerMap,detectManagedEncryption,geoPackageFeaturesFromResult})
});

global.EditPolygonGISFileImport=api;
})(typeof window!=='undefined'?window:globalThis);
