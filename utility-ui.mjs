let context = {
  getCommandShowcase: () => ({}),
  runCommand: () => {},
  loadSettings: () => ({}),
  applySettings: () => {},
  saveSettings: () => {},
  showToast: () => {},
};

export function setUtilityUiContext(nextContext = {}) {
  context = { ...context, ...nextContext };
}

export function showHelpModal() {
  const old = document.getElementById('help-modal');
  if (old) {
    old.remove();
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'help-modal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.9)',
    zIndex: '10000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(8px)',
    overflow: 'auto',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#0d0d0d',
    border: '1px solid #252525',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '900px',
    width: '95%',
    maxHeight: '85vh',
    overflow: 'auto',
    fontFamily: 'JetBrains Mono, monospace',
    color: '#e0e0e0',
  });

  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
    + '<h2 style="color:#ff6b35;margin:0">⌨️ All Commands</h2>'
    + '<button onclick="this.closest(\'#help-modal\').remove()" style="background:none;border:none;color:#555;font-size:1.5rem;cursor:pointer">✕</button></div>';

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
  const colors = ['#4ade80','#60a5fa','#f59e0b','#c084fc','#ef4444','#22d3ee','#fb923c','#a78bfa','#f472b6','#34d399','#fbbf24','#818cf8','#fb7185','#2dd4bf'];
  let categoryIndex = 0;

  for (const [category, commands] of Object.entries(context.getCommandShowcase?.() || {})) {
    const color = colors[categoryIndex % colors.length];
    categoryIndex++;
    html += '<div style="background:#111;border-radius:8px;padding:12px;border:1px solid #1a1a1a">';
    html += '<h4 style="color:' + color + ';margin:0 0 8px">' + category + '</h4>';
    html += '<div style="color:#888;font-size:0.72rem;line-height:2">';
    commands.forEach((cmd) => {
      html += '<span onclick="document.getElementById(\'help-modal\').remove();window.showHelpCommand && window.showHelpCommand(\'' + cmd.replace(/'/g, "\\'") + '\')" style="display:inline-block;background:#1a1a1a;padding:2px 8px;border-radius:4px;margin:2px;cursor:pointer;transition:background 0.2s;border:1px solid #252525" onmouseover="this.style.background=\'#252525\'" onmouseout="this.style.background=\'#1a1a1a\'">' + cmd + '</span>';
    });
    html += '</div></div>';
  }

  html += '</div>';
  html += '<div style="margin-top:16px;padding:12px;background:#111;border-radius:8px;border:1px solid #252525;text-align:center">'
    + '<span style="color:#ff6b35;font-weight:700">💡 Click any command to run it!</span> '
    + '<span style="color:#888;font-size:0.8rem">Or combine with "and" — <code style="color:#4ade80">build tropical paradise and equip sword and play</code></span></div>';
  html += '<div style="margin-top:8px;padding:12px;background:#111;border-radius:8px;border:1px solid #252525">'
    + '<h4 style="color:#ff6b35;margin:0 0 8px">🎮 Play Mode Controls</h4>'
    + '<div style="color:#888;font-size:0.72rem;display:grid;grid-template-columns:1fr 1fr;gap:4px">'
    + '<span>WASD — Move</span><span>Space — Jump</span>'
    + '<span>Shift — Run</span><span>Ctrl — Sprint</span>'
    + '<span>C — Dodge Roll</span><span>E / Click — Attack</span>'
    + '<span>Q — Heavy Attack</span><span>V — Toggle FPS/TPS</span>'
    + '<span>T — Swap Shoulder</span><span>F — Interact</span>'
    + '<span>1/2/3 — Weapon Slots</span><span>ESC — Exit Play</span>'
    + '</div></div>';

  card.innerHTML = html;
  modal.appendChild(card);
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });

  window.showHelpCommand = (cmd) => context.runCommand?.(cmd);
}

