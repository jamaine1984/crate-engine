const STORAGE_KEY = 'crate-game-builder-open';
const BLUEPRINT_STORAGE_KEY = 'crate-game-builder-blueprints';
const PROJECT_SAVE_KEY = 'crate-saves';

const SCRIPT_PRESETS = {
  inventory: {
    id: 'gb_inventory_hotbar',
    name: 'Inventory Hotbar',
    description: 'Five-slot inventory with pickup support.',
    code: `state.gbInventory = state.gbInventory || [null, null, null, null, null];
state.gbInventorySlot = state.gbInventorySlot || 0;

let hotbar = document.getElementById('gb-hotbar');
if (!hotbar) {
  hotbar = document.createElement('div');
  hotbar.id = 'gb-hotbar';
  hotbar.style.cssText = 'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);z-index:760;display:flex;gap:6px;pointer-events:none;font-family:monospace';
  document.body.appendChild(hotbar);
}

function renderHotbar() {
  hotbar.innerHTML = state.gbInventory.map((item, index) => {
    const active = index === state.gbInventorySlot;
    return '<div style="width:52px;height:52px;border:' + (active ? '2px solid #59d987' : '1px solid #333') + ';background:' + (active ? 'rgba(89,217,135,0.14)' : 'rgba(5,5,5,0.78)') + ';border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f5f5f5;font-size:10px"><span style="color:#888">' + (index + 1) + '</span><span>' + (item ? String(item).slice(0, 7) : '') + '</span></div>';
  }).join('');
}

onKeyPress = function(key) {
  if (key >= '1' && key <= '5') {
    state.gbInventorySlot = Number(key) - 1;
    renderHotbar();
  }
  if (key === 'e') {
    const player = getPlayer();
    if (!player) return;
    let closest = null;
    let closestDistance = 3;
    getObjects().forEach((obj) => {
      if (!obj.userData || !obj.userData.name) return;
      const distance = player.position.distanceTo(obj.position);
      if (distance < closestDistance) {
        closest = obj;
        closestDistance = distance;
      }
    });
    if (closest) {
      state.gbInventory[state.gbInventorySlot] = closest.userData.name;
      scene.remove(closest);
      showToast('Picked up: ' + closest.userData.name);
      renderHotbar();
    }
  }
};

onUpdate = function() {
  renderHotbar();
};`,
  },
  hud: {
    id: 'gb_game_hud',
    name: 'Game HUD',
    description: 'Health, score, and level display.',
    code: `state.gbHealth = state.gbHealth || 100;
state.gbScore = state.gbScore || 0;
state.gbLevel = state.gbLevel || 1;

let hud = document.getElementById('gb-game-hud');
if (!hud) {
  hud = document.createElement('div');
  hud.id = 'gb-game-hud';
  hud.style.cssText = 'position:fixed;top:76px;right:18px;z-index:740;width:190px;background:rgba(8,8,10,0.82);border:1px solid #2f3536;border-radius:8px;padding:10px 12px;color:#f5f5f5;font-family:monospace;font-size:12px;pointer-events:none';
  document.body.appendChild(hud);
}

onUpdate = function(dt) {
  state.gbHealth = Math.min(100, state.gbHealth + dt * 1.5);
  const health = Math.max(0, Math.round(state.gbHealth));
  const fill = Math.max(0, Math.min(100, health));
  hud.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>HP</span><span>' + health + '</span></div>' +
    '<div style="height:7px;background:#1c2021;border-radius:6px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:' + fill + '%;background:#59d987"></div></div>' +
    '<div style="display:flex;justify-content:space-between"><span>Score</span><span>' + state.gbScore + '</span></div>' +
    '<div style="display:flex;justify-content:space-between"><span>Level</span><span>' + state.gbLevel + '</span></div>';
};`,
  },
  quest: {
    id: 'gb_quest_tracker',
    name: 'Quest Tracker',
    description: 'Basic objective tracker.',
    code: `state.gbQuests = state.gbQuests || [
  { name: 'Find supplies', current: 0, target: 3 },
  { name: 'Reach the marker', current: 0, target: 1 }
];

let panel = document.getElementById('gb-quest-tracker');
if (!panel) {
  panel = document.createElement('div');
  panel.id = 'gb-quest-tracker';
  panel.style.cssText = 'position:fixed;top:210px;right:18px;z-index:740;width:210px;background:rgba(8,8,10,0.82);border:1px solid #2f3536;border-radius:8px;padding:10px 12px;color:#f5f5f5;font-family:monospace;font-size:12px;pointer-events:none';
  document.body.appendChild(panel);
}

onUpdate = function() {
  panel.innerHTML = '<div style="color:#80b7ff;margin-bottom:8px;font-weight:700">Objectives</div>' +
    state.gbQuests.map((quest) => {
      const done = quest.current >= quest.target;
      return '<div style="margin-bottom:7px;color:' + (done ? '#59d987' : '#e5e5e5') + '">' + (done ? '[x] ' : '[ ] ') + quest.name + '<div style="height:4px;background:#1c2021;border-radius:4px;margin-top:3px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, quest.current / quest.target * 100) + '%;background:#80b7ff"></div></div></div>';
    }).join('');
};`,
  },
  pickups: {
    id: 'gb_coin_pickups',
    name: 'Pickup Loop',
    description: 'Collectible objects that add score.',
    code: `state.gbPickupScore = state.gbPickupScore || 0;
state.gbPickupsReady = state.gbPickupsReady || false;

if (!state.gbPickupsReady) {
  for (let i = 0; i < 12; i++) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0xf6c34a, emissive: 0x6b4700, emissiveIntensity: 0.5 })
    );
    coin.position.set((Math.random() - 0.5) * 34, 1, (Math.random() - 0.5) * 34);
    coin.rotation.x = Math.PI / 2;
    coin.userData.name = 'coin_pickup';
    scene.add(coin);
  }
  state.gbPickupsReady = true;
  showToast('Pickups added');
}

onUpdate = function(dt) {
  const player = getPlayer();
  getObjects().forEach((obj) => {
    if (obj.userData.name !== 'coin_pickup') return;
    obj.rotation.z += dt * 2.8;
    if (player && player.position.distanceTo(obj.position) < 2) {
      scene.remove(obj);
      state.gbPickupScore += 10;
      showToast('+10 score');
    }
  });
};`,
  },
  components: {
    id: 'gb_component_runtime',
    name: 'Component Runtime',
    description: 'Runs pickup, damage, objective, checkpoint, win, and motion tags from Game Builder.',
    code: `state.gbRuntime = state.gbRuntime || {};
state.gbRuntime.health = state.gbRuntime.health ?? 100;
state.gbRuntime.score = state.gbRuntime.score || 0;
state.gbRuntime.objectives = state.gbRuntime.objectives || {};
state.gbRuntime.checkpoints = state.gbRuntime.checkpoints || {};
state.gbRuntime.winConditions = state.gbRuntime.winConditions || {};
state.gbRuntime.gameComplete = state.gbRuntime.gameComplete || false;
state.gbRuntime.gameOver = state.gbRuntime.gameOver || false;

function getPlayerPosition() {
  const player = getPlayer();
  if (player && player.position) return player.position;
  if (player && player.model && player.model.position) return player.model.position;
  if (camera && camera.position) return camera.position;
  return null;
}

function getComponentHud() {
  let hud = document.getElementById('gb-component-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'gb-component-hud';
    hud.style.cssText = 'position:fixed;right:18px;bottom:48px;z-index:735;width:220px;background:rgba(8,8,10,0.82);border:1px solid #2f3536;border-radius:8px;padding:10px 12px;color:#f5f5f5;font-family:monospace;font-size:12px;pointer-events:none';
    document.body.appendChild(hud);
  }
  return hud;
}

function renderComponentHud() {
  const objectiveRows = Object.values(state.gbRuntime.objectives || {});
  const objectives = objectiveRows.length ? objectiveRows.map((item) => {
    return '<div style="color:' + (item.done ? '#59d987' : '#d6e0e6') + '">' + (item.done ? '[x] ' : '[ ] ') + item.label + '</div>';
  }).join('') : '<div style="color:#7d878e">No objectives tagged</div>';
  const checkpoint = state.gbRuntime.activeCheckpoint ? '<div style="color:#f6c34a;margin-top:6px">Checkpoint: ' + state.gbRuntime.activeCheckpoint.label + '</div>' : '';
  const wins = Object.values(state.gbRuntime.winConditions || {});
  const winRows = wins.length ? '<div style="color:#80b7ff;margin-top:6px;margin-bottom:5px;font-weight:700">Win Goals</div>' + wins.map((item) => {
    return '<div style="color:' + (item.done ? '#59d987' : '#d6e0e6') + '">' + (item.done ? '[x] ' : '[ ] ') + item.label + '</div>';
  }).join('') : '';
  const gameState = state.gbRuntime.gameComplete ? '<div style="margin-top:8px;color:#59d987;font-weight:700">Game Complete</div>' : state.gbRuntime.gameOver ? '<div style="margin-top:8px;color:#ff9b9b;font-weight:700">Game Over</div>' : '';
  getComponentHud().innerHTML =
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>HP</span><span>' + Math.round(state.gbRuntime.health) + '</span></div>' +
    '<div style="height:7px;background:#1c2021;border-radius:6px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:' + Math.max(0, Math.min(100, state.gbRuntime.health)) + '%;background:#59d987"></div></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Score</span><span>' + state.gbRuntime.score + '</span></div>' +
    '<div style="color:#80b7ff;margin-bottom:5px;font-weight:700">Objectives</div>' + objectives + checkpoint + winRows + gameState;
}

onUpdate = function(dt, time) {
  const playerPos = getPlayerPosition();
  getObjects().forEach((obj) => {
    const components = obj && obj.userData && obj.userData.gbComponents;
    if (!components) return;

    if (components.spin) obj.rotation.y += dt * (components.spin.speed || 1.2);
    if (components.float) {
      const baseY = components.float.baseY ?? obj.position.y;
      components.float.baseY = baseY;
      obj.position.y = baseY + Math.sin(time * (components.float.speed || 1.8)) * (components.float.height || 0.45);
    }

    if (!playerPos || !obj.position) return;
    const distance = obj.position.distanceTo(playerPos);

    if (components.objective) {
      const id = components.objective.id || obj.uuid;
      if (!state.gbRuntime.objectives[id]) {
        state.gbRuntime.objectives[id] = { label: components.objective.label || 'Reach objective', done: false };
      }
      if (!state.gbRuntime.objectives[id].done && distance < (components.objective.radius || 3)) {
        state.gbRuntime.objectives[id].done = true;
        showToast('Objective complete: ' + state.gbRuntime.objectives[id].label);
      }
    }

    if (components.checkpoint) {
      const id = components.checkpoint.id || obj.uuid;
      if (!state.gbRuntime.checkpoints[id]) {
        state.gbRuntime.checkpoints[id] = { label: components.checkpoint.label || 'Checkpoint', reached: false };
      }
      if (!state.gbRuntime.checkpoints[id].reached && distance < (components.checkpoint.radius || 3)) {
        state.gbRuntime.checkpoints[id].reached = true;
        state.gbRuntime.activeCheckpoint = { id, label: state.gbRuntime.checkpoints[id].label };
        showToast('Checkpoint reached: ' + state.gbRuntime.checkpoints[id].label);
      }
    }

    if (components.winCondition) {
      const id = components.winCondition.id || obj.uuid;
      if (!state.gbRuntime.winConditions[id]) {
        state.gbRuntime.winConditions[id] = { label: components.winCondition.label || 'Reach win goal', done: false };
      }
      if (!state.gbRuntime.winConditions[id].done && distance < (components.winCondition.radius || 3)) {
        state.gbRuntime.winConditions[id].done = true;
        showToast('Win goal complete: ' + state.gbRuntime.winConditions[id].label);
      }
    }

    if (components.pickup && !obj.userData.gbCollected && distance < (components.pickup.radius || 2.5)) {
      obj.userData.gbCollected = true;
      const item = components.pickup.item || obj.userData.name || 'item';
      state.gbRuntime.score += components.pickup.score || 10;
      if (Array.isArray(state.gbInventory)) {
        const slot = typeof state.gbInventorySlot === 'number' ? state.gbInventorySlot : 0;
        state.gbInventory[slot] = item;
      }
      scene.remove(obj);
      showToast('Collected: ' + item);
    }

    if (components.damage && distance < (components.damage.radius || 2.5)) {
      const lastHit = components.damage.lastHit || 0;
      const cooldown = components.damage.cooldown || 1.2;
      if (time - lastHit > cooldown) {
        components.damage.lastHit = time;
        state.gbRuntime.health = Math.max(0, state.gbRuntime.health - (components.damage.amount || 10));
        showToast('Damage: -' + (components.damage.amount || 10));
      }
    }
  });
  const winRows = Object.values(state.gbRuntime.winConditions || {});
  if (!state.gbRuntime.gameComplete && winRows.length && winRows.every((item) => item.done)) {
    state.gbRuntime.gameComplete = true;
    showToast('Game complete');
  }
  if (!state.gbRuntime.gameOver && state.gbRuntime.health <= 0) {
    state.gbRuntime.gameOver = true;
    showToast('Game over');
  }
  renderComponentHud();
};`,
  },
};

