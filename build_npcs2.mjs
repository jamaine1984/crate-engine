import { Document, NodeIO } from '@gltf-transform/core';
import path from 'path';
import fs from 'fs';

const outDir = 'web/models/npcs';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const skins = [[1,.86,.67],[.95,.76,.49],[.83,.64,.45],[.78,.53,.26],[.55,.33,.14],[.42,.23,.16],[.29,.16,.07],[.88,.67,.41],[.75,.55,.39],[.63,.32,.18]];
const shirtCols = [[.17,.24,.31],[.91,.3,.24],[.2,.6,.86],[.15,.68,.38],[.95,.61,.07],[.56,.27,.68],[.1,.74,.61],[.83,.33,0],[.16,.5,.73],[.75,.22,.17],
  [.09,.63,.52],[.95,.77,.06],[.5,.55,.55],[.18,.8,.44],[.61,.35,.71],[.9,.49,.13],[.2,.29,.37],[.12,.38,.55],[.42,.2,.51],[.66,.14,.15],
  [1,1,1],[0,0,0],[.91,.91,.91],[1,.42,.42],[.31,.8,.77],[.27,.72,.82],[.59,.81,.7],[1,.63,.48],[.53,.81,.92],[.87,.63,.87]];
const pantsCols = [[.17,.24,.31],[.1,.1,.18],[.29,.29,.29],[.18,.31,.31],[.1,.1,.44],[.23,.23,.23],[.33,.42,.18],[.55,.26,.07],[.41,.41,.41],[.28,.24,.55]];
const shoesCols = [[.1,.1,.1],[.24,.17,.12],[.29,.29,.29],[.55,.26,.07],[.18,.31,.31],[1,1,1],[.75,.22,.17],[.17,.24,.31]];
const hairCols = [[.1,.1,.1],[.23,.13,.1],[.42,.23,.16],[.72,.52,.07],[.85,.65,.13],[.63,.32,.18],[.5,.5,.5],[.82,.41,.11],[.18,.11,.08],[.29,.02,.02]];

const names = [
  'man_business','woman_casual','man_hoodie','woman_dress','man_tshirt',
  'woman_blouse','man_polo','woman_skirt','man_jacket','woman_coat',
  'man_suit','woman_jeans','man_athletic','woman_sporty','man_worker',
  'woman_elegant','man_urban','woman_bohemian','man_preppy','woman_modern',
  'man_casual2','woman_office','man_street','woman_summer','man_winter',
  'woman_spring','man_formal','woman_punk','man_hip','woman_classic',
  'man_rugged','woman_chic','man_chill','woman_artsy','man_tech',
  'woman_yoga','man_cowboy','woman_rocker','man_surfer','woman_nurse',
  'man_chef','woman_teacher','man_pilot','woman_artist','man_firefighter',
  'woman_scientist','man_mechanic','woman_dancer','man_athlete','woman_executive'
];

function vec3(x,y,z) { return [x,y,z]; }

