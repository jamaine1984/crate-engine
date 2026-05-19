const STRIPE_LINKS = {
  pro: 'https://buy.stripe.com/3cI9AV4Sv6TY15Q1aMffy00',
  premium: 'https://buy.stripe.com/6oUfZjfx96TY29U4mYffy01',
};

let context = {
  parseAndExecute: () => {},
  logOutput: () => {},
  serializeScene: () => '',
  loadGLBModel: () => {},
  getGLBModels: () => ({}),
  showToast: () => {},
  getModelDB: () => null,
  invalidateAssetCatalog: () => {},
  getTHREE: () => null,
  getTerrainMesh: () => null,
  getSceneObjects: () => [],
  isProUser: () => true,
  setProStatus: () => {},
};

export function setProjectToolsContext(nextContext = {}) {
  context = { ...context, ...nextContext };
  window.marketplaceUploadModel = marketplaceUploadModel;
  window.marketplaceUploadAndSell = marketplaceUploadAndSell;
  window.loadMarketplaceItem = loadMarketplaceItem;
}

export function showLoadModal(saves) {
  const old = document.getElementById('load-modal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'load-modal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.7)',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0d0d0d',
    border: '1px solid #252525',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    fontFamily: 'JetBrains Mono, monospace',
    color: '#e0e0e0',
    maxHeight: '60vh',
    overflow: 'auto',
  });

  let html = '<h3 style="color:#60a5fa;margin:0 0 16px;text-align:center">📂 Saved Scenes</h3>';
  saves.forEach((save, index) => {
    const cmds = String(save.data || '').split('|').length;
    html += '<div class="save-item" data-idx="' + index + '" style="padding:12px;background:#111;border:1px solid #252525;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s">' +
      '<div style="font-weight:700;color:#fff;font-size:0.85rem">' + save.name + '</div>' +
      '<div style="color:#555;font-size:0.7rem">' + cmds + ' commands</div>' +
      '</div>';
  });
  html += '<div style="display:flex;gap:8px;margin-top:12px">' +
    '<button id="load-close" style="flex:1;padding:8px;background:#222;color:#888;border:1px solid #333;border-radius:8px;cursor:pointer;font-family:JetBrains Mono,monospace">Close</button>' +
    '<button id="load-clear" style="padding:8px 12px;background:#222;color:#ef4444;border:1px solid #ef4444;border-radius:8px;cursor:pointer;font-family:JetBrains Mono,monospace;font-size:0.75rem">🗑 Clear All</button>' +
    '</div>';

  card.innerHTML = html;
  modal.appendChild(card);
  document.body.appendChild(modal);

  card.querySelectorAll('.save-item').forEach((item) => {
    item.addEventListener('mouseenter', () => {
      item.style.borderColor = '#60a5fa';
    });
    item.addEventListener('mouseleave', () => {
      item.style.borderColor = '#252525';
    });
    item.addEventListener('click', () => {
      const idx = parseInt(item.getAttribute('data-idx'), 10);
      const save = saves[idx];
      const commands = String(save.data || '').split('|');
      context.parseAndExecute('clear');
      context.logOutput('info', '📂 Loading "' + save.name + '" (' + commands.length + ' commands)...');
      commands.forEach((cmd, commandIndex) => {
        setTimeout(() => {
          context.parseAndExecute(cmd);
        }, 200 + commandIndex * 150);
      });
      modal.remove();
    });
  });

  document.getElementById('load-close').addEventListener('click', () => {
    modal.remove();
  });
  document.getElementById('load-clear').addEventListener('click', () => {
    localStorage.removeItem('crate_saves');
    modal.remove();
    context.logOutput('ok', '🗑 All saves cleared');
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}

export function openCreatorMarketplace() {
  document.getElementById('marketplace-modal')?.remove();

  const listings = JSON.parse(localStorage.getItem('crate-marketplace-listings') || '[]');
  let listingsHTML = '';
  if (listings.length === 0) {
    listingsHTML = '<div style="text-align:center;padding:40px;color:#888">No listings yet. Upload a model to get started!</div>';
  } else {
    listingsHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:12px">';
    for (const item of listings) {
      const date = new Date(item.created).toLocaleDateString();
      const safeName = String(item.name || '').replace(/'/g, '');
      listingsHTML += '<div style="background:#1a1a2e;border:1px solid #333;border-radius:12px;padding:16px;text-align:center;cursor:pointer" onclick="loadMarketplaceItem(\'' + item.id + '\',\'' + safeName + '\')">' +
        '<div style="font-size:32px;margin-bottom:8px">📦</div>' +
        '<div style="color:#fff;font-weight:600;font-size:13px">' + item.name + '</div>' +
        '<div style="color:#888;font-size:11px;margin-top:4px">by ' + item.creator + '</div>' +
        '<div style="color:#4ade80;font-size:11px;margin-top:4px">' + (item.price > 0 ? '$' + item.price : 'Free') + '</div>' +
        '<div style="color:#555;font-size:10px;margin-top:4px">' + date + '</div>' +
        '</div>';
    }
    listingsHTML += '</div>';
  }

  const modal = document.createElement('div');
  modal.id = 'marketplace-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif" onclick="if(event.target===this)this.remove()">
      <div style="background:#111;border:1px solid #333;border-radius:16px;width:90%;max-width:800px;max-height:85vh;overflow-y:auto;color:#fff">
        <div style="padding:24px 24px 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <h2 style="margin:0;font-size:22px">🏪 Creator Marketplace</h2>
            <p style="margin:4px 0 0;color:#888;font-size:13px">Upload, sell, and share 3D models</p>
          </div>
          <button onclick="this.closest('#marketplace-modal').remove()" style="background:none;border:none;color:#888;font-size:24px;cursor:pointer">✕</button>
        </div>
        <div style="padding:16px 24px;display:flex;gap:10px;flex-wrap:wrap">
          <button onclick="marketplaceUploadModel()" style="padding:10px 20px;border:none;border-radius:8px;background:#4ade80;color:#000;font-weight:600;cursor:pointer;font-size:14px">📤 Upload GLB Model</button>
          <button onclick="marketplaceUploadAndSell()" style="padding:10px 20px;border:none;border-radius:8px;background:#f59e0b;color:#000;font-weight:600;cursor:pointer;font-size:14px">💰 Upload & Sell</button>
          <button onclick="window.open('https://crateshipgames.com/marketplace','_blank')" style="padding:10px 20px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer;font-size:14px">🌐 Browse Online</button>
        </div>
        <div style="padding:0 24px 24px">
          <h3 style="margin:16px 0 8px;font-size:16px;color:#aaa">📋 Your Listings (${listings.length})</h3>
          ${listingsHTML}
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

export function marketplaceUploadModel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf';
  input.onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const name = prompt('Name your model:', file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]/g, ' ')) || 'Uploaded Model';
    const category = prompt('Category (characters, weapons, buildings, vehicles, furniture, nature, scifi, food):', 'buildings') || 'buildings';
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf]);
    const modelId = 'user_upload_' + Date.now();
    await context.getModelDB()?.save(modelId, name, category.toLowerCase(), blob);
    context.invalidateAssetCatalog();
    context.showToast('📚 "' + name + '" saved to your library in "' + category + '"!');
    openCreatorMarketplace();
  };
  input.click();
}

