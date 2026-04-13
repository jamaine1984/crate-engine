// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — UNIVERSAL ASSET GALLERY
// Visual 3D preview gallery for every model category
// Triggered by voice, text, or AI agent commands
// ═══════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const galLoader = new GLTFLoader();
const galDraco = new DRACOLoader();
galDraco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/');
galLoader.setDRACOLoader(galDraco);

// Category icons and colors
const CAT_META = {
  characters: { icon: '🧑', color: '#ffd700', label: 'Characters' },
  weapons:    { icon: '⚔️', color: '#ef4444', label: 'Weapons' },
  buildings:  { icon: '🏠', color: '#8b5cf6', label: 'Buildings' },
  vehicles:   { icon: '🚗', color: '#3b82f6', label: 'Vehicles' },
  animals:    { icon: '🐾', color: '#22c55e', label: 'Animals' },
  trees:      { icon: '🌳', color: '#16a34a', label: 'Trees & Plants' },
  rocks:      { icon: '🪨', color: '#78716c', label: 'Rocks & Minerals' },
  furniture:  { icon: '🪑', color: '#d97706', label: 'Furniture' },
  food:       { icon: '🍖', color: '#f59e0b', label: 'Food & Items' },
  dungeon:    { icon: '💀', color: '#6b21a8', label: 'Dungeon' },
  scifi:      { icon: '🚀', color: '#06b6d4', label: 'Sci-Fi' },
  modern:     { icon: '🏙️', color: '#64748b', label: 'Modern' },
  nature:     { icon: '⛺', color: '#84cc16', label: 'Nature & Survival' },
  animations: { icon: '🎬', color: '#ec4899', label: 'Animations' },
};

let _catalog = null;
let _activeGallery = null;

export async function loadCatalog() {
  if (_catalog) return _catalog;
  try {
    const resp = await fetch('asset-catalog.json');
    _catalog = await resp.json();
    return _catalog;
  } catch(e) {
    console.warn('Failed to load asset catalog:', e);
    return {};
  }
}