const PRESET_GROUPS = [
  {
    label: 'World',
    presets: [
      { label: 'Modern City', command: 'build city' },
      { label: 'Medieval Village', command: 'build medieval village' },
      { label: 'Zombie Survival', command: 'zombie game' },
      { label: 'Space Station', command: 'build space station' },
      { label: 'Pirate Cove', command: 'build pirate cove' },
      { label: 'Forest Camp', command: 'build forest' },
    ],
  },
  {
    label: 'Systems',
    presets: [
      { label: 'Inventory', script: 'inventory' },
      { label: 'Game HUD', script: 'hud' },
      { label: 'Quest Tracker', script: 'quest' },
      { label: 'Pickups', script: 'pickups' },
      { label: 'Components', script: 'components' },
      { label: 'FPS Combat', command: 'fps mode' },
      { label: 'Dialogue NPC', command: 'dialogue editor' },
      { label: 'Autosave', command: 'autosave on' },
      { label: 'Day/Night', command: 'day night cycle' },
    ],
  },
  {
    label: 'Assets',
    presets: [
      { label: 'Asset Library', action: 'assets' },
      { label: 'Characters', command: 'characters' },
      { label: 'Vehicles', command: 'show vehicles' },
      { label: 'Weapons', command: 'show weapons' },
      { label: 'Buildings', command: 'show buildings' },
      { label: 'Trees', command: 'show trees' },
    ],
  },
  {
    label: 'Ship',
    presets: [
      { label: 'Play Mode', action: 'play' },
      { label: 'Save', action: 'save' },
      { label: 'Load', action: 'load' },
      { label: 'Import', action: 'import' },
      { label: 'Export', action: 'export' },
      { label: 'Share', action: 'share' },
      { label: 'Scripts', action: 'scripts' },
      { label: 'Settings', action: 'settings' },
    ],
  },
];

const PROJECT_ACTIONS = [
  { label: 'Save', action: 'save', title: 'Save or load named project slots.' },
  { label: 'Load', action: 'load', title: 'Open saved project slots.' },
  { label: 'Import', action: 'import', title: 'Import GLB, GLTF, or .crate files.' },
  { label: 'Export', action: 'export', title: 'Export, download, or share the current project.' },
  { label: 'Share', action: 'share', title: 'Create a share URL for the current project.' },
  { label: 'Settings', action: 'settings', title: 'Open engine settings.' },
];

const GAME_SYSTEMS = [
  {
    id: 'inventory',
    name: 'Inventory',
    detail: 'Five-slot hotbar for pickup-based games.',
    script: 'inventory',
    scriptId: 'gb_inventory_hotbar',
    actionLabel: 'Install',
  },
  {
    id: 'hud',
    name: 'Game HUD',
    detail: 'Health, score, and level display.',
    script: 'hud',
    scriptId: 'gb_game_hud',
    actionLabel: 'Install',
  },
  {
    id: 'quest',
    name: 'Quest Tracker',
    detail: 'Objective panel for directed gameplay.',
    script: 'quest',
    scriptId: 'gb_quest_tracker',
    actionLabel: 'Install',
  },
  {
    id: 'runtime',
    name: 'Component Runtime',
    detail: 'Runs pickup, damage, objective, spin, and float tags.',
    script: 'components',
    scriptId: 'gb_component_runtime',
    actionLabel: 'Install',
  },
  {
    id: 'pickups',
    name: 'Pickup System',
    detail: 'Make selected objects collectible.',
    component: 'pickup',
    countKey: 'pickup',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'objectives',
    name: 'Objective System',
    detail: 'Make selected objects complete objectives.',
    component: 'objective',
    countKey: 'objective',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'checkpoints',
    name: 'Checkpoints',
    detail: 'Save player progress at selected objects.',
    component: 'checkpoint',
    countKey: 'checkpoint',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'win',
    name: 'Win Condition',
    detail: 'Mark selected objects as game-finish goals.',
    component: 'winCondition',
    countKey: 'winCondition',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'spawns',
    name: 'Spawn Points',
    detail: 'Mark selected objects as player or enemy starts.',
    component: 'spawnPoint',
    countKey: 'spawnPoint',
    actionLabel: 'Tag Selected',
  },
  {
    id: 'damage',
    name: 'Damage Zones',
    detail: 'Make selected objects damage nearby players.',
    component: 'damage',
    countKey: 'damage',
    actionLabel: 'Tag Selected',
  },
];

const EDIT_ONLY_ACTIONS = new Set(['assets', 'import', 'load', 'save', 'scripts']);

const COMPONENT_PRESETS = [
  { label: 'Collider', component: 'collider', title: 'Tag the current object as solid scene geometry.' },
  { label: 'Pickup', component: 'pickup', title: 'Make the current object collectible.' },
  { label: 'Damage', component: 'damage', title: 'Make the current object damage the player nearby.' },
  { label: 'Objective', component: 'objective', title: 'Make the current object complete an objective when reached.' },
  { label: 'Checkpoint', component: 'checkpoint', title: 'Mark the current object as a checkpoint.' },
  { label: 'Win Goal', component: 'winCondition', title: 'Mark the current object as a win condition.' },
  { label: 'Spin', component: 'spin', title: 'Give the current object a runtime spin behavior.' },
  { label: 'Float', component: 'float', title: 'Give the current object a gentle floating behavior.' },
  { label: 'Spawn Pt', component: 'spawnPoint', title: 'Mark the current object as a player or enemy spawn point.' },
  { label: 'Focus', action: 'focus', title: 'Move the camera toward the current object.' },
];