export function marketplaceUploadAndSell() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb,.gltf';
  input.onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const name = prompt('Name your model:', file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_-]/g, ' ')) || 'Uploaded Model';
    const priceStr = prompt('Price (0 for free):', '0');
    const price = parseFloat(priceStr) || 0;
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf]);
    const listingId = 'listing_' + Date.now();

    await context.getModelDB()?.save(listingId, name, 'premium', blob);
    context.invalidateAssetCatalog();

    const listings = JSON.parse(localStorage.getItem('crate-marketplace-listings') || '[]');
    listings.push({
      id: listingId,
      name,
      creator: localStorage.getItem('crate-username') || 'Anonymous',
      price,
      format: 'glb',
      created: new Date().toISOString(),
      downloads: 0,
      fileSize: file.size,
    });
    localStorage.setItem('crate-marketplace-listings', JSON.stringify(listings));

    context.showToast('💰 "' + name + '" listed on marketplace for ' + (price > 0 ? '$' + price : 'FREE') + '!');
    openCreatorMarketplace();
  };
  input.click();
}

export function loadMarketplaceItem(id, name) {
  context.getModelDB()?.get(id).then((record) => {
    if (!record || !record.blob) {
      context.showToast('❌ Model data not found');
      return;
    }
    const url = URL.createObjectURL(record.blob);
    context.loadGLBModel(url, name, null, true);
    document.getElementById('marketplace-modal')?.remove();
    context.showToast('✓ Loading: ' + name);
  });
}

export async function exportForUnity() {
  return exportGLTF('unity');
}

export async function exportForUnreal() {
  return exportGLTF('unreal');
}

