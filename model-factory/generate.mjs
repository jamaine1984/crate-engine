import "./polyfill.mjs";
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';


const OUTPUT_DIR = path.join(process.cwd(), 'output');
const MANIFEST = [];

class SeededRandom {
  constructor(seed) { this.seed = seed; }
  next() { this.seed = (this.seed * 16807 + 0) % 2147483647; return (this.seed - 1) / 2147483646; }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  color() { return new THREE.Color().setHSL(this.next(), this.range(0.4, 0.9), this.range(0.3, 0.7)); }
}

// Helper: create positioned mesh
function pmesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.6, metalness: opts.metalness ?? 0.1, ...opts });
}
function metalMat(color) { return mat(color, { roughness: 0.25, metalness: 0.85 }); }
function woodMat(rng) { return mat(new THREE.Color().setHSL(rng.range(0.06, 0.1), rng.range(0.5, 0.8), rng.range(0.25, 0.45))); }
function stoneMat(rng) { return mat(new THREE.Color().setHSL(0, 0, rng.range(0.35, 0.6)), { roughness: 0.9 }); }

// ===== BUILDERS =====
function buildSword(rng) {
  const g = new THREE.Group();
  const bLen = rng.range(1.2, 2.5), bW = rng.range(0.06, 0.15);
  g.add(pmesh(new THREE.BoxGeometry(bW, bLen, bW*0.3), metalMat(new THREE.Color().setHSL(0,0,rng.range(0.7,0.95))), 0, bLen/2+0.15));
  g.add(pmesh(new THREE.BoxGeometry(rng.range(0.25,0.45), 0.06, 0.08), metalMat(new THREE.Color().setHSL(rng.range(0.08,0.12),0.8,0.4)), 0, 0.15));
  g.add(pmesh(new THREE.CylinderGeometry(0.03,0.035,0.25,8), mat(new THREE.Color(0x4a2800))));
  g.add(pmesh(new THREE.SphereGeometry(0.04,8,8), metalMat(new THREE.Color().setHSL(rng.range(0.08,0.12),0.8,0.4)), 0, -0.14));
  return g;
}
function buildAxe(rng) {
  const g = new THREE.Group(), hLen = rng.range(0.8,1.5);
  g.add(pmesh(new THREE.CylinderGeometry(0.025,0.03,hLen,8), woodMat(rng), 0, hLen/2));
  const hw = rng.range(0.2,0.4);
  g.add(pmesh(new THREE.BoxGeometry(hw,rng.range(0.15,0.25),0.04), metalMat(new THREE.Color().setHSL(0,0,rng.range(0.5,0.8))), hw/2-0.02, hLen-0.05));
  return g;
}
function buildShield(rng) {
  const g = new THREE.Group(), s = rng.range(0.4,0.7), t = rng.int(0,2);
  const geo = t===0 ? new THREE.CircleGeometry(s,16) : t===1 ? new THREE.BoxGeometry(s*1.3,s*1.6,0.04) : new THREE.CircleGeometry(s,4);
  g.add(new THREE.Mesh(geo, metalMat(rng.color())));
  g.add(pmesh(new THREE.SphereGeometry(s*0.2,8,8), metalMat(new THREE.Color().setHSL(0.1,0.8,0.5)), 0, 0, 0.03));
  return g;
}
function buildSpear(rng) {
  const g = new THREE.Group(), len = rng.range(2,3.5);
  g.add(pmesh(new THREE.CylinderGeometry(0.02,0.025,len,8), woodMat(rng), 0, len/2));
  g.add(pmesh(new THREE.ConeGeometry(0.04,0.2,6), metalMat(new THREE.Color(0xcccccc)), 0, len+0.1));
  return g;
}
function buildHammer(rng) {
  const g = new THREE.Group(), hLen = rng.range(0.6,1.2), hs = rng.range(0.1,0.2);
  g.add(pmesh(new THREE.CylinderGeometry(0.025,0.03,hLen,8), woodMat(rng), 0, hLen/2));
  g.add(pmesh(new THREE.BoxGeometry(hs*2,hs,hs), metalMat(new THREE.Color().setHSL(0,0,rng.range(0.4,0.7))), 0, hLen));
  return g;
}
function buildBow(rng) {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,-0.6,0), new THREE.Vector3(0.3,0,0), new THREE.Vector3(0,0.6,0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve,20,0.015,8,false), woodMat(rng)));
  const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-0.6,0), new THREE.Vector3(0,0.6,0)]);
  g.add(new THREE.Line(sg, new THREE.LineBasicMaterial({color:0xcccccc})));
  return g;
}
function buildStaff(rng) {
  const g = new THREE.Group(), len = rng.range(1.5,2.5);
  g.add(pmesh(new THREE.CylinderGeometry(0.02,0.03,len,8), woodMat(rng), 0, len/2));
  g.add(pmesh(new THREE.IcosahedronGeometry(rng.range(0.06,0.12),1), mat(rng.color(),{roughness:0.1,metalness:0.3}), 0, len+0.08));
  return g;
}
function buildDagger(rng) {
  const g = new THREE.Group(), bLen = rng.range(0.3,0.6);
  g.add(pmesh(new THREE.BoxGeometry(0.04,bLen,0.015), metalMat(new THREE.Color(0xdddddd)), 0, bLen/2+0.08));
  g.add(pmesh(new THREE.CylinderGeometry(0.025,0.025,0.15,8), mat(new THREE.Color(0x3a1a00))));
  return g;
}
function buildChair(rng) {
  const g = new THREE.Group(), w = rng.range(0.35,0.5), wm = woodMat(rng);
  g.add(pmesh(new THREE.BoxGeometry(w,0.04,w), wm, 0, 0.4));
  for (let x of [-1,1]) for (let z of [-1,1]) g.add(pmesh(new THREE.CylinderGeometry(0.02,0.02,0.4,6), wm, x*w*0.4, 0.2, z*w*0.4));
  g.add(pmesh(new THREE.BoxGeometry(w,rng.range(0.3,0.5),0.03), wm, 0, 0.65, -w*0.4));
  return g;
}
function buildTable(rng) {
  const g = new THREE.Group(), w = rng.range(0.8,1.5), d = rng.range(0.5,1), h = rng.range(0.7,0.9), wm = woodMat(rng);
  g.add(pmesh(new THREE.BoxGeometry(w,0.04,d), wm, 0, h));
  for (let x of [-1,1]) for (let z of [-1,1]) g.add(pmesh(new THREE.CylinderGeometry(0.03,0.03,h,6), wm, x*(w/2-0.05), h/2, z*(d/2-0.05)));
  return g;
}
function buildBookshelf(rng) {
  const g = new THREE.Group(), wm = woodMat(rng), w = rng.range(0.6,1.2), h = rng.range(1.2,2), d = 0.3, shelves = rng.int(3,5);
  for (let x of [-1,1]) g.add(pmesh(new THREE.BoxGeometry(0.03,h,d), wm, x*w/2, h/2));
  for (let i = 0; i <= shelves; i++) g.add(pmesh(new THREE.BoxGeometry(w,0.02,d), wm, 0, (i/shelves)*h));
  for (let i = 1; i <= shelves; i++) { const nb = rng.int(3,8); for (let b = 0; b < nb; b++) { const bh = rng.range(0.1,0.25); g.add(pmesh(new THREE.BoxGeometry(rng.range(0.03,0.06),bh,d*0.7), mat(rng.color()), -w/2+0.06+b*0.07, ((i-1)/shelves)*h+0.02+bh/2)); } }
  return g;
}
function buildBed(rng) {
  const g = new THREE.Group(), wm = woodMat(rng), w = rng.range(0.8,1.2), len = rng.range(1.8,2.2);
  g.add(pmesh(new THREE.BoxGeometry(w,0.1,len), wm, 0, 0.25));
  g.add(pmesh(new THREE.BoxGeometry(w-0.05,0.12,len-0.05), mat(new THREE.Color().setHSL(0,0,0.9)), 0, 0.36));
  g.add(pmesh(new THREE.BoxGeometry(w*0.6,0.06,0.25), mat(new THREE.Color(0xffffff)), 0, 0.44, -len/2+0.2));
  g.add(pmesh(new THREE.BoxGeometry(w,0.5,0.04), wm, 0, 0.5, -len/2));
  for (let x of [-1,1]) for (let z of [-1,1]) g.add(pmesh(new THREE.CylinderGeometry(0.03,0.03,0.25,6), wm, x*(w/2-0.05), 0.125, z*(len/2-0.05)));
  return g;
}
function buildBarrel(rng) {
  const g = new THREE.Group(), h = rng.range(0.6,1), r = rng.range(0.2,0.35);
  g.add(pmesh(new THREE.CylinderGeometry(r*0.85,r*0.85,h,12), woodMat(rng), 0, h/2));
  for (let y of [0.15, h-0.15]) { const band = pmesh(new THREE.TorusGeometry(r*0.86,0.01,8,16), metalMat(new THREE.Color(0x888888)), 0, y); band.rotation.x = Math.PI/2; g.add(band); }
  return g;
}
function buildChest(rng) {
  const g = new THREE.Group(), w = rng.range(0.4,0.7), h = rng.range(0.25,0.4), d = rng.range(0.25,0.4), wm = woodMat(rng);
  g.add(pmesh(new THREE.BoxGeometry(w,h,d), wm, 0, h/2));
  const lid = pmesh(new THREE.CylinderGeometry(d/2,d/2,w,12,1,false,0,Math.PI), wm, 0, h); lid.rotation.z = Math.PI/2; g.add(lid);
  g.add(pmesh(new THREE.BoxGeometry(0.04,0.04,0.02), metalMat(new THREE.Color(0xccaa00)), 0, h*0.7, d/2+0.01));
  return g;
}
function buildTree(rng) {
  const g = new THREE.Group(), trH = rng.range(1,3), trR = rng.range(0.08,0.2);
  g.add(pmesh(new THREE.CylinderGeometry(trR*0.7,trR,trH,8), mat(new THREE.Color().setHSL(0.08,0.6,0.3)), 0, trH/2));
  const tt = rng.int(0,2);
  if (tt===0) g.add(pmesh(new THREE.SphereGeometry(rng.range(0.5,1.5),8,8), mat(new THREE.Color().setHSL(rng.range(0.2,0.4),rng.range(0.5,0.8),rng.range(0.2,0.45))), 0, trH+0.3));
  else if (tt===1) { const layers = rng.int(2,4); for (let i=0;i<layers;i++) g.add(pmesh(new THREE.ConeGeometry(rng.range(0.4,0.9)*(1-i*0.2),rng.range(0.5,1),8), mat(new THREE.Color().setHSL(rng.range(0.25,0.38),0.7,0.25)), 0, trH+i*0.5)); }
  else { for (let i=0;i<3;i++) g.add(pmesh(new THREE.SphereGeometry(rng.range(0.3,0.8),6,6), mat(new THREE.Color().setHSL(rng.range(0.2,0.4),0.6,0.3)), rng.range(-0.3,0.3), trH+rng.range(0,0.5), rng.range(-0.3,0.3))); }
  return g;
}
function buildRock(rng) {
  const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(rng.range(0.2,0.8), rng.int(0,2));
  const pos = geo.attributes.position;
  for (let i=0;i<pos.count;i++) { pos.setX(i,pos.getX(i)*rng.range(0.7,1.3)); pos.setY(i,pos.getY(i)*rng.range(0.5,1)); pos.setZ(i,pos.getZ(i)*rng.range(0.7,1.3)); }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, stoneMat(rng)));
  return g;
}
function buildBush(rng) {
  const g = new THREE.Group(), n = rng.int(2,5);
  for (let i=0;i<n;i++) g.add(pmesh(new THREE.SphereGeometry(rng.range(0.15,0.4),6,6), mat(new THREE.Color().setHSL(rng.range(0.22,0.38),rng.range(0.5,0.8),rng.range(0.2,0.4))), rng.range(-0.3,0.3), rng.range(0.1,0.3), rng.range(-0.3,0.3)));
  return g;
}
function buildFlower(rng) {
  const g = new THREE.Group(), sh = rng.range(0.2,0.5);
  g.add(pmesh(new THREE.CylinderGeometry(0.01,0.012,sh,6), mat(new THREE.Color(0x228833)), 0, sh/2));
  const n = rng.int(4,8), pc = rng.color();
  for (let i=0;i<n;i++) { const a = (i/n)*Math.PI*2; g.add(pmesh(new THREE.SphereGeometry(rng.range(0.03,0.06),6,6), mat(pc), Math.cos(a)*0.04, sh, Math.sin(a)*0.04)); }
  g.add(pmesh(new THREE.SphereGeometry(0.025,6,6), mat(new THREE.Color(0xffcc00)), 0, sh));
  return g;
}
function buildMushroom(rng) {
  const g = new THREE.Group(), sh = rng.range(0.1,0.3);
  g.add(pmesh(new THREE.CylinderGeometry(0.03,0.04,sh,8), mat(new THREE.Color(0xeeddcc)), 0, sh/2));
  g.add(pmesh(new THREE.SphereGeometry(rng.range(0.06,0.15),8,8,0,Math.PI*2,0,Math.PI/2), mat(new THREE.Color().setHSL(rng.pick([0,0.05,0.1,0.3]),rng.range(0.6,0.9),rng.range(0.3,0.6))), 0, sh));
  return g;
}
function buildHouse(rng) {
  const g = new THREE.Group(), w = rng.range(2,4), h = rng.range(2,3.5), d = rng.range(2,3.5);
  const wc = new THREE.Color().setHSL(rng.range(0.05,0.15),rng.range(0.3,0.6),rng.range(0.5,0.8));
  g.add(pmesh(new THREE.BoxGeometry(w,h,d), mat(wc), 0, h/2));
  const rc = new THREE.Color().setHSL(rng.pick([0,0.05,0.55,0.6]),rng.range(0.5,0.8),rng.range(0.3,0.5));
  const roof = pmesh(new THREE.ConeGeometry(Math.max(w,d)*0.75,rng.range(1,2),4), mat(rc), 0, h+0.5); roof.rotation.y = Math.PI/4; g.add(roof);
  g.add(pmesh(new THREE.BoxGeometry(0.5,1,0.05), mat(new THREE.Color(0x5a3a1a)), 0, 0.5, d/2+0.02));
  for (let x of [-1,1]) g.add(pmesh(new THREE.BoxGeometry(0.3,0.3,0.05), mat(new THREE.Color(0x88ccff),{roughness:0.1}), x*w*0.3, h*0.6, d/2+0.02));
  return g;
}
function buildTower(rng) {
  const g = new THREE.Group(), h = rng.range(4,8), r = rng.range(0.6,1.2);
  g.add(pmesh(new THREE.CylinderGeometry(r*0.9,r,h,12), stoneMat(rng), 0, h/2));
  g.add(pmesh(new THREE.ConeGeometry(r*1.2,rng.range(1.5,2.5),12), mat(new THREE.Color().setHSL(0,0.7,0.35)), 0, h+0.8));
  const nb = 8; for (let i=0;i<nb;i++) { const a = (i/nb)*Math.PI*2; g.add(pmesh(new THREE.BoxGeometry(0.2,0.3,0.15), stoneMat(rng), Math.cos(a)*r, h+0.15, Math.sin(a)*r)); }
  return g;
}
function buildWall(rng) {
  const g = new THREE.Group(), len = rng.range(3,8), h = rng.range(2,4), thick = rng.range(0.3,0.6);
  g.add(pmesh(new THREE.BoxGeometry(len,h,thick), stoneMat(rng), 0, h/2));
  const nb = Math.floor(len/0.5); for (let i=0;i<nb;i+=2) g.add(pmesh(new THREE.BoxGeometry(0.3,0.4,thick+0.05), stoneMat(rng), -len/2+0.25+i*0.5, h+0.2));
  return g;
}
function buildBridge(rng) {
  const g = new THREE.Group(), len = rng.range(3,6), w = rng.range(1,2), wm = woodMat(rng);
  g.add(pmesh(new THREE.BoxGeometry(len,0.1,w), wm, 0, 1));
  for (let z of [-1,1]) g.add(pmesh(new THREE.BoxGeometry(len,0.5,0.05), wm, 0, 1.3, z*w/2));
  for (let x of [-1,0,1]) g.add(pmesh(new THREE.CylinderGeometry(0.08,0.1,1.5,8), stoneMat(rng), x*len*0.35, 0.5));
  return g;
}
function buildPotion(rng) {
  const g = new THREE.Group(), bR = rng.range(0.04,0.08);
  g.add(pmesh(new THREE.SphereGeometry(bR,8,8), mat(rng.color(),{roughness:0.1}), 0, bR));
  g.add(pmesh(new THREE.CylinderGeometry(bR*0.3,bR*0.5,bR,8), mat(new THREE.Color(0xdddddd),{roughness:0.1}), 0, bR*2.3));
  g.add(pmesh(new THREE.CylinderGeometry(bR*0.35,bR*0.3,0.03,8), mat(new THREE.Color(0x8B4513)), 0, bR*2.8));
  return g;
}
function buildCoin(rng) { return pmesh(new THREE.CylinderGeometry(rng.range(0.03,0.06),rng.range(0.03,0.06),0.005,16), metalMat(new THREE.Color().setHSL(rng.pick([0.12,0.08,0,0.55]),0.8,0.5))); }
function buildGem(rng) { return pmesh(new THREE.OctahedronGeometry(rng.range(0.04,0.1),0), mat(rng.color(),{roughness:0.05,metalness:0.15})); }
function buildTorch(rng) {
  const g = new THREE.Group();
  g.add(pmesh(new THREE.CylinderGeometry(0.02,0.025,0.5,8), woodMat(rng), 0, 0.25));
  g.add(pmesh(new THREE.ConeGeometry(0.04,0.1,8), mat(new THREE.Color(0xff6600),{emissive:new THREE.Color(0xff3300),emissiveIntensity:0.8}), 0, 0.55));
  return g;
}
function buildLantern(rng) {
  const g = new THREE.Group(), h = rng.range(0.15,0.25);
  g.add(pmesh(new THREE.BoxGeometry(0.08,h,0.08), metalMat(new THREE.Color(0x222222)), 0, h/2));
  g.add(pmesh(new THREE.BoxGeometry(0.06,h*0.6,0.06), mat(new THREE.Color(0xffcc44),{roughness:0.1,emissive:new THREE.Color(0xffaa00),emissiveIntensity:0.5}), 0, h/2));
  const hook = pmesh(new THREE.TorusGeometry(0.02,0.005,6,8,Math.PI), metalMat(new THREE.Color(0x222222)), 0, h+0.02); g.add(hook);
  return g;
}
function buildCrate(rng) {
  const g = new THREE.Group(), s = rng.range(0.3,0.6), wm = woodMat(rng);
  g.add(pmesh(new THREE.BoxGeometry(s,s,s), wm, 0, s/2));
  return g;
}
function buildKey(rng) {
  const g = new THREE.Group(), m = metalMat(new THREE.Color().setHSL(rng.pick([0.1,0,0.55]),0.7,0.5));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.03,0.005,8,12), m));
  g.add(pmesh(new THREE.CylinderGeometry(0.004,0.004,0.08,6), m, 0, -0.07));
  for (let i=0;i<rng.int(2,4);i++) g.add(pmesh(new THREE.BoxGeometry(0.015,0.008,0.004), m, 0.01, -0.09-i*0.012));
  return g;
}
function buildScroll(rng) {
  const g = new THREE.Group(), m = mat(new THREE.Color().setHSL(0.1,0.5,rng.range(0.7,0.9)));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.2,12), m));
  for (let y of [-1,1]) g.add(pmesh(new THREE.CylinderGeometry(0.025,0.025,0.01,12), woodMat(rng), 0, y*0.105));
  return g;
}
function buildApple(rng) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.04,0.07),8,8), mat(new THREE.Color().setHSL(rng.pick([0,0.05,0.3]),0.8,0.45))));
  g.add(pmesh(new THREE.CylinderGeometry(0.003,0.003,0.03,6), mat(new THREE.Color(0x4a2800)), 0, 0.06));
  return g;
}
function buildBread(rng) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1,8,8), mat(new THREE.Color().setHSL(0.08,0.7,0.55))); m.scale.set(1.5,0.7,1); return m; }
function buildCup(rng) { return new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.03,0),new THREE.Vector2(0.04,0.02),new THREE.Vector2(0.04,0.08),new THREE.Vector2(0.035,0.1)],12), mat(rng.color())); }
function buildCart(rng) {
  const g = new THREE.Group(), wm = woodMat(rng);
  g.add(pmesh(new THREE.BoxGeometry(1.5,0.06,0.8), wm, 0, 0.4));
  for (let z of [-1,1]) g.add(pmesh(new THREE.BoxGeometry(1.5,0.25,0.04), wm, 0, 0.55, z*0.4));
  for (let x of [-1,1]) for (let z of [-1,1]) { const w = pmesh(new THREE.TorusGeometry(0.15,0.03,8,12), woodMat(rng), x*0.6, 0.15, z*0.45); w.rotation.y = Math.PI/2; g.add(w); }
  return g;
}
function buildBoat(rng) {
  const g = new THREE.Group(), wm = woodMat(rng), len = rng.range(2,4);
  g.add(pmesh(new THREE.BoxGeometry(len,0.4,0.8), wm, 0, 0.2));
  g.add(pmesh(new THREE.CylinderGeometry(0.03,0.04,2,8), wm, 0, 1.2));
  g.add(pmesh(new THREE.PlaneGeometry(0.8,1.2), mat(new THREE.Color(0xeeeeee),{side:THREE.DoubleSide}), 0.3, 1.2));
  return g;
}
function buildHelmet(rng) {
  const g = new THREE.Group(), m = metalMat(new THREE.Color().setHSL(rng.range(0,0.12),rng.range(0.3,0.8),rng.range(0.3,0.6)));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15,12,12,0,Math.PI*2,0,Math.PI*0.6), m));
  g.add(pmesh(new THREE.BoxGeometry(0.2,0.08,0.05), m, 0, -0.05, 0.12));
  return g;
}
function buildArmor(rng) {
  const g = new THREE.Group(), m = metalMat(new THREE.Color().setHSL(rng.range(0,0.12),rng.range(0.3,0.7),rng.range(0.35,0.6)));
  g.add(pmesh(new THREE.BoxGeometry(0.5,0.6,0.25), m, 0, 0.3));
  for (let x of [-1,1]) g.add(pmesh(new THREE.SphereGeometry(0.1,8,8), m, x*0.3, 0.55));
  return g;
}
function buildPillar(rng) {
  const g = new THREE.Group(), h = rng.range(2,5), r = rng.range(0.1,0.25), sm = stoneMat(rng);
  g.add(pmesh(new THREE.CylinderGeometry(r,r*1.1,h,12), sm, 0, h/2));
  g.add(pmesh(new THREE.CylinderGeometry(r*1.3,r*1.4,0.15,12), sm, 0, 0.075));
  g.add(pmesh(new THREE.CylinderGeometry(r*1.4,r*1.1,0.15,12), sm, 0, h-0.075));
  return g;
}
function buildStairs(rng) {
  const g = new THREE.Group(), steps = rng.int(5,12), sH = 0.2, sD = 0.3, w = rng.range(0.8,1.5), sm = stoneMat(rng);
  for (let i=0;i<steps;i++) g.add(pmesh(new THREE.BoxGeometry(w,sH,sD), sm, 0, sH*(i+0.5), -sD*i));
  return g;
}
function buildFence(rng) {
  const g = new THREE.Group(), posts = rng.int(4,8), sp = rng.range(0.5,0.8), h = rng.range(0.6,1.2), wm = woodMat(rng);
  for (let i=0;i<posts;i++) g.add(pmesh(new THREE.CylinderGeometry(0.02,0.025,h,6), wm, i*sp, h/2));
  for (let y of [h*0.33,h*0.66]) g.add(pmesh(new THREE.BoxGeometry((posts-1)*sp,0.03,0.02), wm, (posts-1)*sp/2, y));
  return g;
}
function buildCampfire(rng) {
  const g = new THREE.Group();
  for (let i=0;i<4;i++) { const l = pmesh(new THREE.CylinderGeometry(0.03,0.035,0.4,6), woodMat(rng), 0, 0.04); l.rotation.z = Math.PI/2; l.rotation.y = (i/4)*Math.PI; g.add(l); }
  for (let i=0;i<8;i++) { const a = (i/8)*Math.PI*2; g.add(pmesh(new THREE.SphereGeometry(rng.range(0.03,0.05),6,6), stoneMat(rng), Math.cos(a)*0.2, 0.03, Math.sin(a)*0.2)); }
  g.add(pmesh(new THREE.ConeGeometry(0.08,0.25,8), mat(new THREE.Color(0xff4400),{emissive:new THREE.Color(0xff2200),emissiveIntensity:1}), 0, 0.15));
  return g;
}
function buildWell(rng) {
  const g = new THREE.Group(), sm = stoneMat(rng), wm = woodMat(rng);
  g.add(pmesh(new THREE.CylinderGeometry(0.5,0.55,0.6,12), sm, 0, 0.3));
  for (let x of [-1,1]) g.add(pmesh(new THREE.CylinderGeometry(0.03,0.035,1.2,6), wm, x*0.35, 0.9));
  const cb = pmesh(new THREE.CylinderGeometry(0.025,0.025,0.8,6), wm, 0, 1.5); cb.rotation.z = Math.PI/2; g.add(cb);
  g.add(pmesh(new THREE.CylinderGeometry(0.06,0.05,0.1,8), wm, 0, 0.8));
  return g;
}
function buildCrystal(rng) {
  const g = new THREE.Group(), n = rng.int(2,5), bc = rng.color();
  for (let i=0;i<n;i++) { const h = rng.range(0.2,0.6); g.add(pmesh(new THREE.ConeGeometry(rng.range(0.03,0.08),h,rng.pick([4,5,6])), mat(bc.clone().offsetHSL(rng.range(-0.05,0.05),0,rng.range(-0.1,0.1)),{roughness:0.05,metalness:0.2}), rng.range(-0.1,0.1), h/2, rng.range(-0.1,0.1))); }
  return g;
}
function buildFlag(rng) {
  const g = new THREE.Group(), h = rng.range(1.5,3), fw = rng.range(0.4,0.8), fh = rng.range(0.3,0.5);
  g.add(pmesh(new THREE.CylinderGeometry(0.02,0.025,h,8), woodMat(rng), 0, h/2));
  g.add(pmesh(new THREE.PlaneGeometry(fw,fh), mat(rng.color(),{side:THREE.DoubleSide}), fw/2+0.02, h-fh/2-0.05));
  return g;
}
function buildGravestone(rng) {
  const g = new THREE.Group(), sm = stoneMat(rng), h = rng.range(0.5,1), w = rng.range(0.3,0.5);
  if (rng.int(0,1)===0) { g.add(pmesh(new THREE.BoxGeometry(w,h,0.08), sm, 0, h/2)); const top = pmesh(new THREE.SphereGeometry(w/2,8,8,0,Math.PI*2,0,Math.PI/2), sm, 0, h); top.scale.set(1,0.5,0.15); g.add(top); }
  else { g.add(pmesh(new THREE.BoxGeometry(0.06,h,0.06), sm, 0, h/2)); g.add(pmesh(new THREE.BoxGeometry(w*0.7,0.06,0.06), sm, 0, h*0.7)); }
  return g;
}
function buildSign(rng) { const g = new THREE.Group(), wm = woodMat(rng), h = rng.range(1,1.8); g.add(pmesh(new THREE.CylinderGeometry(0.025,0.03,h,6), wm, 0, h/2)); g.add(pmesh(new THREE.BoxGeometry(rng.range(0.4,0.8),0.25,0.03), wm, 0, h-0.1)); return g; }
function buildLadder(rng) { const g = new THREE.Group(), wm = woodMat(rng), rungs = rng.int(4,8), h = rungs*0.25, w = rng.range(0.3,0.5); for (let x of [-1,1]) g.add(pmesh(new THREE.CylinderGeometry(0.015,0.015,h,6), wm, x*w/2, h/2)); for (let i=0;i<rungs;i++) { const r = pmesh(new THREE.CylinderGeometry(0.01,0.01,w,6), wm, 0, 0.15+i*0.25); r.rotation.z = Math.PI/2; g.add(r); } return g; }
function buildAnvil(rng) { const g = new THREE.Group(), m = metalMat(new THREE.Color(0x444444)); g.add(pmesh(new THREE.BoxGeometry(0.3,0.15,0.2), m, 0, 0.075)); g.add(pmesh(new THREE.BoxGeometry(0.2,0.1,0.15), m, 0, 0.2)); g.add(pmesh(new THREE.BoxGeometry(0.35,0.05,0.18), m, 0, 0.275)); const horn = pmesh(new THREE.ConeGeometry(0.06,0.15,8), m, 0.22, 0.27); horn.rotation.z = -Math.PI/2; g.add(horn); return g; }
function buildCauldron(rng) {
  const g = new THREE.Group(), m = metalMat(new THREE.Color(0x333333));
  g.add(pmesh(new THREE.SphereGeometry(0.2,12,12,0,Math.PI*2,0,Math.PI*0.6), m, 0, 0.12));
  for (let i=0;i<3;i++) { const a = (i/3)*Math.PI*2; g.add(pmesh(new THREE.CylinderGeometry(0.02,0.02,0.1,6), m, Math.cos(a)*0.12, 0.05, Math.sin(a)*0.12)); }
  const liq = pmesh(new THREE.CircleGeometry(0.17,12), mat(new THREE.Color(0x22ff44),{emissive:new THREE.Color(0x00aa22),emissiveIntensity:0.3}), 0, 0.22); liq.rotation.x = -Math.PI/2; g.add(liq);
  return g;
}

