import * as THREE from 'three';

let context = {
  showToast: () => {},
  getScene: () => null,
  getRenderer: () => null,
  getCamera: () => null,
  getCurrentGround: () => null,
  loadGroundTexture: () => Promise.resolve(null),
  loadGLBModel: () => {},
  runCommand: () => {},
  getGLBModels: () => ({}),
};

let fabAliasesPromise = null;
let terrainPaintMode = false;
let terrainPaintType = 'grass';
let terrainPaintRadius = 15;
const paintedZones = [];

const PAINT_COLORS = {
  grass: 0x3a7a3a,
  sand: 0xc4a96a,
  desert: 0xb8924a,
  snow: 0xd8dce8,
  dirt: 0x6b4a2a,
  stone: 0x666666,
  rock: 0x555555,
  mud: 0x4a3a2a,
  lava: 0xcc3300,
  forest: 0x2a5a2a,
  concrete: 0x999999,
  asphalt: 0x333333,
  ice: 0xaaddff,
};

const PROCEDURAL_ANIMATIONS = [
  { id: 'spin', name: 'Spin', desc: 'Rotation', icon: '🔄' },
  { id: 'bounce', name: 'Bounce', desc: 'Up/down', icon: '⬆️' },
  { id: 'float', name: 'Float', desc: 'Floating', icon: '☁️' },
  { id: 'pulse', name: 'Pulse', desc: 'Scale pulse', icon: '💫' },
  { id: 'wobble', name: 'Wobble', desc: 'Side sway', icon: '↔️' },
  { id: 'orbit', name: 'Orbit', desc: 'Circle', icon: '🌀' },
  { id: 'swing', name: 'Swing', desc: 'Pendulum', icon: '🔔' },
  { id: 'breathe', name: 'Breathe', desc: 'Breathing', icon: '🫁' },
  { id: 'shake', name: 'Shake', desc: 'Vibration', icon: '📳' },
  { id: 'walk', name: 'Walk', desc: 'Walk bob', icon: '🚶' },
  { id: 'idle', name: 'Idle', desc: 'Subtle', icon: '🧍' },
  { id: 'dance', name: 'Dance', desc: 'Dance moves', icon: '💃' },
  { id: 'attack', name: 'Attack', desc: 'Lunge', icon: '⚔️' },
  { id: 'die', name: 'Die', desc: 'Death fall', icon: '💀' },
  { id: 'jump', name: 'Jump', desc: 'Jump', icon: '🦘' },
];

export function setEditorToolsContext(nextContext = {}) {
  context = { ...context, ...nextContext };
}

function getDialogueTrees() {
  return window._dialogueTrees || (window._dialogueTrees = {});
}

function syncTerrainPaintMode() {
  window._terrainPaintMode = terrainPaintMode;
}

export async function ensureFabAliasesLoaded() {
  if (window._fabAliases && Object.keys(window._fabAliases).length) {
    return window._fabAliases;
  }
  if (!fabAliasesPromise) {
    fabAliasesPromise = fetch('/models/fab/fab_aliases.json').then(async (response) => {
      if (!response.ok) return {};
      const aliases = await response.json();
      window._fabAliases = aliases;
      Object.assign(context.getGLBModels?.() || {}, aliases);
      console.log('[Fab] Loaded', Object.keys(aliases).length, 'Fab assets');
      return aliases;
    }).catch((err) => {
      console.warn('[Fab] Could not load aliases:', err.message);
      return {};
    }).finally(() => {
      fabAliasesPromise = null;
    });
  }
  return fabAliasesPromise;
}

