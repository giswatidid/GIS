import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../docs/assets/editpolygon-app.js',import.meta.url),'utf8');
const tools=fs.readFileSync(new URL('../docs/assets/gis-data-tools.js',import.meta.url),'utf8');

test('undo and redo announce restored project history to open GIS workspaces',()=>{
  assert.match(app,/function notifyHistoryRestored\(direction\)/);
  assert.match(app,/notifyHistoryRestored\('undo'\)/);
  assert.match(app,/notifyHistoryRestored\('redo'\)/);
  assert.match(app,/editpolygon:history-restored/);
});

test('Fields & stats refreshes and clears stale schema editor state after history restoration',()=>{
  assert.match(tools,/function refreshAfterHistory\(event\)/);
  assert.match(tools,/editingField&&!names\.has\(editingField\)/);
  assert.match(tools,/editingField='';\s*fieldConversionPreview=null;/);
  assert.match(tools,/render\(which\)/);
  assert.match(tools,/addEventListener\('editpolygon:history-restored',refreshAfterHistory\)/);
});

test('native form-control undo is not intercepted as project undo',()=>{
  const typing=app.indexOf("const typing=tag==='INPUT'||tag==='TEXTAREA'||activeElement?.isContentEditable");
  const shortcut=app.indexOf("if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z')",typing);
  const nativeGuard=app.indexOf('if(typing)return;',shortcut);
  const projectUndo=app.indexOf('e.shiftKey?redo():undo();',shortcut);
  assert.ok(typing>=0&&shortcut>typing&&nativeGuard>shortcut&&projectUndo>nativeGuard);
});