async function exportGLTF(target) {
  context.logOutput('info', '📦 Preparing ' + target.charAt(0).toUpperCase() + target.slice(1) + ' export...');

  try {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const THREE = context.getTHREE?.();
    const exporter = new GLTFExporter();
    const exportScene = new THREE.Scene();
    const terrainMesh = context.getTerrainMesh?.();
    if (terrainMesh) exportScene.add(terrainMesh.clone());

    for (const obj of context.getSceneObjects?.() || []) {
      if (!obj || !obj.visible) continue;
      try {
        exportScene.add(obj.clone());
      } catch {}
    }

    const lightMarker = new THREE.Object3D();
    lightMarker.name = 'Sun_DirectionalLight';
    lightMarker.position.set(30, 40, 20);
    exportScene.add(lightMarker);

    exporter.parse(
      exportScene,
      (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = target === 'unity' ? 'crate-scene-unity.glb' : 'crate-scene-unreal.glb';
        a.click();
        URL.revokeObjectURL(url);

        const readme = target === 'unity'
          ? '# Crate Engine -> Unity Import Guide\n\n' +
            '1. Drag `crate-scene-unity.glb` into your Unity Assets folder\n' +
            '2. Unity auto-imports GLB/GLTF files (2020.3+)\n' +
            '3. Drag the imported prefab into your scene\n' +
            '4. Add lights (Sun_DirectionalLight node marks sun position)\n' +
            '5. Materials may need Standard->URP/HDRP conversion\n' +
            '6. Scale: 1 unit = 1 meter (matches Unity default)\n\n' +
            '## Tips\n' +
            '- Enable "Read/Write" on mesh import settings for runtime modification\n' +
            '- Set "Animation Type" to Humanoid for characters\n' +
            '- Textures import alongside the GLB automatically\n'
          : '# Crate Engine -> Unreal Import Guide\n\n' +
            '1. File -> Import into Level (or drag to Content Browser)\n' +
            '2. Select `crate-scene-unreal.glb`\n' +
            '3. Choose "Scene" import for full hierarchy\n' +
            '4. Unreal imports GLTF/GLB natively (UE5)\n' +
            '5. Add directional light at Sun_DirectionalLight position\n' +
            '6. Scale: 1 unit = 1 meter = 100 Unreal units (auto-scaled)\n\n' +
            '## Tips\n' +
            '- Use Datasmith for better material conversion\n' +
            '- Check "Combine Meshes" for performance\n' +
            '- Nanite works with imported static meshes\n';

        const readmeBlob = new Blob([readme], { type: 'text/markdown' });
        const readmeUrl = URL.createObjectURL(readmeBlob);
        const readmeLink = document.createElement('a');
        readmeLink.href = readmeUrl;
        readmeLink.download = target === 'unity' ? 'UNITY-IMPORT-GUIDE.md' : 'UNREAL-IMPORT-GUIDE.md';
        setTimeout(() => {
          readmeLink.click();
          URL.revokeObjectURL(readmeUrl);
        }, 500);

        context.logOutput('ok', '📦 Exported for ' + target.charAt(0).toUpperCase() + target.slice(1) + '! GLB + import guide downloaded.');
      },
      (error) => {
        context.logOutput('error', '❌ Export failed: ' + error.message);
      },
      {
        binary: true,
        maxTextureSize: 2048,
        includeCustomExtensions: true,
      },
    );
  } catch (err) {
    context.logOutput('error', '❌ Export failed: ' + err.message);
  }
}