// Main gallery function — opens a visual picker for any category
export function showGallery(category, options = {}) {
  console.log("[GALLERY] showGallery called with:", category);
  return new Promise(async (resolve) => {
    const catalog = await loadCatalog();
    const items = catalog[category];
    if (!items || items.length === 0) {
      resolve(null);
      return;
    }

    // Remove existing gallery
    if (_activeGallery) {
      _activeGallery.cleanup();
      _activeGallery = null;
    }

    const meta = CAT_META[category] || { icon: '📦', color: '#888', label: category };
    const viewers = [];
    let searchTerm = '';
    let currentPage = 0;
    const PAGE_SIZE = 24; // Show 24 at a time

    const overlay = document.createElement('div');
    overlay.id = 'asset-gallery-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.94);z-index:10005;display:flex;flex-direction:column;font-family:monospace;color:#e0e0e0;';

    // Top bar
    const topBar = document.createElement('div');
    topBar.style.cssText = 'padding:16px 24px;display:flex;align-items:center;gap:16px;border-bottom:1px solid #222;flex-shrink:0;';
    
    const title = document.createElement('div');
    title.style.cssText = `font-size:24px;color:${meta.color};`;
    title.textContent = `${meta.icon} ${meta.label}`;
    topBar.appendChild(title);

    const count = document.createElement('div');
    count.style.cssText = 'font-size:13px;color:#666;';
    count.textContent = `${items.length} models`;
    count.id = 'gallery-count';
    topBar.appendChild(count);

    // Search
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = '🔍 Search...';
    search.style.cssText = 'margin-left:auto;padding:8px 14px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-family:monospace;font-size:13px;width:220px;outline:none;';
    search.onfocus = () => search.style.borderColor = meta.color;
    search.onblur = () => search.style.borderColor = '#333';
    search.oninput = () => {
      searchTerm = search.value.toLowerCase();
      currentPage = 0;
      renderItems();
    };
    topBar.appendChild(search);

    // Close
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'font-size:24px;color:#666;cursor:pointer;margin-left:16px;transition:color 0.2s;padding:0 8px;';
    closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
    closeBtn.onmouseleave = () => closeBtn.style.color = '#666';
    closeBtn.onclick = () => { cleanup(); resolve(null); };
    topBar.appendChild(closeBtn);

    overlay.appendChild(topBar);

    // Grid scroll area
    const scrollArea = document.createElement('div');
    scrollArea.style.cssText = 'flex:1;overflow-y:auto;padding:20px;';
    
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,160px);gap:14px;justify-content:center;max-width:1100px;margin:0 auto;';
    scrollArea.appendChild(grid);

    // Pagination
    const pagination = document.createElement('div');
    pagination.style.cssText = 'display:flex;justify-content:center;gap:10px;padding:16px;align-items:center;';
    scrollArea.appendChild(pagination);

    overlay.appendChild(scrollArea);

    // Action bar at bottom
    const actionBar = document.createElement('div');
    actionBar.style.cssText = 'padding:12px 24px;border-top:1px solid #222;display:flex;align-items:center;gap:12px;flex-shrink:0;background:#0a0a0f;';
    
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:12px;color:#555;flex:1;';
    hint.textContent = options.hint || 'Click any model to add it to your scene';
    actionBar.appendChild(hint);

    // Browse all categories button
    const browseBtn = document.createElement('button');
    browseBtn.textContent = '📂 Browse All Categories';
    browseBtn.style.cssText = 'padding:8px 16px;background:transparent;border:1px solid #444;border-radius:6px;color:#aaa;cursor:pointer;font-family:monospace;font-size:12px;transition:all 0.2s;';
    browseBtn.onmouseenter = () => { browseBtn.style.borderColor = meta.color; browseBtn.style.color = '#fff'; };
    browseBtn.onmouseleave = () => { browseBtn.style.borderColor = '#444'; browseBtn.style.color = '#aaa'; };
    browseBtn.onclick = () => {
      cleanup();
      showCategoryPicker().then(resolve);
    };
    actionBar.appendChild(browseBtn);

    overlay.appendChild(actionBar);

    function cleanup() {
      viewers.forEach(v => {
        if (v.animId) cancelAnimationFrame(v.animId);
        if (v.renderer) v.renderer.dispose();
      });
      viewers.length = 0;
      overlay.remove();
      _activeGallery = null;
    }

    function getFiltered() {
      if (!searchTerm) return items;
      return items.filter(m => m.name.toLowerCase().includes(searchTerm));
    }

    function renderItems() {
      // Cleanup old viewers
      viewers.forEach(v => {
        if (v.animId) cancelAnimationFrame(v.animId);
        if (v.renderer) v.renderer.dispose();
      });
      viewers.length = 0;
      grid.innerHTML = '';

      const filtered = getFiltered();
      const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
      const start = currentPage * PAGE_SIZE;
      const pageItems = filtered.slice(start, start + PAGE_SIZE);

      document.getElementById('gallery-count').textContent = 
        searchTerm ? `${filtered.length} of ${items.length} models` : `${items.length} models`;

      pageItems.forEach((item, idx) => {
        const card = document.createElement('div');
        card.style.cssText = `background:#111;border:2px solid transparent;border-radius:10px;overflow:hidden;cursor:pointer;transition:all 0.2s;`;
        card.onmouseenter = () => { card.style.borderColor = meta.color; card.style.transform = 'translateY(-3px)'; card.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)'; };
        card.onmouseleave = () => { card.style.borderColor = 'transparent'; card.style.transform = 'none'; card.style.boxShadow = 'none'; };

        // Canvas for 3D preview
        const cvs = document.createElement('canvas');
        cvs.width = 160; cvs.height = 140;
        cvs.style.cssText = 'width:100%;height:140px;display:block;background:#0d0d0d;';
        card.appendChild(cvs);

        // Loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'position:absolute;top:60px;left:50%;transform:translateX(-50%);color:#444;font-size:12px;';
        loadingDiv.textContent = '⏳';
        card.style.position = 'relative';
        card.appendChild(loadingDiv);

        // Name
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'padding:8px 10px;font-size:11px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        nameEl.textContent = item.name;
        nameEl.title = item.name;
        card.appendChild(nameEl);

        card.onclick = () => {
          cleanup();
          resolve({ file: item.file, name: item.name, category, path: item.path || null });
        };

        grid.appendChild(card);

        // Lazy load 3D preview
        const obs = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            obs.disconnect();
            // Single shared renderer — no limit needed
            renderPreview(cvs, item.file, loadingDiv, viewers, item);
          }
        }, { root: scrollArea, threshold: 0.1 });
        obs.observe(card);
      });

      // Render pagination
      pagination.innerHTML = '';
      if (totalPages > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Prev';
        prevBtn.disabled = currentPage === 0;
        prevBtn.style.cssText = 'padding:6px 14px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#aaa;cursor:pointer;font-family:monospace;font-size:12px;' + (currentPage === 0 ? 'opacity:0.3;cursor:default;' : '');
        prevBtn.onclick = () => { if (currentPage > 0) { currentPage--; renderItems(); scrollArea.scrollTop = 0; } };
        pagination.appendChild(prevBtn);

        const pageInfo = document.createElement('span');
        pageInfo.style.cssText = 'color:#666;font-size:13px;';
        pageInfo.textContent = `Page ${currentPage + 1} of ${totalPages}`;
        pagination.appendChild(pageInfo);

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.disabled = currentPage >= totalPages - 1;
        nextBtn.style.cssText = 'padding:6px 14px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#aaa;cursor:pointer;font-family:monospace;font-size:12px;' + (currentPage >= totalPages - 1 ? 'opacity:0.3;cursor:default;' : '');
        nextBtn.onclick = () => { if (currentPage < totalPages - 1) { currentPage++; renderItems(); scrollArea.scrollTop = 0; } };
        pagination.appendChild(nextBtn);
      }
    }

    renderItems();
    document.body.appendChild(overlay);
    search.focus();

    _activeGallery = { cleanup };

    // ESC to close
    const escHandler = (e) => {
      if (e.key === 'Escape') { 
        document.removeEventListener('keydown', escHandler);
        cleanup(); 
        resolve(null); 
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

// Single shared offscreen renderer — renders one model at a time, captures to image
let _sharedRenderer = null;
let _renderQueue = [];
let _isRendering = false;

function getSharedRenderer() {
  if (!_sharedRenderer) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 320; offCanvas.height = 280;
    _sharedRenderer = new THREE.WebGLRenderer({ canvas: offCanvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    _sharedRenderer.setSize(320, 280);
    _sharedRenderer.setClearColor(0x0d0d0d, 1);
  }
  return _sharedRenderer;
}

function processRenderQueue() {
  if (_isRendering || _renderQueue.length === 0) return;
  _isRendering = true;
  const { targetCanvas, file, loadingDiv, viewers, item } = _renderQueue.shift();
  
  const r = getSharedRenderer();
  const s = new THREE.Scene();
  const c = new THREE.PerspectiveCamera(40, 320/280, 0.1, 100);
  c.position.set(0, 1.2, 3.5);
  c.lookAt(0, 0.6, 0);
  s.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(2, 4, 3);
  s.add(dl);
  const bl = new THREE.DirectionalLight(0x6688ff, 0.3);
  bl.position.set(-2, 1, -2);
  s.add(bl);

  const _path = (item && item.path) ? item.path : 'models/' + file + '.glb'; galLoader.load(_path, (gltf) => {
    if (loadingDiv) loadingDiv.remove();
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    m.scale.setScalar(2 / Math.max(maxDim, 0.001));
    const box2 = new THREE.Box3().setFromObject(m);
    const center = box2.getCenter(new THREE.Vector3());
    m.position.sub(center);
    const box3 = new THREE.Box3().setFromObject(m);
    m.position.y -= box3.min.y;
    // Slight rotation for better view
    m.rotation.y = Math.PI * 0.25;
    s.add(m);

    // Render 1 frame and capture
    r.render(s, c);
    const dataUrl = r.domElement.toDataURL('image/jpeg', 0.85);
    
    // Replace canvas with img for zero WebGL overhead
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'width:100%;height:140px;display:block;object-fit:cover;background:#0d0d0d;';
    if (targetCanvas.parentNode) {
      targetCanvas.parentNode.replaceChild(img, targetCanvas);
    }

    // Cleanup scene
    s.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => { if (mat.map) mat.map.dispose(); mat.dispose(); });
      }
    });

    _isRendering = false;
    // Process next in queue
    setTimeout(processRenderQueue, 50);
  }, undefined, () => {
    if (loadingDiv) { loadingDiv.textContent = '❌'; loadingDiv.style.color = '#ff4444'; }
    _isRendering = false;
    setTimeout(processRenderQueue, 50);
  });
}

