// NPC Character Generator — builds 50 unique humanoid GLBs with Mixamo-compatible skeleton
// Run via: open gen_npcs.html in browser, it auto-downloads all 50

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Mixamo bone hierarchy (rest pose = arms down, facing +Z)
function createSkeleton() {
  const bones = [];
  const boneMap = {};
  
  function addBone(name, parent, pos) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(pos[0], pos[1], pos[2]);
    if (parent) parent.add(bone);
    bones.push(bone);
    boneMap[name] = bone;
    return bone;
  }
  
  // Build hierarchy matching Mixamo naming (what the Soldier uses)
  const hips = addBone('mixamorigHips', null, [0, 0.95, 0]);
  const spine = addBone('mixamorigSpine', hips, [0, 0.1, 0]);
  const spine1 = addBone('mixamorigSpine1', spine, [0, 0.12, 0]);
  const spine2 = addBone('mixamorigSpine2', spine1, [0, 0.12, 0]);
  const neck = addBone('mixamorigNeck', spine2, [0, 0.15, 0]);
  const head = addBone('mixamorigHead', neck, [0, 0.08, 0]);
  const headTop = addBone('mixamorigHeadTop_End', head, [0, 0.22, 0]);
  
  // Left arm
  const lShoulder = addBone('mixamorigLeftShoulder', spine2, [0.05, 0.12, 0]);
  const lArm = addBone('mixamorigLeftArm', lShoulder, [0.12, 0, 0]);
  const lForeArm = addBone('mixamorigLeftForeArm', lArm, [0.25, 0, 0]);
  const lHand = addBone('mixamorigLeftHand', lForeArm, [0.22, 0, 0]);
  
  // Right arm
  const rShoulder = addBone('mixamorigRightShoulder', spine2, [-0.05, 0.12, 0]);
  const rArm = addBone('mixamorigRightArm', rShoulder, [-0.12, 0, 0]);
  const rForeArm = addBone('mixamorigRightForeArm', rArm, [-0.25, 0, 0]);
  const rHand = addBone('mixamorigRightHand', rForeArm, [-0.22, 0, 0]);
  
  // Left leg
  const lUpLeg = addBone('mixamorigLeftUpLeg', hips, [0.1, -0.05, 0]);
  const lLeg = addBone('mixamorigLeftLeg', lUpLeg, [0, -0.42, 0]);
  const lFoot = addBone('mixamorigLeftFoot', lLeg, [0, -0.42, 0]);
  const lToe = addBone('mixamorigLeftToeBase', lFoot, [0, 0, 0.12]);
  
  // Right leg
  const rUpLeg = addBone('mixamorigRightUpLeg', hips, [-0.1, -0.05, 0]);
  const rLeg = addBone('mixamorigRightLeg', rUpLeg, [0, -0.42, 0]);
  const rFoot = addBone('mixamorigRightFoot', rLeg, [0, -0.42, 0]);
  const rToe = addBone('mixamorigRightToeBase', rFoot, [0, 0, 0.12]);
  
  const skeleton = new THREE.Skeleton(bones);
  return { skeleton, bones, boneMap, root: hips };
}

// Create a body part mesh skinned to specific bones
function createBodyPart(geo, material, boneIndices, boneWeights) {
  const skinIndices = [];
  const skinWeights = [];
  const count = geo.attributes.position.count;
  
  for (let i = 0; i < count; i++) {
    const idx = boneIndices.length === 1 ? 0 : Math.min(i, boneIndices.length - 1);
    if (typeof boneIndices[0] === 'number') {
      skinIndices.push(boneIndices[0], boneIndices.length > 1 ? boneIndices[1] : 0, 0, 0);
      skinWeights.push(boneWeights[0], boneWeights.length > 1 ? boneWeights[1] : 0, 0, 0);
    } else {
      // Per-vertex assignment based on Y position
      const y = geo.attributes.position.getY(i);
      skinIndices.push(...boneIndices[0]);
      skinWeights.push(...boneWeights[0]);
    }
  }
  
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  
  return new THREE.SkinnedMesh(geo, material);
}

