import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,cleanEntity,validateProject} from '../engine/core/schema.mjs';
import {ProjectStore} from '../engine/core/project-store.mjs';
import {WORLD_RECIPE_SCHEMA,WORLD_LIMITS,validateWorldRecipeShape,validateWorldRecipe,compileWorldRecipe,createWorldPreviewSession,createWorldRecipe,getWorldRecipeHelp} from '../engine/core/procedural.mjs';

const recipe=operations=>({version:1,seed:'repeatable-world',operations});
const add=(entity={type:'box'},extra={})=>({op:'add',entity,...extra});
const grid=(extra={})=>({op:'grid',entity:{type:'box'},counts:[3,2],spacing:[2,4],origin:[-2,1,0],...extra});
const scatter=(extra={})=>({op:'scatter',entity:{type:'sphere'},count:8,bounds:{min:[-10,-20],max:[10,20]},y:2,scaleRange:[.5,2],rotationY:true,...extra});

test('authoritative schema is immutable and help describes executable-free preview/apply',()=>{
 assert.equal(WORLD_RECIPE_SCHEMA.properties.version.const,1);assert.equal(Object.isFrozen(WORLD_RECIPE_SCHEMA),true);assert.equal(Object.isFrozen(WORLD_RECIPE_SCHEMA.properties.operations.items.oneOf),true);
 assert.equal(WORLD_LIMITS.generatedEntities,500);assert.match(getWorldRecipeHelp(),/preview|Undo/);assert.match(getWorldRecipeHelp(),/No IDs,parentId,URLs,code/);
});

test('add, grid and scatter use bounded normalized templates without mutating input',()=>{
 const input=recipe([add({type:'empty',position:[0,0,0]},{key:'root'}),grid({parentKey:'root'}),scatter({parentKey:'root'})]),before=structuredClone(input),compiled=compileWorldRecipe(input,newProject());
 assert.deepEqual(input,before);assert.equal(compiled.entities.length,15);assert.equal(compiled.summary.entityCount,15);assert.deepEqual(compiled.summary.byType,{empty:1,box:6,sphere:8});
 assert.ok(compiled.entities.slice(1).every(entity=>entity.parentId===compiled.entities[0].id));assert.deepEqual(compiled.entities[1].position,[-2,1,0]);assert.deepEqual(compiled.entities[6].position,[2,1,4]);
 assert.ok(compiled.entities.slice(7).every(entity=>entity.position[0]>=-10&&entity.position[0]<=10&&entity.position[2]>=-20&&entity.position[2]<=20&&entity.position[1]===2));
 assert.equal(validateProject({...newProject(),entities:compiled.entities}).entities.length,15);
});

test('seeded scatter repeats transforms and varies with seed while preview IDs remain fresh',()=>{
 const input=recipe([scatter()]),a=compileWorldRecipe(input),b=compileWorldRecipe(input),c=compileWorldRecipe({...input,seed:'another'});
 const transforms=value=>value.entities.map(({position,rotation,scale})=>({position,rotation,scale}));assert.deepEqual(transforms(a),transforms(b));assert.notDeepEqual(transforms(a),transforms(c));assert.notEqual(a.entities[0].id,b.entities[0].id);
});

test('grid/scatter template offsets remain local to their recipe parent',()=>{
 const compiled=compileWorldRecipe(recipe([grid({counts:[1,1],entity:{type:'box',position:[1,2,3]}}),scatter({count:1,entity:{type:'sphere',position:[2,3,4]},bounds:{min:[0,0],max:[0,0]},y:5,scaleRange:[1,1],rotationY:false})]));
 assert.deepEqual(compiled.entities[0].position,[-1,3,3]);assert.deepEqual(compiled.entities[1].position,[2,8,4]);
});

test('missing, duplicate, self and forward parent keys reject',()=>{
 for(const operations of [[add(undefined,{parentKey:'missing'})],[add(undefined,{key:'same'}),add(undefined,{key:'same'})],[add(undefined,{key:'self',parentKey:'self'})],[add(undefined,{parentKey:'later'}),add(undefined,{key:'later'})]])assert.throws(()=>validateWorldRecipeShape(recipe(operations)),/parentKey|unique/);
});