function renderPreview(canvas, file, loadingDiv, viewers, item) {
  _renderQueue.push({ targetCanvas: canvas, file, loadingDiv, viewers, item });
  processRenderQueue();
}

// Category picker — shows all categories as a grid
export function showCategoryPicker() {
  return new Promise(async (resolve) => {
    const catalog = await loadCatalog();
    
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.94);z-index:10005;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:28px;color:#ffd700;margin-bottom:8px;';
    title.textContent = '📂 ASSET LIBRARY';
    overlay.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:13px;color:#666;margin-bottom:30px;';
    subtitle.textContent = 'Choose a category to browse 3D models';
    overlay.appendChild(subtitle);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,180px);gap:16px;justify-content:center;max-width:900px;';

    // Add characters special entry
    const allCats = ['characters', ...Object.keys(catalog)];
    
    allCats.forEach(cat => {
      const m = CAT_META[cat] || { icon: '📦', color: '#888', label: cat };
      const itemCount = cat === 'characters' ? 19 : (catalog[cat]?.length || 0);
      if (itemCount === 0) return;

      const card = document.createElement('div');
      card.style.cssText = `padding:24px 16px;background:rgba(255,255,255,0.03);border:2px solid ${m.color}30;border-radius:12px;cursor:pointer;text-align:center;transition:all 0.2s;`;
      card.onmouseenter = () => { card.style.borderColor = m.color; card.style.background = 'rgba(255,255,255,0.06)'; card.style.transform = 'scale(1.04)'; };
      card.onmouseleave = () => { card.style.borderColor = m.color + '30'; card.style.background = 'rgba(255,255,255,0.03)'; card.style.transform = 'scale(1)'; };

      card.innerHTML = `
        <div style="font-size:40px;margin-bottom:8px;">${m.icon}</div>
        <div style="font-size:15px;font-weight:bold;color:${m.color};margin-bottom:4px;">${m.label}</div>
        <div style="font-size:12px;color:#555;">${itemCount} models</div>
      `;

      card.onclick = () => {
        overlay.remove();
        if (cat === 'characters') {
          // Use the character gallery from engine
          if (window._showCharacterGallery) {
            window._showCharacterGallery().then(resolve);
          } else {
            resolve(null);
          }
        } else {
          showGallery(cat).then(resolve);
        }
      };

      grid.appendChild(card);
    });

    overlay.appendChild(grid);

    // Close
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#666;cursor:pointer;z-index:10006;';
    closeBtn.onmouseenter = () => closeBtn.style.color = '#fff';
    closeBtn.onmouseleave = () => closeBtn.style.color = '#666';
    closeBtn.onclick = () => { overlay.remove(); resolve(null); };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);

    // ESC
    const esc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); overlay.remove(); resolve(null); } };
    document.addEventListener('keydown', esc);
  });
}

