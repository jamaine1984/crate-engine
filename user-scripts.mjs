window._userScripts = window._userScripts || [];
window._userScriptScope = window._userScriptScope || {};

const USER_SCRIPTS_STORAGE_KEY = 'crate-user-scripts';

let listenersAttached = false;
let savedScriptsLoaded = false;
const KEYDOWN_HANDLED_FLAG = '__crateUserScriptKeyHandled';
let context = {
  getScene: () => null,
  getCamera: () => null,
  getObjects: () => [],
  getTHREE: () => null,
  addObj: () => {},
  showToast: () => {},
  getCharacterController: () => null,
  getNpcController: () => null,
  isPlayMode: () => false,
  getUserAIConfig: () => ({ provider: 'ollama', apiKey: '', model: 'gemma4:latest' }),
  getDefaultOllamaModel: () => 'gemma4:latest',
};

export function setUserScriptsContext(nextContext = {}) {
  context = { ...context, ...nextContext };
}

function getUserScripts() {
  if (!Array.isArray(window._userScripts)) window._userScripts = [];
  return window._userScripts;
}

function serializeScript(script) {
  return {
    id: script.id,
    name: script.name,
    description: script.description,
    code: script.code,
    enabled: script.enabled,
  };
}

function persistUserScripts() {
  localStorage.setItem(
    USER_SCRIPTS_STORAGE_KEY,
    JSON.stringify(getUserScripts().map(serializeScript)),
  );
}

function upsertUserScript(scriptObj) {
  const scripts = getUserScripts();
  const nextScript = { ...scriptObj };
  const index = scripts.findIndex((script) => script.id === nextScript.id);
  if (index >= 0) scripts.splice(index, 1, nextScript);
  else scripts.push(nextScript);
  return nextScript;
}

function removeUserScript(scriptId) {
  window._userScripts = getUserScripts().filter((script) => script.id !== scriptId);
}

function getShowToast() {
  return typeof context.showToast === 'function' ? context.showToast : () => {};
}

function getObjectByName(name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  return getUserScriptsContextObjects().find((obj) => {
    const objectName = obj?.userData?.name;
    return objectName && objectName.toLowerCase().includes(lower);
  }) || null;
}

function getUserScriptsContextObjects() {
  return Array.isArray(context.getObjects?.()) ? context.getObjects() : [];
}

function createUserScriptSandbox() {
  return {
    scene: context.getScene?.(),
    camera: context.getCamera?.(),
    objects: getUserScriptsContextObjects(),
    THREE: context.getTHREE?.(),
    addObj: (...args) => context.addObj?.(...args),
    showToast: (msg, duration) => getShowToast()(msg, duration),
    getPlayer: () => context.getCharacterController?.(),
    getNPCs: () => context.getNpcController?.()?.npcs || [],
    getObjects: () => getUserScriptsContextObjects(),
    getObjectByName,
    playMode: () => Boolean(context.isPlayMode?.()),
    onUpdate: null,
    onKeyPress: null,
    onCollision: null,
    state: window._userScriptScope,
    dt: 0,
    time: 0,
    keys: {},
    console: { log: (...args) => console.log('[UserScript]', ...args) },
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 10000)),
    setInterval: (fn, ms) => setInterval(fn, Math.max(ms, 100)),
    clearTimeout,
    clearInterval,
  };
}

function handleUserScriptKeydown(event) {
  if (event[KEYDOWN_HANDLED_FLAG]) return;
  try {
    Object.defineProperty(event, KEYDOWN_HANDLED_FLAG, { value: true });
  } catch {
    event[KEYDOWN_HANDLED_FLAG] = true;
  }
  for (const script of getUserScripts()) {
    if (!script.enabled || !script._running || !script._onKeyPress) continue;
    try {
      script._onKeyPress(event.key.toLowerCase());
    } catch {}
  }
}

function attachListeners() {
  if (listenersAttached) return;
  window.addEventListener('keydown', handleUserScriptKeydown);
  document.addEventListener('keydown', handleUserScriptKeydown, true);
  listenersAttached = true;
}