test('unknown instructions, code, URLs and object IDs reject at every supported nesting level',()=>{
 for(const operation of [
  {...add(),code:'alert(1)'},add({type:'box',id:'injected'}),add({type:'box',parentId:'existing'}),add({type:'box',url:'https://example.test/a.glb'}),add({type:'box',material:{map:'https://example.test/a.png'}}),add({type:'box',components:{script:{source:'run()'}}}),{op:'execute',code:'run()'}
 ])assert.throws(()=>validateWorldRecipeShape(recipe([operation])));
 assert.throws(()=>validateWorldRecipeShape({...recipe([add()]),settings:{script:'run()'}}));
});

test('finite strict numbers, booleans, ranges and unknown versions are enforced',()=>{
 for(const input of [
  {...recipe([add()]),version:2},{...recipe([add()]),seed:-1},{...recipe([add()]),seed:''},recipe([add({type:'box',position:[NaN,0,0]})]),recipe([add({type:'box',scale:[-1,1,1]})]),recipe([grid({counts:[1.5,2]})]),recipe([grid({spacing:[0,2]})]),recipe([scatter({rotationY:'true'})]),recipe([scatter({scaleRange:[2,1]})]),recipe([scatter({bounds:{min:[2,0],max:[1,1]}})])
 ])assert.throws(()=>validateWorldRecipeShape(input));
 assert.doesNotThrow(()=>validateWorldRecipeShape({...recipe([add()]),seed:0}));
});

test('recipe operation, generated count, encoded size and cyclic data caps reject early',()=>{
 assert.throws(()=>validateWorldRecipeShape(recipe(Array.from({length:65},()=>add()))));
 assert.throws(()=>validateWorldRecipeShape(recipe([grid({counts:[50,11]})])),/500/);
 assert.throws(()=>validateWorldRecipeShape(recipe([scatter({count:500}),add()])),/500/);
 const tooLarge={...recipe([add()]),extra:'x'.repeat(140000)};assert.throws(()=>validateWorldRecipeShape(tooLarge),/128 KB/);
 const cyclic=recipe([add()]);cyclic.self=cyclic;assert.throws(()=>validateWorldRecipeShape(cyclic),/JSON/);
});

test('existing assets can be instantiated without adding assets or trusting remote locations',()=>{
 const project=newProject(),asset={id:'owned-model',name:'Own GLB',mime:'model/gltf-binary'};project.assets=[asset];const input=recipe([add({type:'model',assetId:'owned-model',components:{animation:{autoplay:true}}})]);
 const compiled=compileWorldRecipe(input,project);assert.equal(compiled.entities[0].assetId,'owned-model');assert.equal(project.assets.length,1);assert.equal(validateWorldRecipe(input,project).operations[0].entity.type,'model');
 assert.throws(()=>compileWorldRecipe(input,newProject()),/already imported/);assert.throws(()=>validateWorldRecipeShape(recipe([add({type:'model'})])),/assetId/);assert.throws(()=>validateWorldRecipeShape(recipe([add({type:'box',assetId:'owned-model'})])),/Only model/);
});

test('physics/component requirements hold for procedural templates',()=>{
 for(const entity of [{type:'box',components:{player:{}}},{type:'box',components:{rigidbody:{type:'static'},player:{}}},{type:'box',components:{rigidbody:{type:'dynamic'},spin:{}}},{type:'camera',components:{rigidbody:{type:'static'}}},{type:'sphere',components:{animation:{}}}])assert.throws(()=>validateWorldRecipeShape(recipe([add(entity)])));
 assert.doesNotThrow(()=>compileWorldRecipe(recipe([add({type:'box',components:{player:{},rigidbody:{type:'dynamic'}}})])));
});

test('total object and light caps respect full and reduced scene contexts',()=>{
 const input=recipe([grid()]);assert.throws(()=>compileWorldRecipe(input,{entities:[],assets:[],entityCount:4999}),/5000/);
 assert.throws(()=>compileWorldRecipe(recipe([add({type:'pointLight'})]),{entities:[],assets:[],lightCount:32}),/32 lights/);
 assert.throws(()=>compileWorldRecipe(recipe([add()]),{entities:[],assets:[],entityCount:NaN}),/count/);
 const entities=Array.from({length:32},()=>({type:'pointLight'}));assert.throws(()=>compileWorldRecipe(recipe([add({type:'pointLight'})]),{entities,assets:[],lightCount:0}),/32 lights/);
 assert.throws(()=>compileWorldRecipe(recipe([grid({counts:[50,10],entity:{type:'pointLight'}})])),/32 lights/);
});