export function exportAsHTML() {
  const data = context.serializeScene?.();
  if (!data) {
    context.logOutput('warn', '⚠ Nothing to export - build something first!');
    return;
  }

  const commands = data.split('|');
  const cmdStr = JSON.stringify(commands);
  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>Crate Engine Scene</title>\n' +
    '<style>body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style>\n' +
    '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"}}<\/script>\n' +
    '</head>\n<body>\n<canvas id="viewport"></canvas>\n' +
    '<div style="position:fixed;bottom:10px;left:10px;color:#555;font-family:monospace;font-size:11px">Built with <a href="https://crateshipgames.com" style="color:#ff6b35">Crate Engine</a></div>\n' +
    '<script type="module">\n' +
    'import * as THREE from "three";\nimport {OrbitControls} from "three/addons/controls/OrbitControls.js";\n' +
    'const canvas=document.getElementById("viewport");\n' +
    'const renderer=new THREE.WebGLRenderer({canvas,antialias:true});\n' +
    'renderer.setSize(window.innerWidth,window.innerHeight);\n' +
    'renderer.shadowMap.enabled=true;\n' +
    'const scene=new THREE.Scene();\n' +
    'scene.background=new THREE.Color(0x1a1a2e);\n' +
    'const camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,0.1,500);\n' +
    'camera.position.set(15,12,15);\n' +
    'const controls=new OrbitControls(camera,canvas);\n' +
    'controls.enableDamping=true;\n' +
    'scene.add(new THREE.AmbientLight(0x404050,2));\n' +
    'const sun=new THREE.DirectionalLight(0xfff5e0,3);\n' +
    'sun.position.set(30,40,20);sun.castShadow=true;\n' +
    'scene.add(sun);\n' +
    'const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x2d5a27,roughness:0.9}));\n' +
    'ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);\n' +
    'function makeMat(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.7,metalness:0.1})}\n' +
    'function addCube(x,z){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),makeMat(Math.random()*0xffffff));m.position.set(x||Math.random()*10-5,0.5,z||Math.random()*10-5);m.castShadow=true;scene.add(m);}\n' +
    'function addSphere(x,z){const m=new THREE.Mesh(new THREE.SphereGeometry(0.5,16,16),makeMat(Math.random()*0xffffff));m.position.set(x||Math.random()*10-5,0.5,z||Math.random()*10-5);m.castShadow=true;scene.add(m);}\n' +
    'function addTree(x,z){const g=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,1.5),makeMat(0x8B4513));trunk.position.y=0.75;const leaves=new THREE.Mesh(new THREE.SphereGeometry(0.8,8,8),makeMat(0x228B22));leaves.position.y=2;g.add(trunk,leaves);g.position.set(x||(Math.random()-0.5)*20,0,z||(Math.random()-0.5)*20);g.castShadow=true;scene.add(g);}\n' +
    'function addRock(x,z){const m=new THREE.Mesh(new THREE.DodecahedronGeometry(0.5+Math.random()*0.5),makeMat(0x888888));m.position.set(x||(Math.random()-0.5)*15,0.3,z||(Math.random()-0.5)*15);m.castShadow=true;scene.add(m);}\n' +
    'const cmds=' + cmdStr + ';\n' +
    'cmds.forEach(function(c){\n' +
    '  const l=c.toLowerCase();\n' +
    '  const n=parseInt((l.match(/(\\d+)/)||[0,1])[1]);\n' +
    '  if(l.includes("cube"))for(let i=0;i<n;i++)addCube();\n' +
    '  if(l.includes("sphere"))for(let i=0;i<n;i++)addSphere();\n' +
    '  if(l.includes("tree"))for(let i=0;i<n;i++)addTree();\n' +
    '  if(l.includes("rock"))for(let i=0;i<n;i++)addRock();\n' +
    '  if(l.includes("rain")){const rg=new THREE.BufferGeometry();const pos=new Float32Array(3000);for(let i=0;i<3000;i++){pos[i*3]=(Math.random()-0.5)*50;pos[i*3+1]=Math.random()*20;pos[i*3+2]=(Math.random()-0.5)*50;}rg.setAttribute("position",new THREE.BufferAttribute(pos,3));scene.add(new THREE.Points(rg,new THREE.PointsMaterial({color:0x8888ff,size:0.05})));}\n' +
    '  if(l.includes("night")){scene.background=new THREE.Color(0x050515);sun.intensity=0.08;}\n' +
    '  if(l.includes("sunset")){scene.background=new THREE.Color(0xff8844);sun.intensity=0.6;}\n' +
    '  if(l.includes("fog"))scene.fog=new THREE.FogExp2(0x888899,0.02);\n' +
    '});\n' +
    'function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}\n' +
    'animate();\n' +
    'window.addEventListener("resize",()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});\n' +
    '<\/script>\n</body>\n</html>';

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'crate-scene.html';
  link.click();
  URL.revokeObjectURL(url);
  context.logOutput('ok', '📦 Exported! Open crate-scene.html in any browser.');
}

function getProjectSnapshot() {
  const raw = context.serializeScene?.();
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return null;
    parsed.objects = Array.isArray(parsed.objects) ? parsed.objects : [];
    parsed.commands = Array.isArray(parsed.commands) ? parsed.commands : [];
    parsed.userScripts = Array.isArray(parsed.userScripts) ? parsed.userScripts : [];
    return parsed;
  } catch {
    return {
      format: 'crate-engine-project',
      version: 3,
      savedAt: new Date().toISOString(),
      commands: String(raw).split('|').filter(Boolean),
      objects: [],
      userScripts: [],
      weather: null,
      time: null,
    };
  }
}