export function showDialogueEditor(npcName) {
  const existing = document.getElementById('dialogue-editor-modal');
  if (existing) {
    existing.remove();
    return;
  }

  const treeName = npcName || 'NPC_1';
  const dialogueTrees = getDialogueTrees();
  if (!dialogueTrees[treeName]) {
    dialogueTrees[treeName] = {
      nodes: [
        { id: 'node_0', text: 'Hello traveler, what do you seek?', options: [
          { text: 'Tell me about this place', next: 'node_1' },
          { text: 'I need supplies', next: 'node_2' },
          { text: 'Goodbye', next: null },
        ] },
        { id: 'node_1', text: 'This is a dangerous land. Beware the creatures at night.', options: [
          { text: 'Thank you for the warning', next: null },
          { text: 'What creatures?', next: null },
        ] },
        { id: 'node_2', text: 'I have potions and weapons for sale.', options: [
          { text: 'Show me your wares', next: null },
          { text: 'Never mind', next: null },
        ] },
      ],
      start: 'node_0',
    };
  }

  const tree = dialogueTrees[treeName];
  const modal = document.createElement('div');
  modal.id = 'dialogue-editor-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99998;display:flex;flex-direction:column;font-family:-apple-system,sans-serif;overflow:hidden';

  function renderEditor() {
    const nodeList = tree.nodes.map((node, nodeIndex) => `
      <div style="background:#0d0d0d;border:1px solid ${node.id === tree.start ? '#ff6b35' : '#222'};border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="color:#555;font-size:0.7rem;font-family:monospace">${node.id}</span>
          ${node.id === tree.start ? '<span style="background:#ff6b35;color:#fff;font-size:0.6rem;padding:2px 6px;border-radius:4px">START</span>' : ''}
          <button onclick="window._dlgSetStart('${node.id}')" style="margin-left:auto;background:#111;border:1px solid #333;color:#888;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.65rem">Set Start</button>
          <button onclick="window._dlgDeleteNode(${nodeIndex})" style="background:#111;border:1px solid #ef4444;color:#ef4444;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:0.65rem">Delete</button>
        </div>
        <textarea id="node-text-${nodeIndex}" style="width:100%;background:#111;border:1px solid #333;border-radius:6px;padding:8px;color:#fff;font-size:0.82rem;resize:vertical;min-height:60px;box-sizing:border-box" onchange="window._dlgUpdateText(${nodeIndex},this.value)">${node.text}</textarea>
        <div style="margin-top:8px">
          <div style="color:#555;font-size:0.65rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">Response Options</div>
          ${node.options.map((option, optionIndex) => `
            <div style="display:flex;gap:6px;margin-bottom:4px;align-items:center">
              <input value="${option.text}" onchange="window._dlgUpdateOpt(${nodeIndex},${optionIndex},'text',this.value)" style="flex:1;background:#111;border:1px solid #333;border-radius:4px;padding:5px 8px;color:#ccc;font-size:0.75rem">
              <select onchange="window._dlgUpdateOpt(${nodeIndex},${optionIndex},'next',this.value||null)" style="background:#111;border:1px solid #333;border-radius:4px;padding:5px;color:#ccc;font-size:0.75rem">
                <option value="">End</option>
                ${tree.nodes.map((entry) => `<option value="${entry.id}" ${option.next === entry.id ? 'selected' : ''}>${entry.id}</option>`).join('')}
              </select>
              <button onclick="window._dlgDeleteOpt(${nodeIndex},${optionIndex})" style="background:#111;border:1px solid #ef4444;color:#ef4444;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem">X</button>
            </div>`).join('')}
          <button onclick="window._dlgAddOpt(${nodeIndex})" style="background:#111;border:1px solid #4ade80;color:#4ade80;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.7rem;margin-top:2px">Add Option</button>
        </div>
      </div>`).join('');

    modal.innerHTML = `
      <div style="padding:14px 18px;background:#0a0a0a;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:10px;flex-shrink:0">
        <span style="font-size:1.2rem">Dialogue</span>
        <div style="flex:1">
          <div style="font-weight:700;color:#fff">Dialogue Editor - <span style="color:#ff6b35">${treeName}</span></div>
          <div style="font-size:0.65rem;color:#555">${tree.nodes.length} nodes</div>
        </div>
        <button onclick="window._dlgPreview()" style="background:#1a1a2e;border:1px solid #4ade80;color:#4ade80;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem">Preview</button>
        <button onclick="window._dlgExport('${treeName}')" style="background:#1a1a2e;border:1px solid #ff6b35;color:#ff6b35;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.8rem">Save</button>
        <button onclick="document.getElementById('dialogue-editor-modal').remove()" style="background:none;border:1px solid #333;color:#888;padding:6px 12px;border-radius:8px;cursor:pointer">Close</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-content:start">
        <div>
          <div style="color:#ff6b35;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Dialogue Nodes</div>
          ${nodeList}
          <button onclick="window._dlgAddNode()" style="width:100%;padding:10px;background:#111;border:2px dashed #333;border-radius:8px;color:#555;cursor:pointer;font-size:0.8rem;margin-top:4px" onmouseenter="this.style.borderColor='#ff6b35';this.style.color='#ff6b35'" onmouseleave="this.style.borderColor='#333';this.style.color='#555'">Add Node</button>
        </div>
        <div>
          <div style="color:#4ade80;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Flow Preview</div>
          <div style="background:#0d0d0d;border:1px solid #1a1a1a;border-radius:10px;padding:12px;font-size:0.75rem;color:#888;font-family:monospace;white-space:pre-wrap">${tree.nodes.map((node) => `[${node.id}] "${node.text.substring(0, 40)}..."\n${node.options.map((option) => `  -> "${option.text}" -> ${option.next || 'END'}`).join('\n')}`).join('\n\n')}</div>
          <div style="margin-top:12px;color:#555;font-size:0.7rem">Commands</div>
          <div style="font-family:monospace;font-size:0.7rem;color:#888;background:#0d0d0d;padding:8px;border-radius:6px;margin-top:4px">
npc ${treeName} say Hello traveler<br>
add npc dialogue<br>
show dialogue ${treeName}<br>
attach dialogue ${treeName} to [npc name]
          </div>
        </div>
      </div>`;

    window._dlgAddNode = () => {
      const id = 'node_' + tree.nodes.length;
      tree.nodes.push({ id, text: 'New dialogue node', options: [{ text: 'Continue', next: null }] });
      renderEditor();
    };
    window._dlgDeleteNode = (index) => {
      tree.nodes.splice(index, 1);
      renderEditor();
    };
    window._dlgSetStart = (id) => {
      tree.start = id;
      renderEditor();
    };
    window._dlgUpdateText = (index, value) => {
      tree.nodes[index].text = value;
    };
    window._dlgAddOpt = (nodeIndex) => {
      tree.nodes[nodeIndex].options.push({ text: 'New option', next: null });
      renderEditor();
    };
    window._dlgDeleteOpt = (nodeIndex, optionIndex) => {
      tree.nodes[nodeIndex].options.splice(optionIndex, 1);
      renderEditor();
    };
    window._dlgUpdateOpt = (nodeIndex, optionIndex, key, value) => {
      tree.nodes[nodeIndex].options[optionIndex][key] = value || null;
    };
    window._dlgPreview = () => showDialoguePreview(treeName);
    window._dlgExport = (name) => {
      localStorage.setItem('crate_dialogue_' + name, JSON.stringify(dialogueTrees[name], null, 2));
      context.showToast?.('Dialogue "' + name + '" saved');
    };
  }

  document.body.appendChild(modal);
  renderEditor();
}