const CATEGORIES = {
  'weapons/swords': { fn: buildSword, count: 800 },
  'weapons/axes': { fn: buildAxe, count: 500 },
  'weapons/shields': { fn: buildShield, count: 500 },
  'weapons/spears': { fn: buildSpear, count: 400 },
  'weapons/hammers': { fn: buildHammer, count: 400 },
  'weapons/bows': { fn: buildBow, count: 400 },
  'weapons/staffs': { fn: buildStaff, count: 400 },
  'weapons/daggers': { fn: buildDagger, count: 400 },
  'furniture/chairs': { fn: buildChair, count: 500 },
  'furniture/tables': { fn: buildTable, count: 500 },
  'furniture/bookshelves': { fn: buildBookshelf, count: 300 },
  'furniture/beds': { fn: buildBed, count: 300 },
  'furniture/barrels': { fn: buildBarrel, count: 400 },
  'furniture/chests': { fn: buildChest, count: 500 },
  'nature/trees': { fn: buildTree, count: 1000 },
  'nature/rocks': { fn: buildRock, count: 800 },
  'nature/bushes': { fn: buildBush, count: 600 },
  'nature/flowers': { fn: buildFlower, count: 500 },
  'nature/mushrooms': { fn: buildMushroom, count: 400 },
  'buildings/houses': { fn: buildHouse, count: 600 },
  'buildings/towers': { fn: buildTower, count: 400 },
  'buildings/walls': { fn: buildWall, count: 300 },
  'buildings/bridges': { fn: buildBridge, count: 300 },
  'items/potions': { fn: buildPotion, count: 600 },
  'items/coins': { fn: buildCoin, count: 300 },
  'items/gems': { fn: buildGem, count: 400 },
  'items/torches': { fn: buildTorch, count: 300 },
  'items/lanterns': { fn: buildLantern, count: 300 },
  'items/crates': { fn: buildCrate, count: 400 },
  'items/keys': { fn: buildKey, count: 300 },
  'items/scrolls': { fn: buildScroll, count: 300 },
  'food/apples': { fn: buildApple, count: 200 },
  'food/bread': { fn: buildBread, count: 200 },
  'food/cups': { fn: buildCup, count: 200 },
  'vehicles/carts': { fn: buildCart, count: 300 },
  'vehicles/boats': { fn: buildBoat, count: 300 },
  'armor/helmets': { fn: buildHelmet, count: 500 },
  'armor/chestpieces': { fn: buildArmor, count: 500 },
  'dungeon/pillars': { fn: buildPillar, count: 300 },
  'dungeon/stairs': { fn: buildStairs, count: 300 },
  'dungeon/crystals': { fn: buildCrystal, count: 400 },
  'props/fences': { fn: buildFence, count: 300 },
  'props/campfires': { fn: buildCampfire, count: 300 },
  'props/wells': { fn: buildWell, count: 200 },
  'props/flags': { fn: buildFlag, count: 300 },
  'props/gravestones': { fn: buildGravestone, count: 300 },
  'props/signs': { fn: buildSign, count: 300 },
  'props/ladders': { fn: buildLadder, count: 200 },
  'props/anvils': { fn: buildAnvil, count: 200 },
  'props/cauldrons': { fn: buildCauldron, count: 200 },
};