function getAssetBaseUrl() {
  if (typeof window !== 'undefined' && typeof window._crateAssetBaseUrl === 'function') {
    const value = window._crateAssetBaseUrl();
    if (value) return value;
  }
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="crate-asset-base"]')?.content;
    if (meta) return meta;
  }
  return 'https://crateship-games-assets.pages.dev';
}

function slugifyName(value) {
  return String(value || 'crate-playable-game')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'crate-playable-game';
}

function countProjectComponents(objects = []) {
  const byType = {};
  let total = 0;
  objects.forEach((obj) => {
    const components = obj?.components || {};
    Object.keys(components).forEach((key) => {
      total += 1;
      byType[key] = (byType[key] || 0) + 1;
    });
  });
  return { total, byType };
}

function createPlayableReadme(manifest) {
  return [
    '# ' + manifest.title,
    '',
    'This package was exported from CrateShip Games.',
    '',
    '- Open index.html in a browser to play.',
    '- Keep internet access enabled if the package references the shared CrateShip asset host.',
    '- Object count: ' + manifest.objectCount,
    '- Component count: ' + manifest.componentCount,
    '- Asset host: ' + manifest.assetBaseUrl,
    '',
    'The same project data is embedded inside index.html and also available as game.crate.',
  ].join('\n');
}

function createPlayableHtml(pkg) {
  const embedded = JSON.stringify(pkg).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pkg.manifest.title}</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#05070a;color:#edf2f7;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}
#viewport{position:fixed;inset:0;display:block}
#hud{position:fixed;left:16px;top:16px;z-index:5;min-width:240px;max-width:340px;background:rgba(5,7,10,.82);border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:12px 14px;backdrop-filter:blur(10px);font-size:13px;line-height:1.45}
#hud strong{color:#86efac}
#dialogue{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:6;width:min(680px,calc(100vw - 32px));background:rgba(5,7,10,.88);border:1px solid rgba(134,239,172,.45);border-radius:8px;padding:12px 14px;display:none}
#loading{position:fixed;right:16px;top:16px;z-index:5;background:rgba(5,7,10,.78);border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:10px 12px;color:#cbd5e1;font-size:12px}
.muted{color:#94a3b8}
</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"}}<\/script>
</head>
<body>
<canvas id="viewport"></canvas>
<div id="hud"></div>
<div id="dialogue"></div>
<div id="loading">Loading package...</div>
<script>window.__CRATE_PLAYABLE_PACKAGE__=${embedded};<\/script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const pkg = window.__CRATE_PLAYABLE_PACKAGE__;
const project = pkg.project || {};
const assetBase = String(pkg.manifest.assetBaseUrl || '').replace(/\\/$/, '');
const objects = Array.isArray(project.objects) ? project.objects : [];
const hud = document.getElementById('hud');
const dialogue = document.getElementById('dialogue');
const loading = document.getElementById('loading');
const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101820);
scene.fog = new THREE.FogExp2(0x101820, 0.012);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
camera.position.set(12, 11, 16);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xeff6ff, 0x1f2937, 2.1));
const sun = new THREE.DirectionalLight(0xfff5df, 3.2);
sun.position.set(30, 42, 18);
sun.castShadow = true;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x243426, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');
const records = [];
const keys = {};
const state = { health: 100, score: 0, xp: 0, inventory: [], equipment: {}, message: '', loaded: 0, failed: 0 };
const player = new THREE.Mesh(
  new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.35, 1.1, 4, 8) : new THREE.BoxGeometry(0.7, 1.7, 0.7),
  new THREE.MeshStandardMaterial({ color: 0x86efac, emissive: 0x12351f, emissiveIntensity: 0.35 })
);
player.position.set(0, 1, 0);
scene.add(player);