const COMPONENT_FIELDS = {
  collider: [
    { key: 'type', label: 'Type', kind: 'text' },
  ],
  pickup: [
    { key: 'item', label: 'Item', kind: 'text' },
    { key: 'score', label: 'Score', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  damage: [
    { key: 'amount', label: 'Damage', kind: 'number', step: 1 },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
    { key: 'cooldown', label: 'Cooldown', kind: 'number', step: 0.1 },
  ],
  objective: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  checkpoint: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  winCondition: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
  spin: [
    { key: 'speed', label: 'Speed', kind: 'number', step: 0.1 },
  ],
  float: [
    { key: 'speed', label: 'Speed', kind: 'number', step: 0.1 },
    { key: 'height', label: 'Height', kind: 'number', step: 0.1 },
  ],
  spawnPoint: [
    { key: 'kind', label: 'Kind', kind: 'text' },
    { key: 'radius', label: 'Radius', kind: 'number', step: 0.1 },
  ],
};

let lastSceneSignature = '';
let lastInspectorSignature = '';
let lastBlueprintSignature = '';
let lastPlacementSignature = '';
let lastAssetPackSignature = '';
let lastReadinessSignature = '';
let lastGameSystemsSignature = '';
let assetManifestLoadStarted = false;

function isSmallScreen() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function notify(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.log('[Game Builder]', message);
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return {};
  }
}

function readBlueprints() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BLUEPRINT_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name) : [];
  } catch {
    return [];
  }
}

function writeBlueprints(items) {
  localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(items.slice(0, 24)));
  lastBlueprintSignature = '';
}

function readProjectSaves() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_SAVE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && (item.commands || item.name)) : [];
  } catch {
    return [];
  }
}

function formatComponentLabel(name) {
  return String(name || 'component').replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim();
}

function parseNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function runCommand(command) {
  const runner = window._runCommand || window._parseAndExecute || window._engine?.exec;
  if (!runner) {
    notify('Engine is still loading');
    return Promise.resolve(null);
  }
  return Promise.resolve(runner(command)).catch((err) => {
    notify(err.message || 'Command failed');
    return null;
  });
}

async function installScript(key) {
  const script = SCRIPT_PRESETS[key];
  if (!script) return;
  if (!window._installUserScriptPreset) {
    notify('Script tools are still loading');
    return;
  }
  try {
    await window._installUserScriptPreset(script);
  } catch (err) {
    notify(err.message || 'Script install failed');
  }
}

function getSceneObjects() {
  const candidates = window._engineBridge?.objects || window._engine?.objects || window._sceneObjects || [];
  return Array.isArray(candidates) ? candidates.filter((obj) => obj && obj.position && obj.userData) : [];
}

function normalizeSceneObject(obj) {
  if (!obj) return null;
  const objects = getSceneObjects();
  let target = obj;
  while (target.parent && !objects.includes(target)) target = target.parent;
  return objects.includes(target) ? target : null;
}

function getObjectName(obj, index) {
  const name = obj?.userData?.name || obj?.name || obj?.type || 'Object';
  return String(name).replace(/[_-]+/g, ' ').trim() || 'Object ' + (index + 1);
}

function getTargetObject() {
  const selected = normalizeSceneObject(window._engineBridge?.getSelected?.() || window._engine?.selectedObject);
  if (selected) return selected;
  const lastPlaced = normalizeSceneObject(window._lastPlacedObj);
  if (lastPlaced) return lastPlaced;
  const objects = getSceneObjects();
  return objects[objects.length - 1] || null;
}

function selectObject(obj, options = {}) {
  if (!options.readOnly && !requireEditAction('select objects')) return null;
  const target = normalizeSceneObject(obj) || getTargetObject();
  if (!target) {
    notify('Select or add an object first');
    return null;
  }
  const selected = window._engineBridge?.selectObject?.(target) || window._engine?.selectObject?.(target) || target;
  window._lastPlacedObj = selected;
  updateBuilderUi();
  return selected;
}

function focusObject(obj) {
  const target = obj || getTargetObject();
  const camera = window._engine?.camera || window._engineBridge?.camera;
  const controls = window._engine?.controls;
  if (!target || !target.position || !camera) {
    notify('Select or add an object first');
    return;
  }
  const pos = target.position;
  camera.position.set(pos.x + 10, pos.y + 7, pos.z + 10);
  if (camera.lookAt) camera.lookAt(pos.x, pos.y, pos.z);
  if (controls?.target?.copy) {
    controls.target.copy(pos);
    controls.update?.();
  }
  if (isEditMode()) selectObject(target);
  notify('Focused: ' + getObjectName(target, 0));
}

function duplicateTarget(obj) {
  if (!requireEditAction('clone objects')) return null;
  const target = selectObject(obj || getTargetObject());
  if (!target) return null;
  if (typeof window._duplicateSelected === 'function') {
    window._duplicateSelected();
    const clone = normalizeSceneObject(window._lastPlacedObj);
    if (clone && clone !== target) {
      selectObject(clone);
      notify('Cloned: ' + getObjectName(clone, 0));
      return clone;
    }
  }

  const scene = window._engineBridge?.scene || window._engine?.scene;
  const objects = getSceneObjects();
  if (!scene || !target.clone) return null;
  const clone = target.clone(true);
  clone.position.x += 2;
  clone.userData = { ...cloneJson(target.userData), name: (target.userData?.name || 'object') + '_copy' };
  scene.add(clone);
  objects.push(clone);
  window._lastPlacedObj = clone;
  selectObject(clone);
  notify('Cloned: ' + getObjectName(clone, 0));
  return clone;
}

function deleteTarget(obj) {
  if (!requireEditAction('delete objects')) return;
  const target = selectObject(obj || getTargetObject());
  if (!target) return;
  const label = getObjectName(target, 0);
  if (typeof window._deleteSelected === 'function') {
    window._deleteSelected();
  } else {
    window._engineBridge?.removeObject?.(target);
  }
  window._lastPlacedObj = null;
  lastSceneSignature = '';
  lastInspectorSignature = '';
  notify('Deleted: ' + label);
  updateBuilderUi();
}

function getComponentStore(obj) {
  obj.userData = obj.userData || {};
  obj.userData.gbComponents = obj.userData.gbComponents || {};
  return obj.userData.gbComponents;
}

async function ensureComponentRuntime() {
  await installScript('components');
}

async function ensureRuntimeForComponents(components) {
  const keys = Object.keys(components || {});
  if (keys.includes('pickup')) await installScript('inventory');
  if (keys.some((key) => ['pickup', 'damage', 'objective', 'checkpoint', 'winCondition', 'spin', 'float'].includes(key))) {
    await ensureComponentRuntime();
  }
}