export function showDialoguePreview(treeName) {
  const tree = getDialogueTrees()[treeName];
  if (!tree) return;
  let currentNode = tree.nodes.find((node) => node.id === tree.start) || tree.nodes[0];
  if (!currentNode) return;

  const overlay = document.getElementById('dlg-preview-overlay') || (() => {
    const element = document.createElement('div');
    element.id = 'dlg-preview-overlay';
    element.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);width:500px;max-width:92vw;background:rgba(10,10,10,0.95);border:1px solid #333;border-radius:14px;z-index:100000;padding:20px;font-family:-apple-system,sans-serif;backdrop-filter:blur(10px)';
    document.body.appendChild(element);
    return element;
  })();

  function render(node) {
    overlay.innerHTML = `
      <div style="color:#888;font-size:0.65rem;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Dialogue ${treeName}</div>
      <div style="color:#fff;font-size:0.95rem;line-height:1.5;margin-bottom:14px">${node.text}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${node.options.map((option, index) => `
          <button onclick="window._dlgPickOpt(${index})" style="text-align:left;padding:8px 14px;background:#111;border:1px solid #333;border-radius:8px;color:#ccc;cursor:pointer;font-size:0.82rem;transition:all 0.15s" onmouseenter="this.style.borderColor='#ff6b35';this.style.color='#ff6b35'" onmouseleave="this.style.borderColor='#333';this.style.color='#ccc'">
            [${index + 1}] ${option.text}
          </button>`).join('')}
      </div>
      <button onclick="document.getElementById('dlg-preview-overlay').remove()" style="margin-top:10px;background:none;border:none;color:#444;cursor:pointer;font-size:0.75rem">Close preview</button>`;

    window._dlgPickOpt = (index) => {
      const next = node.options[index]?.next;
      if (!next) {
        overlay.remove();
        return;
      }
      const nextNode = tree.nodes.find((entry) => entry.id === next);
      if (nextNode) render(nextNode);
      else overlay.remove();
    };
  }

  render(currentNode);
}

