import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const workspace=fs.readFileSync(new URL('../docs/assets/gis-workspace.js',import.meta.url),'utf8');

 test('remote-source resolver loads before the application and workspace',()=>{
  assert.ok(html.indexOf('gis-remote-source.js')<html.indexOf('editpolygon-app.js'));
  assert.ok(html.indexOf('editpolygon-app.js')<html.indexOf('gis-workspace.js'));
  assert.match(html,/gis-remote-source\.js\?v=20260809-world-wrap-edit-155446/);
});

test('application exposes discovery and batch ArcGIS import APIs',()=>{
  assert.match(app,/discoverRemoteData/);
  assert.match(app,/gisFetchArcGisGeoJsonResolved/);
  assert.match(app,/returnIdsOnly/);
  assert.match(app,/MapServer/);
  assert.match(app,/remoteSourceVersion/);
});

test('workspace presents a simple find, choose and import flow',()=>{
  assert.match(workspace,/Add web data/);
  assert.match(workspace,/Paste a web data link/);
  assert.match(workspace,/Find data/);
  assert.match(workspace,/Choose a service or folder/);
  assert.match(workspace,/Choose a layer/);
  assert.match(workspace,/Import layer/);
  assert.doesNotMatch(workspace,/Unexpected token/);
});
