import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Scene,Mesh,BoxGeometry,MeshBasicMaterial,AnimationClip,VectorKeyframeTrack,Vector3,MathUtils} from 'three';
import {newProject,cleanEntity} from '../engine/core/schema.mjs';
import {ProjectStore} from '../engine/core/project-store.mjs';
import {createSelectionGesture,cancelTransformGesture,preserveWorldTransform} from '../engine/runtime/editor-interactions.mjs';
import {createModelInstance,applyTransform} from '../engine/runtime/scene.mjs';
import {createPhysics} from '../engine/runtime/physics.mjs';

const pointer=(x=10,y=20,extra={})=>({pointerId:1,button:0,clientX:x,clientY:y,isPrimary:true,...extra});

test('selection accepts a primary click but ignores pan, secondary pointers and cancelled gestures',()=>{
 const gesture=createSelectionGesture();gesture.begin(pointer());assert.equal(gesture.end(pointer(12,21)),true);
 gesture.begin(pointer(10,20,{button:2}));assert.equal(gesture.end(pointer(10,20,{button:2})),false);
 gesture.begin(pointer(10,20,{isPrimary:false}));assert.equal(gesture.end(pointer()),false);
 gesture.begin(pointer());gesture.cancel();assert.equal(gesture.end(pointer()),false);
});

test('orbit dragging, multi-touch and gizmo interaction never fall through into object selection',()=>{
 const gesture=createSelectionGesture();gesture.begin(pointer());gesture.move(pointer(50,20));assert.equal(gesture.end(pointer()),false,'Moving away and back is still a drag');
 gesture.begin(pointer());gesture.begin(pointer(10,20,{pointerId:2,isPrimary:false}));assert.equal(gesture.end(pointer(10,20,{pointerId:2})),false);assert.equal(gesture.end(pointer()),false);
 gesture.begin(pointer(),{blocked:true});assert.equal(gesture.end(pointer()),false);
 gesture.begin(pointer());gesture.block();assert.equal(gesture.end(pointer()),false);
});

test('cancelled transforms restore their start and release dragging without a commit event',()=>{
 let restored=0;const control={dragging:true,axis:'X',reset(){restored++;},pointerUp(){assert.fail('Cancel must not commit');}};
 assert.equal(cancelTransformGesture(control),true);assert.equal(restored,1);assert.equal(control.dragging,false);assert.equal(control.axis,null);
 assert.equal(cancelTransformGesture(control),false);assert.equal(restored,1);
});

test('reparenting preserves world position, orientation and scale under rotated uniform parents',()=>{
 const scene=new Scene(),oldParent=new Group(),nextParent=new Group(),object=new Group();scene.add(oldParent,nextParent);oldParent.add(object);
 oldParent.position.set(3,1,-4);oldParent.rotation.y=.7;oldParent.scale.setScalar(2);nextParent.position.set(-5,2,8);nextParent.rotation.x=.2;nextParent.scale.setScalar(.5);
 object.position.set(1,2,3);object.rotation.set(.1,.2,.3);object.scale.set(2,1,3);scene.updateMatrixWorld(true);const before=object.matrixWorld.clone();
 const patch=preserveWorldTransform(object,nextParent);nextParent.add(object);object.position.fromArray(patch.position);object.rotation.set(...patch.rotation.map(MathUtils.degToRad));object.scale.fromArray(patch.scale);scene.updateMatrixWorld(true);
 for(let i=0;i<16;i++)assert.ok(Math.abs(object.matrixWorld.elements[i]-before.elements[i])<1e-8);
});

test('reparenting rejects shear rather than silently changing the object shape',()=>{
 const scene=new Scene(),parent=new Group(),object=new Group();scene.add(parent,object);parent.scale.set(3,1,1);object.rotation.z=.5;scene.updateMatrixWorld(true);
 assert.throws(()=>preserveWorldTransform(object,parent),/sheared|uniform/);
});

test('duplicate includes descendants with remapped parents and one undo/redo step',()=>{
 const project=newProject();project.entities=[{type:'empty',id:'external',name:'Outer'},{type:'empty',id:'parent',parentId:'external',name:'Group',position:[2,3,4]},{type:'box',id:'child',parentId:'parent',name:'Child',position:[1,0,0]},{type:'sphere',id:'grandchild',parentId:'child',name:'Grandchild',position:[0,2,0]},{type:'box',id:'other',name:'Other'}].map(cleanEntity);
 const store=new ProjectStore(project),before=store.snapshot(),copyId=store.duplicate('parent'),copies=store.project.entities.slice(5);
 assert.equal(copies.length,3);assert.equal(copies[0].id,copyId);assert.equal(copies[0].parentId,'external');assert.equal(copies[1].parentId,copyId);assert.equal(copies[2].parentId,copies[1].id);
 assert.deepEqual(copies[0].position,[3,3,4]);assert.deepEqual(copies[1].position,[1,0,0]);assert.equal(store.past.length,1);
 assert.equal(store.undo(),true);assert.deepEqual(store.project.entities,before.entities);assert.equal(store.redo(),true);assert.equal(store.project.entities.at(-3).id,copyId);
 copies[0].position[0]=200;assert.equal(store.project.entities.find(e=>e.id==='parent').position[0],2);
});

test('invalid duplicate rolls back the whole subtree and its history',()=>{
 const project=newProject();project.entities=Array.from({length:32},(_,i)=>cleanEntity({type:'pointLight',id:'light-'+i}));
 const store=new ProjectStore(project),before=store.snapshot();assert.throws(()=>store.duplicate('light-0'),/32.*lights/);assert.deepEqual(store.snapshot(),before);assert.equal(store.past.length,0);
});