function ensurePaintClickHandler() {
  if (window._paintClickHandler) return;
  const renderer = context.getRenderer?.();
  if (!renderer) return;
  window._paintClickHandler = (event) => {
    if (!terrainPaintMode) return;
    const scene = context.getScene?.();
    const camera = context.getCamera?.();
    const currentGround = context.getCurrentGround?.();
    if (!scene || !camera || !currentGround) return;

    const raycaster = new THREE.Raycaster();
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(currentGround);
    if (!hits.length) return;

    const point = hits[0].point;
    const geometry = new THREE.CircleGeometry(terrainPaintRadius, 32);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAINT_COLORS[terrainPaintType] || 0x3a7a3a),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(geometry, material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(point.x, 0.05, point.z);
    disc.userData = { isPaintZone: true, paintType: terrainPaintType };
    scene.add(disc);
    paintedZones.push(disc);

    context.loadGroundTexture?.(terrainPaintType).then((texture) => {
      if (!texture) return;
      const cloned = texture.clone();
      cloned.wrapS = cloned.wrapT = THREE.RepeatWrapping;
      cloned.repeat.set(4, 4);
      material.map = cloned;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    });

    context.showToast?.('Painted ' + terrainPaintType + ' zone at (' + point.x.toFixed(0) + ',' + point.z.toFixed(0) + ')');
  };
  renderer.domElement.addEventListener('click', window._paintClickHandler);
}

