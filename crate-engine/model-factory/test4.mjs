import * as THREE from 'three';

// Polyfill FileReader
globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(ab => {
      this.result = ab;
      if (this.onloadend) this.onloadend();
      if (this.onload) this.onload({ target: this });
    });
  }
  addEventListener(evt, fn) { this['on' + evt] = fn; }
};

import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';

const exporter = new GLTFExporter();

async function test() {
  const scene = new THREE.Scene();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1,2,0.03), new THREE.MeshStandardMaterial({color:0xcccccc, roughness:0.25, metalness:0.85})));
  scene.add(g);
  
  const result = await exporter.parseAsync(scene, { binary: true });
  fs.writeFileSync('test_sword.glb', Buffer.from(result));
  console.log('✅', fs.statSync('test_sword.glb').size, 'bytes');
  
  // Now test 100 exports
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(Math.random()+0.1, Math.random()+0.1, Math.random()+0.1), new THREE.MeshStandardMaterial({color: Math.random()*0xffffff})));
    const r = await exporter.parseAsync(s, { binary: true });
    fs.writeFileSync(`output/test-${i}.glb`, Buffer.from(r));
  }
  console.log(`✅ 100 models in ${((Date.now()-start)/1000).toFixed(1)}s`);
}

fs.mkdirSync('output', { recursive: true });
test().catch(e => console.error('❌', e));
