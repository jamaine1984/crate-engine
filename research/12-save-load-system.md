# 12 — Save/Load System: World State Persistence

> Players need to save their creations and come back to them

---

## What Needs Saving

For a game engine where users BUILD things, saving is critical:

```javascript
const SAVE_DATA = {
    version: 1,
    timestamp: Date.now(),
    
    // Player state
    player: {
        position: [x, y, z],
        rotation: [x, y, z],
        health: 100,
        stamina: 100,
        inventory: [...],
        equippedWeapons: { slot1: 'sword', slot2: 'bow' },
    },
    
    // World objects (everything the user placed)
    objects: [
        {
            id: 'obj_001',
            type: 'building',       // or 'npc', 'vehicle', 'prop'
            template: 'house_01',   // which prefab
            position: [x, y, z],
            rotation: [x, y, z],
            scale: [1, 1, 1],
            properties: {},         // custom per-object data
        },
    ],
    
    // Terrain modifications
    terrain: {
        type: 'island',
        seed: 12345,
        modifications: [], // player-made changes
    },
    
    // NPC states
    npcs: [
        { id: 'npc_001', position: [x, y, z], health: 80, state: 'patrol' },
    ],
    
    // Time of day, weather
    environment: {
        timeOfDay: 0.35,
        weather: 'clear',
    },
    
    // Game progress
    quests: {},
    flags: {},
};
```

---

## Serialization

```javascript
class SaveSystem {
    serialize(world) {
        const data = {
            version: SAVE_VERSION,
            timestamp: Date.now(),
            player: this.serializePlayer(world.player),
            objects: world.objects.map(o => this.serializeObject(o)),
            terrain: this.serializeTerrain(world.terrain),
            environment: {
                timeOfDay: world.dayNight.timeOfDay,
                weather: world.weather.current,
            },
        };
        return JSON.stringify(data);
    }
    
    serializeObject(obj) {
        return {
            id: obj.id,
            type: obj.type,
            template: obj.template,
            position: obj.mesh.position.toArray(),
            rotation: [obj.mesh.rotation.x, obj.mesh.rotation.y, obj.mesh.rotation.z],
            scale: obj.mesh.scale.toArray(),
            properties: obj.properties || {},
        };
    }
    
    // Save to localStorage
    saveLocal(slot, world) {
        const data = this.serialize(world);
        localStorage.setItem(`save_${slot}`, data);
        localStorage.setItem(`save_${slot}_meta`, JSON.stringify({
            name: slot,
            timestamp: Date.now(),
            thumbnail: this.captureThumbnail(),
        }));
    }
    
    // Save to server (for cloud saves)
    async saveCloud(userId, slot, world) {
        const data = this.serialize(world);
        const compressed = LZString.compressToUTF16(data); // compress large saves
        
        await fetch('/api/saves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, slot, data: compressed }),
        });
    }
    
    // Load
    async load(slot) {
        const raw = localStorage.getItem(`save_${slot}`);
        if (!raw) return null;
        
        const data = JSON.parse(raw);
        
        // Version migration
        if (data.version < SAVE_VERSION) {
            return this.migrate(data);
        }
        
        return data;
    }
    
    // Rebuild world from save
    async restore(data, world) {
        // Clear current world
        world.clear();
        
        // Restore terrain
        await world.generateTerrain(data.terrain);
        
        // Restore objects
        for (const objData of data.objects) {
            const obj = await world.spawnObject(objData.template, objData.type);
            obj.mesh.position.fromArray(objData.position);
            obj.mesh.rotation.set(...objData.rotation);
            obj.mesh.scale.fromArray(objData.scale);
            obj.properties = objData.properties;
        }
        
        // Restore player
        world.player.position.fromArray(data.player.position);
        world.player.health = data.player.health;
        
        // Restore environment
        world.dayNight.timeOfDay = data.environment.timeOfDay;
    }
    
    captureThumbnail() {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/jpeg', 0.5);
    }
}
```

---

## Auto-Save

```javascript
class AutoSave {
    constructor(saveSystem, interval = 60) { // every 60 seconds
        this.saveSystem = saveSystem;
        this.interval = interval;
        this.timer = 0;
        this.maxAutoSaves = 3; // rotating slots
        this.currentSlot = 0;
    }
    
    update(dt, world) {
        this.timer += dt;
        if (this.timer >= this.interval) {
            this.timer = 0;
            const slot = `autosave_${this.currentSlot}`;
            this.saveSystem.saveLocal(slot, world);
            this.currentSlot = (this.currentSlot + 1) % this.maxAutoSaves;
            showNotification('Auto-saved', 2000);
        }
    }
}
```

---

## Undo/Redo (Critical for a Building Engine!)

```javascript
class UndoSystem {
    constructor(maxHistory = 100) {
        this.history = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
    }
    
    push(action) {
        // action = { type, data, undo(), redo() }
        this.history.push(action);
        this.redoStack = []; // clear redo on new action
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }
    
    undo() {
        const action = this.history.pop();
        if (!action) return;
        action.undo();
        this.redoStack.push(action);
    }
    
    redo() {
        const action = this.redoStack.pop();
        if (!action) return;
        action.redo();
        this.history.push(action);
    }
}

// Usage:
function placeObject(template, position) {
    const obj = spawnObject(template, position);
    
    undoSystem.push({
        type: 'place',
        undo: () => { scene.remove(obj.mesh); objects.delete(obj.id); },
        redo: () => { scene.add(obj.mesh); objects.set(obj.id, obj); },
    });
}

// Ctrl+Z / Ctrl+Y
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') undoSystem.undo();
    if (e.ctrlKey && e.key === 'y') undoSystem.redo();
});
```

---

## Export/Share (Huge for Crate Engine!)

```javascript
// Export scene as shareable JSON
function exportScene(world) {
    const data = saveSystem.serialize(world);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `crate-scene-${Date.now()}.json`;
    a.click();
}

// Import scene from file
function importScene(file, world) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = JSON.parse(e.target.result);
        await saveSystem.restore(data, world);
    };
    reader.readAsText(file);
}

// Share via URL (small scenes)
function shareAsURL(world) {
    const data = saveSystem.serialize(world);
    const compressed = LZString.compressToEncodedURIComponent(data);
    const url = `${window.location.origin}?scene=${compressed}`;
    navigator.clipboard.writeText(url);
    showNotification('Share link copied!');
}
```

---

*Next: 13-terrain-advanced.md*
