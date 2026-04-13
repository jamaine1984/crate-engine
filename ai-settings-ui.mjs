const AI_PROVIDERS = {
  claude: { name: 'Claude (Anthropic)', url: 'https://api.anthropic.com/v1/messages', header: 'x-api-key' },
  openai: { name: 'OpenAI / GPT', url: 'https://api.openai.com/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  gemini: { name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', param: 'key' },
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  mistral: { name: 'Mistral AI', url: 'https://api.mistral.ai/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  deepseek: { name: 'DeepSeek', url: 'https://api.deepseek.com/v1/chat/completions', header: 'Authorization', prefix: 'Bearer ' },
  ollama: { name: 'Ollama (Local)', url: 'http://127.0.0.1:11434/api/generate', header: null },
};

let context = {
  getUserAIConfig: () => ({ provider: 'ollama', apiKey: '', model: 'gemma4:latest' }),
  setUserAIConfig: () => {},
  getDefaultOllamaModel: () => 'gemma4:latest',
  getMeshyApiKey: () => '',
  setMeshyApiKey: () => {},
  getMeshyApiBase: () => 'https://api.meshy.ai',
};

export function setAiSettingsUiContext(nextContext = {}) {
  context = { ...context, ...nextContext };
}

export function showAISettingsModal() {
  const existing = document.getElementById('ai-settings-modal');
  if (existing) {
    existing.remove();
    return;
  }

  const config = context.getUserAIConfig?.() || {};
  const modal = document.createElement('div');
  modal.id = 'ai-settings-modal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%,-50%)',
    zIndex: '500',
    background: '#0d0d0d',
    border: '1px solid #333',
    borderRadius: '16px',
    padding: '28px',
    width: '420px',
    maxHeight: '80vh',
    overflowY: 'auto',
    color: '#eee',
    fontFamily: "'Inter',system-ui,sans-serif",
    boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
  });

  const providers = Object.entries(AI_PROVIDERS).map(([key, value]) =>
    `<option value="${key}" ${config.provider === key ? 'selected' : ''}>${value.name}</option>`,
  ).join('');

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="margin:0;font-size:1.2rem">🤖 AI Model Settings</h2>
      <button onclick="this.closest('#ai-settings-modal').remove()" style="background:none;border:none;color:#666;font-size:1.5rem;cursor:pointer">✕</button>
    </div>
    <p style="color:#888;font-size:0.8rem;margin-bottom:16px">Connect your own AI model for advanced scene generation, code assist, and NPC dialogue. Remote API keys are kept only for this browser session.</p>

    <label style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">Provider</label>
    <select id="ai-provider" style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;margin-bottom:14px;font-size:0.85rem">
      <option value="">None (use built-in commands only)</option>
      ${providers}
    </select>

    <label id="ai-apikey-label" style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">API Key</label>
    <input id="ai-apikey" type="password" value="${config.apiKey || ''}" placeholder="sk-..." style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;margin-bottom:14px;font-size:0.85rem;box-sizing:border-box">

    <label style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">Model (optional)</label>
    <input id="ai-model" value="${config.model || ''}" placeholder="e.g. gpt-4o, claude-3-sonnet, gemini-pro" style="width:100%;padding:10px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;margin-bottom:20px;font-size:0.85rem;box-sizing:border-box">
    <div id="ai-security-note" style="margin:-8px 0 16px;font-size:0.75rem;color:#666"></div>

    <div style="display:flex;gap:10px">
      <button id="ai-save-btn" style="flex:1;padding:10px;background:linear-gradient(135deg,#ff6b35,#f7c948);border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:0.9rem">Save</button>
      <button id="ai-test-btn" style="flex:1;padding:10px;background:#1a1a2e;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.9rem">Test Connection</button>
    </div>
    <div id="ai-status" style="margin-top:12px;font-size:0.78rem;color:#666"></div>
  `;
  document.body.appendChild(modal);

  const providerEl = document.getElementById('ai-provider');
  const apiKeyLabelEl = document.getElementById('ai-apikey-label');
  const apiKeyInputEl = document.getElementById('ai-apikey');
  const modelInputEl = document.getElementById('ai-model');
  const securityNoteEl = document.getElementById('ai-security-note');

  function syncProviderUI() {
    if (providerEl.value === 'ollama') {
      apiKeyLabelEl.textContent = 'API Key (not required for local Ollama)';
      apiKeyInputEl.placeholder = 'Leave blank for local Ollama';
      if (!modelInputEl.value) modelInputEl.value = context.getDefaultOllamaModel?.() || 'gemma4:latest';
      modelInputEl.placeholder = 'e.g. gemma4:latest';
      securityNoteEl.innerHTML = '<span style="color:#4ade80">Local mode: requests stay on this machine.</span>';
    } else {
      apiKeyLabelEl.textContent = 'API Key';
      apiKeyInputEl.placeholder = 'sk-...';
      modelInputEl.placeholder = 'e.g. gpt-4o, claude-3-sonnet, gemini-pro';
      securityNoteEl.innerHTML = providerEl.value === 'claude'
        ? '<span style="color:#f59e0b">Claude runs as a direct browser call here. For stronger secret isolation, prefer local Ollama or a server-side proxy.</span>'
        : '<span style="color:#f59e0b">Remote providers here are called directly from the browser. Keys are kept only for this session, but local Ollama is safer.</span>';
    }
  }

  providerEl.addEventListener('change', syncProviderUI);
  syncProviderUI();

  document.getElementById('ai-save-btn').onclick = () => {
    const provider = providerEl.value;
    const apiKey = apiKeyInputEl.value;
    const model = modelInputEl.value || (provider === 'ollama' ? context.getDefaultOllamaModel?.() || 'gemma4:latest' : '');
    context.setUserAIConfig?.(provider, apiKey, model);
    document.getElementById('ai-status').innerHTML = '<span style="color:#4ade80">✓ Saved!</span>';
    setTimeout(() => modal.remove(), 1000);
  };

  document.getElementById('ai-test-btn').onclick = async () => {
    const provider = providerEl.value;
    const apiKey = apiKeyInputEl.value;
    const model = modelInputEl.value || (provider === 'ollama' ? context.getDefaultOllamaModel?.() || 'gemma4:latest' : '');
    const statusEl = document.getElementById('ai-status');
    if (!provider) {
      statusEl.innerHTML = '<span style="color:#f87171">⚠️ Select a provider first</span>';
      return;
    }
    if (provider !== 'ollama' && !apiKey) {
      statusEl.innerHTML = '<span style="color:#f87171">⚠️ Enter an API key for this provider</span>';
      return;
    }
    statusEl.innerHTML = '<span style="color:#f7c948">Testing...</span>';

    try {
      if (provider === 'ollama') {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        const data = await response.json();
        const names = (data.models || []).map((entry) => entry.name);
        if (!response.ok) throw new Error('Local Ollama is not responding');
        if (model && !names.includes(model)) {
          statusEl.innerHTML = '<span style="color:#f59e0b">⚠️ Ollama reached, but model not found locally: ' + model + '</span>';
        } else {
          statusEl.innerHTML = '<span style="color:#4ade80">✓ Local Ollama ready' + (model ? ' (' + model + ')' : '') + '</span>';
        }
        return;
      }

      const providerConfig = AI_PROVIDERS[provider];
      const headers = { 'Content-Type': 'application/json' };
      if (providerConfig.header) headers[providerConfig.header] = (providerConfig.prefix || '') + apiKey;
      const response = await fetch(providerConfig.url, { method: 'POST', headers, body: '{}' }).catch(() => null);
      if (response && response.status < 500) {
        statusEl.innerHTML = '<span style="color:#4ade80">✓ Connection OK (status ' + response.status + ')</span>';
      } else {
        statusEl.innerHTML = '<span style="color:#f87171">⚠️ Could not reach API</span>';
      }
    } catch (err) {
      statusEl.innerHTML = '<span style="color:#f87171">⚠️ Error: ' + err.message + '</span>';
    }
  };
}

export function showMeshyKeyModal() {
  const existing = document.getElementById('meshy-key-modal');
  if (existing) {
    existing.remove();
    return;
  }

  const existingKey = context.getMeshyApiKey?.() || '';
  const modal = document.createElement('div');
  modal.id = 'meshy-key-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif" onclick="if(event.target===this)this.remove()">
      <div style="background:#1a1a2e;border-radius:16px;width:480px;color:#fff;box-shadow:0 25px 60px rgba(0,0,0,0.5);padding:28px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h2 style="margin:0;font-size:1.3rem">🔑 Connect Meshy AI</h2>
          <button onclick="this.closest('#meshy-key-modal').remove()" style="background:none;border:none;color:#666;font-size:1.5rem;cursor:pointer">✕</button>
        </div>
        <p style="color:#888;font-size:0.85rem;margin-bottom:16px">Generate 3D models from text or images using Meshy AI. Connect your own Meshy account — <a href="https://www.meshy.ai/settings/api" target="_blank" style="color:#6366f1">get an API key here</a>.</p>
        <p style="color:#666;font-size:0.78rem;margin-bottom:12px">Free tier: 200 credits/month. Pro ($16/mo): 1000 credits. Your key stays only for this browser session.</p>

        <label style="font-size:0.75rem;color:#aaa;display:block;margin-bottom:4px">Meshy API Key</label>
        <input id="meshy-key-input" type="password" value="${existingKey}" placeholder="msy-..." style="width:100%;padding:12px;background:#0d0d1a;border:1px solid #333;border-radius:8px;color:#fff;font-size:0.9rem;box-sizing:border-box;margin-bottom:16px">

        <div style="display:flex;gap:10px">
          <button id="meshy-save-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-size:0.95rem">Save Key</button>
          <button id="meshy-test-btn" style="flex:1;padding:12px;background:#2a2a4a;border:1px solid #333;border-radius:10px;color:#aaa;cursor:pointer;font-size:0.95rem">Test Connection</button>
        </div>
        <div id="meshy-key-status" style="margin-top:10px;font-size:0.8rem;color:#666;text-align:center"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('meshy-save-btn').onclick = () => {
    const key = document.getElementById('meshy-key-input').value.trim();
    context.setMeshyApiKey?.(key);
    document.getElementById('meshy-key-status').innerHTML = '<span style="color:#4ade80">✓ Saved! You can now generate 3D models.</span>';
    setTimeout(() => modal.remove(), 1200);
  };

  document.getElementById('meshy-test-btn').onclick = async () => {
    const key = document.getElementById('meshy-key-input').value.trim();
    const statusEl = document.getElementById('meshy-key-status');
    if (!key) {
      statusEl.innerHTML = '<span style="color:#f87171">Enter your Meshy API key (msy-...)</span>';
      return;
    }
    statusEl.innerHTML = '<span style="color:#fbbf24">Testing...</span>';
    try {
      const response = await fetch(context.getMeshyApiBase?.() + '/openapi/v1/image-to-3d?page_size=1', {
        headers: { Authorization: 'Bearer ' + key },
      });
      if (response.ok) {
        statusEl.innerHTML = '<span style="color:#4ade80">✓ Connected to Meshy AI!</span>';
      } else {
        const error = await response.json().catch(() => ({}));
        statusEl.innerHTML = '<span style="color:#f87171">❌ ' + (error.message || 'Auth failed — check your key') + '</span>';
      }
    } catch {
      statusEl.innerHTML = '<span style="color:#f87171">❌ Connection error</span>';
    }
  };
}
