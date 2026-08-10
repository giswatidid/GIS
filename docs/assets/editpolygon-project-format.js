(function(global){
  'use strict';

  const FORMAT='EditPolygon Project';
  const FORMAT_VERSION=1;
  const EXTENSION='epz';
  const MIME='application/vnd.editpolygon.project+zip';
  const MANIFEST_FILE='manifest.json';
  const PROJECT_FILE='project.json';

  function zipLibrary(){
    if(!global.JSZip)throw Error('Project compression library is not loaded.');
    return global.JSZip;
  }
  function utf8Bytes(text){
    if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(String(text));
    const encoded=unescape(encodeURIComponent(String(text)));
    const bytes=new Uint8Array(encoded.length);
    for(let i=0;i<encoded.length;i++)bytes[i]=encoded.charCodeAt(i);
    return bytes;
  }
  function hex(buffer){
    return [...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
  }
  async function sha256(text){
    const subtle=global.crypto?.subtle;
    if(!subtle?.digest)return null;
    return hex(await subtle.digest('SHA-256',utf8Bytes(text)));
  }
  function validateManifest(manifest){
    if(!manifest||typeof manifest!=='object')throw Error('Invalid .epz project: manifest.json is not valid JSON.');
    if(manifest.format!==FORMAT)throw Error('Invalid .epz project: this is not an EditPolygon project container.');
    const version=Number(manifest.formatVersion);
    if(!Number.isInteger(version)||version<1)throw Error('Invalid .epz project: format version is missing or invalid.');
    if(version>FORMAT_VERSION)throw Error(`This .epz project uses format version ${version}, but this EditPolygon build supports version ${FORMAT_VERSION}.`);
    if(manifest.projectFile!==PROJECT_FILE)throw Error('Invalid .epz project: manifest projectFile must be project.json.');
    const integrity=manifest.integrity;
    if(integrity!=null){
      if(typeof integrity!=='object'||integrity.algorithm!=='SHA-256'||!/^[a-f0-9]{64}$/i.test(String(integrity.projectSha256||''))){
        throw Error('Invalid .epz project: integrity metadata is malformed.');
      }
    }
    return manifest;
  }
  async function createArchive(payload,{appVersion='unknown'}={}){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Cannot save an invalid project payload.');
    const JSZip=zipLibrary();
    const projectJson=JSON.stringify(payload,null,2);
    const checksum=await sha256(projectJson);
    const manifest={
      format:FORMAT,
      formatVersion:FORMAT_VERSION,
      projectFile:PROJECT_FILE,
      app:'EditPolygon',
      appVersion:String(appVersion||'unknown'),
      savedAt:payload.savedAt||new Date().toISOString(),
      compression:'DEFLATE'
    };
    if(checksum)manifest.integrity={algorithm:'SHA-256',projectSha256:checksum};
    const zip=new JSZip();
    zip.file(MANIFEST_FILE,JSON.stringify(manifest,null,2));
    zip.file(PROJECT_FILE,projectJson);
    zip.folder('assets');
    const blob=await zip.generateAsync({
      type:'blob',
      mimeType:MIME,
      compression:'DEFLATE',
      compressionOptions:{level:6}
    });
    return {
      blob,
      manifest,
      projectJson,
      uncompressedBytes:utf8Bytes(projectJson).byteLength,
      compressedBytes:Number(blob.size)||0
    };
  }
  async function readArchive(file,{onProgress=()=>{}}={}){
    if(!file)throw Error('No .epz project file was provided.');
    const JSZip=zipLibrary();
    onProgress(`Reading compressed project ${file.name||''}…`,25);
    let zip;
    try{
      const buffer=typeof file.arrayBuffer==='function'?await file.arrayBuffer():file;
      zip=await JSZip.loadAsync(buffer);
    }catch(err){
      throw Error(`Invalid .epz project: the ZIP container is damaged or unreadable${err?.message?` (${err.message})`:''}.`);
    }
    const manifestEntry=zip.file(MANIFEST_FILE);
    if(!manifestEntry)throw Error('Invalid .epz project: manifest.json is missing.');
    let manifest;
    try{manifest=JSON.parse(await manifestEntry.async('text'));}
    catch{throw Error('Invalid .epz project: manifest.json is not valid JSON.');}
    validateManifest(manifest);
    const projectEntry=zip.file(PROJECT_FILE);
    if(!projectEntry)throw Error('Invalid .epz project: project.json is missing.');
    onProgress(`Verifying ${file.name||'project'}…`,55);
    const projectJson=await projectEntry.async('text');
    if(manifest.integrity?.projectSha256){
      const actual=await sha256(projectJson);
      if(actual&&actual.toLowerCase()!==String(manifest.integrity.projectSha256).toLowerCase()){
        throw Error('This .epz project is damaged: project.json failed its SHA-256 integrity check.');
      }
    }
    let payload;
    try{payload=JSON.parse(projectJson);}
    catch{throw Error('Invalid .epz project: project.json is not valid JSON.');}
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid .epz project: project.json does not contain a project object.');
    onProgress(`Prepared compressed project ${file.name||''}.`,92);
    return {
      payload,
      manifest,
      projectJson,
      compressedBytes:Number(file.size)||0,
      uncompressedBytes:utf8Bytes(projectJson).byteLength
    };
  }

  global.EditPolygonProjectFormat=Object.freeze({
    format:FORMAT,
    formatVersion:FORMAT_VERSION,
    extension:EXTENSION,
    mime:MIME,
    manifestFile:MANIFEST_FILE,
    projectFile:PROJECT_FILE,
    validateManifest,
    createArchive,
    readArchive
  });
})(window);