export function showSettingsPanel() {
  let panel = document.getElementById('settings-panel');
  if (panel) {
    panel.remove();
    return;
  }

  const saved = context.loadSettings?.() || {};
  const quality = saved.quality || 'high';
  const shadows = saved.shadows !== false;
  const fog = saved.fog !== false;
  const clouds = saved.clouds === true;
  const sensitivity = saved.sensitivity || 1;
  const fov = saved.fov || 60;

  panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10020;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;backdrop-filter:blur(10px);';
  panel.innerHTML = `
    <div style="background:#111;border:1px solid #333;border-radius:16px;padding:32px;width:440px;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <h2 style="margin:0;color:#fff;font-size:22px;">⚙️ Settings</h2>
        <div id="settings-close" style="cursor:pointer;font-size:20px;color:#666;">✕</div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Graphics</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Quality</span>
          <select id="s-quality" style="background:#222;color:#fff;border:1px solid #444;padding:4px 12px;border-radius:6px;">
            <option value="low" ${quality === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${quality === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${quality === 'high' ? 'selected' : ''}>High</option>
            <option value="ultra" ${quality === 'ultra' ? 'selected' : ''}>Ultra</option>
          </select>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Shadows</span>
          <label style="position:relative;width:44px;height:24px;">
            <input type="checkbox" id="s-shadows" ${shadows ? 'checked' : ''} style="opacity:0;width:0;height:0;">
            <span style="position:absolute;cursor:pointer;inset:0;background:${shadows ? '#4ade80' : '#333'};border-radius:24px;transition:0.3s;"></span>
            <span style="position:absolute;left:${shadows ? '22px' : '2px'};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"></span>
          </label>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Fog</span>
          <label style="position:relative;width:44px;height:24px;">
            <input type="checkbox" id="s-fog" ${fog ? 'checked' : ''} style="opacity:0;width:0;height:0;">
            <span style="position:absolute;cursor:pointer;inset:0;background:${fog ? '#4ade80' : '#333'};border-radius:24px;transition:0.3s;"></span>
            <span style="position:absolute;left:${fog ? '22px' : '2px'};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"></span>
          </label>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="color:#ccc;font-size:14px;">Clouds</span>
          <label style="position:relative;width:44px;height:24px;">
            <input type="checkbox" id="s-clouds" ${clouds ? 'checked' : ''} style="opacity:0;width:0;height:0;">
            <span style="position:absolute;cursor:pointer;inset:0;background:${clouds ? '#4ade80' : '#333'};border-radius:24px;transition:0.3s;"></span>
            <span style="position:absolute;left:${clouds ? '22px' : '2px'};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s;"></span>
          </label>
        </div>
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#ccc;font-size:14px;">FOV</span>
            <span style="color:#666;font-size:13px;" id="s-fov-val">${fov}°</span>
          </div>
          <input type="range" id="s-fov" min="40" max="120" value="${fov}" style="width:100%;accent-color:#ff6b35;">
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Controls</div>
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#ccc;font-size:14px;">Mouse Sensitivity</span>
            <span style="color:#666;font-size:13px;" id="s-sens-val">${sensitivity.toFixed(1)}x</span>
          </div>
          <input type="range" id="s-sensitivity" min="0.1" max="3" step="0.1" value="${sensitivity}" style="width:100%;accent-color:#ff6b35;">
        </div>
      </div>
      <button id="s-apply" style="width:100%;padding:12px;background:#ff6b35;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
        Apply & Save
      </button>
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById('s-fov').oninput = (event) => {
    document.getElementById('s-fov-val').textContent = event.target.value + '°';
  };
  document.getElementById('s-sensitivity').oninput = (event) => {
    document.getElementById('s-sens-val').textContent = parseFloat(event.target.value).toFixed(1) + 'x';
  };

  document.getElementById('settings-close').onclick = () => panel.remove();
  document.addEventListener('keydown', function esc(event) {
    if (event.key === 'Escape') {
      panel.remove();
      document.removeEventListener('keydown', esc);
    }
  });

  document.getElementById('s-apply').onclick = () => {
    const settings = {
      quality: document.getElementById('s-quality').value,
      shadows: document.getElementById('s-shadows').checked,
      fog: document.getElementById('s-fog').checked,
      clouds: document.getElementById('s-clouds').checked,
      sensitivity: parseFloat(document.getElementById('s-sensitivity').value),
      fov: parseInt(document.getElementById('s-fov').value, 10),
    };
    context.saveSettings?.(settings);
    context.applySettings?.(settings);
    panel.remove();
    context.showToast?.('⚙️ Settings saved!');
  };
}
