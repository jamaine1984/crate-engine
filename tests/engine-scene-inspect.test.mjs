import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {groundWarnings,groundPlacements,surfaceBelow,framingPose} from '../engine/runtime/scene-inspect.mjs';
import {createCommandRunner} from '../engine/editor/mcp-client.mjs';

function world(){
 const root=new THREE.Group(),objects=new Map(),entities=[];
 const add=(id,name,geometry,position,extra={})=>{const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.position.fromArray(position);mesh.userData.entityId=id;root.add(mesh);objects.set(id,mesh);entities.push({id,name,type:'box',position,scale:[1,1,1],components:{},parentId:null,visible:true,...extra});return mesh;};
 add('ground','Beach',new THREE.BoxGeometry(100,1,100),[0,-.5,0]);                 // top at y=0
 add('table','Table',new THREE.BoxGeometry(2,1,2),[5,.5,5]);                         // resting, top at 1
 add('crate','Crate',new THREE.BoxGeometry(1,1,1),[5,1.5,5]);                        // resting on the table
 add('balloon','Floating crate',new THREE.BoxGeometry(1,1,1),[-10,3.5,0]);           // 3 m above the beach
 add('lost','Lost rock',new THREE.BoxGeometry(1,1,1),[300,2,0]);                     // nothing below
 entities.push({id:'sea',name:'Ocean',type:'plane',position:[0,1,-200],scale:[200,1,200],components:{water:{}},parentId:null,visible:true});
 root.updateMatrixWorld(true);
 return {THREE,root,objects,project:{entities}};
}

test('resting objects pass; floating objects and objects over nothing are reported with the fix',()=>{
 const w=world(),warnings=groundWarnings({...w,ids:['table','crate','balloon','lost']});
 assert.equal(warnings.length,2);
 assert.match(warnings[0],/Floating crate floats 3\.00 m above Beach/);assert.match(warnings[0],/place_on_ground \{ids:\["balloon"\]\}/);
 assert.match(warnings[1],/Lost rock has nothing under it/);
 assert.deepEqual(groundWarnings({...w,ids:['ground']}),[],'very large pieces such as terrain are not checked');
});

test('place_on_ground drops floating objects onto the ground, lifts buried ones and can float on water',()=>{
 const w=world();
 w.objects.get('table').position.y=-.2;w.root.updateMatrixWorld(true);                 // table buried 0.7 m
 const {updates,problems}=groundPlacements({...w,ids:['balloon','table','lost']});
 const byId=Object.fromEntries(updates.map(u=>[u.id,u]));
 assert.equal(byId.balloon.position[1],.5);assert.equal(byId.balloon.restsOn,'Beach');
 assert.equal(byId.table.position[1],.5);
 assert.equal(problems.length,1);assert.match(problems[0],/Lost rock/);
 const buoy=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());buoy.position.set(0,5,-200);buoy.userData.entityId='buoy';w.root.add(buoy);w.objects.set('buoy',buoy);w.project.entities.push({id:'buoy',name:'Buoy',type:'box',position:[0,5,-200],scale:[1,1,1],components:{},parentId:null,visible:true});w.root.updateMatrixWorld(true);
 const onWater=groundPlacements({...w,ids:['buoy'],offset:-.4}).updates[0];
 assert.equal(onWater.restsOn,'Ocean');assert.equal(onWater.position[1],1.6,'bottom at water level (y=1) minus 0.4, centre 1 m above');
 assert.equal(surfaceBelow({...w,x:0,z:-200,fromY:10,surface:'ground',ignore:new Set(['buoy'])}),null,'ground-only ignores water');
});

test('the framing pose looks at the box from above and outside it',()=>{
 const box=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1)),pose=framingPose(THREE,box);
 assert.deepEqual(pose.target.toArray(),[0,1,0]);assert.ok(pose.position.y>2&&!box.containsPoint(pose.position));
});

test('every scene change returns a picture and warnings; previews stay short',async()=>{
 let project={id:'p',entities:[{id:'a'}],assets:[]},proposals=[],inspected=[];
 const editor={getProject:()=>structuredClone(project),applyProposal:p=>{proposals.push(p);},
  previewWorld:async()=>({previewId:'1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b',summary:{entityCount:40},entities:Array.from({length:40},(_,i)=>({id:'e'+i}))}),
  inspectChange:async({ids})=>{inspected.push(ids);return {warnings:['Crate floats 1.00 m above Beach.'],image:{mimeType:'image/jpeg',data:'QUJD'}};},
  groundPlacements:async ids=>({updates:ids.map(id=>({id,position:[0,1,0],restsOn:'Beach',moved:-2})),problems:[]}),
  checkScene:async()=>({checked:1,warnings:[]})};
 const runner=createCommandRunner({getEditor:()=>editor,getState:()=>({mode:'edit',busy:false})});
 const preview=await runner.run('preview_world',{recipe:{}},{allowWrites:false});
 assert.equal(preview.entities.length,12);assert.equal(preview.omitted,28);
 const edit=await runner.run('edit_objects',{operations:[{op:'update',id:'a',patch:{name:'B'}}]},{allowWrites:true});
 assert.deepEqual(inspected.at(-1),['a']);assert.equal(edit.image.data,'QUJD');assert.deepEqual(edit.warnings,['Crate floats 1.00 m above Beach.']);
 const placed=await runner.run('place_on_ground',{ids:['a']},{allowWrites:true});
 assert.match(placed.summary,/a moved -2 m onto Beach/);assert.deepEqual(proposals.at(-1).operations,[{op:'update',id:'a',patch:{position:[0,1,0]}}]);
 const check=await runner.run('check_scene',{look:false},{allowWrites:false});
 assert.deepEqual(check,{projectId:'p',checked:1,warnings:[]});
 await assert.rejects(runner.run('place_on_ground',{ids:['a']},{allowWrites:false}),/disabled/);
});