function vec3(value, fallback) {
  return Array.isArray(value) ? new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0) : fallback.clone();
}
function resolveAsset(path, file) {
  const ref = String(path || file || '');
  if (!ref) return '';
  if (/^https?:/i.test(ref)) return ref;
  if (ref.startsWith('/')) return assetBase + ref;
  return assetBase + '/models/' + ref.replace(/^models\\//, '');
}
function componentColor(components) {
  if (components.npc) return 0x60a5fa;
  if (components.merchant) return 0xfbbf24;
  if (components.enemySpawn || components.waveController) return 0xef4444;
  if (components.equipmentItem || components.pickup) return 0x86efac;
  if (components.missionStep || components.missionReward || components.missionGate) return 0xc084fc;
  return 0x94a3b8;
}
function addPlaceholder(group, snap) {
  const components = snap.components || {};
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: componentColor(components), roughness: 0.72 })
  );
  marker.position.y = 0.5;
  marker.castShadow = true;
  marker.receiveShadow = true;
  group.add(marker);
}
function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  if (max > 0 && max > 8) model.scale.multiplyScalar(8 / max);
}
function addObject(snap, index) {
  const group = new THREE.Group();
  group.name = snap.name || 'Object ' + (index + 1);
  group.position.copy(vec3(snap.position, new THREE.Vector3()));
  if (Array.isArray(snap.rotation)) group.rotation.set(Number(snap.rotation[0]) || 0, Number(snap.rotation[1]) || 0, Number(snap.rotation[2]) || 0);
  if (Array.isArray(snap.scale)) group.scale.set(Number(snap.scale[0]) || 1, Number(snap.scale[1]) || Number(snap.scale[0]) || 1, Number(snap.scale[2]) || Number(snap.scale[0]) || 1);
  const components = snap.components || {};
  const record = { id: snap.id || String(index), name: group.name, group, components, removed: false, talked: false, sold: 0 };
  records.push(record);
  scene.add(group);
  const assetUrl = resolveAsset(snap.assetPath, snap.assetFile);
  if (assetUrl) {
    loader.load(assetUrl, (gltf) => {
      const model = gltf.scene || gltf.scenes?.[0];
      if (!model) { addPlaceholder(group, snap); return; }
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      fitModel(model);
      group.add(model);
      state.loaded += 1;
      updateLoading();
    }, undefined, () => {
      state.failed += 1;
      addPlaceholder(group, snap);
      updateLoading();
    });
  } else {
    addPlaceholder(group, snap);
  }
}
function updateLoading() {
  loading.textContent = 'Package: ' + records.length + ' objects, ' + state.loaded + ' assets loaded, ' + state.failed + ' placeholders';
}
function nearby(filter, radius) {
  let best = null;
  let bestDistance = radius || 3;
  records.forEach((record) => {
    if (record.removed || !filter(record)) return;
    const d = player.position.distanceTo(record.group.position);
    if (d < bestDistance) {
      best = record;
      bestDistance = d;
    }
  });
  return best;
}
function grantItem(item) {
  const entry = item || {};
  const name = entry.name || entry.item || 'Item';
  state.inventory.push(name);
  if (entry.slot) state.equipment[entry.slot] = name;
  if (entry.score) state.score += Number(entry.score) || 0;
  if (entry.xp) state.xp += Number(entry.xp) || 0;
}
function showMessage(speaker, text) {
  state.message = (speaker || 'Game') + ': ' + (text || '');
  dialogue.style.display = 'block';
  dialogue.innerHTML = '<strong>' + escapeHtml(speaker || 'Game') + '</strong><div>' + escapeHtml(text || '') + '</div>';
  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => { dialogue.style.display = 'none'; }, 5000);
}
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
}
function interactNpc() {
  const npc = nearby((record) => record.components.npc, 4);
  if (!npc) return false;
  const cfg = npc.components.npc || {};
  npc.talked = true;
  showMessage(cfg.name || npc.name || 'NPC', cfg.dialogue || 'Hello.');
  if (!npc.rewardClaimed && (cfg.rewardItem || cfg.rewardScore || cfg.rewardXp)) {
    grantItem({ name: cfg.rewardItem || 'NPC reward', slot: cfg.rewardSlot || '', power: cfg.rewardPower || 0, score: cfg.rewardScore || 0, xp: cfg.rewardXp || 0 });
    npc.rewardClaimed = true;
  }
  return true;
}
function interactMerchant() {
  const merchant = nearby((record) => record.components.merchant, 4);
  if (!merchant) return false;
  const cfg = merchant.components.merchant || {};
  const price = Number(cfg.price) || 0;
  const stock = Math.max(0, Number(cfg.stock) || 1);
  if (merchant.sold >= stock) {
    showMessage(cfg.name || 'Merchant', 'Sold out.');
    return true;
  }
  if (state.score < price) {
    showMessage(cfg.name || 'Merchant', 'Need ' + price + ' score for ' + (cfg.item || 'item') + '.');
    return true;
  }
  state.score -= price;
  merchant.sold += 1;
  grantItem({ name: cfg.item || 'Merchant item', slot: cfg.slot || '', power: cfg.power || 0, xp: cfg.xp || 0 });
  showMessage(cfg.name || 'Merchant', 'Purchased ' + (cfg.item || 'Merchant item') + '.');
  return true;
}
function attackEnemy() {
  const enemy = nearby((record) => record.components.enemySpawn || record.components.waveController, 5);
  if (!enemy) return false;
  enemy.removed = true;
  scene.remove(enemy.group);
  state.score += 10;
  showMessage('Combat', 'Enemy cleared: ' + enemy.name);
  return true;
}
function updatePickups() {
  records.forEach((record) => {
    if (record.removed) return;
    const pickup = record.components.pickup || record.components.equipmentItem;
    if (!pickup) return;
    const radius = Number(pickup.radius) || 2.5;
    if (player.position.distanceTo(record.group.position) < radius) {
      grantItem({ name: pickup.item || record.name, slot: pickup.slot || '', power: pickup.power || 0, score: pickup.score || 0, xp: pickup.xp || 0 });
      record.removed = true;
      scene.remove(record.group);
    }
  });
}
function updatePlayer(dt) {
  const speed = 7 * dt;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  if (keys.KeyW || keys.ArrowUp) player.position.addScaledVector(forward, speed);
  if (keys.KeyS || keys.ArrowDown) player.position.addScaledVector(forward, -speed);
  if (keys.KeyA || keys.ArrowLeft) player.position.addScaledVector(right, -speed);
  if (keys.KeyD || keys.ArrowRight) player.position.addScaledVector(right, speed);
  controls.target.lerp(player.position, 0.08);
}
function renderHud() {
  const npc = nearby((record) => record.components.npc, 4);
  const merchant = nearby((record) => record.components.merchant, 4);
  hud.innerHTML = '<strong>' + escapeHtml(pkg.manifest.title) + '</strong>' +
    '<div class="muted">' + records.length + ' objects | ' + pkg.manifest.componentCount + ' components</div>' +
    '<div>Score: ' + Math.round(state.score) + ' | XP: ' + Math.round(state.xp) + '</div>' +
    '<div>Inventory: ' + (state.inventory.slice(-4).map(escapeHtml).join(', ') || '-') + '</div>' +
    '<div>Equipment: ' + (Object.keys(state.equipment).map((slot) => slot + '=' + state.equipment[slot]).join(', ') || '-') + '</div>' +
    '<div class="muted">Move WASD. T talk. E buy/interact. F attack.</div>' +
    (npc ? '<div>Talk: ' + escapeHtml(npc.components.npc.name || npc.name) + '</div>' : '') +
    (merchant ? '<div>Merchant: ' + escapeHtml(merchant.components.merchant.item || merchant.name) + '</div>' : '');
}
objects.slice(0, 650).forEach(addObject);
updateLoading();
window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  const key = event.key.toLowerCase();
  if (key === 't') interactNpc();
  if (key === 'e') interactMerchant() || interactNpc();
  if (key === 'f' || key === ' ') attackEnemy();
});
window.addEventListener('keyup', (event) => { keys[event.code] = false; });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePlayer(dt);
  updatePickups();
  controls.update();
  renderHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