test('model entity wrapper preserves imported root transform and binding name',()=>{
 const original=new Group();original.name='ImportedRoot';original.position.set(2,3,4);original.rotation.y=.4;original.scale.setScalar(2);
 const child=new Group();child.name='Part';original.add(child);
 const entity=cleanEntity({type:'model',name:'Renamed entity',assetId:'a',position:[10,0,0],scale:[3,3,3]}),instance=createModelInstance({scene:original,animations:[]},entity);
 applyTransform(instance.object,entity);const content=instance.object.children[0];assert.equal(instance.object.name,'Renamed entity');assert.equal(content.name,'ImportedRoot');assert.deepEqual(content.position.toArray(),[2,3,4]);assert.deepEqual(content.scale.toArray(),[2,2,2]);assert.ok(Math.abs(content.rotation.y-.4)<1e-12);
 instance.object.updateMatrixWorld(true);assert.deepEqual(content.getWorldPosition(new Vector3()).toArray(),[16,9,12]);assert.deepEqual(original.position.toArray(),[2,3,4]);assert.notEqual(content,original);
});

test('imported root animation runs inside the entity wrapper and resets without moving authored transform',()=>{
 const original=new Group();original.name='ImportedRoot';const clip=new AnimationClip('Walk',2,[new VectorKeyframeTrack('ImportedRoot.position',[0,2],[1,2,3,5,2,3])]);
 const entity=cleanEntity({type:'model',assetId:'a',name:'Editable name',position:[10,0,0],components:{animation:{clip:'Walk',autoplay:true,speed:2}}});
 const {object,mixer}=createModelInstance({scene:original,animations:[clip]},entity);applyTransform(object,entity);mixer.update(.5);
 assert.deepEqual(object.position.toArray(),[10,0,0]);assert.deepEqual(object.children[0].position.toArray(),[3,2,3]);mixer.setTime(0);assert.deepEqual(object.children[0].position.toArray(),[1,2,3]);assert.deepEqual(object.position.toArray(),entity.position);
 mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());
});

test('disabled animation stays still and an unknown clip has an explicit fallback warning',()=>{
 const original=new Group(),clip=new AnimationClip('Idle',1,[]),warnings=[];
 const disabled=createModelInstance({scene:original,animations:[clip]},cleanEntity({type:'model',assetId:'a',components:{animation:{autoplay:false}}}));assert.equal(disabled.mixer,null);
 const fallback=createModelInstance({scene:original,animations:[clip]},cleanEntity({type:'model',name:'Actor',assetId:'a',components:{animation:{clip:'Missing'}}}),{onLog:entry=>warnings.push(entry)});
 assert.equal(warnings.length,1);assert.match(warnings[0].message,/Missing.*Idle/);fallback.mixer.stopAllAction();fallback.mixer.uncacheRoot(fallback.mixer.getRoot());
});

async function physicsFixture(t,entities){
 const previousWindow=globalThis.window;globalThis.window={performance:globalThis.performance,addEventListener(){},removeEventListener(){}};
 const project=newProject(),scene=new Scene(),objects=new Map(),scores=[],logs=[];project.settings.gravity=0;project.entities=entities.map(cleanEntity);
 for(const entity of project.entities){const object=entity.type==='empty'?new Group():new Mesh(new BoxGeometry(.1,.1,.1),new MeshBasicMaterial());applyTransform(object,entity);objects.set(entity.id,object);}
 for(const entity of project.entities)(objects.get(entity.parentId)||scene).add(objects.get(entity.id));scene.updateMatrixWorld(true);
 const physics=await createPhysics(project,objects,{onScore:value=>scores.push(value),onLog:entry=>logs.push(entry)});
 t.after(()=>{physics.dispose();scene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
 return {project,objects,physics,scores,logs};
}

test('collecting removes invisible object and descendant colliders without mutating the authoring project',async t=>{
 const f=await physicsFixture(t,[{type:'box',id:'player',position:[0,0,0],components:{rigidbody:{type:'dynamic'},player:{}}},{type:'box',id:'coin',position:[.5,0,0],components:{rigidbody:{type:'static'},collectible:{value:3}}},{type:'box',id:'coin-child',parentId:'coin',position:[0,.5,0],components:{rigidbody:{type:'static'}}}]);
 const before=structuredClone(f.project);assert.equal(f.physics.bodies.size,3);f.physics.step(1/60);assert.deepEqual(f.scores,[3]);assert.equal(f.physics.bodies.size,1);assert.equal(f.objects.get('coin').visible,false);assert.deepEqual(f.project,before);f.physics.step(1/60);assert.deepEqual(f.scores,[3]);
});

test('multiple visible player components use the same input and warn that independent controls are unsupported',async t=>{
 const f=await physicsFixture(t,[{type:'box',id:'one',position:[0,0,0],components:{rigidbody:{type:'dynamic'},player:{speed:4}}},{type:'box',id:'two',position:[3,0,0],components:{rigidbody:{type:'dynamic'},player:{speed:4}}}]);
 assert.match(f.logs[0].message,/2 active Player.*share/);f.physics.setInput({x:1,z:0});f.physics.step(1/60);for(const id of ['one','two'])assert.ok(Math.abs(f.physics.bodies.get(id).linvel().x-4)<.01);
});

test('a Player collectible cannot collect itself',async t=>{
 const f=await physicsFixture(t,[{type:'box',id:'player',components:{rigidbody:{type:'dynamic'},player:{},collectible:{value:7}}}]);f.physics.step(1/60);assert.deepEqual(f.scores,[]);assert.equal(f.physics.bodies.size,1);
});
