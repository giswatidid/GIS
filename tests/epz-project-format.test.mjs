import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../docs/assets/editpolygon-project-format.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');

class FakeZip{
  static last=null;
  static nextLoad=null;
  constructor(){this.entries=new Map();FakeZip.last=this;}
  file(name,content){
    if(arguments.length===1){
      if(!this.entries.has(name))return null;
      const value=this.entries.get(name);
      return {dir:false,async:async type=>type==='text'?String(value):value};
    }
    this.entries.set(name,content);return this;
  }
  folder(name){this.entries.set(String(name).replace(/\/$/,'')+'/',{dir:true});return this;}
  async generateAsync(){return new Blob(['fake-zip']);}
  static async loadAsync(){if(!FakeZip.nextLoad)throw Error('no archive');return FakeZip.nextLoad;}
}

function load(){
  const window={JSZip:FakeZip,crypto:webcrypto};
  const context=vm.createContext({window,globalThis:window,console,TextEncoder,Uint8Array,Blob,Date,JSON,Number,String,Array,Object,Error,Math,encodeURIComponent,unescape});
  vm.runInContext(source,context,{filename:'editpolygon-project-format.js'});
  return window.EditPolygonProjectFormat;
}

function archiveFrom(entries){const zip=new FakeZip();zip.entries=new Map(entries);return zip;}

test('EPZ module publishes the canonical lossless project-container contract',()=>{
  const format=load();
  assert.equal(format.extension,'epz');
  assert.equal(format.format,'EditPolygon Project');
  assert.equal(format.formatVersion,1);
  assert.equal(format.manifestFile,'manifest.json');
  assert.equal(format.projectFile,'project.json');
  assert.equal(format.mime,'application/vnd.editpolygon.project+zip');
});

test('EPZ manifest validator rejects unrelated and newer project containers',()=>{
  const format=load();
  assert.throws(()=>format.validateManifest({format:'Other',formatVersion:1,projectFile:'project.json'}),/not an EditPolygon project container/);
  assert.throws(()=>format.validateManifest({format:'EditPolygon Project',formatVersion:2,projectFile:'project.json'}),/uses format version 2/);
  assert.throws(()=>format.validateManifest({format:'EditPolygon Project',formatVersion:1,projectFile:'elsewhere.json'}),/must be project\.json/);
});

test('EPZ archive creation keeps the canonical project JSON intact and adds integrity metadata',async()=>{
  const format=load();
  const payload={kind:'polygon-editor-project',version:3,savedAt:'2026-08-10T00:00:00.000Z',files:[{id:'a',features:[{id:'p',geometry:{type:'Point',coordinates:[153.123456789,-27.987654321]}}]}],gisWorkspace:{layers:[{id:'wms'}]}};
  const result=await format.createArchive(payload,{appVersion:'1.55.4.16'});
  assert.deepEqual(JSON.parse(result.projectJson),payload);
  assert.equal(result.manifest.formatVersion,1);
  assert.equal(result.manifest.projectFile,'project.json');
  assert.equal(result.manifest.appVersion,'1.55.4.16');
  assert.match(result.manifest.integrity.projectSha256,/^[a-f0-9]{64}$/);
  assert.ok(FakeZip.last.entries.has('manifest.json'));
  assert.ok(FakeZip.last.entries.has('project.json'));
  assert.ok(FakeZip.last.entries.has('assets/'));
});

test('EPZ archive loading verifies and returns the exact project payload',async()=>{
  const format=load();
  const payload={kind:'polygon-editor-project',version:3,files:[],measurements:[{id:'m1',type:'distance'}],gisWorkspace:{layers:[{id:'wms',opacity:.42}]}};
  const created=await format.createArchive(payload,{appVersion:'1.55.4.16'});
  FakeZip.nextLoad=archiveFrom([
    ['manifest.json',JSON.stringify(created.manifest)],
    ['project.json',created.projectJson]
  ]);
  const file={name:'test.epz',size:1234,arrayBuffer:async()=>new ArrayBuffer(8)};
  const opened=await format.readArchive(file);
  assert.deepEqual(JSON.parse(JSON.stringify(opened.payload)),payload);
  assert.equal(opened.manifest.format,'EditPolygon Project');
});

test('application uses only .epz for project save/open and loads the format module before the app',()=>{
  assert.match(app,/EditPolygonProjectFormat\.createArchive\(payload,\{appVersion:'1\.55\.4\.16'\}\)/);
  assert.match(app,/downloadBlob\('editpolygon_project\.epz',archive\.blob\)/);
  assert.match(app,/else if\(ext==='epz'\)/);
  assert.match(app,/EditPolygonProjectFormat\.readArchive\(file,\{onProgress\}\)/);
  assert.doesNotMatch(app,/\.polygonproject/i);
  assert.doesNotMatch(app,/ext===['"]polygonproject['"]/i);
  assert.doesNotMatch(html,/\.polygonproject/i);
  assert.match(html,/accept="[^"]*\.epz/);
  assert.ok(html.indexOf('jszip.min.js')<html.indexOf('editpolygon-project-format.js'));
  assert.ok(html.indexOf('editpolygon-project-format.js')<html.indexOf('editpolygon-app.js'));
});
