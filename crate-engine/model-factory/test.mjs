import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(ab => {
        this.result = ab;
        if (this.onload) this.onload({ target: this });
      });
    }
  };
}

const scene = new THREE.Scene();
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xff0000 })
);
scene.add(box);

const exporter = new GLTFExporter();
exporter.parse(scene, (result) => {
  console.log('Result type:', typeof result, result instanceof ArrayBuffer, result.byteLength);
  fs.writeFileSync('test.glb', Buffer.from(result));
  console.log('✅ Wrote test.glb:', fs.statSync('test.glb').size, 'bytes');
}, (err) => {
  console.error('❌ Error:', err);
}, { binary: true });