function buildNPC(doc, def, idx) {
  const scene = doc.createScene();
  const buf = doc.createBuffer();
  
  // Create Mixamo-compatible skeleton as joints
  const joints = {};
  
  function joint(name, t) {
    const n = doc.createNode(name).setTranslation(t);
    joints[name] = n;
    return n;
  }
  
  // Hierarchy — arms at sides (not T-pose)
  const hips = joint('mixamorigHips', [0, 0.95, 0]);
  const spine = joint('mixamorigSpine', [0, 0.1, 0]);
  const spine1 = joint('mixamorigSpine1', [0, 0.12, 0]);
  const spine2 = joint('mixamorigSpine2', [0, 0.12, 0]);
  const neck = joint('mixamorigNeck', [0, 0.15, 0]);
  const head = joint('mixamorigHead', [0, 0.08, 0]);
  const headTop = joint('mixamorigHeadTop_End', [0, 0.22, 0]);
  
  const lSh = joint('mixamorigLeftShoulder', [0.06, 0.13, 0]);
  const lA = joint('mixamorigLeftArm', [0.1, -0.02, 0]);
  const lFA = joint('mixamorigLeftForeArm', [0, -0.25, 0]);
  const lH = joint('mixamorigLeftHand', [0, -0.22, 0]);
  
  const rSh = joint('mixamorigRightShoulder', [-0.06, 0.13, 0]);
  const rA = joint('mixamorigRightArm', [-0.1, -0.02, 0]);
  const rFA = joint('mixamorigRightForeArm', [0, -0.25, 0]);
  const rH = joint('mixamorigRightHand', [0, -0.22, 0]);
  
  const lUL = joint('mixamorigLeftUpLeg', [0.09, -0.05, 0]);
  const lL = joint('mixamorigLeftLeg', [0, -0.42, 0]);
  const lF = joint('mixamorigLeftFoot', [0, -0.42, 0.02]);
  const lT = joint('mixamorigLeftToeBase', [0, 0, 0.1]);
  
  const rUL = joint('mixamorigRightUpLeg', [-0.09, -0.05, 0]);
  const rL = joint('mixamorigRightLeg', [0, -0.42, 0]);
  const rF = joint('mixamorigRightFoot', [0, -0.42, 0.02]);
  const rT = joint('mixamorigRightToeBase', [0, 0, 0.1]);
  
  // Build hierarchy
  hips.addChild(spine).addChild(lUL).addChild(rUL);
  spine.addChild(spine1);
  spine1.addChild(spine2);
  spine2.addChild(neck).addChild(lSh).addChild(rSh);
  neck.addChild(head);
  head.addChild(headTop);
  lSh.addChild(lA); lA.addChild(lFA); lFA.addChild(lH);
  rSh.addChild(rA); rA.addChild(rFA); rFA.addChild(rH);
  lUL.addChild(lL); lL.addChild(lF); lF.addChild(lT);
  rUL.addChild(rL); rL.addChild(rF); rF.addChild(rT);
  
  scene.addChild(hips);
  
  // Create skin
  const allJoints = [hips,spine,spine1,spine2,neck,head,headTop,
    lSh,lA,lFA,lH, rSh,rA,rFA,rH,
    lUL,lL,lF,lT, rUL,rL,rF,rT];
  
  const skin = doc.createSkin('NPC_Skin');
  for (const j of allJoints) skin.addJoint(j);
  skin.setSkeleton(hips);
  
  // Compute inverse bind matrices
  // We need world transforms for each joint
  function getWorldPos(jointNode) {
    const pos = [0,0,0];
    let cur = jointNode;
    while (cur) {
      const t = cur.getTranslation();
      pos[0] += t[0]; pos[1] += t[1]; pos[2] += t[2];
      cur = cur.getParentNode ? cur.getParentNode() : null;
      // gltf-transform: use listParents
      const parents = cur ? [] : jointNode.listParents().filter(p => p.propertyType === 'Node');
      if (!cur && parents.length > 0) cur = parents[0];
      else break;
    }
    return pos;
  }
  
  // Compute IBMs manually by walking hierarchy
  function computeWorldTranslation(node) {
    const t = [...node.getTranslation()];
    // Walk up parents
    for (const parent of node.listParents()) {
      if (parent.propertyType === 'Node') {
        const pt = computeWorldTranslation(parent);
        t[0] += pt[0]; t[1] += pt[1]; t[2] += pt[2];
      }
    }
    return t;
  }
  
  const ibmData = new Float32Array(allJoints.length * 16);
  for (let i = 0; i < allJoints.length; i++) {
    const wt = computeWorldTranslation(allJoints[i]);
    // IBM = inverse of world transform (translation only)
    // Identity matrix with -translation
    const off = i * 16;
    ibmData[off+0]=1; ibmData[off+1]=0; ibmData[off+2]=0; ibmData[off+3]=0;
    ibmData[off+4]=0; ibmData[off+5]=1; ibmData[off+6]=0; ibmData[off+7]=0;
    ibmData[off+8]=0; ibmData[off+9]=0; ibmData[off+10]=1; ibmData[off+11]=0;
    ibmData[off+12]=-wt[0]; ibmData[off+13]=-wt[1]; ibmData[off+14]=-wt[2]; ibmData[off+15]=1;
  }
  
  const ibmAccessor = doc.createAccessor('IBM')
    .setType('MAT4')
    .setArray(ibmData)
    .setBuffer(buf);
  skin.setInverseBindMatrices(ibmAccessor);
  
  // Helper: create box mesh with single bone binding
  function createBoxMesh(name, w, h, d, material, jointIdx) {
    const hw=w/2, hh=h/2, hd=d/2;
    // Box: 8 vertices, 12 triangles
    const positions = new Float32Array([
      -hw,-hh,-hd, hw,-hh,-hd, hw,hh,-hd, -hw,hh,-hd,
      -hw,-hh,hd, hw,-hh,hd, hw,hh,hd, -hw,hh,hd,
      -hw,hh,-hd, hw,hh,-hd, hw,hh,hd, -hw,hh,hd,
      -hw,-hh,-hd, hw,-hh,-hd, hw,-hh,hd, -hw,-hh,hd,
      -hw,-hh,-hd, -hw,hh,-hd, -hw,hh,hd, -hw,-hh,hd,
      hw,-hh,-hd, hw,hh,-hd, hw,hh,hd, hw,-hh,hd,
    ]);
    const normals = new Float32Array([
      0,0,-1,0,0,-1,0,0,-1,0,0,-1,
      0,0,1,0,0,1,0,0,1,0,0,1,
      0,1,0,0,1,0,0,1,0,0,1,0,
      0,-1,0,0,-1,0,0,-1,0,0,-1,0,
      -1,0,0,-1,0,0,-1,0,0,-1,0,0,
      1,0,0,1,0,0,1,0,0,1,0,0,
    ]);
    const indices = new Uint16Array([
      0,1,2,0,2,3, 4,6,5,4,7,6, 8,10,9,8,11,10,
      12,13,14,12,14,15, 16,18,17,16,19,18, 20,21,22,20,22,23
    ]);
    const vc = 24;
    const joints0 = new Uint16Array(vc * 4);
    const weights0 = new Float32Array(vc * 4);
    for (let i = 0; i < vc; i++) {
      joints0[i*4] = jointIdx;
      weights0[i*4] = 1;
    }
    
    const posA = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buf);
    const normA = doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buf);
    const idxA = doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buf);
    const jA = doc.createAccessor().setType('VEC4').setArray(joints0).setBuffer(buf);
    const wA = doc.createAccessor().setType('VEC4').setArray(weights0).setBuffer(buf);
    
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', posA)
      .setAttribute('NORMAL', normA)
      .setAttribute('JOINTS_0', jA)
      .setAttribute('WEIGHTS_0', wA)
      .setIndices(idxA)
      .setMaterial(material);
    
    const mesh = doc.createMesh(name).addPrimitive(prim);
    return mesh;
  }
  
  // Create sphere-like mesh (icosphere approximation — just use box for now, it's stylized)
  // Actually let's use a simple approach: all body parts are boxes/capsule-like
  
  const skinCol = def.skin;
  const shirtCol = def.shirt;
  const pantsCol = def.pants;
  const shoesCol = def.shoes;
  const hairCol = def.hairColor;
  
  const matSkin = doc.createMaterial('skin').setBaseColorFactor([...skinCol, 1]).setRoughnessFactor(0.8);
  const matShirt = doc.createMaterial('shirt').setBaseColorFactor([...shirtCol, 1]).setRoughnessFactor(0.7);
  const matPants = doc.createMaterial('pants').setBaseColorFactor([...pantsCol, 1]).setRoughnessFactor(0.7);
  const matShoes = doc.createMaterial('shoes').setBaseColorFactor([...shoesCol, 1]).setRoughnessFactor(0.9);
  const matHair = doc.createMaterial('hair').setBaseColorFactor([...hairCol, 1]).setRoughnessFactor(0.6);
  
  // Joint indices map
  const ji = {};
  allJoints.forEach((j, i) => ji[j.getName()] = i);
  
  // Body parts as nodes with meshes
  const parts = [
    ['Head', 0.18, 0.2, 0.18, matSkin, ji['mixamorigHead']],
    ['Hair', 0.19, 0.1, 0.19, matHair, ji['mixamorigHead']],
    ['Neck', 0.08, 0.08, 0.08, matSkin, ji['mixamorigNeck']],
    ['Torso', 0.34, 0.42, 0.18, matShirt, ji['mixamorigSpine1']],
    ['Hips', 0.32, 0.12, 0.18, matPants, ji['mixamorigHips']],
    ['UpperArmL', 0.08, 0.22, 0.08, matShirt, ji['mixamorigLeftArm']],
    ['ForeArmL', 0.07, 0.2, 0.07, matSkin, ji['mixamorigLeftForeArm']],
    ['HandL', 0.05, 0.08, 0.03, matSkin, ji['mixamorigLeftHand']],
    ['UpperArmR', 0.08, 0.22, 0.08, matShirt, ji['mixamorigRightArm']],
    ['ForeArmR', 0.07, 0.2, 0.07, matSkin, ji['mixamorigRightForeArm']],
    ['HandR', 0.05, 0.08, 0.03, matSkin, ji['mixamorigRightHand']],
    ['UpperLegL', 0.12, 0.36, 0.12, matPants, ji['mixamorigLeftUpLeg']],
    ['LowerLegL', 0.1, 0.36, 0.1, matPants, ji['mixamorigLeftLeg']],
    ['ShoeL', 0.09, 0.07, 0.18, matShoes, ji['mixamorigLeftFoot']],
    ['UpperLegR', 0.12, 0.36, 0.12, matPants, ji['mixamorigRightUpLeg']],
    ['LowerLegR', 0.1, 0.36, 0.1, matPants, ji['mixamorigRightLeg']],
    ['ShoeR', 0.09, 0.07, 0.18, matShoes, ji['mixamorigRightFoot']],
  ];
  
  for (const [name, w, h, d, mat, jIdx] of parts) {
    const mesh = createBoxMesh(name, w, h, d, mat, jIdx);
    const node = doc.createNode(name).setMesh(mesh).setSkin(skin);
    scene.addChild(node);
  }
  
  return doc;
}

async function main() {
  const io = new NodeIO();
  console.log('Building 50 NPC characters...');
  
  for (let i = 0; i < 50; i++) {
    const def = {
      name: names[i],
      skin: skins[i % skins.length],
      shirt: shirtCols[i % shirtCols.length],
      pants: pantsCols[i % pantsCols.length],
      shoes: shoesCols[i % shoesCols.length],
      hairColor: hairCols[i % hairCols.length],
    };
    
    try {
      const doc = new Document();
      buildNPC(doc, def, i);
      const filepath = path.join(outDir, `${def.name}.glb`);
      await io.write(filepath, doc);
      const stats = fs.statSync(filepath);
      console.log(`  [${i+1}/50] ${def.name}.glb (${(stats.size/1024).toFixed(1)}KB)`);
    } catch(e) {
      console.error(`  [${i+1}/50] FAILED ${def.name}: ${e.message}`);
      if (i === 0) console.error(e.stack);
    }
  }
  console.log('Done!');
}

main();
