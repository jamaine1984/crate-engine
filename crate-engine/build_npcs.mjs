import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

const outDir = 'web/models/npcs';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 50 NPC definitions: diverse skin tones, outfits, hair
const skins = [0xFFDBAC, 0xF1C27D, 0xD4A373, 0xC68642, 0x8D5524, 0x6B3A2A, 0x4A2912, 0xE0AC69, 0xBE8C63, 0xA0522D];
const shirts = [0x2C3E50,0xE74C3C,0x3498DB,0x27AE60,0xF39C12,0x8E44AD,0x1ABC9C,0xD35400,0x2980B9,0xC0392B,
  0x16A085,0xF1C40F,0x7F8C8D,0x2ECC71,0x9B59B6,0xE67E22,0x34495E,0x1F618D,0x6C3483,0xA93226,
  0xFFFFFF,0x000000,0xE8E8E8,0xFF6B6B,0x4ECDC4,0x45B7D1,0x96CEB4,0xFFA07A,0x87CEEB,0xDDA0DD];
const pants = [0x2C3E50,0x1A1A2E,0x4A4A4A,0x2F4F4F,0x191970,0x3B3B3B,0x556B2F,0x8B4513,0x696969,0x483D8B];
const shoes = [0x1A1A1A,0x3D2B1F,0x4A4A4A,0x8B4513,0x2F4F4F,0xFFFFFF,0xC0392B,0x2C3E50];
const hairs = [0x1A1A1A,0x3B2219,0x6B3A2A,0xB8860B,0xDAA520,0xA0522D,0x808080,0xD2691E,0x2F1B14,0x4A0404];
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

function createSkeleton() {
  const bones = [];
  
  function b(name, parent, x, y, z) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(x, y, z);
    if (parent) parent.add(bone);
    bones.push(bone);
    return bone;
  }
  
  // Mixamo-compatible hierarchy — arms at sides rest pose
  const hips = b('mixamorigHips', null, 0, 0.95, 0);
  const spine = b('mixamorigSpine', hips, 0, 0.1, 0);
  const spine1 = b('mixamorigSpine1', spine, 0, 0.12, 0);
  const spine2 = b('mixamorigSpine2', spine1, 0, 0.12, 0);
  const neck = b('mixamorigNeck', spine2, 0, 0.15, 0);
  const head = b('mixamorigHead', neck, 0, 0.08, 0);
  b('mixamorigHeadTop_End', head, 0, 0.22, 0);
  
  // Left arm — hanging at side
  const lsh = b('mixamorigLeftShoulder', spine2, 0.06, 0.13, 0);
  const la = b('mixamorigLeftArm', lsh, 0.1, -0.02, 0);
  const lfa = b('mixamorigLeftForeArm', la, 0, -0.25, 0);
  const lh = b('mixamorigLeftHand', lfa, 0, -0.22, 0);
  
  // Right arm
  const rsh = b('mixamorigRightShoulder', spine2, -0.06, 0.13, 0);
  const ra = b('mixamorigRightArm', rsh, -0.1, -0.02, 0);
  const rfa = b('mixamorigRightForeArm', ra, 0, -0.25, 0);
  const rh = b('mixamorigRightHand', rfa, 0, -0.22, 0);
  
  // Left leg
  const lul = b('mixamorigLeftUpLeg', hips, 0.09, -0.05, 0);
  const ll = b('mixamorigLeftLeg', lul, 0, -0.42, 0);
  const lf = b('mixamorigLeftFoot', ll, 0, -0.42, 0.02);
  b('mixamorigLeftToeBase', lf, 0, 0, 0.1);
  
  // Right leg
  const rul = b('mixamorigRightUpLeg', hips, -0.09, -0.05, 0);
  const rl = b('mixamorigRightLeg', rul, 0, -0.42, 0);
  const rf = b('mixamorigRightFoot', rl, 0, -0.42, 0.02);
  b('mixamorigRightToeBase', rf, 0, 0, 0.1);
  
  return { skeleton: new THREE.Skeleton(bones), bones, root: hips };
}