export function showTerrainPaintUI() {
  const existing = document.getElementById('terrain-paint-ui');
  if (existing) {
    existing.remove();
    terrainPaintMode = false;
    syncTerrainPaintMode();
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'terrain-paint-ui';
  panel.style.cssText = 'position:fixed;top:60px;left:20px;z-index:300;width:220px;background:#0a0a0a;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;font-family:-apple-system,sans-serif';

  const textureTypes = ['grass', 'sand', 'desert', 'snow', 'dirt', 'stone', 'rock', 'mud', 'lava', 'forest', 'concrete', 'asphalt', 'ice'];
  panel.innerHTML = `
    <div style="padding:10px 12px;background:rgba(255,107,53,0.08);border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:8px">
      <span>Paint</span>
      <div style="flex:1;font-weight:700;color:#ff6b35;font-size:0.8rem">Terrain Painter</div>
      <button id="terrain-paint-close" style="background:none;border:none;color:#555;cursor:pointer">Close</button>
    </div>
    <div style="padding:10px">
      <div style="color:#555;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Texture</div>
      <div id="paint-texture-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px"></div>
      <div style="color:#555;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Brush Radius: <span id="paint-radius-val">${terrainPaintRadius}</span></div>
      <input type="range" min="2" max="50" value="${terrainPaintRadius}" id="paint-radius" style="width:100%;accent-color:#ff6b35;margin-bottom:10px">
      <button id="paint-toggle" style="width:100%;padding:8px;background:#111;border:1px solid #333;border-radius:8px;color:#888;cursor:pointer;font-size:0.8rem;margin-bottom:6px">Start Painting</button>
      <button id="paint-clear" style="width:100%;padding:6px;background:#111;border:1px solid #ef4444;border-radius:8px;color:#ef4444;cursor:pointer;font-size:0.75rem">Clear All Zones</button>
      <div style="color:#555;font-size:0.65rem;margin-top:8px">Click terrain to paint texture zones</div>
    </div>`;

  document.body.appendChild(panel);
  terrainPaintMode = false;
  syncTerrainPaintMode();

  const textureGrid = panel.querySelector('#paint-texture-grid');
  textureTypes.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.texture = type;
    button.style.cssText = 'aspect-ratio:1;border-radius:6px;cursor:pointer;border:2px solid ' + (type === terrainPaintType ? '#ff6b35' : 'transparent') + ';background:#' + PAINT_COLORS[type].toString(16).padStart(6, '0') + ';position:relative;transition:all 0.15s';
    button.innerHTML = '<span style="position:absolute;bottom:1px;left:0;right:0;text-align:center;font-size:0.45rem;color:rgba(255,255,255,0.8)">' + type + '</span>';
    button.onclick = () => {
      terrainPaintType = type;
      textureGrid.querySelectorAll('button').forEach((entry) => {
        entry.style.borderColor = entry.dataset.texture === type ? '#ff6b35' : 'transparent';
      });
    };
    textureGrid.appendChild(button);
  });

  panel.querySelector('#terrain-paint-close').onclick = () => {
    panel.remove();
    terrainPaintMode = false;
    syncTerrainPaintMode();
  };
  panel.querySelector('#paint-radius').oninput = (event) => {
    terrainPaintRadius = Number(event.target.value);
    panel.querySelector('#paint-radius-val').textContent = String(terrainPaintRadius);
  };
  panel.querySelector('#paint-toggle').onclick = (event) => {
    terrainPaintMode = !terrainPaintMode;
    syncTerrainPaintMode();
    event.currentTarget.style.background = terrainPaintMode ? 'rgba(255,107,53,0.2)' : '#111';
    event.currentTarget.style.color = terrainPaintMode ? '#ff6b35' : '#888';
    event.currentTarget.textContent = terrainPaintMode ? 'Painting...' : 'Start Painting';
  };
  panel.querySelector('#paint-clear').onclick = () => {
    const scene = context.getScene?.();
    paintedZones.splice(0).forEach((zone) => scene?.remove(zone));
    context.showToast?.('Paint zones cleared');
  };

  ensurePaintClickHandler();
}

