const STORAGE_KEY = 'crate-game-builder-open';

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
    description: 'Runs pickup, damage, objective, and motion tags from Game Builder.',
    code: `state.gbRuntime = state.gbRuntime || { health: 100, score: 0, objectives: {} };

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
  getComponentHud().innerHTML =
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>HP</span><span>' + Math.round(state.gbRuntime.health) + '</span></div>' +
    '<div style="height:7px;background:#1c2021;border-radius:6px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:' + Math.max(0, Math.min(100, state.gbRuntime.health)) + '%;background:#59d987"></div></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Score</span><span>' + state.gbRuntime.score + '</span></div>' +
    '<div style="color:#80b7ff;margin-bottom:5px;font-weight:700">Objectives</div>' + objectives;
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
      { label: 'Play Mode', command: 'play' },
      { label: 'Save', action: 'save' },
      { label: 'Export', action: 'export' },
      { label: 'Share', command: 'share world' },
      { label: 'Scripts', action: 'scripts' },
      { label: 'Settings', action: 'settings' },
    ],
  },
];

const COMPONENT_PRESETS = [
  { label: 'Collider', component: 'collider', title: 'Tag the current object as solid scene geometry.' },
  { label: 'Pickup', component: 'pickup', title: 'Make the current object collectible.' },
  { label: 'Damage', component: 'damage', title: 'Make the current object damage the player nearby.' },
  { label: 'Objective', component: 'objective', title: 'Make the current object complete an objective when reached.' },
  { label: 'Spin', component: 'spin', title: 'Give the current object a runtime spin behavior.' },
  { label: 'Float', component: 'float', title: 'Give the current object a gentle floating behavior.' },
  { label: 'Spawn Pt', component: 'spawnPoint', title: 'Mark the current object as a player or enemy spawn point.' },
  { label: 'Focus', action: 'focus', title: 'Move the camera toward the current object.' },
];

let lastSceneSignature = '';

function isSmallScreen() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function notify(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.log('[Game Builder]', message);
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

function selectObject(obj) {
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
  selectObject(target);
  notify('Focused: ' + getObjectName(target, 0));
}

function getComponentStore(obj) {
  obj.userData = obj.userData || {};
  obj.userData.gbComponents = obj.userData.gbComponents || {};
  return obj.userData.gbComponents;
}

async function ensureComponentRuntime() {
  await installScript('components');
}

async function markComponent(component) {
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
  if (action === 'assets') {
    if (window._showCategoryPicker) return window._showCategoryPicker();
    return runCommand('browse');
  }
  if (action === 'save') {
    if (window._showSaveLoad) return window._showSaveLoad();
    return runCommand('save world');
  }
  if (action === 'export') {
    if (window._showImportExport) return window._showImportExport('export');
    return runCommand('export world');
  }
  if (action === 'scripts') {
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
  button.title = preset.command || preset.label;
  button.addEventListener('click', async () => {
    setBusy(button, true);
    if (preset.command) await runCommand(preset.command);
    else if (preset.script) await installScript(preset.script);
    else if (preset.action) await runAction(preset.action);
    setBusy(button, false);
    updateStats();
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
  button.addEventListener('click', async () => {
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
}

function updateStats() {
  const stats = document.getElementById('gb-stats');
  if (!stats) return;
  const objects = getSceneObjects();
  const objectCount = objects.length;
  const componentCount = objects.reduce((count, obj) => count + Object.keys(obj.userData?.gbComponents || {}).length, 0);
  const scriptCount = Array.isArray(window._userScripts) ? window._userScripts.length : 0;
  const mode = window._engine?.playMode ? 'Play' : 'Edit';
  stats.innerHTML = '<span>' + objectCount + ' objects</span><span>' + componentCount + ' components</span><span>' + scriptCount + ' scripts</span><span>' + mode + '</span>';
}

function formatPosition(obj) {
  if (!obj?.position) return 'No position';
  return 'x ' + obj.position.x.toFixed(1) + ' y ' + obj.position.y.toFixed(1) + ' z ' + obj.position.z.toFixed(1);
}

function formatComponentList(obj) {
  const components = Object.keys(obj?.userData?.gbComponents || {});
  if (obj?.userData?.hasPhysics && !components.includes('physics')) components.push('physics');
  return components.length ? components.join(', ') : 'No components';
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
    clone.addEventListener('click', () => {
      selectObject(obj);
      window._duplicateSelected?.();
      updateBuilderUi();
    });

    main.append(name, meta);
    actions.append(focus, clone);
    row.append(main, actions);
    list.appendChild(row);
  });
}

function updateBuilderUi() {
  updateStats();
  renderSceneList();
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
    .gb-scene-actions button{height:28px;border:1px solid #2a3237;background:#161a1c;color:#dfe6ea;border-radius:6px;font-size:11px;cursor:pointer;padding:0 7px}
    .gb-scene-actions button:hover{border-color:#d9572b;color:#fff}
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
  updateBuilderUi();
  setInterval(updateBuilderUi, 1200);
  window.addEventListener('resize', () => repositionLegacyButtons(panel.dataset.open === 'true'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