function skinGeo(geo, boneIndex) {
  const count = geo.attributes.position.count;
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    si[i*4] = boneIndex;
    sw[i*4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}

function skinGeoBlend(geo, bi1, bi2, yCenter, yRange) {
  const count = geo.attributes.position.count;
  const si = new Uint16Array(count * 4);
  const sw = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const y = geo.attributes.position.getY(i);
    const t = Math.max(0, Math.min(1, (y - yCenter + yRange) / (2 * yRange)));
    si[i*4] = bi1; si[i*4+1] = bi2;
    sw[i*4] = 1-t; sw[i*4+1] = t;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}

function buildChar(def) {
  const { skeleton, bones, root } = createSkeleton();
  const scene = new THREE.Scene();
  
  const bi = {};
  bones.forEach((b, i) => bi[b.name] = i);
  
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });
  const skinM = mat(def.skin);
  const shirtM = mat(def.shirt);
  const pantsM = mat(def.pants);
  const shoesM = mat(def.shoes);
  const hairM = mat(def.hairColor);
  
  const allMeshes = [];
  
  // Head
  const headG = skinGeo(new THREE.SphereGeometry(0.1, 12, 10), bi['mixamorigHead']);
  allMeshes.push(new THREE.SkinnedMesh(headG, skinM));
  
  // Hair
  const hairG = skinGeo(new THREE.SphereGeometry(0.105, 10, 6, 0, Math.PI*2, 0, Math.PI*0.55), bi['mixamorigHead']);
  allMeshes.push(new THREE.SkinnedMesh(hairG, hairM));
  
  // Neck
  const neckG = skinGeo(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), bi['mixamorigNeck']);
  allMeshes.push(new THREE.SkinnedMesh(neckG, skinM));
  
  // Torso — blend between spine bones
  const torsoG = skinGeoBlend(new THREE.BoxGeometry(0.34, 0.42, 0.18, 1, 4, 1),
    bi['mixamorigSpine'], bi['mixamorigSpine2'], 0, 0.21);
  allMeshes.push(new THREE.SkinnedMesh(torsoG, shirtM));
  
  // Arms
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    // Upper arm
    const uaG = skinGeo(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), bi[`mixamorig${side}Arm`]);
    allMeshes.push(new THREE.SkinnedMesh(uaG, shirtM));
    
    // Forearm
    const faG = skinGeo(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), bi[`mixamorig${side}ForeArm`]);
    allMeshes.push(new THREE.SkinnedMesh(faG, skinM));
    
    // Hand
    const hG = skinGeo(new THREE.BoxGeometry(0.05, 0.07, 0.03), bi[`mixamorig${side}Hand`]);
    allMeshes.push(new THREE.SkinnedMesh(hG, skinM));
  }
  
  // Legs
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    // Upper leg
    const ulG = skinGeo(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), bi[`mixamorig${side}UpLeg`]);
    allMeshes.push(new THREE.SkinnedMesh(ulG, pantsM));
    
    // Lower leg
    const llG = skinGeo(new THREE.CapsuleGeometry(0.05, 0.32, 4, 8), bi[`mixamorig${side}Leg`]);
    allMeshes.push(new THREE.SkinnedMesh(llG, pantsM));
    
    // Shoe
    const shG = skinGeo(new THREE.BoxGeometry(0.08, 0.06, 0.16), bi[`mixamorig${side}Foot`]);
    allMeshes.push(new THREE.SkinnedMesh(shG, shoesM));
  }
  
  // Bind all to skeleton
  for (const mesh of allMeshes) {
    mesh.add(root.clone(true)); // need bone hierarchy
    mesh.bind(skeleton.clone());
    scene.add(mesh);
  }
  
  // Actually, all meshes should share ONE skeleton with ONE bone hierarchy
  // Let me rebuild properly
  scene.clear();
  
  const { skeleton: skel2, bones: bones2, root: root2 } = createSkeleton();
  const bi2 = {};
  bones2.forEach((b, i) => bi2[b.name] = i);
  
  scene.add(root2);
  
  // Rebuild meshes with shared skeleton reference
  const meshDefs = [
    ['head', new THREE.SphereGeometry(0.1, 12, 10), skinM, bi2['mixamorigHead']],
    ['hair', new THREE.SphereGeometry(0.105, 10, 6, 0, Math.PI*2, 0, Math.PI*0.55), hairM, bi2['mixamorigHead']],
    ['neck', new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), skinM, bi2['mixamorigNeck']],
  ];
  
  // Arms + hands
  for (const [side] of [['Left'], ['Right']]) {
    meshDefs.push([`upperArm${side}`, new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), shirtM, bi2[`mixamorig${side}Arm`]]);
    meshDefs.push([`foreArm${side}`, new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), skinM, bi2[`mixamorig${side}ForeArm`]]);
    meshDefs.push([`hand${side}`, new THREE.BoxGeometry(0.05, 0.07, 0.03), skinM, bi2[`mixamorig${side}Hand`]]);
  }
  
  // Legs + shoes
  for (const [side] of [['Left'], ['Right']]) {
    meshDefs.push([`upperLeg${side}`, new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), pantsM, bi2[`mixamorig${side}UpLeg`]]);
    meshDefs.push([`lowerLeg${side}`, new THREE.CapsuleGeometry(0.05, 0.32, 4, 8), pantsM, bi2[`mixamorig${side}Leg`]]);
    meshDefs.push([`shoe${side}`, new THREE.BoxGeometry(0.08, 0.06, 0.16), shoesM, bi2[`mixamorig${side}Foot`]]);
  }
  
  // Torso with blended skinning
  const torsoG2 = skinGeoBlend(new THREE.BoxGeometry(0.34, 0.42, 0.18, 1, 4, 1),
    bi2['mixamorigSpine'], bi2['mixamorigSpine2'], 0, 0.21);
  const torsoMesh = new THREE.SkinnedMesh(torsoG2, shirtM);
  torsoMesh.add(root2.clone(false));
  torsoMesh.bind(skel2);
  scene.add(torsoMesh);
  
  for (const [name, geo, material, boneIdx] of meshDefs) {
    const g = skinGeo(geo, boneIdx);
    const m = new THREE.SkinnedMesh(g, material);
    m.name = name;
    // Each SkinnedMesh needs its own bone tree but bound to same skeleton
    // In GLTF, they can share — let's use a single merged approach instead
    m.add(root2.clone(false));
    m.bind(skel2);
    scene.add(m);
  }
  
  return scene;
}

// Export function
async function exportGLB(scene, filename) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(scene, (result) => {
      const buffer = Buffer.from(result);
      fs.writeFileSync(filename, buffer);
      resolve(buffer.byteLength);
    }, reject, { binary: true });
  });
}

// Generate all 50
async function main() {
  console.log('Generating 50 NPC characters...');
  
  for (let i = 0; i < 50; i++) {
    const def = {
      name: names[i],
      skin: skins[i % skins.length],
      shirt: shirts[i % shirts.length],
      pants: pants[i % pants.length],
      shoes: shoes[i % shoes.length],
      hairColor: hairs[i % hairs.length],
    };
    
    try {
      const scene = buildChar(def);
      const filepath = path.join(outDir, `${def.name}.glb`);
      const size = await exportGLB(scene, filepath);
      console.log(`  [${i+1}/50] ${def.name}.glb (${(size/1024).toFixed(1)}KB)`);
    } catch(e) {
      console.error(`  [${i+1}/50] FAILED ${def.name}: ${e.message}`);
    }
  }
  
  console.log('Done!');
}

main();
