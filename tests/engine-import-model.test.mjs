import test from 'node:test';
import assert from 'node:assert/strict';
import {importableModelUrl,validArguments,MUTATING_COMMANDS} from '../integrations/editor/contracts.mjs';
import {createCommandRunner} from '../engine/editor/mcp-client.mjs';

test('import_model accepts public https and local file servers only',()=>{
 for(const good of ['https://example.com/models/palm.glb','https://cdn.example.com/a/b.GLB','http://127.0.0.1:9940/tree.glb','http://localhost:8000/x.glb'])assert.equal(importableModelUrl(good),true,good);
 for(const bad of ['http://example.com/a.glb','ftp://example.com/a.glb','https://user:pw@example.com/a.glb','https://example.com/a.glb#x','https://example.com/a.gltf','https://192.168.1.5/a.glb','https://10.0.0.2/a.glb','https://172.16.0.1/a.glb','https://169.254.169.254/a.glb','https://localhost/a.glb','https://printer.local/a.glb','http://192.168.0.2/a.glb','file:///c:/a.glb','javascript:alert(1)','','x'.repeat(700)])assert.equal(importableModelUrl(bad),false,bad);
 assert.equal(importableModelUrl(42),false);
});

test('import_model is a write command with strict arguments',()=>{
 assert.ok(MUTATING_COMMANDS.includes('import_model'));
 assert.equal(validArguments('import_model',{url:'https://example.com/a.glb',name:'Palm'}),true);
 assert.equal(validArguments('import_model',{url:'https://example.com/a.glb',extra:1}),false);
 assert.equal(validArguments('import_model',{name:'Palm'}),false);
 assert.equal(validArguments('import_model',{url:'https://example.com/a.glb',name:''}),false);
});

test('the runner downloads the file, imports it as an asset only, and reports the asset id',async t=>{
 const imported=[];
 const editor={getProject:()=>({id:'p',entities:[],assets:[]}),importAsset:async(bytes,name,source)=>{imported.push({size:bytes.length,name,source});return {id:'asset-1',name:name.replace(/\.glb$/i,''),size:bytes.length};}};
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async url=>{assert.equal(String(url),'http://127.0.0.1:9940/palm.glb');return new Response(new Uint8Array([1,2,3,4]),{status:200,headers:{'content-length':'4'}});};
 const logs=[];const runner=createCommandRunner({getEditor:()=>editor,getState:()=>({mode:'edit',busy:false}),onLog:l=>logs.push(l)});
 const result=await runner.run('import_model',{url:'http://127.0.0.1:9940/palm.glb'},{allowWrites:true});
 assert.equal(result.ok,true);assert.match(result.summary,/asset asset-1/);assert.match(result.summary,/assetId/);
 assert.deepEqual(imported,[{size:4,name:'palm.glb',source:'mcp'}]);
});

test('import failures give safe, readable messages and need the write grant',async t=>{
 const editor={getProject:()=>({id:'p',entities:[],assets:[]}),importAsset:async()=>{throw new Error('should not run');}};
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const runner=createCommandRunner({getEditor:()=>editor,getState:()=>({mode:'edit',busy:false})});
 await assert.rejects(runner.run('import_model',{url:'https://example.com/a.glb'},{allowWrites:false}),/disabled/);
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 await assert.rejects(runner.run('import_model',{url:'http://127.0.0.1:9940/a.glb'},{allowWrites:true}),/could not reach http:\/\/127\.0\.0\.1:9940/);
 globalThis.fetch=async()=>new Response('nope',{status:404});
 await assert.rejects(runner.run('import_model',{url:'https://example.com/a.glb'},{allowWrites:true}),/HTTP 404/);
});