async function markComponent(component) {
  if (!requireEditAction('add components')) return;
  const target = selectObject(getTargetObject());
  if (!target) return;
  const components = getComponentStore(target);
  const cleanName = getObjectName(target, 0);
  const id = target.uuid || ('object_' + Date.now());

  if (component === 'collider') {
    components.collider = { type: 'solid', createdAt: Date.now() };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Inspect';
  } else if (component === 'pickup') {
    components.pickup = { item: cleanName, score: 10, radius: 2.5 };
    await installScript('inventory');
    await ensureComponentRuntime();
  } else if (component === 'damage') {
    components.damage = { amount: 10, radius: 2.5, cooldown: 1.2 };
    await ensureComponentRuntime();
  } else if (component === 'objective') {
    components.objective = { id: 'objective_' + id, label: 'Reach ' + cleanName, radius: 3 };
    await ensureComponentRuntime();
  } else if (component === 'checkpoint') {
    components.checkpoint = { id: 'checkpoint_' + id, label: cleanName + ' checkpoint', radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Checkpoint';
    await ensureComponentRuntime();
  } else if (component === 'winCondition') {
    components.winCondition = { id: 'win_' + id, label: 'Finish at ' + cleanName, radius: 3 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Finish';
    await ensureComponentRuntime();
  } else if (component === 'spin') {
    components.spin = { speed: 1.2 };
    await ensureComponentRuntime();
  } else if (component === 'float') {
    components.float = { speed: 1.8, height: 0.45, baseY: target.position.y };
    await ensureComponentRuntime();
  } else if (component === 'spawnPoint') {
    components.spawnPoint = { kind: 'player', radius: 1.5 };
    target.userData.interactable = true;
    target.userData.interactLabel = target.userData.interactLabel || 'Spawn point';
  }

  notify(component.replace(/([A-Z])/g, ' $1') + ' added to ' + cleanName);
  updateBuilderUi();
}

function runAction(action) {
  if (action === 'play') {
    setBuilderMode('play');
    return null;
  }
  if (action === 'assets') {
    if (!requireEditAction('place assets')) return null;
    if (window._showCategoryPicker) return window._showCategoryPicker();
    return runCommand('browse');
  }
  if (action === 'save') {
    if (!requireEditAction('save or load projects')) return null;
    if (window._showSaveLoad) return window._showSaveLoad();
    return runCommand('save world');
  }
  if (action === 'load') {
    if (!requireEditAction('load projects')) return null;
    if (window._showSaveLoad) return window._showSaveLoad();
    return runCommand('load world');
  }
  if (action === 'import') {
    if (!requireEditAction('import assets or scenes')) return null;
    if (window._showImportExport) return window._showImportExport('import');
    return null;
  }
  if (action === 'export') {
    if (window._showImportExport) return window._showImportExport('export');
    return runCommand('export world');
  }
  if (action === 'share') {
    return runCommand('share world');
  }
  if (action === 'scripts') {
    if (!requireEditAction('edit scripts')) return null;
    if (window._showScriptManager) return window._showScriptManager();
    if (window._openCodeEditor) return window._openCodeEditor();
  }
  if (action === 'settings') {
    if (window.showSettings) return window.showSettings();
    if (window.showAISettingsModal) return window.showAISettingsModal();
  }
  return null;
}

function createButton(preset) {
  const button = document.createElement('button');
  button.className = 'gb-preset';
  button.type = 'button';
  button.textContent = preset.label;
  button.title = preset.title || preset.command || preset.label;
  if (preset.action) button.dataset.gbAction = preset.action;
  const editOnly = !!(preset.editOnly === true || preset.script || (preset.command && preset.editOnly !== false) || EDIT_ONLY_ACTIONS.has(preset.action));
  if (editOnly) markEditOnly(button, preset.action === 'assets' ? 'place assets' : preset.action === 'import' ? 'import assets or scenes' : preset.action === 'load' ? 'load projects' : preset.action === 'save' ? 'save or load projects' : preset.action === 'scripts' ? 'edit scripts' : 'run builder presets');
  button.addEventListener('click', async () => {
    if (editOnly && !requireEditAction(button.dataset.gbEditAction || 'edit this')) return;
    setBusy(button, true);
    if (preset.command) await runCommand(preset.command);
    else if (preset.script) await installScript(preset.script);
    else if (preset.action) await runAction(preset.action);
    setBusy(button, false);
    updateBuilderUi();
  });
  return button;
}

function createComponentButton(preset) {
  const button = document.createElement('button');
  button.className = 'gb-preset gb-component-btn';
  button.type = 'button';
  button.dataset.gbComponent = preset.component || preset.action || preset.label;
  button.textContent = preset.label;
  button.title = preset.title || preset.label;
  if (preset.action !== 'focus') markEditOnly(button, 'add components');
  button.addEventListener('click', async () => {
    if (preset.action !== 'focus' && !requireEditAction('add components')) return;
    setBusy(button, true);
    if (preset.action === 'focus') focusObject();
    else await markComponent(preset.component);
    setBusy(button, false);
  });
  return button;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.dataset.busy = busy ? 'true' : 'false';
  if (!busy) updateEditorControlState();
}

function updateStats() {
  const stats = document.getElementById('gb-stats');
  if (!stats) return;
  const objects = getSceneObjects();
  const objectCount = objects.length;
  const componentCount = objects.reduce((count, obj) => count + Object.keys(obj.userData?.gbComponents || {}).length, 0);
  const scriptCount = Array.isArray(window._userScripts) ? window._userScripts.length : 0;
  const mode = formatModeLabel(getCurrentMode());
  const summary = objectCount + ' objects, ' + componentCount + ' components, ' + scriptCount + ' scripts, ' + mode + ' mode';
  stats.dataset.summary = summary;
  stats.setAttribute('aria-label', summary);
  stats.replaceChildren(
    createStatPill(objectCount + ' objects'),
    createStatPill(componentCount + ' components'),
    createStatPill(scriptCount + ' scripts'),
    createStatPill(mode + ' mode')
  );
}

function createStatPill(label) {
  const pill = document.createElement('span');
  pill.textContent = label;
  return pill;
}

function updateProjectStatus() {
  const status = document.getElementById('gb-project-status');
  if (!status) return;
  const saves = readProjectSaves();
  const assetVersion = window._assetManifestVersion || window._crateAssetManifest?.version || '';
  const saveText = saves.length === 1 ? '1 saved project' : saves.length + ' saved projects';
  status.textContent = saveText + (assetVersion ? ' | assets ' + assetVersion : '');
}

function getInstalledScriptIds() {
  return new Set((Array.isArray(window._userScripts) ? window._userScripts : [])
    .filter((script) => script && script.enabled !== false)
    .map((script) => script.id || script.name || ''));
}

function countComponents(objects) {
  return objects.reduce((counts, obj) => {
    const components = obj?.userData?.gbComponents || {};
    Object.keys(components).forEach((key) => {
      counts.total += 1;
      counts.byType[key] = (counts.byType[key] || 0) + 1;
    });
    return counts;
  }, { total: 0, byType: {} });
}

function collectReadiness() {
  const objects = getSceneObjects();
  const scripts = Array.isArray(window._userScripts) ? window._userScripts.filter((script) => script && script.enabled !== false) : [];
  const componentCounts = countComponents(objects);
  const saves = readProjectSaves();
  const assetStatus = window._crateAssetManifestStatus?.status || (window._crateAssetManifest?.version ? 'loaded' : 'idle');
  const mode = formatModeLabel(getCurrentMode());
  const spawnCount = componentCounts.byType.spawnPoint || 0;
  const pickupCount = componentCounts.byType.pickup || 0;
  const objectiveCount = componentCounts.byType.objective || 0;
  const checkpointCount = componentCounts.byType.checkpoint || 0;
  const winConditionCount = componentCounts.byType.winCondition || 0;
  const hasWorld = objects.length > 0;
  const hasGameplay = scripts.length > 0 || componentCounts.total > 0;
  let status = 'Needs world';
  let tone = 'warn';
  if (assetStatus === 'failed') {
    status = 'Asset issue';
    tone = 'blocked';
  } else if (hasWorld && hasGameplay) {
    status = getCurrentMode() === 'play' ? 'Playing' : 'Ready to test';
    tone = 'ready';
  } else if (hasWorld) {
    status = 'Add gameplay';
    tone = 'warn';
  }
  const summary = [
    status,
    objects.length + ' objects',
    scripts.length + ' scripts',
    componentCounts.total + ' components',
    mode + ' mode',
  ].join(', ');
  return {
    status,
    tone,
    summary,
    mode,
    objectCount: objects.length,
    scriptCount: scripts.length,
    componentCount: componentCounts.total,
    spawnCount,
    pickupCount,
    objectiveCount,
    checkpointCount,
    winConditionCount,
    saveCount: saves.length,
    assetStatus,
    assetVersion: window._crateAssetManifest?.version || window._assetManifestVersion || '',
  };
}

function createReadinessSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-readiness';
  const heading = document.createElement('h3');
  heading.textContent = 'Readiness';
  const status = document.createElement('div');
  status.id = 'gb-readiness-status';
  status.className = 'gb-readiness-status';
  const list = document.createElement('div');
  list.id = 'gb-readiness-list';
  list.className = 'gb-readiness-list';
  section.append(heading, status, list);
  return section;
}

function renderReadinessStatus() {
  const status = document.getElementById('gb-readiness-status');
  const list = document.getElementById('gb-readiness-list');
  if (!status || !list) return;
  const readiness = collectReadiness();
  const signature = JSON.stringify(readiness);
  window._gameBuilderReadiness = readiness;
  if (signature === lastReadinessSignature) return;
  lastReadinessSignature = signature;
  status.dataset.status = readiness.tone;
  status.dataset.summary = readiness.summary;
  status.setAttribute('aria-label', readiness.summary);
  status.replaceChildren(
    createTextElement('strong', '', readiness.status),
    createTextElement('span', '', readiness.mode + ' mode')
  );
  list.replaceChildren(
    createReadinessRow('World', readiness.objectCount + ' objects'),
    createReadinessRow('Gameplay', readiness.scriptCount + ' scripts | ' + readiness.componentCount + ' components'),
    createReadinessRow('Progress', readiness.pickupCount + ' pickups | ' + readiness.checkpointCount + ' checkpoints'),
    createReadinessRow('Goals', readiness.objectiveCount + ' objectives | ' + readiness.winConditionCount + ' wins'),
    createReadinessRow('Spawns', readiness.spawnCount + ' spawns'),
    createReadinessRow('Project', readiness.saveCount + (readiness.saveCount === 1 ? ' save' : ' saves')),
    createReadinessRow('Assets', readiness.assetStatus === 'loaded' ? shortAssetValue(readiness.assetVersion) : readiness.assetStatus)
  );
}

function createReadinessRow(label, value) {
  const row = document.createElement('div');
  row.className = 'gb-readiness-row';
  row.append(createTextElement('span', '', label), createTextElement('strong', '', value));
  return row;
}

function createGameSystemsSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-systems';
  const heading = document.createElement('h3');
  heading.textContent = 'Game Systems';
  const list = document.createElement('div');
  list.id = 'gb-systems-list';
  list.className = 'gb-systems-list';
  section.append(heading, list);
  return section;
}

function collectGameSystemState() {
  const objects = getSceneObjects();
  const componentCounts = countComponents(objects);
  const scriptIds = getInstalledScriptIds();
  const hasTarget = !!getTargetObject();
  return GAME_SYSTEMS.map((system) => {
    const installed = system.scriptId ? scriptIds.has(system.scriptId) : (componentCounts.byType[system.countKey] || 0) > 0;
    const count = system.countKey ? componentCounts.byType[system.countKey] || 0 : 0;
    const status = installed ? 'installed' : system.component && !hasTarget ? 'needs-object' : 'available';
    const statusText = installed
      ? (system.countKey ? count + ' tagged' : 'Installed')
      : (status === 'needs-object' ? 'Select object' : 'Ready');
    return {
      id: system.id,
      name: system.name,
      detail: system.detail,
      status,
      statusText,
      actionLabel: installed ? 'Reapply' : system.actionLabel,
      script: system.script,
      component: system.component,
    };
  });
}

