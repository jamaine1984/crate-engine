import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';

const exporter = new GLTFExporter();

async function test() {
  // Test sword
  const scene = new THREE.Scene();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1,2,0.03), new THREE.MeshStandardMaterial({color:0xcccccc, roughness:0.25, metalness:0.85})));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3,0.06,0.08), new THREE.MeshStandardMaterial({color:0x886633, roughness:0.25, metalness:0.85})));
  scene.add(g);
  
  console.log('Exporting...');
  const result = await exporter.parseAsync(scene, { binary: true });
  console.log('Result:', result.byteLength);
  fs.writeFileSync('test_sword.glb', Buffer.from(result));
  console.log('✅ test_sword.glb:', fs.statSync('test_sword.glb').size, 'bytes');
}

test().catch(e => console.error('❌', e));
