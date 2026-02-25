// ============================================================================
// CRATE ENGINE — ACTION API (Phase 2)
// Clean, testable functions that DO things. No regex. No parsing.
// ============================================================================

// All actions return { ok: bool, message: string, data?: any }

const Actions = {
  _engine: null, // set during init

  init(engine) {
    this._engine = engine;
    window.CrateActions = this;
    console.log('[Actions] API initialized');
  },

  // --------------------------------------------------------------------------
  // ASSET SEARCH — fuzzy search across all 2000 models
  // --------------------------------------------------------------------------
  async searchAssets(query, limit = 10) {
    const catalog = await this._engine.loadAssetCatalog();
    if (!catalog) return { ok: false, message: 'Asset catalog not loaded' };

    const q = query.toLowerCase().trim();
    const results = [];

    for (const [category, items] of Object.entries(catalog)) {
      for (const item of items) {
        const name = item.name.toLowerCase();
        const file = item.file.toLowerCase();
        
        // Exact match
        if (name === q || file === q) {
          results.push({ ...item, category, score: 100 });
          continue;
        }
        // Starts with query
        if (name.startsWith(q)) {
          results.push({ ...item, category, score: 80 });
          continue;
        }
        // Contains query
        if (name.includes(q) || file.includes(q)) {
          results.push({ ...item, category, score: 60 });
          continue;
        }
        // Word match (e.g., "house" matches "Buildings Pack 2 House Tall")
        const words = q.split(/\s+/);
        const nameWords = name.split(/\s+/);
        const matchCount = words.filter(w => nameWords.some(nw => nw.includes(w))).length;
        if (matchCount === words.length) {
          results.push({ ...item, category, score: 50 + matchCount * 5 });
        } else if (matchCount > 0) {
          results.push({ ...item, category, score: 20 + matchCount * 10 });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return { ok: true, message: `Found ${results.length} matches`, data: results.slice(0, limit) };
  },

  // --------------------------------------------------------------------------
  // ADD OBJECT — fuzzy search + load best match
  // --------------------------------------------------------------------------
  async addObject(query, position = null) {
    const search = await this.searchAssets(query, 1);
    if (!search.ok || !search.data.length) {
      return { ok: false, message: `No model found for "${query}"` };
    }
    
    const best = search.data[0];
    const x = position ? position.x : 0;
    const z = position ? position.z : 0;
    
    this._engine.loadGLBModel(best.name, best.file, x, z);
    return { ok: true, message: `Added ${best.name}`, data: best };
  },

  // --------------------------------------------------------------------------
  // SCENE
  // --------------------------------------------------------------------------
  clearScene() {
    this._engine.clearScene();
    return { ok: true, message: 'Scene cleared' };
  },

  async buildWorld(templateName) {
    const result = await this._engine.buildWorld(templateName);
    return { ok: !!result, message: result || `Unknown world: ${templateName}` };
  },

  removeSelected() {
    const obj = this._engine.getSelected();
    if (!obj) return { ok: false, message: 'Nothing selected' };
    this._engine.removeObject(obj);
    return { ok: true, message: `Removed ${obj.name || 'object'}` };
  },

  // --------------------------------------------------------------------------
  // CHARACTER & PLAYER
  // --------------------------------------------------------------------------
  async setCharacter(id) {
    const result = await this._engine.setCharacter(id);
    return { ok: !!result, message: result || `Unknown character: ${id}` };
  },

  enterPlayMode() {
    this._engine.enterPlayMode();
    return { ok: true, message: 'Play mode' };
  },

  exitPlayMode() {
    this._engine.exitPlayMode();
    return { ok: true, message: 'Edit mode' };
  },

  toggleCamera() {
    this._engine.toggleCamera();
    return { ok: true, message: 'Camera toggled' };
  },

  equipWeapon(weaponId, slot = 1) {
    const result = this._engine.equipWeapon(weaponId, slot);
    return { ok: !!result, message: result || `Unknown weapon: ${weaponId}` };
  },

  // --------------------------------------------------------------------------
  // NPCs
  // --------------------------------------------------------------------------
  spawnNPC(options = {}) {
    const { type = 'random', count = 1, hostile = false, position = null } = options;
    const result = this._engine.spawnNPCs(type, count, hostile, position);
    return { ok: true, message: `Spawned ${count} ${hostile ? 'hostile ' : ''}NPC${count > 1 ? 's' : ''}`, data: result };
  },

  // --------------------------------------------------------------------------
  // ENVIRONMENT
  // --------------------------------------------------------------------------
  setWater(preset) {
    const result = this._engine.setWaterPreset(preset);
    return { ok: !!result, message: result || `Unknown water preset: ${preset}` };
  },

  setTerrain(type, options = {}) {
    const result = this._engine.setTerrain(type, options);
    return { ok: !!result, message: result || `Terrain set to ${type}` };
  },

  setWeather(type) {
    const result = this._engine.setWeather(type);
    return { ok: true, message: `Weather: ${type}` };
  },

  setTime(time) {
    this._engine.setTime(time);
    return { ok: true, message: `Time: ${time}` };
  },

  // --------------------------------------------------------------------------
  // BUILDINGS
  // --------------------------------------------------------------------------
  addInterior(type, options = {}) {
    const result = this._engine.addInterior(type, options);
    return { ok: !!result, message: result || `Added ${type}` };
  },

  // --------------------------------------------------------------------------
  // UI
  // --------------------------------------------------------------------------
  openLibrary(category = null) {
    if (category) {
      this._engine.showGallery(category);
    } else {
      this._engine.showCategoryPicker();
    }
    return { ok: true, message: 'Library opened' };
  },

  showHelp() {
    this._engine.showHelp();
    return { ok: true, message: 'Help panel toggled' };
  },

  showGenerator() {
    this._engine.showGenerator();
    return { ok: true, message: '3D Generator opened' };
  },
};

export default Actions;
