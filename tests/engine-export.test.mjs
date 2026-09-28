import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {newProject,cleanEntity} from '../engine/core/schema.mjs';
import {hashBytes} from '../engine/core/gltf.mjs';
import {createPortableProject,exportGameZip,readLimitedResponse,exportOriginalModel} from '../engine/player/export.mjs';
import {prepareProjectLoad,createOperationLock} from '../engine/runtime/editor.mjs';
import {createGenerationGate,assetCacheKey} from '../engine/runtime/scene.mjs';

function glb(label='fixture'){
 const json=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0',generator:label},scene:0,scenes:[{nodes:[]}]}));
 const length=Math.ceil(json.length/4)*4,bytes=new Uint8Array(length+20),view=new DataView(bytes.buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bytes.length,true);view.setUint32(12,length,true);view.setUint32(16,0x4e4f534a,true);bytes.fill(32,20);bytes.set(json,20);return bytes;
}
async function fixture(){
 const bytes=glb(),project=newProject('My portable world');
 project.assets=[{id:'model-fixture',name:'Own model',source:'local',mime:'model/gltf-binary',size:bytes.length,sha256:await hashBytes(bytes),cloudId:'private-model',url:'https://crateship-games-assets.pages.dev/models/fixture.glb'}];
 project.entities=[cleanEntity({id:'object-fixture',type:'model',assetId:'model-fixture',name:'Own object',components:{animation:{autoplay:true}}})];
 return {project,bytes};
}
function distribution(t,{license=true}={}){
 const calls=[];t.mock.method(globalThis,'fetch',async path=>{calls.push(path);if(path.endsWith('/game-runtime.js'))return new Response('var CrateGame={start:function(){}};');if(path.endsWith('/THIRD-PARTY.txt'))return new Response('Fixture license notices',{status:license?200:404});throw new Error('Unexpected external request: '+path);});return calls;
}

test('original model export returns exact validated GLB bytes with a safe filename',async()=>{
 const {project,bytes}=await fixture(),asset={...project.assets[0],name:'My / source <model>.glb'},before=structuredClone(asset);
 const result=await exportOriginalModel(asset,async()=>bytes);assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()),bytes);assert.equal(result.blob.type,'model/gltf-binary');assert.equal(result.filename,'My-source-model-.glb');assert.deepEqual(asset,before);
 await assert.rejects(exportOriginalModel({...asset,sha256:'0'.repeat(64)},async()=>bytes),/checksum/);
});

test('portable project embeds exact validated bytes without mutating the authoring project',async()=>{
 const {project,bytes}=await fixture();project.legacySource={format:'crate-engine-project',version:3,userScripts:[{code:'saved as source only'}]};project.providerConnections={apiKey:'must-not-export'};
 const before=structuredClone(project),portable=await createPortableProject(project,async()=>bytes);
 assert.deepEqual(project,before);assert.equal(portable.format,'crateship-project');assert.equal(portable.version,4);
 assert.deepEqual(new Uint8Array(Buffer.from(portable.assets[0].embedded,'base64')),bytes);
 assert.equal(portable.assets[0].cloudId,undefined);assert.equal(portable.assets[0].url,undefined);
 assert.equal(portable.providerConnections,undefined);assert.deepEqual(portable.legacySource,project.legacySource);
});

test('game ZIP carries exact instantiated assets, runtime and notices, with no private metadata',async t=>{
 const {project,bytes}=await fixture();const original=structuredClone(project);project.name='A <script>named</script> world';project.legacySource={apiKey:'private-legacy-key',userScripts:[{code:'alert(1)'}]};project.assets.push({id:'unused',name:'Unused model',source:'local',mime:'model/gltf-binary',size:100,sha256:null});
 const calls=distribution(t),resolved=[];
 const result=await exportGameZip(project,async asset=>{resolved.push(asset.id);return bytes;});
 const files=unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
 assert.deepEqual(Object.keys(files).sort(),['README.txt','THIRD-PARTY.txt','assets/model-fixture.glb','bootstrap.js','game-runtime.js','index.html','project.json'].sort());
 assert.deepEqual(resolved,['model-fixture']);assert.deepEqual(files['assets/model-fixture.glb'],bytes);
 const saved=JSON.parse(strFromU8(files['project.json']));assert.equal(saved.assets.length,1);assert.equal(saved.assets[0].sha256,original.assets[0].sha256);
 assert.equal(saved.assets[0].cloudId,undefined);assert.equal(saved.assets[0].url,undefined);assert.equal(saved.legacySource,undefined);
 assert.ok(!strFromU8(files['project.json']).includes('private-legacy-key'));
 assert.match(strFromU8(files['index.html']),/&lt;script&gt;named&lt;\/script&gt;/);
 assert.match(strFromU8(files['index.html']),/script-src 'self' 'wasm-unsafe-eval'/);
 assert.equal(calls.length,2);assert.ok(calls.every(path=>path.startsWith('/engine/distribution/')));
 assert.equal(project.assets[0].cloudId,'private-model');assert.equal(project.legacySource.apiKey,'private-legacy-key');
});