// Build a complete humanoid character
function buildCharacter(def) {
  const { skeleton, bones, boneMap, root } = createSkeleton();
  const group = new THREE.Group();
  group.add(root);
  
  // Bone indices in the skeleton array
  const bi = {};
  bones.forEach((b, i) => bi[b.name] = i);
  
  const skinMat = new THREE.MeshStandardMaterial({ color: def.skin, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: def.shirt, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: def.pants, roughness: 0.7 });
  const shoesMat = new THREE.MeshStandardMaterial({ color: def.shoes, roughness: 0.9 });
  const hairMat = new THREE.MeshStandardMaterial({ color: def.hairColor, roughness: 0.6 });
  
  const meshes = [];
  
  // HEAD — sphere at head bone
  const headGeo = new THREE.SphereGeometry(0.1, 12, 10);
  const headMesh = createBodyPart(headGeo, skinMat, [bi['mixamorigHead']], [1]);
  headMesh.name = 'Head';
  meshes.push(headMesh);
  
  // HAIR — slightly larger sphere on top
  const hairGeo = new THREE.SphereGeometry(0.105, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const hairMesh = createBodyPart(hairGeo, hairMat, [bi['mixamorigHead']], [1]);
  hairMesh.name = 'Hair';
  meshes.push(hairMesh);
  
  // TORSO — box from hips to spine2
  const torsoGeo = new THREE.BoxGeometry(0.32, 0.45, 0.18, 1, 4, 1);
  // Skin torso vertices to spine chain based on Y
  const torsoSI = [], torsoSW = [];
  for (let i = 0; i < torsoGeo.attributes.position.count; i++) {
    const y = torsoGeo.attributes.position.getY(i);
    if (y > 0.15) {
      torsoSI.push(bi['mixamorigSpine2'], bi['mixamorigSpine1'], 0, 0);
      torsoSW.push(0.7, 0.3, 0, 0);
    } else if (y > 0) {
      torsoSI.push(bi['mixamorigSpine1'], bi['mixamorigSpine'], 0, 0);
      torsoSW.push(0.6, 0.4, 0, 0);
    } else {
      torsoSI.push(bi['mixamorigSpine'], bi['mixamorigHips'], 0, 0);
      torsoSW.push(0.5, 0.5, 0, 0);
    }
  }
  torsoGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(torsoSI, 4));
  torsoGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(torsoSW, 4));
  const torsoMesh = new THREE.SkinnedMesh(torsoGeo, shirtMat);
  torsoMesh.name = 'Torso';
  meshes.push(torsoMesh);
  
  // UPPER ARMS
  const armGeo = new THREE.CapsuleGeometry(0.04, 0.2, 4, 8);
  armGeo.rotateZ(Math.PI / 2); // horizontal for T-pose... but we want arms down
  // Actually in rest pose arms are at sides, so capsule should be vertical
  const armGeoV = new THREE.CapsuleGeometry(0.04, 0.2, 4, 8);
  
  for (const side of ['Left', 'Right']) {
    const upperArmMesh = createBodyPart(armGeoV.clone(), shirtMat, 
      [bi[`mixamorig${side}Arm`]], [1]);
    upperArmMesh.name = `UpperArm${side}`;
    meshes.push(upperArmMesh);
    
    const foreArmMesh = createBodyPart(armGeoV.clone(), skinMat,
      [bi[`mixamorig${side}ForeArm`]], [1]);
    foreArmMesh.name = `ForeArm${side}`;
    meshes.push(foreArmMesh);
    
    // Hand
    const handGeo = new THREE.BoxGeometry(0.06, 0.08, 0.03);
    const handMesh = createBodyPart(handGeo, skinMat,
      [bi[`mixamorig${side}Hand`]], [1]);
    handMesh.name = `Hand${side}`;
    meshes.push(handMesh);
  }
  
  // UPPER LEGS (pants)
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.35, 4, 8);
  for (const side of ['Left', 'Right']) {
    const upperLegMesh = createBodyPart(legGeo.clone(), pantsMat,
      [bi[`mixamorig${side}UpLeg`]], [1]);
    upperLegMesh.name = `UpperLeg${side}`;
    meshes.push(upperLegMesh);
    
    const lowerLegMesh = createBodyPart(legGeo.clone(), pantsMat,
      [bi[`mixamorig${side}Leg`]], [1]);
    lowerLegMesh.name = `LowerLeg${side}`;
    meshes.push(lowerLegMesh);
    
    // Shoe
    const shoeGeo = new THREE.BoxGeometry(0.08, 0.06, 0.16);
    const shoeMesh = createBodyPart(shoeGeo, shoesMat,
      [bi[`mixamorig${side}Foot`]], [1]);
    shoeMesh.name = `Shoe${side}`;
    meshes.push(shoeMesh);
  }
  
  // Bind all meshes to skeleton
  for (const mesh of meshes) {
    mesh.add(root.clone(false)); // Each skinned mesh needs bone ref
    mesh.bind(skeleton);
    group.add(mesh);
  }
  
  return { group, skeleton, root };
}

export { buildCharacter, createSkeleton, NPC_DEFS };

// Skin tones x outfit combos for 50 unique characters
const skins = [0xFFDBAC, 0xF1C27D, 0xD4A373, 0xC68642, 0x8D5524, 0x6B3A2A, 0x4A2912, 0xE0AC69, 0xBE8C63, 0xA0522D];
const shirtColors = [0x2C3E50, 0xE74C3C, 0x3498DB, 0x27AE60, 0xF39C12, 0x8E44AD, 0x1ABC9C, 0xD35400, 0x2980B9, 0xC0392B,
                0x16A085, 0xF1C40F, 0x7F8C8D, 0x2ECC71, 0x9B59B6, 0xE67E22, 0x34495E, 0x1F618D, 0x6C3483, 0xA93226];
const pantsColors = [0x2C3E50, 0x1A1A2E, 0x4A4A4A, 0x2F4F4F, 0x191970, 0x3B3B3B, 0x556B2F, 0x8B4513, 0x696969, 0x483D8B];
const shoesColors = [0x1A1A1A, 0x3D2B1F, 0x4A4A4A, 0x8B4513, 0x2F4F4F];
const hairCols = [0x1A1A1A, 0x3B2219, 0x6B3A2A, 0xB8860B, 0xDAA520, 0xA0522D, 0x808080, 0xD2691E, 0x2F1B14, 0x4A0404];

const NPC_DEFS_FULL = [];
for (let i = 0; i < 50; i++) {
  NPC_DEFS_FULL.push({
    name: `npc_person_${String(i+1).padStart(2,'0')}`,
    skin: skins[i % skins.length],
    shirt: shirtColors[i % shirtColors.length],
    pants: pantsColors[i % pantsColors.length],
    shoes: shoesColors[i % shoesColors.length],
    hairColor: hairCols[i % hairCols.length],
  });
}

export { NPC_DEFS_FULL };