// Animation gallery — special gallery for applying animations to objects
const PROCEDURAL_ANIMS = [
  { id: 'spin', name: 'Spin', desc: 'Continuous rotation', icon: '🔄' },
  { id: 'bounce', name: 'Bounce', desc: 'Up and down', icon: '⬆️' },
  { id: 'float', name: 'Float', desc: 'Gentle floating', icon: '☁️' },
  { id: 'pulse', name: 'Pulse', desc: 'Scale breathing', icon: '💫' },
  { id: 'wobble', name: 'Wobble', desc: 'Side to side', icon: '↔️' },
  { id: 'orbit', name: 'Orbit', desc: 'Circle around origin', icon: '🌀' },
  { id: 'swing', name: 'Swing', desc: 'Pendulum motion', icon: '🔔' },
  { id: 'breathe', name: 'Breathe', desc: 'Breathing scale', icon: '🫁' },
  { id: 'shake', name: 'Shake', desc: 'Rapid vibration', icon: '📳' },
  { id: 'walk', name: 'Walk', desc: 'Walking bob', icon: '🚶' },
  { id: 'idle', name: 'Idle', desc: 'Subtle sway', icon: '🧍' },
  { id: 'dance', name: 'Dance', desc: 'Dance moves', icon: '💃' },
  { id: 'attack', name: 'Attack', desc: 'Attack lunge', icon: '⚔️' },
  { id: 'die', name: 'Die', desc: 'Death fall', icon: '💀' },
  { id: 'jump', name: 'Jump', desc: 'Jump motion', icon: '🦘' },
];

export function showAnimationGallery(targetObjectName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10005;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:24px;color:#ec4899;margin-bottom:6px;';
    title.textContent = '🎬 ANIMATIONS';
    overlay.appendChild(title);

    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:13px;color:#666;margin-bottom:24px;';
    sub.textContent = targetObjectName ? `Apply animation to: ${targetObjectName}` : 'Choose an animation to apply';
    overlay.appendChild(sub);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,140px);gap:14px;justify-content:center;max-width:800px;';

    PROCEDURAL_ANIMS.forEach(anim => {
      const card = document.createElement('div');
      card.style.cssText = 'padding:20px 12px;background:rgba(236,72,153,0.05);border:2px solid rgba(236,72,153,0.2);border-radius:10px;cursor:pointer;text-align:center;transition:all 0.2s;';
      card.onmouseenter = () => { card.style.borderColor = '#ec4899'; card.style.transform = 'scale(1.05)'; };
      card.onmouseleave = () => { card.style.borderColor = 'rgba(236,72,153,0.2)'; card.style.transform = 'scale(1)'; };

      card.innerHTML = `
        <div style="font-size:32px;margin-bottom:8px;">${anim.icon}</div>
        <div style="font-size:14px;color:#ec4899;font-weight:bold;margin-bottom:4px;">${anim.name}</div>
        <div style="font-size:11px;color:#666;">${anim.desc}</div>
      `;

      card.onclick = () => {
        overlay.remove();
        resolve({ animId: anim.id, animName: anim.name, target: targetObjectName });
      };

      grid.appendChild(card);
    });

    overlay.appendChild(grid);

    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#666;cursor:pointer;z-index:10006;';
    closeBtn.onclick = () => { overlay.remove(); resolve(null); };
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
    const esc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); overlay.remove(); resolve(null); } };
    document.addEventListener('keydown', esc);
  });
}