export function runUserScript(scriptObj) {
  try {
    const sandbox = createUserScriptSandbox();
    const wrappedCode = '"use strict";\n' + (scriptObj.code || '') + '\n;return { onUpdate, onKeyPress, onCollision };';
    const fn = new Function(...Object.keys(sandbox), wrappedCode);
    const hooks = fn(...Object.values(sandbox)) || {};
    scriptObj._onUpdate = typeof hooks.onUpdate === 'function' ? hooks.onUpdate : sandbox.onUpdate;
    scriptObj._onKeyPress = typeof hooks.onKeyPress === 'function' ? hooks.onKeyPress : sandbox.onKeyPress;
    scriptObj._onCollision = typeof hooks.onCollision === 'function' ? hooks.onCollision : sandbox.onCollision;
    scriptObj._running = true;
    console.log('[AI Sandbox] Script "' + (scriptObj.name || 'Untitled Script') + '" running');
    return true;
  } catch (err) {
    console.error('[AI Sandbox] Script error:', err.message);
    getShowToast()('❌ Script error: ' + err.message);
    scriptObj._running = false;
    return false;
  }
}

export function updateUserScripts(dt) {
  const time = performance.now() * 0.001;
  for (const script of getUserScripts()) {
    if (!script.enabled || !script._running || !script._onUpdate) continue;
    try {
      script._onUpdate(dt, time);
    } catch (err) {
      console.error('[AI Sandbox] Script "' + (script.name || 'Untitled Script') + '" update error:', err.message);
      script._running = false;
    }
  }
}

export function initializeUserScripts() {
  attachListeners();
  if (savedScriptsLoaded) return getUserScripts();
  savedScriptsLoaded = true;
  try {
    const savedScripts = JSON.parse(localStorage.getItem(USER_SCRIPTS_STORAGE_KEY) || '[]');
    if (!Array.isArray(savedScripts)) return getUserScripts();
    for (const savedScript of savedScripts) {
      const script = upsertUserScript(savedScript);
      if (script.enabled) runUserScript(script);
    }
    if (savedScripts.length) {
      console.log('[AI Sandbox] Loaded ' + savedScripts.length + ' user scripts');
    }
  } catch {}
  return getUserScripts();
}

export function hasSavedUserScripts() {
  try {
    const savedScripts = JSON.parse(localStorage.getItem(USER_SCRIPTS_STORAGE_KEY) || '[]');
    return Array.isArray(savedScripts) && savedScripts.length > 0;
  } catch {
    return false;
  }
}