test('model integrity failure blocks both backup and game export before runtime download',async t=>{
 const {project}=await fixture(),different=glb('changed');let network=0;t.mock.method(globalThis,'fetch',async()=>{network++;throw new Error('Unexpected fetch');});
 await assert.rejects(createPortableProject(project,async()=>different),/checksum/);
 await assert.rejects(exportGameZip(project,async()=>different),/checksum/);assert.equal(network,0);
});

test('game export requires the bundled third-party notices',async t=>{
 const project=newProject('No assets');distribution(t,{license:false});await assert.rejects(exportGameZip(project,async()=>assert.fail()),/Third-party notices/);
});

test('stream byte cap rejects a chunked response despite a misleading Content-Length',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3]));controller.enqueue(new Uint8Array([4,5,6]));},cancel(){cancelled=true;}});
 await assert.rejects(readLimitedResponse(new Response(stream,{headers:{'content-length':'1'}}),4,'Model'),/size limit/);assert.equal(cancelled,true);
});

test('stream cap accepts an exact-size payload and rejects oversized declared length before reading',async()=>{
 assert.deepEqual(await readLimitedResponse(new Response(new Uint8Array([1,2,3,4])),4),new Uint8Array([1,2,3,4]));
 let cancelled=false;const response=new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-length':'100'}});
 await assert.rejects(readLimitedResponse(response,4),/size limit/);assert.equal(cancelled,true);
});

test('opening a portable file remaps IDs before storage so existing saves cannot be overwritten',async()=>{
 const {project,bytes}=await fixture();project.assets[0].embedded=Buffer.from(bytes).toString('base64');const before=structuredClone(project);
 const loaded=await prepareProjectLoad(project,{imported:true});
 assert.notEqual(loaded.project.id,project.id);assert.notEqual(loaded.project.assets[0].id,project.assets[0].id);
 assert.equal(loaded.project.entities[0].assetId,loaded.project.assets[0].id);assert.equal(loaded.project.assets[0].embedded,undefined);assert.equal(loaded.project.assets[0].cloudId,undefined);
 assert.deepEqual(loaded.embedded.get(loaded.project.assets[0].id),bytes);assert.deepEqual(project,before);
});

test('cloud reopen retains stable IDs and authoritative cloud display name including v3 migration',async()=>{
 const {project}=await fixture();const loaded=await prepareProjectLoad(project,{name:'Renamed account project'});
 assert.equal(loaded.project.name,'Renamed account project');assert.equal(loaded.project.id,project.id);assert.equal(loaded.project.assets[0].id,'model-fixture');
 const legacy=await prepareProjectLoad({format:'crate-engine-project',version:3,objects:[],userScripts:[{code:'never execute'}]},{name:'Saved legacy title'});
 assert.equal(legacy.project.name,'Saved legacy title');assert.equal(legacy.project.version,4);assert.equal(legacy.project.legacySource.userScripts[0].code,'never execute');
});

test('corrupt embedded model fails preparation before any local storage write',async()=>{
 const {project,bytes}=await fixture();project.assets[0].embedded=Buffer.from(bytes).toString('base64');project.assets[0].sha256='0'.repeat(64);
 await assert.rejects(prepareProjectLoad(project,{imported:true}),/checksum/);
});

test('cloud save operation lock rejects overlapping edits and releases on failure',async()=>{
 const lock=createOperationLock();let finish;const pending=lock.run('Cloud save',()=>new Promise(resolve=>finish=resolve));
 assert.equal(lock.current,'Cloud save');assert.throws(()=>lock.assert(),/Cloud save/);await assert.rejects(lock.run('Import',async()=>{}),/Cloud save/);
 finish('saved');assert.equal(await pending,'saved');assert.equal(lock.current,null);lock.assert();
 await assert.rejects(lock.run('Upload',async()=>{throw new Error('Offline');}),/Offline/);assert.equal(lock.current,null);lock.assert();lock.close();assert.throws(()=>lock.assert(),/closed/);
});

test('scene generation gate never commits superseded or disposed asynchronous work',()=>{
 const gate=createGenerationGate(),first=gate.begin();assert.equal(gate.current(first),true);const second=gate.begin();assert.equal(gate.current(first),false);assert.equal(gate.current(second),true);gate.close();assert.equal(gate.current(second),false);assert.equal(gate.current(gate.begin()),false);
});

test('model cache identity includes content hash and source, not just a reused asset ID',()=>{
 const first={id:'same',sha256:'a',url:'https://crateship-games-assets.pages.dev/models/a.glb',size:100};
 assert.notEqual(assetCacheKey(first),assetCacheKey({...first,sha256:'b'}));assert.notEqual(assetCacheKey(first),assetCacheKey({...first,url:'https://crateship-games-assets.pages.dev/models/b.glb'}));
});