export async function showFabGallery() {
  const aliases = await ensureFabAliasesLoaded();
  const names = Object.keys(aliases);

  const existing = document.getElementById('fab-gallery-modal');
  if (existing) {
    existing.remove();
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'fab-gallery-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif';

  const box = document.createElement('div');
  box.style.cssText = 'background:#111;border-radius:16px;padding:24px;max-width:860px;width:90%;max-height:85vh;display:flex;flex-direction:column;gap:12px';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-shrink:0';
  header.innerHTML = '<div><div style="font-size:20px;font-weight:700;color:#fff">Fab Assets</div><div style="font-size:12px;color:#666;margin-top:4px">' + names.length + ' photorealistic models - click to spawn</div></div>';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.cssText = 'background:#222;border:none;color:#aaa;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:14px';
  closeButton.onclick = () => modal.remove();
  header.appendChild(closeButton);

  const search = document.createElement('input');
  search.placeholder = 'Search...';
  search.style.cssText = 'padding:10px 14px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;outline:none;flex-shrink:0';

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;overflow-y:auto;max-height:60vh';

  names.forEach((name) => {
    const card = document.createElement('div');
    card.dataset.name = name;
    card.style.cssText = 'background:#1a1a1a;border:1px solid #222;border-radius:10px;padding:12px;cursor:pointer;transition:all 0.15s;text-align:center';
    card.innerHTML = '<div style="font-size:22px;margin-bottom:6px">FAB</div><div style="font-size:11px;font-weight:600;color:#fff;word-break:break-all">' + name.replace(/_/g, ' ') + '</div><div style="font-size:10px;color:#555;margin-top:3px">Fab</div>';
    card.onmouseenter = function() {
      this.style.borderColor = '#f59e0b';
      this.style.background = '#1e1a10';
    };
    card.onmouseleave = function() {
      this.style.borderColor = '#222';
      this.style.background = '#1a1a1a';
    };
    card.onclick = () => {
      modal.remove();
      const path = aliases[name];
      if (path) context.loadGLBModel?.(name, path, 0, 0, null, path);
      else context.runCommand?.('add fab ' + name);
    };
    grid.appendChild(card);
  });

  search.oninput = function() {
    const query = this.value.toLowerCase();
    grid.querySelectorAll('div[data-name]').forEach((card) => {
      card.style.display = card.dataset.name.includes(query) ? '' : 'none';
    });
  };

  box.appendChild(header);
  box.appendChild(search);
  box.appendChild(grid);
  modal.appendChild(box);
  modal.onclick = (event) => {
    if (event.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
  search.focus();
}

export function showAnimationGallery(targetName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:10005;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;';
    overlay.innerHTML = '<div style="font-size:24px;color:#ec4899;margin-bottom:6px;">🎬 ANIMATIONS</div><div style="font-size:13px;color:#666;margin-bottom:24px;">' + (targetName ? 'Apply to: ' + targetName : 'Choose animation') + '</div>';

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,130px);gap:14px;justify-content:center;max-width:700px;';

    PROCEDURAL_ANIMATIONS.forEach((animation) => {
      const card = document.createElement('div');
      card.style.cssText = 'padding:18px 10px;background:rgba(236,72,153,0.05);border:2px solid rgba(236,72,153,0.2);border-radius:10px;cursor:pointer;text-align:center;transition:all 0.2s;';
      card.onmouseenter = () => { card.style.borderColor = '#ec4899'; card.style.transform = 'scale(1.05)'; };
      card.onmouseleave = () => { card.style.borderColor = 'rgba(236,72,153,0.2)'; card.style.transform = 'scale(1)'; };
      card.innerHTML = '<div style="font-size:28px;margin-bottom:6px;">' + animation.icon + '</div><div style="font-size:13px;color:#ec4899;font-weight:bold;">' + animation.name + '</div><div style="font-size:10px;color:#666;">' + animation.desc + '</div>';
      card.onclick = () => {
        overlay.remove();
        resolve({ animId: animation.id, animName: animation.name, target: targetName });
      };
      grid.appendChild(card);
    });

    overlay.appendChild(grid);

    const closeButton = document.createElement('div');
    closeButton.textContent = '✕';
    closeButton.style.cssText = 'position:fixed;top:15px;right:20px;font-size:28px;color:#fff;cursor:pointer;z-index:2147483647;background:rgba(0,0,0,0.5);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;';
    closeButton.onclick = () => {
      overlay.remove();
      resolve(null);
    };
    overlay.appendChild(closeButton);
    document.body.appendChild(overlay);

    const esc = (event) => {
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', esc);
        overlay.remove();
        resolve(null);
      }
    };
    document.addEventListener('keydown', esc);
  });
}