test('generated transforms reject arithmetic overflow and excessive scale without clamping silently',()=>{
 assert.throws(()=>compileWorldRecipe(recipe([grid({origin:[1e6,0,0]})])),/position/);
 assert.throws(()=>compileWorldRecipe(recipe([scatter({entity:{type:'sphere',scale:[10000,10000,10000]},scaleRange:[2,2]})])),/scale/);
});

function previewFixture(){
 let revision=0;const store=new ProjectStore(newProject(),()=>revision++),session=createWorldPreviewSession({getProject:()=>store.snapshot(),getRevision:()=>revision,apply:entities=>store.commit('Generate world',project=>project.entities.push(...entities))});return {store,session};
}

test('world preview has no mutation and applying exact preview inserts once in one undo',()=>{
 const {store,session}=previewFixture(),before=store.snapshot(),preview=session.preview(recipe([grid()]));assert.deepEqual(store.snapshot(),before);assert.equal(store.past.length,0);
 const ids=preview.entities.map(entity=>entity.id);preview.entities[0].position[0]=500;const result=session.apply({previewId:preview.previewId});assert.equal(result.applied,true);assert.deepEqual(result.entityIds,ids);assert.equal(store.project.entities[0].position[0],-2);assert.equal(store.past.length,1);
 assert.throws(()=>session.apply({previewId:preview.previewId}),/no longer/);store.undo();assert.equal(store.project.entities.length,0);store.redo();assert.deepEqual(store.project.entities.map(entity=>entity.id),ids);
});

test('world preview rejects a changed scene even if undo restores its original data',()=>{
 const {store,session}=previewFixture(),preview=session.preview(recipe([add()]));store.add('box');store.undo();assert.throws(()=>session.apply({previewId:preview.previewId}),/scene changed/);assert.equal(store.project.entities.length,0);
});

test('preflight inspection does not consume a preview and failed insertion preserves it for retry',()=>{
 let fail=true;const store=new ProjectStore(newProject()),session=createWorldPreviewSession({getProject:()=>store.snapshot(),getRevision:()=>0,apply:entities=>{if(fail)throw new Error('Model preflight failed');store.commit('Generate',project=>project.entities.push(...entities));}});
 const preview=session.preview(recipe([add()])),before=store.snapshot();const inspected=session.inspect({previewId:preview.previewId});inspected.entities[0].name='tampered';
 assert.throws(()=>session.apply({previewId:preview.previewId}),/preflight/);assert.deepEqual(store.snapshot(),before);assert.equal(store.past.length,0);assert.equal(session.inspect({previewId:preview.previewId}).entities[0].name,'box');fail=false;assert.equal(session.apply({previewId:preview.previewId}).applied,true);assert.equal(store.past.length,1);
});

test('new project, new preview and explicit invalidation revoke previous preview IDs',()=>{
 const {store,session}=previewFixture(),a=session.preview(recipe([add()]));store.load(newProject());assert.throws(()=>session.apply({previewId:a.previewId}),/changed/);
 const b=session.preview(recipe([add()])),c=session.preview(recipe([add()]));assert.throws(()=>session.apply({previewId:b.previewId}),/no longer/);assert.equal(session.apply({previewId:c.previewId}).applied,true);
 const d=session.preview(recipe([add()]));session.invalidate();assert.throws(()=>session.apply({previewId:d.previewId}),/no longer/);
 assert.throws(()=>session.apply(recipe([add()])),/previewId/);
});

test('preset villages and forests compile without asset changes or external resources',()=>{
 for(const kind of ['village','forest']){const input=createWorldRecipe(kind,{seed:'Demo'}),project=newProject(),compiled=compileWorldRecipe(input,project);assert.ok(compiled.entities.length>20&&compiled.entities.length<=500);assert.equal(project.assets.length,0);assert.ok(compiled.entities.some(entity=>entity.components.player));validateProject({...project,entities:compiled.entities});}
 const project=newProject();project.assets=[{id:'tree',name:'Imported tree',size:0}];const input=createWorldRecipe('forest',{seed:4,assetId:'tree'});assert.equal(compileWorldRecipe(input,project).summary.byType.model,45);assert.throws(()=>compileWorldRecipe(input,newProject()),/imported/);
});

test('presets can reuse an existing player and sun without adding competing controls or lights',()=>{
 for(const kind of ['village','forest']){const compiled=compileWorldRecipe(createWorldRecipe(kind,{includePlayer:false,includeSun:false}));assert.equal(compiled.entities.some(entity=>entity.components.player),false);assert.equal(compiled.entities.some(entity=>entity.type==='directionalLight'),false);}
});
