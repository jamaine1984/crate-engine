const STORAGE_KEY = 'crate_agent_memory';

function loadRawMemory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveMemory(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-200)));
  return entries;
}

export function loadMemory() {
  return loadRawMemory();
}

export function clearMemory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStats() {
  const memory = loadRawMemory();
  const types = {};
  let scoreTotal = 0;
  for (const item of memory) {
    const type = item.type || 'unknown';
    types[type] = (types[type] || 0) + 1;
    scoreTotal += Number(item.score || 0);
  }
  return {
    total: memory.length,
    avgScore: memory.length ? (scoreTotal / memory.length).toFixed(2) : '0.00',
    refs: Object.keys(types).length,
    types
  };
}

export function showMemory() {
  const memory = loadRawMemory();
  const existing = document.getElementById('agent-memory-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'agent-memory-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:100002;display:flex;align-items:center;justify-content:center;padding:24px;';
  modal.innerHTML = `
    <div style="width:min(640px,95vw);max-height:80vh;overflow:auto;background:#0d0d0d;border:1px solid #333;border-radius:16px;padding:20px;color:#eee;font-family:'JetBrains Mono',monospace;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <strong>Agent Memory</strong>
        <button id="agent-memory-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="color:#888;font-size:12px;margin-bottom:12px;">${memory.length} lessons saved locally</div>
      <pre style="white-space:pre-wrap;line-height:1.5;color:#ddd;font-size:12px;margin:0;">${memory.length ? memory.slice(-50).map((entry) => `[${entry.type || 'note'} | ${entry.score ?? '?'}] ${entry.summary || ''}`).join('\n') : 'No memory yet.'}</pre>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
  document.getElementById('agent-memory-close').onclick = () => modal.remove();
}

export async function agentBuildLoop(prompt, iterations = 1) {
  const entry = {
    type: 'build',
    score: 1,
    summary: String(prompt || '').trim(),
    iterations,
    ts: Date.now()
  };
  const memory = loadRawMemory();
  memory.push(entry);
  saveMemory(memory);

  if (window._parseAndExecute) {
    await window._parseAndExecute(prompt);
  }

  return entry;
}