function renderGameSystems() {
  const list = document.getElementById('gb-systems-list');
  if (!list) return;
  const systems = collectGameSystemState();
  const signature = JSON.stringify(systems.map((system) => [system.id, system.status, system.statusText]));
  window._gameBuilderSystems = systems;
  if (signature === lastGameSystemsSignature) return;
  lastGameSystemsSignature = signature;
  list.replaceChildren(...systems.map(createGameSystemCard));
  updateEditorControlState();
}

function createGameSystemCard(system) {
  const card = document.createElement('div');
  card.className = 'gb-system-card';
  card.dataset.gbSystem = system.id;
  card.dataset.status = system.status;

  const info = document.createElement('div');
  info.className = 'gb-system-info';
  info.append(
    createTextElement('strong', '', system.name),
    createTextElement('span', '', system.detail)
  );

  const controls = document.createElement('div');
  controls.className = 'gb-system-controls';
  const badge = createTextElement('span', 'gb-system-badge', system.statusText);
  const button = createSmallButton(system.actionLabel, async () => {
    if (system.script) await installScript(system.script);
    if (system.component) await markComponent(system.component);
    lastGameSystemsSignature = '';
    updateBuilderUi();
  }, { editOnly: true, action: system.script ? 'install game systems' : 'tag gameplay components' });
  button.dataset.gbAction = 'install-system';
  button.dataset.gbSystemAction = system.id;
  controls.append(badge, button);
  card.append(info, controls);
  return card;
}

function getAssetBaseUrl() {
  if (typeof window._crateAssetBaseUrl === 'function') {
    const base = window._crateAssetBaseUrl();
    if (base) return base;
  }
  const meta = document.querySelector('meta[name="crate-asset-base"],meta[name="crateship-asset-base"]');
  return (meta?.getAttribute('content') || window.CRATESHIP_ASSET_BASE_URL || '').replace(/\/+$/, '');
}

function shortAssetValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > 18 ? text.slice(0, 12) + '...' + text.slice(-4) : text;
}

async function refreshAssetManifest(force = false) {
  if (assetManifestLoadStarted && !force) return;
  assetManifestLoadStarted = true;
  const base = getAssetBaseUrl();
  window._crateAssetManifestStatus = { status: 'loading', base };
  renderAssetPackStatus();
  try {
    if (!base) throw new Error('No asset host configured');
    const response = await fetch(new URL('/asset-manifest.json', base + '/').href, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const manifest = await response.json();
    window._crateAssetManifest = manifest;
    window._assetManifestVersion = manifest.version || '';
    window._crateAssetManifestStatus = { status: 'loaded', base, checkedAt: Date.now() };
  } catch (err) {
    window._crateAssetManifestStatus = { status: 'failed', base, error: err?.message || String(err || 'Asset manifest failed') };
  }
  lastAssetPackSignature = '';
  renderAssetPackStatus();
  updateProjectStatus();
}

function getCurrentMode() {
  const bridgeMode = window._engineBridge?.getMode?.();
  const raw = bridgeMode || window._engine?.mode || window._currentMode || (window._engine?.playMode ? 'play' : 'edit');
  const mode = String(raw || 'edit').toLowerCase();
  return mode === 'view' ? 'explore' : mode;
}

function isEditMode() {
  const bridgeValue = window._engineBridge?.isEditMode?.();
  if (bridgeValue === false) return false;
  return getCurrentMode() === 'edit';
}

function requireEditAction(action) {
  if (isEditMode()) return true;
  notify('Switch to Edit mode to ' + action);
  updateEditorControlState();
  return false;
}

function markEditOnly(el, action) {
  if (!el) return el;
  el.dataset.gbEditOnly = 'true';
  el.dataset.gbEditAction = action || 'edit this';
  return el;
}

function formatModeLabel(mode) {
  if (mode === 'play') return 'Play';
  if (mode === 'explore') return 'Explore';
  return 'Edit';
}

function updateEditorControlState() {
  const edit = isEditMode();
  const panel = document.getElementById('game-builder-panel');
  if (panel) panel.dataset.editMode = edit ? 'true' : 'false';
  document.querySelectorAll('[data-gb-edit-only="true"]').forEach((el) => {
    el.disabled = !edit;
    el.setAttribute('aria-disabled', edit ? 'false' : 'true');
    if (!edit) {
      el.dataset.disabledMode = getCurrentMode();
      if (!el.dataset.originalTitle) el.dataset.originalTitle = el.title || '';
      el.title = 'Switch to Edit mode to ' + (el.dataset.gbEditAction || 'edit this');
    } else {
      delete el.dataset.disabledMode;
      if (el.dataset.originalTitle !== undefined) {
        el.title = el.dataset.originalTitle;
        delete el.dataset.originalTitle;
      }
    }
  });
}

function updateModeControls() {
  const mode = getCurrentMode();
  document.querySelectorAll('[data-gb-mode]').forEach((button) => {
    const selected = button.dataset.gbMode === mode;
    button.dataset.selected = selected ? 'true' : 'false';
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  updateEditorControlState();
}

function setBuilderMode(mode) {
  const normalized = mode === 'view' ? 'explore' : mode;
  const setter = window._setMode || window._engineBridge?.setMode || window._engine?.setMode;
  if (setter) setter(normalized);
  else if (normalized === 'play') window._engineBridge?.enterPlayMode?.();
  else window._engineBridge?.exitPlayMode?.();
  updateModeControls();
  updateBuilderUi();
  updateStats();
}

function createModeSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Mode';
  const row = document.createElement('div');
  row.className = 'gb-mode-row';
  [
    { mode: 'edit', label: 'Edit', title: 'Select, move, inspect, and change objects' },
    { mode: 'explore', label: 'Explore', title: 'Move the camera without selecting objects' },
    { mode: 'play', label: 'Play', title: 'Run the game without editor interactions' },
  ].forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gb-mode-btn';
    button.dataset.gbMode = item.mode;
    button.textContent = item.label;
    button.title = item.title;
    button.addEventListener('click', () => setBuilderMode(item.mode));
    row.appendChild(button);
  });
  section.append(heading, row);
  return section;
}

function createPlacementSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Placement';
  const status = document.createElement('div');
  status.id = 'gb-placement-status';
  status.className = 'gb-placement-status';
  section.append(heading, status);
  return section;
}

function createProjectSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-project';
  const heading = document.createElement('h3');
  heading.textContent = 'Project';
  const status = document.createElement('div');
  status.id = 'gb-project-status';
  status.className = 'gb-project-status';
  const grid = document.createElement('div');
  grid.className = 'gb-grid gb-project-grid';
  PROJECT_ACTIONS.forEach((preset) => grid.appendChild(createButton(preset)));
  section.append(heading, status, grid);
  return section;
}

function createAssetPackSection() {
  const section = document.createElement('section');
  section.className = 'gb-section';
  section.id = 'gb-asset-pack';
  const heading = document.createElement('h3');
  heading.textContent = 'Asset Pack';
  const status = document.createElement('div');
  status.id = 'gb-asset-pack-status';
  status.className = 'gb-asset-pack-status';
  const refresh = createSmallButton('Check', () => refreshAssetManifest(true), { action: 'check assets' });
  refresh.dataset.gbAction = 'asset-pack-refresh';
  section.append(heading, status, refresh);
  return section;
}

function formatPosition(obj) {
  if (!obj?.position) return 'No position';
  return 'x ' + obj.position.x.toFixed(1) + ' y ' + obj.position.y.toFixed(1) + ' z ' + obj.position.z.toFixed(1);
}

function formatPlacementPosition(state) {
  if (!Number.isFinite(state?.x) || !Number.isFinite(state?.z)) return '';
  const y = Number.isFinite(state.y) ? ' y ' + state.y.toFixed(1) : '';
  return 'x ' + state.x.toFixed(1) + y + ' z ' + state.z.toFixed(1);
}

function renderPlacementStatus() {
  const box = document.getElementById('gb-placement-status');
  if (!box) return;
  const state = window._lastAssetPlacement || {};
  const target = getTargetObject();
  const fallbackName = target ? getObjectName(target, 0) : '';
  const status = state.status || (fallbackName ? 'selected' : 'ready');
  const name = state.name || fallbackName || 'Ready';
  const position = formatPlacementPosition(state) || (target ? formatPosition(target) : '');
  const signature = [status, name, position, state.objectId || '', state.updatedAt || ''].join('|');
  if (signature === lastPlacementSignature) return;
  lastPlacementSignature = signature;
  box.dataset.status = status;
  box.innerHTML = '';
  const title = createTextElement('strong', '', status === 'loading' ? 'Placing' : status === 'failed' ? 'Placement failed' : status === 'blocked' ? 'Placement blocked' : status === 'placed' ? 'Placed' : 'Ready');
  const item = createTextElement('span', '', name);
  box.append(title, item);
  if (position) box.appendChild(createTextElement('span', '', position));
  if (state.error) box.appendChild(createTextElement('span', 'gb-placement-error', state.error));
}

