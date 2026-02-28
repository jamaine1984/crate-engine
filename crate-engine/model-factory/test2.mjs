import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';

// Sync FileReader polyfill
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      // Use sync approach
      blob.arrayBuffer().then(ab => {
        this.result = ab;
        if (this.onloadend) this.onloadend();
        if (this.onload) this.onload({ target: this });
      });
    }
    addEventListener(evt, fn) { this['on' + evt] = fn; }
  };
}

const scene = new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color:0xff0000})));

const exporter = new GLTFExporter();

// Try parseAsync if available
if (exporter.parseAsync) {
  console.log('Using parseAsync...');
  exporter.parseAsync(scene, { binary: true }).then(result => {
    console.log('Got result:', result.byteLength, 'bytes');
    fs.writeFileSync('test.glb', Buffer.from(result));
    console.log('✅ Done');
  }).catch(e => console.error('❌', e));
} else {
  console.log('No parseAsync, using parse...');
  exporter.parse(scene, (result) => {
    console.log('Got result');
    fs.writeFileSync('test.glb', Buffer.from(result));
  }, (err) => console.error(err), { binary: true });
}
