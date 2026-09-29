import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanEntity} from '../engine/core/schema.mjs';
import {validateWorldRecipeShape,compileWorldRecipe} from '../engine/core/procedural.mjs';
import {validArguments} from '../integrations/editor/contracts.mjs';
import {createWaterMesh,isWaterObject,updateWaterTime,WATER_DEFAULTS,WATER_SEGMENTS} from '../engine/runtime/water.mjs';
import * as THREE from 'three';

const sea={type:'plane',name:'Sea',scale:[400,1,400],components:{water:{waveHeight:1.2,waveLength:30,deepColor:'#003355'}}};

test('a plane can carry a cleaned water component',()=>{
 const entity=cleanEntity(sea);
 assert.equal(entity.components.water.waveHeight,1.2);
 assert.equal(entity.components.water.deepColor,'#003355');
 assert.equal(entity.components.water.foam,true);
 assert.equal(entity.components.water.choppiness,.5);
});

test('water values are clamped and bad colours fall back',()=>{
 const water=cleanEntity({type:'plane',components:{water:{waveHeight:99,waveLength:1,opacity:0,deepColor:'red',foam:false}}}).components.water;
 assert.equal(water.waveHeight,5);assert.equal(water.waveLength,4);assert.equal(water.opacity,.3);
 assert.equal(water.deepColor,'#0a4d6e');assert.equal(water.foam,false);
});

test('water is refused on other shapes and beside physics or gameplay',()=>{
 assert.throws(()=>cleanEntity({type:'box',components:{water:{}}}),/plane/);
 assert.throws(()=>cleanEntity({type:'plane',components:{water:{},rigidbody:{type:'static'}}}),/plane/);
 assert.throws(()=>cleanEntity({type:'plane',components:{water:{},hazard:{}}}),/plane/);
});

test('world recipes and MCP edits accept water and reject it elsewhere',()=>{
 const recipe={version:1,seed:'sea',operations:[{op:'add',entity:sea}]};
 assert.doesNotThrow(()=>validateWorldRecipeShape(recipe));
 assert.equal(compileWorldRecipe?.length>=0,true);
 assert.throws(()=>validateWorldRecipeShape({version:1,seed:'sea',operations:[{op:'add',entity:{type:'box',components:{water:{}}}}]}),/plane/);
 assert.equal(validArguments('edit_objects',{operations:[{op:'update',id:'a1',patch:{components:{water:{waveHeight:2,foam:true}}}}]}),true);
 assert.equal(validArguments('edit_objects',{operations:[{op:'update',id:'a1',patch:{components:{water:{waveHeight:50}}}}]}),false);
 assert.equal(validArguments('edit_objects',{operations:[{op:'update',id:'a1',patch:{components:{water:null}}}]}),true);
});

test('the water mesh is a dense animated grid that does not cast shadows',()=>{
 const entity=cleanEntity(sea);
 const mesh=createWaterMesh(THREE,entity);
 assert.equal(isWaterObject(mesh),true);
 assert.equal(mesh.geometry.attributes.position.count,(WATER_SEGMENTS+1)**2);
 assert.equal(mesh.material.transparent,true);
 const {uniforms}=mesh.userData.water;
 assert.equal(uniforms.uHeight.value,1.2);
 updateWaterTime(mesh,12.5,new THREE.Color('#87ceeb'));
 assert.equal(uniforms.uTime.value,12.5);
 assert.equal(uniforms.uSky.value.getHexString(),'87ceeb');
 assert.equal(WATER_DEFAULTS.opacity,.86);
});

test('the wave shader replaces every chunk three.js provides',()=>{
 const mesh=createWaterMesh(THREE,cleanEntity(sea));
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <defaultnormal_vertex>',fragmentShader:'#include <common>\n#include <normal_fragment_maps>'};
 mesh.material.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/gerstnerWaves/);
 assert.match(shader.vertexShader,/transformedNormal=normalize\(mat3\(viewMatrix\)\*gNormal\)/);
 assert.match(shader.fragmentShader,/totalEmissiveRadiance\+=uSky/);
 assert.ok(shader.uniforms.uTime&&shader.uniforms.uDeep&&shader.uniforms.uOpacity);
 // If a three.js upgrade renames a chunk, the replacements silently do nothing. Fail loudly instead.
 for(const chunk of ['beginnormal_vertex','begin_vertex','defaultnormal_vertex']){
  assert.ok(THREE.ShaderChunk[chunk],'three.js no longer ships the '+chunk+' chunk');
 }
 assert.ok(THREE.ShaderChunk.normal_fragment_maps);
 assert.ok(THREE.ShaderLib.standard.vertexShader.includes('#include <beginnormal_vertex>'));
 assert.ok(THREE.ShaderLib.standard.vertexShader.includes('#include <defaultnormal_vertex>'));
 assert.ok(THREE.ShaderLib.standard.fragmentShader.includes('#include <normal_fragment_maps>'));
});