<\/script>
</body>
</html>`;
}

export function exportPlayablePackage(options = {}) {
  const project = getProjectSnapshot();
  if (!project || (!project.objects.length && !project.commands.length)) {
    context.logOutput('warn', 'Nothing to export - build something first.');
    return null;
  }
  const componentCounts = countProjectComponents(project.objects);
  const title = options.title || project.name || 'Crate Playable Game';
  const slug = slugifyName(title);
  const manifest = {
    format: 'crate-playable-package',
    version: 1,
    title,
    slug,
    exportedAt: new Date().toISOString(),
    engine: 'CrateShip Games Web Engine',
    assetBaseUrl: options.assetBaseUrl || getAssetBaseUrl(),
    objectCount: project.objects.length,
    commandCount: project.commands.length,
    scriptCount: project.userScripts.length,
    componentCount: componentCounts.total,
    componentTypes: componentCounts.byType,
  };
  const pkg = { manifest, project };
  const html = createPlayableHtml(pkg);
  const crate = JSON.stringify(project, null, 2);
  const readme = createPlayableReadme(manifest);
  const summary = {
    format: manifest.format,
    version: manifest.version,
    title: manifest.title,
    filename: slug + '-playable.html',
    assetBaseUrl: manifest.assetBaseUrl,
    objectCount: manifest.objectCount,
    commandCount: manifest.commandCount,
    scriptCount: manifest.scriptCount,
    componentCount: manifest.componentCount,
    componentTypes: manifest.componentTypes,
    files: ['index.html', 'game.crate', 'README.md'],
    htmlBytes: new Blob([html]).size,
    crateBytes: new Blob([crate]).size,
    readmeBytes: new Blob([readme]).size,
    hasEmbeddedPackage: html.includes('__CRATE_PLAYABLE_PACKAGE__'),
    hasRuntimeControls: html.includes('Move WASD. T talk. E buy/interact. F attack.'),
  };
  if (typeof window !== 'undefined') {
    window._lastPlayableExport = { ...summary, manifest, html, crate, readme };
  }
  if (options.download !== false) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = summary.filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  context.logOutput('ok', 'Playable package ready: ' + summary.filename + ' (' + summary.objectCount + ' objects, ' + summary.componentCount + ' components).');
  return summary;
}

export function showProWelcome() {
  const banner = document.createElement('div');
  Object.assign(banner.style, {
    position: 'fixed',
    top: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'linear-gradient(135deg, #ff6b35, #f7c948)',
    color: '#000',
    padding: '12px 24px',
    borderRadius: '12px',
    fontFamily: 'JetBrains Mono, monospace',
    fontWeight: '700',
    fontSize: '0.9rem',
    zIndex: '10001',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(255,107,53,0.4)',
  });
  banner.innerHTML = '⚡ Pro Unlocked! Export, premium models, and more are now yours.';
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.style.transition = 'opacity 0.5s';
    banner.style.opacity = '0';
    setTimeout(() => {
      banner.remove();
    }, 500);
  }, 5000);
}

export function showUpgradeModal(tier = 'pro') {
  const old = document.getElementById('upgrade-modal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'upgrade-modal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.8)',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0d0d0d',
    border: '2px solid ' + (tier === 'premium' ? '#f7c948' : '#ff6b35'),
    borderRadius: '20px',
    padding: '32px',
    maxWidth: '420px',
    width: '90%',
    textAlign: 'center',
    fontFamily: 'JetBrains Mono, monospace',
    color: '#e0e0e0',
    boxShadow: '0 0 40px rgba(255,107,53,0.2)',
  });

  card.innerHTML =
    '<div style="font-size:2.5rem;margin-bottom:8px">⚡</div>' +
    '<h2 style="color:' + (tier === 'premium' ? '#f7c948' : '#ff6b35') + ';margin:0 0 8px;font-size:1.3rem">' + (tier === 'premium' ? 'Go Premium' : 'Go Pro') + '</h2>' +
    '<p style="color:#888;font-size:0.85rem;margin-bottom:20px">Unlock the full power of Crate Engine</p>' +
    '<div style="background:#111;border-radius:12px;padding:16px;margin-bottom:20px;text-align:left;font-size:0.8rem;color:#ccc;line-height:2">' +
    '✅ Export games (no watermark)<br>' +
    '✅ 500+ premium 3D models<br>' +
    '✅ Unlimited AI prompts<br>' +
    '✅ Publish to crateshipgames.com<br>' +
    '✅ Priority support<br>' +
    '✅ Early access to new features' +
    '</div>' +
    '<div style="font-size:2rem;font-weight:900;color:#fff;margin-bottom:4px">' + (tier === 'premium' ? '$14.99' : '$4.99') + '<span style="font-size:0.9rem;color:#888">/month</span></div>' +
    '<p style="color:#555;font-size:0.7rem;margin-bottom:16px">Cancel anytime · No contracts</p>' +
    '<div style="display:flex;gap:8px;flex-direction:column">' +
    '<button id="upgrade-stripe-btn" style="padding:14px;background:linear-gradient(135deg,#ff6b35,#f7c948);color:#000;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;font-family:JetBrains Mono,monospace;transition:transform 0.2s">' + (tier === 'premium' ? '💎 Subscribe Premium' : '⚡ Subscribe Pro') + '</button>' +
    '<button id="upgrade-close-btn" style="padding:10px;background:transparent;color:#555;border:1px solid #252525;border-radius:10px;cursor:pointer;font-family:JetBrains Mono,monospace;font-size:0.8rem">Maybe Later</button>' +
    '</div>';

  modal.appendChild(card);
  document.body.appendChild(modal);

  document.getElementById('upgrade-stripe-btn').addEventListener('click', function() {
    const link = STRIPE_LINKS[tier] || STRIPE_LINKS.pro;
    if (link) {
      window.open(link, '_blank');
      return;
    }
    this.textContent = '🚀 Coming Soon!';
    this.style.background = '#333';
    this.style.color = '#888';
    setTimeout(() => {
      modal.remove();
    }, 2000);
  });

  document.getElementById('upgrade-close-btn').addEventListener('click', () => {
    modal.remove();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
}