export async function generateUserScript(description) {
  const settings = context.getUserAIConfig?.() || {};
  const provider = settings.provider;
  const apiKey = settings.apiKey;
  const showToast = getShowToast();

  if (!provider) {
    showToast('⚠ Configure an AI provider in Settings (⚙) to use custom code generation');
    return null;
  }
  if (provider !== 'ollama' && !apiKey) {
    showToast('⚠ Set your AI API key in Settings (⚙) or switch to local Ollama');
    return null;
  }

  const systemPrompt = `You are a game scripting AI for Crate Engine (Three.js).
Generate ONLY executable JavaScript code. No explanations, no markdown.
Available APIs:
- scene, camera, objects (Three.js scene)
- THREE (Three.js library)
- getPlayer() -> character controller with .position, .model
- getNPCs() -> array of NPCs with .model, .behavior, .speed
- getObjects() -> all scene objects
- getObjectByName(name) -> find object
- showToast(msg) -> show message to player
- state -> persistent object to store variables
- onUpdate = function(dt, time) {} -> called every frame
- onKeyPress = function(key) {} -> called on key press
- Math, setTimeout, setInterval available

Example: Make coins spin
onUpdate = function(dt) {
  getObjects().filter((o) => o.userData.name && o.userData.name.includes('coin')).forEach((o) => {
    o.rotation.y += dt * 2;
  });
};`;

  let endpoint;
  let headers;
  let body;
  if (provider === 'openai' || provider === 'groq' || provider === 'deepseek' || provider === 'mistral') {
    const urls = {
      openai: 'https://api.openai.com/v1/chat/completions',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      mistral: 'https://api.mistral.ai/v1/chat/completions',
    };
    const models = {
      openai: 'gpt-4o-mini',
      groq: 'llama-3.1-8b-instant',
      deepseek: 'deepseek-chat',
      mistral: 'mistral-small-latest',
    };
    endpoint = urls[provider];
    headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey };
    body = JSON.stringify({
      model: settings.model || models[provider],
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: description },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });
  } else if (provider === 'claude') {
    endpoint = 'https://api.anthropic.com/v1/messages';
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    body = JSON.stringify({
      model: settings.model || 'claude-3-5-haiku-20241022',
      system: systemPrompt,
      messages: [{ role: 'user', content: description }],
      max_tokens: 1000,
    });
  } else if (provider === 'gemini') {
    endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt + '\n\nUser request: ' + description }] }],
    });
  } else if (provider === 'ollama') {
    endpoint = 'http://127.0.0.1:11434/api/generate';
    headers = { 'Content-Type': 'application/json' };
    body = JSON.stringify({
      model: settings.model || context.getDefaultOllamaModel?.() || 'gemma4:latest',
      system: systemPrompt,
      prompt: description + '\n\nReturn only executable JavaScript code.',
      stream: false,
      options: { temperature: 0.3 },
    });
  } else {
    showToast('⚠ Unsupported AI provider: ' + provider);
    return null;
  }

  try {
    showToast('🤖 Generating custom game logic...');
    const response = await fetch(endpoint, { method: 'POST', headers, body });
    const data = await response.json();

    let generatedCode = '';
    if (provider === 'claude') generatedCode = data.content?.[0]?.text || '';
    else if (provider === 'gemini') generatedCode = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    else if (provider === 'ollama') generatedCode = data.response || '';
    else generatedCode = data.choices?.[0]?.message?.content || '';

    return generatedCode
      .replace(/^```(?:javascript|js)?\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();
  } catch (err) {
    console.error('[AI Sandbox] Generation failed:', err);
    showToast('❌ AI generation failed: ' + err.message);
    return null;
  }
}

export async function generateAndRunUserScript(description) {
  initializeUserScripts();
  const generatedCode = await generateUserScript(description);
  if (!generatedCode) return null;
  const script = upsertUserScript({
    id: 'script_' + Date.now(),
    name: description.slice(0, 30) || 'Untitled Script',
    description,
    code: generatedCode,
    enabled: true,
  });
  runUserScript(script);
  persistUserScripts();
  return script;
}

export function installUserScript(scriptObj) {
  initializeUserScripts();
  const script = upsertUserScript({
    id: scriptObj.id || ('script_' + Date.now()),
    name: scriptObj.name || 'Untitled Script',
    description: scriptObj.description || '',
    code: scriptObj.code || '',
    enabled: scriptObj.enabled !== false,
  });
  if (script.enabled) runUserScript(script);
  persistUserScripts();
  getShowToast()('Installed: ' + script.name);
  return script;
}

export function showScriptEditor(existingScript) {
  initializeUserScripts();
  const existing = existingScript || {};
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100000;display:flex;align-items:center;justify-content:center;';

  overlay.innerHTML = `
    <div style="background:#111;border:2px solid #7c5cff;border-radius:16px;width:700px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px;font-family:-apple-system,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:#7c5cff;margin:0;font-size:1.2rem;">🧠 AI Game Logic Editor</h2>
        <button id="script-close" style="background:none;border:none;color:#666;font-size:24px;cursor:pointer;">✕</button>
      </div>
      <div style="margin-bottom:12px;">
        <label style="color:#888;font-size:0.8rem;">Script Name</label>
        <input id="script-name" value="${existing.name || ''}" placeholder="e.g. Coin Collector" style="width:100%;background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#fff;font-size:0.9rem;margin-top:4px;">
      </div>
      <div style="margin-bottom:12px;">
        <label style="color:#888;font-size:0.8rem;">Describe what you want (AI will generate code)</label>
        <textarea id="script-prompt" placeholder="e.g. When the player touches a coin, add 10 points and make the coin disappear with a sparkle effect" style="width:100%;height:60px;background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:8px 12px;color:#fff;font-size:0.85rem;margin-top:4px;resize:vertical;font-family:inherit;"></textarea>
        <button id="script-generate" style="margin-top:6px;background:linear-gradient(135deg,#7c5cff,#4a9eff);border:none;color:#fff;padding:6px 16px;border-radius:8px;cursor:pointer;font-size:0.8rem;">🤖 Generate Code</button>
      </div>
      <div style="margin-bottom:12px;">
        <label style="color:#888;font-size:0.8rem;">Code (JavaScript)</label>
        <textarea id="script-code" style="width:100%;height:200px;background:#0a0a1a;border:1px solid #333;border-radius:8px;padding:12px;color:#4ade80;font-family:'JetBrains Mono',monospace;font-size:0.8rem;margin-top:4px;resize:vertical;tab-size:2;">${existing.code || '// Your custom game logic here\n// Available: getPlayer(), getNPCs(), getObjects(), showToast()\n// Set onUpdate = function(dt) {} for per-frame logic\n// Set onKeyPress = function(key) {} for input\n'}</textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="script-run" style="flex:1;padding:10px;background:#16a34a;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">▶ Run Script</button>
        <button id="script-save" style="flex:1;padding:10px;background:#7c5cff;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">💾 Save Script</button>
        ${existing.id ? '<button id="script-delete" style="padding:10px 16px;background:#ef4444;border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">🗑</button>' : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const scriptPrompt = overlay.querySelector('#script-prompt');
  if (scriptPrompt && existing.description) scriptPrompt.value = existing.description;

  overlay.querySelector('#script-close').onclick = () => overlay.remove();
  overlay.onclick = (event) => {
    if (event.target === overlay) overlay.remove();
  };

  overlay.querySelector('#script-generate').onclick = async () => {
    const prompt = scriptPrompt.value.trim();
    if (!prompt) return;
    const generated = await generateUserScript(prompt);
    if (generated) overlay.querySelector('#script-code').value = generated;
  };

  overlay.querySelector('#script-run').onclick = () => {
    const script = upsertUserScript({
      id: existing.id || 'script_' + Date.now(),
      name: overlay.querySelector('#script-name').value || 'Untitled Script',
      description: scriptPrompt.value,
      code: overlay.querySelector('#script-code').value,
      enabled: true,
    });
    runUserScript(script);
    getShowToast()('▶ Script "' + script.name + '" running!');
  };

  overlay.querySelector('#script-save').onclick = () => {
    const script = upsertUserScript({
      id: existing.id || 'script_' + Date.now(),
      name: overlay.querySelector('#script-name').value || 'Untitled Script',
      description: scriptPrompt.value,
      code: overlay.querySelector('#script-code').value,
      enabled: true,
    });
    persistUserScripts();
    getShowToast()('💾 Script "' + script.name + '" saved!');
    overlay.remove();
  };

  const deleteButton = overlay.querySelector('#script-delete');
  if (deleteButton) {
    deleteButton.onclick = () => {
      removeUserScript(existing.id);
      persistUserScripts();
      getShowToast()('🗑 Script deleted');
      overlay.remove();
    };
  }
}

export function showScriptManager() {
  initializeUserScripts();
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100000;display:flex;align-items:center;justify-content:center;';

  const scripts = getUserScripts();
  const listHTML = scripts.length
    ? scripts.map((script) => (
      '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#1a1a2e;border-radius:8px;margin-bottom:6px;cursor:pointer;" data-id="' + script.id + '">' +
      '<span style="color:' + (script.enabled && script._running ? '#4ade80' : '#666') + ';font-size:12px;">●</span>' +
      '<span style="color:#fff;flex:1;font-size:0.85rem;">' + script.name + '</span>' +
      '<button class="script-toggle" data-id="' + script.id + '" style="background:none;border:1px solid #333;color:#888;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">' + (script.enabled ? 'ON' : 'OFF') + '</button>' +
      '<button class="script-edit" data-id="' + script.id + '" style="background:none;border:1px solid #7c5cff;color:#7c5cff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:0.7rem;">Edit</button>' +
      '</div>'
    )).join('')
    : '<p style="color:#666;text-align:center;">No custom scripts yet</p>';

  overlay.innerHTML = `
    <div style="background:#111;border:2px solid #7c5cff;border-radius:16px;width:500px;max-width:95vw;max-height:80vh;overflow-y:auto;padding:24px;font-family:-apple-system,sans-serif;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="color:#7c5cff;margin:0;font-size:1.1rem;">🧠 Custom Game Scripts</h2>
        <button id="scripts-close" style="background:none;border:none;color:#666;font-size:24px;cursor:pointer;">✕</button>
      </div>
      <div id="scripts-list">${listHTML}</div>
      <button id="scripts-new" style="width:100%;margin-top:12px;padding:10px;background:linear-gradient(135deg,#7c5cff,#4a9eff);border:none;color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">+ New Script</button>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#scripts-close').onclick = () => overlay.remove();
  overlay.onclick = (event) => {
    if (event.target === overlay) overlay.remove();
  };
  overlay.querySelector('#scripts-new').onclick = () => {
    overlay.remove();
    showScriptEditor();
  };

  overlay.querySelectorAll('.script-edit').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const script = getUserScripts().find((item) => item.id === button.dataset.id);
      if (!script) return;
      overlay.remove();
      showScriptEditor(script);
    };
  });

  overlay.querySelectorAll('.script-toggle').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const script = getUserScripts().find((item) => item.id === button.dataset.id);
      if (!script) return;
      script.enabled = !script.enabled;
      if (script.enabled) runUserScript(script);
      else script._running = false;
      persistUserScripts();
      overlay.remove();
      showScriptManager();
    };
  });
}