function renderAssetPackStatus() {
  const box = document.getElementById('gb-asset-pack-status');
  if (!box) return;
  const state = window._crateAssetManifestStatus || {};
  const manifest = window._crateAssetManifest || {};
  const base = state.base || getAssetBaseUrl() || 'local';
  const version = manifest.version || window._assetManifestVersion || '';
  const integrity = manifest.integrity || {};
  const signature = [
    state.status || '',
    base,
    version,
    integrity.checkedModels || '',
    integrity.catalogReferences || '',
    state.error || '',
  ].join('|');
  if (signature === lastAssetPackSignature) return;
  lastAssetPackSignature = signature;
  box.dataset.status = state.status || (version ? 'loaded' : 'idle');
  box.innerHTML = '';
  if (state.status === 'failed') {
    box.append(createTextElement('strong', '', 'Asset host issue'), createTextElement('span', 'gb-placement-error', state.error || 'Manifest unavailable'));
    return;
  }
  if (state.status === 'loading') {
    box.append(createTextElement('strong', '', 'Checking assets'), createTextElement('span', '', shortAssetValue(base)));
    return;
  }
  box.append(
    createTextElement('strong', '', version ? 'Assets ' + shortAssetValue(version) : 'Assets ready'),
    createTextElement('span', '', shortAssetValue(base)),
  );
  if (integrity.checkedModels || integrity.catalogReferences) {
    box.appendChild(createTextElement('span', '', (integrity.checkedModels || 0) + ' models | ' + (integrity.catalogReferences || 0) + ' refs'));
  }
}

function formatComponentList(obj) {
  const components = Object.keys(obj?.userData?.gbComponents || {});
  if (obj?.userData?.hasPhysics && !components.includes('physics')) components.push('physics');
  return components.length ? components.join(', ') : 'No components';
}

function createTextElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function createField(label, input) {
  const row = document.createElement('label');
  row.className = 'gb-field';
  row.append(createTextElement('span', '', label), input);
  return row;
}

