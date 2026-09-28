import {Document,NodeIO} from '@gltf-transform/core';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const doc=new Document(),buffer=doc.createBuffer();
const positions=new Float32Array([-1,0,-1,1,0,-1,0,2,0,1,0,-1,1,0,1,0,2,0,1,0,1,-1,0,1,0,2,0,-1,0,1,-1,0,-1,0,2,0,-1,0,-1,-1,0,1,1,0,1,-1,0,-1,1,0,1,1,0,-1]);
const material=doc.createMaterial('Copper').setBaseColorFactor([.9,.35,.08,1]).setMetallicFactor(.4).setRoughnessFactor(.35);
const primitive=doc.createPrimitive().setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer)).setMaterial(material);
doc.createScene('QA pyramid').addChild(doc.createNode('Pyramid').setMesh(doc.createMesh('Pyramid').addPrimitive(primitive)));
const target=resolve(import.meta.dirname,'../../../work/qa-pyramid.glb');await mkdir(resolve(target,'..'),{recursive:true});await new NodeIO().write(target,doc);console.log(target);
