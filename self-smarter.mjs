// self-smarter.mjs - Autonomous Self-Improvement Loop for Crate Engine
class SelfSmarterLoop {
  constructor({ scene, camera, renderer, characterController, npcController }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.characterController = characterController;
    this.npcController = npcController;
    this.openRouterKey = localStorage.getItem('crate_openrouter_key') || '';
    this.model = 'google/gemini-2.0-flash-exp:free';
    this.loopActive = false;
    this.loopInterval = null;
    this.checkIntervalMs = 30000;
    this.screenshotHistory = [];
    this.learningDatabase = this._loadLearningDB();
    this.appliedFixes = new Set();
    this._loadAppliedFixes();
    console.log('[SelfSmarter] Initialized');
  }
  _loadLearningDB() { try { const s = localStorage.getItem('crate_learning_db'); return s ? JSON.parse(s) : []; } catch { return []; } }
  _saveLearningDB() { try { localStorage.setItem('crate_learning_db', JSON.stringify(this.learningDatabase)); } catch {} }
  _loadAppliedFixes() { try { const s = localStorage.getItem('crate_applied_fixes'); if (s) this.appliedFixes = new Set(JSON.parse(s)); } catch {} }
  _saveAppliedFixes() { try { localStorage.setItem('crate_applied_fixes', JSON.stringify([...this.appliedFixes])); } catch {} }
  _logLearning(e) { this.learningDatabase.push(e); if (this.learningDatabase.length > 50) this.learningDatabase = this.learningDatabase.slice(-40); this._saveLearningDB(); }

  captureScreenshot() {
    return new Promise(r => {
      try {
        this.renderer.render(this.scene, this.camera);
        const c = this.renderer.domElement;
        const d = c.toDataURL('image/png');
        const b64 = d.replace(/^data:image\/\w+;base64,/, '');
        const e = { timestamp: Date.now(), base64: b64, npcCount: this.npcController ? this.npcController.npcs.length : 0 };
        this.screenshotHistory.push(e);
        if (this.screenshotHistory.length > 10) this.screenshotHistory.shift();
        r(e);
      } catch (err) { console.error('[SelfSmarter] capture failed:', err); r(null); }
    });
  }

  async analyzeScreenshot(ss) {
    if (!ss || !this.openRouterKey) return null;
    const report = (this.npcController?.npcs || []).map(n => ({ type: n.type, anims: Object.keys(n.animations||{}).join(','), aiState: n.ai?.state }));
    const prompt = 'Analyze this screenshot for NPC issues: shadows, t-pose, floating, wrong scale, clipping. NPC: ' + JSON.stringify(report) + '. Return JSON: {issues:[{type:"",severity:"",description:""}],fixes:[{issue:"",code:"",priority:1}],overallScore:0,summary:""}';
    try {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openRouterKey}`,
          'HTTP-Referer': 'https://crateshipgames.com',
          'X-Title': 'Crate Engine Self-Smarter'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${ss.base64}` } }
              ]
            }
          ]
        })
      });
      if (!res.ok) { console.error('[SelfSmarter] API error:', res.status); return null; }
      const data = await res.json();
      let t = data.choices?.[0]?.message?.content || '';
      t = t.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
      try { const a = JSON.parse(t); console.log('[SelfSmarter]', a.summary); return {...a, timestamp:Date.now()}; } catch { return {rawText:t, issues:[], fixes:[]}; }
    } catch (e) { console.error('[SelfSmarter] Analysis failed:', e); return null; }
  }

  async applyFixes(a) {
    if (!a) return; const applied = [];
    if (a.issues?.some(i=>i.type==='shadow') && !this.appliedFixes.has('shadow')) { this._fixShadow(); applied.push('shadow'); this.appliedFixes.add('shadow'); this._saveAppliedFixes(); }
    if (a.issues?.some(i=>i.type==='tpose') && !this.appliedFixes.has('tpose')) { this._fixTPose(); applied.push('tpose'); this.appliedFixes.add('tpose'); this._saveAppliedFixes(); }
    if (a.issues?.some(i=>i.type==='floating'||i.type==='clipping') && !this.appliedFixes.has('ground')) { this._fixGround(); applied.push('ground'); this.appliedFixes.add('ground'); this._saveAppliedFixes(); }
    if (applied.length) console.log('[SelfSmarter] Fixed:', applied.join(','));
    return applied;
  }
  _fixShadow() { for (const n of (this.npcController?.npcs||[])) n.model?.traverse(c => { if ((c.isMesh||c.isSkinnedMesh)) { c.castShadow=true;c.receiveShadow=true; if (c.material){c.material.needsUpdate=true;} } }); console.log('[SelfSmarter] Shadow fix done'); }
  _fixTPose() { for (const n of (this.npcController?.npcs||[])) { if (n.mixer) { n.mixer.update(0.001); if (n.currentAnim && n.animations[n.currentAnim]) n.animations[n.currentAnim].reset().play(); else if (n.animations.idle) { n.animations.idle.reset().play(); n.currentAnim='idle'; } } } console.log('[SelfSmarter] T-pose fix done'); }
  _fixGround() { if (typeof _getTerrainY!=='function') return; for (const n of (this.npcController?.npcs||[])) n.model && (n.model.position.y=_getTerrainY(n.model.position.x, n.model.position.z)); console.log('[SelfSmarter] Ground fix done'); }

  startAutoLoop() { if (this.loopActive) return; this.loopActive=true; this.loopInterval=setInterval(async()=>{const s=await this.captureScreenshot();if(s){const a=await this.analyzeScreenshot(s);if(a)await this.applyFixes(a);}},this.checkIntervalMs); console.log('[SelfSmarter] Auto-loop ON'); }
  stopAutoLoop() { this.loopActive=false; if(this.loopInterval){clearInterval(this.loopInterval);this.loopInterval=null;} }
  async runOnce() { const s=await this.captureScreenshot(); if(!s) return{error:'no ss'}; const a=await this.analyzeScreenshot(s); if(!a) return{error:'no analysis'}; return{analysis:a,applied:await this.applyFixes(a)}; }
  getState() { return {loopActive:this.loopActive,screenshots:this.screenshotHistory.length,learningEntries:this.learningDatabase.length,appliedFixes:[...this.appliedFixes],openRouterKey:this.openRouterKey?'set':'missing'}; }
}

window.SelfSmarterLoop = SelfSmarterLoop;