function createNumberInput(value, step, onChange, options = {}) {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step || 0.1);
  input.value = Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '0';
  if (options.editOnly) markEditOnly(input, options.action || 'edit values');
  input.addEventListener('change', () => {
    if (options.editOnly && !requireEditAction(options.action || 'edit values')) {
      input.value = Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '0';
      return;
    }
    onChange(parseNumber(input.value, value || 0));
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
  return input;
}

function createTextInput(value, onChange, options = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value == null ? '' : String(value);
  if (options.editOnly) markEditOnly(input, options.action || 'edit text');
  input.addEventListener('change', () => {
    if (options.editOnly && !requireEditAction(options.action || 'edit text')) {
      input.value = value == null ? '' : String(value);
      return;
    }
    onChange(input.value.trim());
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
  return input;
}

function createSmallButton(label, onClick, options = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gb-small-btn';
  button.textContent = label;
  if (options.editOnly) markEditOnly(button, options.action || 'edit this');
  button.addEventListener('click', () => {
    if (options.editOnly && !requireEditAction(options.action || 'edit this')) return;
    onClick();
  });
  return button;
}

function updateInspectorObject(target) {
  window._lastPlacedObj = target;
  lastSceneSignature = '';
  updateStats();
  renderSceneList();
}

function renderComponentEditor(container, obj, componentName, data) {
  const card = document.createElement('div');
  card.className = 'gb-component-card';

  const head = document.createElement('div');
  head.className = 'gb-component-head';
  head.appendChild(createTextElement('strong', '', formatComponentLabel(componentName)));
  head.appendChild(createSmallButton('Remove', () => {
    delete obj.userData.gbComponents[componentName];
    lastInspectorSignature = '';
    notify(formatComponentLabel(componentName) + ' removed');
    updateBuilderUi();
  }, { editOnly: true, action: 'remove components' }));
  card.appendChild(head);

  const fields = COMPONENT_FIELDS[componentName] || Object.keys(data || {}).map((key) => ({ key, label: formatComponentLabel(key), kind: typeof data[key] === 'number' ? 'number' : 'text' }));
  fields.forEach((field) => {
    const value = data[field.key];
    const input = field.kind === 'number'
      ? createNumberInput(Number(value), field.step || 0.1, (next) => {
          data[field.key] = next;
          updateInspectorObject(obj);
        }, { editOnly: true, action: 'edit component fields' })
      : createTextInput(value, (next) => {
          data[field.key] = next;
          updateInspectorObject(obj);
        }, { editOnly: true, action: 'edit component fields' });
    card.appendChild(createField(field.label, input));
  });

  container.appendChild(card);
}

async function saveSelectedBlueprint() {
  if (!requireEditAction('save blueprints')) return;
  const target = selectObject(getTargetObject());
  if (!target) return;
  const components = cloneJson(target.userData?.gbComponents || {});
  const nameInput = document.getElementById('gb-blueprint-name');
  const name = (nameInput?.value || '').trim() || getObjectName(target, 0) + ' Blueprint';
  const blueprints = readBlueprints();
  const id = 'gbp_' + Date.now().toString(36);
  blueprints.unshift({
    id,
    name,
    components,
    interactable: !!target.userData?.interactable,
    interactLabel: target.userData?.interactLabel || '',
    createdAt: Date.now(),
  });
  writeBlueprints(blueprints);
  notify('Blueprint saved: ' + name);
  renderBlueprintList();
}

async function applyBlueprint(id) {
  if (!requireEditAction('apply blueprints')) return;
  const target = selectObject(getTargetObject());
  const blueprint = readBlueprints().find((item) => item.id === id);
  if (!target || !blueprint) return;
  target.userData = target.userData || {};
  target.userData.gbComponents = cloneJson(blueprint.components || {});
  if (blueprint.interactable) target.userData.interactable = true;
  if (blueprint.interactLabel) target.userData.interactLabel = blueprint.interactLabel;
  await ensureRuntimeForComponents(target.userData.gbComponents);
  lastInspectorSignature = '';
  notify('Applied blueprint: ' + blueprint.name);
  updateBuilderUi();
}

function deleteBlueprint(id) {
  if (!requireEditAction('delete blueprints')) return;
  const blueprints = readBlueprints().filter((item) => item.id !== id);
  writeBlueprints(blueprints);
  notify('Blueprint deleted');
  renderBlueprintList();
}

function renderInspector(options = {}) {
  const inspector = document.getElementById('gb-inspector');
  if (!inspector) return;
  if (!options.force && document.activeElement?.closest?.('#gb-inspector')) return;
  const target = getTargetObject();
  const edit = isEditMode();
  const signature = target ? [
    edit ? 'edit' : 'readonly',
    target.uuid || target.id || 'object',
    getObjectName(target, 0),
    target.position?.x?.toFixed(2),
    target.position?.y?.toFixed(2),
    target.position?.z?.toFixed(2),
    target.rotation?.y?.toFixed(2),
    target.scale?.x?.toFixed(2),
    JSON.stringify(target.userData?.gbComponents || {}),
  ].join('|') : 'empty';
  if (signature === lastInspectorSignature) return;
  lastInspectorSignature = signature;
  inspector.innerHTML = '';

  if (!target) {
    inspector.appendChild(createTextElement('div', 'gb-empty', 'Select an object from the scene list to edit game behavior.'));
    return;
  }

  if (!edit) {
    inspector.appendChild(createTextElement('div', 'gb-readonly-note', 'Read-only in ' + formatModeLabel(getCurrentMode()) + '. Switch to Edit to change this object.'));
  }

  const summary = document.createElement('div');
  summary.className = 'gb-inspector-summary';
  const title = createTextElement('strong', '', getObjectName(target, 0));
  const meta = createTextElement('span', '', formatPosition(target));
  summary.append(title, meta);
  inspector.appendChild(summary);

  inspector.appendChild(createField('Name', createTextInput(getObjectName(target, 0), (next) => {
    target.userData.name = next || getObjectName(target, 0);
    updateInspectorObject(target);
  }, { editOnly: true, action: 'rename objects' })));

  const transformGrid = document.createElement('div');
  transformGrid.className = 'gb-transform-grid';
  transformGrid.append(
    createField('X', createNumberInput(target.position.x, 0.1, (next) => { target.position.x = next; updateInspectorObject(target); }, { editOnly: true, action: 'move objects' })),
    createField('Y', createNumberInput(target.position.y, 0.1, (next) => { target.position.y = next; updateInspectorObject(target); }, { editOnly: true, action: 'move objects' })),
    createField('Z', createNumberInput(target.position.z, 0.1, (next) => { target.position.z = next; updateInspectorObject(target); }, { editOnly: true, action: 'move objects' })),
    createField('Rot Y', createNumberInput(target.rotation?.y || 0, 0.1, (next) => { target.rotation.y = next; updateInspectorObject(target); }, { editOnly: true, action: 'rotate objects' })),
    createField('Scale', createNumberInput(target.scale?.x || 1, 0.05, (next) => {
      const scale = Math.max(0.01, next);
      target.scale.setScalar(scale);
      updateInspectorObject(target);
    }, { editOnly: true, action: 'scale objects' }))
  );
  inspector.appendChild(transformGrid);

  const actionRow = document.createElement('div');
  actionRow.className = 'gb-action-row';
  actionRow.append(
    createSmallButton('Focus', () => focusObject(target)),
    createSmallButton('Clone', () => duplicateTarget(target), { editOnly: true, action: 'clone objects' }),
    createSmallButton('Delete', () => deleteTarget(target), { editOnly: true, action: 'delete objects' })
  );
  inspector.appendChild(actionRow);

  const components = target.userData?.gbComponents || {};
  const componentNames = Object.keys(components);
  const componentWrap = document.createElement('div');
  componentWrap.className = 'gb-component-editor';
  if (!componentNames.length) {
    componentWrap.appendChild(createTextElement('div', 'gb-empty', 'No behavior components yet. Add one above.'));
  } else {
    componentNames.forEach((name) => renderComponentEditor(componentWrap, target, name, components[name]));
  }
  inspector.appendChild(componentWrap);
}

function renderBlueprintList() {
  const list = document.getElementById('gb-blueprint-list');
  if (!list) return;
  if (document.activeElement?.closest?.('#gb-blueprints')) return;
  const blueprints = readBlueprints();
  const signature = blueprints.map((item) => [item.id, item.name, JSON.stringify(item.components || {})].join(':')).join('|') || 'empty';
  if (signature === lastBlueprintSignature) return;
  lastBlueprintSignature = signature;
  list.innerHTML = '';

  if (!blueprints.length) {
    list.appendChild(createTextElement('div', 'gb-empty', 'Save a selected object setup to reuse it on another object.'));
    return;
  }

  blueprints.slice(0, 8).forEach((blueprint) => {
    const row = document.createElement('div');
    row.className = 'gb-blueprint-row';
    const info = document.createElement('div');
    info.className = 'gb-blueprint-info';
    info.append(
      createTextElement('strong', '', blueprint.name),
      createTextElement('span', '', Object.keys(blueprint.components || {}).map(formatComponentLabel).join(', ') || 'No components')
    );
    const actions = document.createElement('div');
    actions.className = 'gb-scene-actions';
    actions.append(
      createSmallButton('Apply', () => applyBlueprint(blueprint.id), { editOnly: true, action: 'apply blueprints' }),
      createSmallButton('Delete', () => deleteBlueprint(blueprint.id), { editOnly: true, action: 'delete blueprints' })
    );
    row.append(info, actions);
    list.appendChild(row);
  });
}

function renderSceneList() {
  const list = document.getElementById('gb-scene-list');
  if (!list) return;
  const objects = getSceneObjects();
  const target = getTargetObject();
  const visibleObjects = objects.slice(-10).reverse();
  const signature = [
    objects.length,
    target?.uuid || 'none',
    ...visibleObjects.map((obj) => [
      obj.uuid || obj.id || obj.userData?.name || 'object',
      obj.position?.x?.toFixed(1),
      obj.position?.y?.toFixed(1),
      obj.position?.z?.toFixed(1),
      formatComponentList(obj),
    ].join(':')),
  ].join('|');
  if (signature === lastSceneSignature) return;
  lastSceneSignature = signature;
  list.innerHTML = '';

  if (!objects.length) {
    const empty = document.createElement('div');
    empty.className = 'gb-empty';
    empty.textContent = 'Build a world or add an asset to see scene objects here.';
    list.appendChild(empty);
    return;
  }

  visibleObjects.forEach((obj, index) => {
    const row = document.createElement('div');
    row.className = 'gb-scene-row';
    row.dataset.selected = obj === target ? 'true' : 'false';

    const main = document.createElement('button');
    main.className = 'gb-scene-main';
    main.type = 'button';
    main.title = 'Select object';
    markEditOnly(main, 'select objects');
    main.addEventListener('click', () => selectObject(obj));

    const name = document.createElement('span');
    name.className = 'gb-scene-name';
    name.textContent = getObjectName(obj, objects.length - index - 1);

    const meta = document.createElement('span');
    meta.className = 'gb-scene-meta';
    meta.textContent = formatPosition(obj) + ' | ' + formatComponentList(obj);

    const actions = document.createElement('div');
    actions.className = 'gb-scene-actions';

    const focus = document.createElement('button');
    focus.type = 'button';
    focus.textContent = 'View';
    focus.addEventListener('click', () => focusObject(obj));

    const clone = document.createElement('button');
    clone.type = 'button';
    clone.textContent = 'Clone';
    markEditOnly(clone, 'clone objects');
    clone.addEventListener('click', () => {
      if (!requireEditAction('clone objects')) return;
      duplicateTarget(obj);
    });

    main.append(name, meta);
    actions.append(focus, clone);
    row.append(main, actions);
    list.appendChild(row);
  });
}

function updateBuilderUi() {
  updateStats();
  updateModeControls();
  updateProjectStatus();
  renderPlacementStatus();
  renderAssetPackStatus();
  renderReadinessStatus();
  renderGameSystems();
  renderInspector();
  renderBlueprintList();
  renderSceneList();
  updateEditorControlState();
}

function setOpen(panel, toggle, open) {
  panel.dataset.open = open ? 'true' : 'false';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  localStorage.setItem(STORAGE_KEY, open ? 'true' : 'false');
  repositionLegacyButtons(open);
}

function repositionLegacyButtons(open) {
  ['ai-settings-btn', 'mp-lobby-btn', 'code-editor-btn'].forEach((id, index) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.left = open && !isSmallScreen() ? (350 + index * 46) + 'px' : (16 + index * 46) + 'px';
  });
}

function mount() {
  if (document.getElementById('game-builder-panel')) return;

  const style = document.createElement('style');
  style.textContent = `
    #game-builder-panel{position:fixed;top:72px;left:14px;bottom:50px;width:318px;z-index:12000;background:rgba(10,11,12,.94);border:1px solid #262b2e;border-radius:8px;box-shadow:0 16px 45px rgba(0,0,0,.45);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e9edf0;display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(14px);pointer-events:auto}
    #game-builder-panel[data-open="false"]{width:48px;bottom:auto;height:48px}
    #game-builder-panel[data-open="false"] .gb-body,#game-builder-panel[data-open="false"] .gb-title,#game-builder-panel[data-open="false"] #gb-stats{display:none}
    .gb-head{height:48px;display:flex;align-items:center;gap:10px;padding:0 10px;border-bottom:1px solid #202427;flex-shrink:0}
    .gb-toggle{width:30px;height:30px;border:1px solid #30373b;background:#151819;color:#f0f0f0;border-radius:6px;cursor:pointer;font-weight:800}
    .gb-title{display:flex;flex-direction:column;min-width:0}
    .gb-title strong{font-size:13px;line-height:16px}
    .gb-title span{font-size:11px;color:#8a9298;line-height:14px}
    #gb-stats{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;justify-content:flex-end}
    #gb-stats span{font-size:10px;color:#aeb7bd;background:#151819;border:1px solid #272c2f;border-radius:999px;padding:3px 6px;white-space:nowrap}
    .gb-body{display:flex;flex-direction:column;gap:10px;overflow:auto;padding:10px}
    .gb-section{border:1px solid #20262a;border-radius:8px;overflow:hidden;background:#0d0f10}
    .gb-section h3{margin:0;padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0;color:#98a2a9;border-bottom:1px solid #20262a;background:#121516}
    .gb-mode-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px}
    .gb-mode-btn{height:32px;border:1px solid #2a3237;background:#161a1c;color:#dfe6ea;border-radius:6px;font-size:12px;cursor:pointer}
    .gb-mode-btn:hover{border-color:#4a9eff;color:#fff}
    .gb-mode-btn[data-selected="true"]{border-color:#4a9eff;background:#102033;color:#fff;font-weight:700}
    .gb-mode-btn[data-gb-mode="edit"][data-selected="true"]{border-color:#d9572b;background:#211a16}
    .gb-mode-btn[data-gb-mode="play"][data-selected="true"]{border-color:#38a169;background:#102318}
    #game-builder-panel[data-edit-mode="false"] .gb-section:has([data-gb-edit-only="true"]) h3::after{content:"Read only";float:right;text-transform:none;font-weight:600;color:#75808a}
    [data-gb-edit-only="true"]:disabled{opacity:.42!important;cursor:not-allowed!important}
    .gb-readonly-note{margin-bottom:8px;border:1px solid #374151;background:#111827;color:#c7d2fe;border-radius:7px;padding:7px 8px;font-size:11px;line-height:15px}
    .gb-placement-status{display:flex;flex-direction:column;gap:3px;margin:8px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px;min-height:52px}
    .gb-placement-status strong{font-size:12px;line-height:16px;color:#eef2f3}
    .gb-placement-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-placement-status[data-status="placed"]{border-color:#2f6f44;background:#101a13}
    .gb-placement-status[data-status="loading"]{border-color:#4a6f9c;background:#101722}
    .gb-placement-status[data-status="failed"],.gb-placement-status[data-status="blocked"]{border-color:#7f2d2d;background:#211313}
    .gb-placement-error{color:#ff9b9b!important}
    .gb-asset-pack-status{display:flex;flex-direction:column;gap:3px;margin:8px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px;min-height:52px}
    .gb-asset-pack-status strong{font-size:12px;line-height:16px;color:#eef2f3}
    .gb-asset-pack-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-asset-pack-status[data-status="loaded"]{border-color:#2f6f44;background:#101a13}
    .gb-asset-pack-status[data-status="loading"]{border-color:#4a6f9c;background:#101722}
    .gb-asset-pack-status[data-status="failed"]{border-color:#7f2d2d;background:#211313}
    #gb-asset-pack .gb-small-btn{margin:0 8px 8px;width:calc(100% - 16px)}
    .gb-readiness-status{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 8px 6px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-readiness-status strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-readiness-status span{font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap}
    .gb-readiness-status[data-status="ready"]{border-color:#2f6f44;background:#101a13}
    .gb-readiness-status[data-status="warn"]{border-color:#725a21;background:#1c1710}
    .gb-readiness-status[data-status="blocked"]{border-color:#7f2d2d;background:#211313}
    .gb-readiness-list{display:flex;flex-direction:column;gap:5px;padding:0 8px 8px}
    .gb-readiness-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #20262a;background:#101213;border-radius:6px;padding:6px 7px}
    .gb-readiness-row span{font-size:10px;line-height:14px;color:#8d979e}
    .gb-readiness-row strong{font-size:10px;line-height:14px;color:#dfe6ea;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-systems-list{display:flex;flex-direction:column;gap:7px;padding:8px}
    .gb-system-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-system-card[data-status="installed"]{border-color:#2f6f44;background:#101a13}
    .gb-system-card[data-status="needs-object"]{border-color:#725a21;background:#1c1710}
    .gb-system-info{min-width:0;display:flex;flex-direction:column;gap:2px}
    .gb-system-info strong{font-size:12px;line-height:16px;color:#eef2f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-system-info span{font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-system-controls{display:flex;align-items:center;gap:6px}
    .gb-system-badge{max-width:74px;font-size:10px;line-height:14px;color:#aeb7bd;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-system-controls .gb-small-btn{width:82px}
    .gb-project-status{padding:0 8px 7px;color:#8d979e;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-project-grid{padding-top:0}
    .gb-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px}
    .gb-preset{height:34px;border:1px solid #2a3237;background:#161a1c;color:#eef2f3;border-radius:6px;font-size:12px;cursor:pointer;text-align:left;padding:0 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-preset:hover{border-color:#d9572b;background:#211a16}
    .gb-preset:disabled{opacity:.55;cursor:progress}
    .gb-component-btn{border-color:#354044}
    .gb-scene-list{display:flex;flex-direction:column;gap:6px;padding:8px;max-height:220px;overflow:auto}
    .gb-empty{font-size:12px;line-height:16px;color:#8d979e;padding:4px 2px}
    .gb-scene-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;border:1px solid #20262a;border-radius:7px;background:#121516;padding:5px}
    .gb-scene-row[data-selected="true"]{border-color:#d9572b;background:#1c1714}
    .gb-scene-main{min-width:0;border:0;background:transparent;color:#eef2f3;text-align:left;cursor:pointer;padding:2px 4px}
    .gb-scene-name{display:block;font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-scene-meta{display:block;font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-scene-actions{display:flex;gap:4px}
    .gb-scene-actions button,.gb-small-btn{height:28px;border:1px solid #2a3237;background:#161a1c;color:#dfe6ea;border-radius:6px;font-size:11px;cursor:pointer;padding:0 7px}
    .gb-scene-actions button:hover,.gb-small-btn:hover{border-color:#d9572b;color:#fff}
    .gb-inspector{display:flex;flex-direction:column;gap:8px;padding:8px}
    .gb-inspector-summary{display:flex;flex-direction:column;gap:2px;border:1px solid #20262a;background:#121516;border-radius:7px;padding:8px}
    .gb-inspector-summary strong{font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-inspector-summary span{font-size:10px;color:#8d979e;line-height:14px}
    .gb-field{display:flex;flex-direction:column;gap:4px;font-size:10px;line-height:12px;color:#8d979e}
    .gb-field input{min-width:0;height:28px;border:1px solid #2a3237;background:#0b0d0e;color:#eef2f3;border-radius:6px;padding:0 7px;font:inherit;font-size:12px}
    .gb-field input:focus{outline:1px solid #d9572b;border-color:#d9572b}
    .gb-transform-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    .gb-transform-grid .gb-field:nth-child(4),.gb-transform-grid .gb-field:nth-child(5){grid-column:span 1}
    .gb-action-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
    .gb-action-row .gb-small-btn{width:100%;height:30px}
    .gb-component-editor{display:flex;flex-direction:column;gap:7px}
    .gb-component-card{border:1px solid #20262a;background:#121516;border-radius:7px;padding:7px;display:flex;flex-direction:column;gap:6px}
    .gb-component-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .gb-component-head strong{font-size:12px;color:#eef2f3;text-transform:capitalize}
    .gb-blueprint-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:8px;border-bottom:1px solid #20262a}
    .gb-blueprint-tools input{min-width:0;height:30px;border:1px solid #2a3237;background:#0b0d0e;color:#eef2f3;border-radius:6px;padding:0 8px;font-size:12px}
    .gb-blueprint-list{display:flex;flex-direction:column;gap:6px;padding:8px}
    .gb-blueprint-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;border:1px solid #20262a;border-radius:7px;background:#121516;padding:6px}
    .gb-blueprint-info{min-width:0;display:flex;flex-direction:column;gap:2px}
    .gb-blueprint-info strong{font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gb-blueprint-info span{font-size:10px;line-height:14px;color:#8d979e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media (max-width:900px){#game-builder-panel{top:70px;left:8px;right:8px;bottom:auto;width:auto;max-height:48vh}#game-builder-panel[data-open="false"]{width:48px;right:auto}.gb-grid{grid-template-columns:1fr 1fr 1fr}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.id = 'game-builder-panel';
  panel.setAttribute('aria-label', 'Game Builder');

  const savedOpen = localStorage.getItem(STORAGE_KEY);
  const open = savedOpen ? savedOpen === 'true' : !isSmallScreen();
  panel.dataset.open = open ? 'true' : 'false';

  const head = document.createElement('div');
  head.className = 'gb-head';

  const toggle = document.createElement('button');
  toggle.className = 'gb-toggle';
  toggle.type = 'button';
  toggle.textContent = '+';
  toggle.setAttribute('aria-label', 'Toggle Game Builder');
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.addEventListener('click', () => {
    const nextOpen = panel.dataset.open !== 'true';
    setOpen(panel, toggle, nextOpen);
  });

  const title = document.createElement('div');
  title.className = 'gb-title';
  title.innerHTML = '<strong>Game Builder</strong><span>Presets and systems</span>';

  const stats = document.createElement('div');
  stats.id = 'gb-stats';

  head.append(toggle, title, stats);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'gb-body';
  body.appendChild(createModeSection());
  body.appendChild(createPlacementSection());
  body.appendChild(createProjectSection());
  body.appendChild(createAssetPackSection());
  body.appendChild(createReadinessSection());
  body.appendChild(createGameSystemsSection());

  const appendBuilderToolSections = () => {
    const componentSection = document.createElement('section');
    componentSection.className = 'gb-section';
    const componentHeading = document.createElement('h3');
    componentHeading.textContent = 'Components';
    const componentGrid = document.createElement('div');
    componentGrid.className = 'gb-grid';
    COMPONENT_PRESETS.forEach((preset) => componentGrid.appendChild(createComponentButton(preset)));
    componentSection.append(componentHeading, componentGrid);
    body.appendChild(componentSection);

    const inspectorSection = document.createElement('section');
    inspectorSection.className = 'gb-section';
    const inspectorHeading = document.createElement('h3');
    inspectorHeading.textContent = 'Inspector';
    const inspector = document.createElement('div');
    inspector.id = 'gb-inspector';
    inspector.className = 'gb-inspector';
    inspectorSection.append(inspectorHeading, inspector);
    body.appendChild(inspectorSection);

    const blueprintSection = document.createElement('section');
    blueprintSection.className = 'gb-section';
    blueprintSection.id = 'gb-blueprints';
    const blueprintHeading = document.createElement('h3');
    blueprintHeading.textContent = 'Blueprints';
    const blueprintTools = document.createElement('div');
    blueprintTools.className = 'gb-blueprint-tools';
    const blueprintName = document.createElement('input');
    blueprintName.id = 'gb-blueprint-name';
    blueprintName.placeholder = 'Blueprint name';
    markEditOnly(blueprintName, 'save blueprints');
    const saveBlueprint = createSmallButton('Save', () => saveSelectedBlueprint(), { editOnly: true, action: 'save blueprints' });
    blueprintTools.append(blueprintName, saveBlueprint);
    const blueprintList = document.createElement('div');
    blueprintList.id = 'gb-blueprint-list';
    blueprintList.className = 'gb-blueprint-list';
    blueprintSection.append(blueprintHeading, blueprintTools, blueprintList);
    body.appendChild(blueprintSection);

    const sceneSection = document.createElement('section');
    sceneSection.className = 'gb-section';
    const sceneHeading = document.createElement('h3');
    sceneHeading.textContent = 'Scene';
    const sceneList = document.createElement('div');
    sceneList.id = 'gb-scene-list';
    sceneList.className = 'gb-scene-list';
    sceneSection.append(sceneHeading, sceneList);
    body.appendChild(sceneSection);
  };

  PRESET_GROUPS.forEach((group, index) => {
    const section = document.createElement('section');
    section.className = 'gb-section';
    const heading = document.createElement('h3');
    heading.textContent = group.label;
    const grid = document.createElement('div');
    grid.className = 'gb-grid';
    group.presets.forEach((preset) => grid.appendChild(createButton(preset)));
    section.append(heading, grid);
    body.appendChild(section);
    if (index === 0) appendBuilderToolSections();
  });

  panel.appendChild(body);
  document.body.appendChild(panel);

  repositionLegacyButtons(open);
  window._refreshGameBuilderMode = () => {
    lastInspectorSignature = '';
    updateModeControls();
    updateStats();
    updateProjectStatus();
    renderAssetPackStatus();
    renderReadinessStatus();
    renderGameSystems();
    renderInspector({ force: true });
    renderBlueprintList();
    renderSceneList();
    updateEditorControlState();
  };
  window._refreshGameBuilderPlacement = () => {
    lastPlacementSignature = '';
    renderPlacementStatus();
    renderReadinessStatus();
    renderGameSystems();
    renderInspector({ force: true });
    renderSceneList();
  };
  window.addEventListener('crate:asset-placement', window._refreshGameBuilderPlacement);
  updateBuilderUi();
  refreshAssetManifest();
  setInterval(updateBuilderUi, 1200);
  window.addEventListener('resize', () => repositionLegacyButtons(panel.dataset.open === 'true'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
