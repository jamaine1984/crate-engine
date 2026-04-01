// ═══════════════════════════════════════════════════════════════
// CRATE ENGINE — SAVE/LOAD SYSTEM v1
// localStorage + export/import JSON scenes
// ═══════════════════════════════════════════════════════════════

const SAVE_KEY = 'crate_engine_saves';
const AUTO_KEY = 'crate_engine_autosave';
const MAX_SAVES = 20;

// ═══════════════════════════════════════════
// SERIALIZE: Scene → JSON
// ═══════════════════════════════════════════

export function serializeScene() {
  var e = window._engine;
  if (!e) return null;
  var objects = e.objects.map(function(obj) {
    return {
      name: obj.name || '',
      alias: obj.userData?.alias || obj.userData?.name || '',
      model: obj.userData?.modelPath || '',
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      userData: {
        alias: obj.userData?.alias,
        name: obj.userData?.name,
        modelPath: obj.userData?.modelPath,
        pickupData: obj.userData?.pickupData,
      }
    };
  });
  return {
    version: 1,
    timestamp: Date.now(),
    biome: window._currentBiome || '',
    objectCount: objects.length,
    objects: objects,
    camera: e.camera ? {
      position: { x: e.camera.position.x, y: e.camera.position.y, z: e.camera.position.z },
    } : null,
  };
}

// ═══════════════════════════════════════════
// DESERIALIZE: JSON → Scene
// ═══════════════════════════════════════════

export async function loadScene(data) {
  var e = window._engine;
  if (!e || !data?.objects) return 'No scene data';
  
  // Clear existing
  await e.exec('clear');
  
  // Set biome if present
  if (data.biome) {
    await e.exec('build a ' + data.biome);
    // Remove auto-generated objects, we'll place our saved ones
    // Actually the biome build sets ground/sky/fog which we want
  }
  
  // Place objects via exec (uses GLB loading pipeline)
  var placed = 0;
  for (var i = 0; i < data.objects.length; i++) {
    var obj = data.objects[i];
    var name = obj.alias || obj.name || '';
    if (!name || name === 'ground' || name === '_water' || name.startsWith('_')) continue;
    var cmd = 'add ' + name + ' at ' + obj.position.x.toFixed(1) + ' ' + obj.position.y.toFixed(1) + ' ' + obj.position.z.toFixed(1);
    await e.exec(cmd);
    placed++;
    // Apply rotation/scale to last placed object
    var objs = e.objects;
    var last = objs[objs.length - 1];
    if (last && obj.rotation) {
      last.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
    }
    if (last && obj.scale) {
      last.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
    }
  }
  
  return 'Loaded ' + placed + ' objects';
}

// ═══════════════════════════════════════════
// LOCAL STORAGE: Save Slots
// ═══════════════════════════════════════════

function getSaves() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function putSaves(saves) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saves));
  } catch (e) { console.warn('Save failed:', e); }
}

export function saveGame(name) {
  var scene = serializeScene();
  if (!scene) return 'Nothing to save';
  var saves = getSaves();
  
  // Check if name exists — overwrite
  var idx = saves.findIndex(function(s) { return s.name === name; });
  var entry = {
    name: name || 'Save ' + (saves.length + 1),
    timestamp: Date.now(),
    date: new Date().toLocaleString(),
    biome: scene.biome,
    objectCount: scene.objectCount,
    scene: scene,
  };
  
  if (idx >= 0) {
    saves[idx] = entry;
  } else {
    if (saves.length >= MAX_SAVES) saves.shift();
    saves.push(entry);
  }
  putSaves(saves);
  return '💾 Saved "' + entry.name + '" (' + scene.objectCount + ' objects)';
}

export async function loadGame(name) {
  var saves = getSaves();
  var save;
  if (typeof name === 'number') {
    save = saves[name];
  } else {
    save = saves.find(function(s) { return s.name.toLowerCase() === (name || '').toLowerCase(); });
  }
  if (!save) return '❌ Save not found. Type "list saves" to see available saves.';
  var result = await loadScene(save.scene);
  return '📂 Loaded "' + save.name + '" — ' + result;
}

export function deleteSave(name) {
  var saves = getSaves();
  var idx = saves.findIndex(function(s) { return s.name.toLowerCase() === (name || '').toLowerCase(); });
  if (idx < 0) return '❌ Save not found';
  var removed = saves.splice(idx, 1)[0];
  putSaves(saves);
  return '🗑️ Deleted "' + removed.name + '"';
}

export function listSaves() {
  var saves = getSaves();
  if (saves.length === 0) return '📁 No saves yet. Type "save [name]" to create one.';
  return saves.map(function(s, i) {
    return '  ' + (i + 1) + '. <strong>' + s.name + '</strong> — ' + s.objectCount + ' objects, ' + (s.biome || 'custom') + ' (' + s.date + ')';
  }).join('<br>');
}

// ═══════════════════════════════════════════
// AUTOSAVE: Every 5 minutes
// ═══════════════════════════════════════════

var _autoSaveInterval = null;

export function startAutosave(intervalMs) {
  if (_autoSaveInterval) clearInterval(_autoSaveInterval);
  _autoSaveInterval = setInterval(function() {
    var scene = serializeScene();
    if (scene && scene.objectCount > 0) {
      try {
        localStorage.setItem(AUTO_KEY, JSON.stringify({
          timestamp: Date.now(),
          date: new Date().toLocaleString(),
          scene: scene,
        }));
      } catch (e) {}
    }
  }, intervalMs || 300000); // 5 min default
}

export async function loadAutosave() {
  try {
    var raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return '❌ No autosave found';
    var data = JSON.parse(raw);
    var result = await loadScene(data.scene);
    return '📂 Loaded autosave from ' + data.date + ' — ' + result;
  } catch (e) { return '❌ Failed to load autosave'; }
}

// ═══════════════════════════════════════════
// EXPORT / IMPORT: File-based sharing
// ═══════════════════════════════════════════

export function exportScene() {
  var scene = serializeScene();
  if (!scene) return 'Nothing to export';
  var json = JSON.stringify(scene, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'crate-scene-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  return '📤 Scene exported! Check downloads.';
}

export function importScene() {
  return new Promise(function(resolve) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async function(e) {
      var file = e.target.files[0];
      if (!file) { resolve('❌ No file selected'); return; }
      try {
        var text = await file.text();
        var data = JSON.parse(text);
        var result = await loadScene(data);
        resolve('📥 Imported! ' + result);
      } catch (err) {
        resolve('❌ Invalid scene file');
      }
    };
    input.click();
  });
}

// Start autosave
startAutosave();

// Expose globally
window._saves = {
  save: saveGame,
  load: loadGame,
  list: listSaves,
  delete: deleteSave,
  export: exportScene,
  import: importScene,
  autosave: { load: loadAutosave },
  serialize: serializeScene,
};