const ADJECTIVES = ['ancient','rustic','elegant','weathered','ornate','simple','dark','golden','iron','enchanted','crude','refined','heavy','light','sturdy','sleek','twisted','curved','straight','runed'];
const TOTAL = Object.values(CATEGORIES).reduce((s,c)=>s+c.count,0);
console.log(`\n🏭 CRATE ENGINE MODEL FACTORY\n📦 Target: ${TOTAL.toLocaleString()} models across ${Object.keys(CATEGORIES).length} categories\n`);

const exporter = new GLTFExporter();
function exportGLB(scene) {
  return new Promise((resolve, reject) => {
    exporter.parseAsync(scene, { binary: true }).then(ab => resolve(Buffer.from(ab))).catch(reject);
  });
}

async function generateAll() {
  const startTime = Date.now();
  let totalGenerated = 0, totalBytes = 0;
  for (const cat of Object.keys(CATEGORIES)) fs.mkdirSync(path.join(OUTPUT_DIR, cat), { recursive: true });
  
  for (const [category, config] of Object.entries(CATEGORIES)) {
    const catStart = Date.now();
    let catBytes = 0;
    for (let i = 0; i < config.count; i++) {
      const seed = totalGenerated * 7919 + 42;
      const rng = new SeededRandom(seed);
      const scene = new THREE.Scene();
      // No lights in export — just geometry + materials
      const model = config.fn(rng);
      if (model instanceof THREE.Group || model instanceof THREE.Mesh) scene.add(model);
      
      const adj = rng.pick(ADJECTIVES);
      const baseName = category.split('/')[1];
      const singular = baseName.endsWith('es') && !baseName.endsWith('ves') ? baseName.slice(0,-2) : baseName.endsWith('s') ? baseName.slice(0,-1) : baseName;
      const modelName = `${adj}-${singular}-${String(i+1).padStart(4,'0')}`;
      
      try {
        const glb = await exportGLB(scene);
        fs.writeFileSync(path.join(OUTPUT_DIR, category, `${modelName}.glb`), glb);
        catBytes += glb.length;
        totalBytes += glb.length;
        MANIFEST.push({ id: `${category}/${modelName}`, name: modelName.replace(/-/g,' ').replace(/\b\w/g,l=>l.toUpperCase()), category, file: `${category}/${modelName}.glb`, size: glb.length });
        totalGenerated++;
        if (totalGenerated % 500 === 0) {
          const elapsed = ((Date.now()-startTime)/1000).toFixed(1);
          const rate = (totalGenerated/((Date.now()-startTime)/1000)).toFixed(0);
          console.log(`  ⚡ ${totalGenerated.toLocaleString()}/${TOTAL.toLocaleString()} (${rate}/sec) — ${(totalBytes/1024/1024).toFixed(1)}MB — ${elapsed}s`);
        }
      } catch(e) { console.error(`  ❌ ${modelName}: ${e.message}`); }
    }
    console.log(`✅ ${category}: ${config.count} models (${(catBytes/1024/1024).toFixed(1)}MB) in ${((Date.now()-catStart)/1000).toFixed(1)}s`);
  }
  
  fs.writeFileSync(path.join(OUTPUT_DIR,'manifest.json'), JSON.stringify({ generated: new Date().toISOString(), total: totalGenerated, totalSizeMB: (totalBytes/1024/1024).toFixed(1), categories: Object.keys(CATEGORIES).length, models: MANIFEST }, null, 2));
  console.log(`\n🎉 DONE! ${totalGenerated.toLocaleString()} GLB models — ${(totalBytes/1024/1024).toFixed(1)}MB — ${((Date.now()-startTime)/1000).toFixed(1)}s`);
}

generateAll().catch(console.error);
