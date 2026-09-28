/** Privileged parent boundary: only bounded, game-session-scoped operations. */
const actions = new Set(['ready', 'configuration', 'pause', 'resume', 'progress.load', 'progress.save', 'ads.rewarded']);
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function boundedJson(value, budget = { nodes: 0, chars: 0 }, depth = 0) {
  if (++budget.nodes > 2000 || depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') { budget.chars += value.length; return value.length <= 16000 && budget.chars <= 32000; }
  if (!Array.isArray(value) && !record(value)) return false;
  const entries = Object.entries(value); if (entries.length > 500) return false;
  for (const [key, child] of entries) {
    budget.chars += key.length;
    if (key.length > 200 || budget.chars > 32000 || !boundedJson(child, budget, depth + 1)) return false;
  }
  return true;
}

function message(data) {
  if (!record(data) || Object.keys(data).some((key) => !['channel', 'id', 'action', 'payload'].includes(key)) || data.channel !== 'crateship-v1' || typeof data.id !== 'string' || !idPattern.test(data.id) || !actions.has(data.action)) return null;
  const payload = data.payload ?? {};
  if (!record(payload)) return null;
  if (data.action === 'progress.save') {
    if (Object.keys(payload).some((key) => !['progress', 'revision'].includes(key)) || !Object.hasOwn(payload, 'progress') || !Number.isSafeInteger(payload.revision) || payload.revision < 0 || !boundedJson(payload.progress)) return null;
  } else if (Object.keys(payload).length) return null;
  // This check is reached only after bounded traversal, so serialization itself
  // cannot hold an unbounded graph/string or throw on BigInt/cyclic payloads.
  let serialized;
  try { serialized = JSON.stringify({ id: data.id, action: data.action, payload }); } catch { return null; }
  if (new TextEncoder().encode(serialized).length > 60000) return null;
  return { id: data.id, action: data.action, payload: JSON.parse(JSON.stringify(payload)) };
}

function publicError(error) {
  if (error?.code === 'REVISION_CONFLICT' || error?.status === 409) return 'Progress changed in another session. Reload before saving.';
  if ([401, 403].includes(error?.status)) return 'This game session is no longer available.';
  if (error?.status === 429) return 'Too many requests. Try again later.';
  if (error?.name === 'AbortError' || error?.code === 'TIMEOUT') return 'The platform request timed out.';
  return 'The platform request could not be completed.';
}

export function mountIsolatedPlayer(container, session, { api, onStatus = () => {} } = {}) {
  let content;
  try { content = new URL(session?.contentUrl); } catch { throw new Error('A valid isolated game session is required.'); }
  const app = new URL(location.origin);
  const related = app.hostname === content.hostname || app.hostname.endsWith('.' + content.hostname) || content.hostname.endsWith('.' + app.hostname) || app.hostname.split('.').slice(-2).join('.') === content.hostname.split('.').slice(-2).join('.');
  const route = /^\/games\/([a-zA-Z0-9-]{1,80})\/([a-zA-Z0-9-]{1,80})\/index\.html$/.exec(content.pathname);
  if (!record(session) || typeof session.id !== 'string' || !idPattern.test(session.id) || !route || route[1] !== session.gameId || related || content.protocol !== 'https:' || content.username || content.password || content.search || content.hash || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now() / 1000 || typeof api !== 'function') {
    throw new Error('A separate secure game origin and valid game session are required.');
  }
  const sessionId = session.id, expiresAt = session.expiresAt, cloudSaveAvailable = session.cloudSaveAvailable === true;
  const base = `/player/sessions/${encodeURIComponent(sessionId)}`;
  const frame = document.createElement('iframe'); frame.title = 'Game player';
  frame.sandbox = 'allow-scripts allow-pointer-lock'; frame.allow = 'fullscreen; gamepad';
  frame.referrerPolicy = 'no-referrer'; frame.src = content.href; frame.className = 'isolated-game-frame';
  const seen = new Set(), controllers = new Set();
  let queue = Promise.resolve(), pending = 0, count = 0, bucket = Date.now(), destroyed = false;

  function respond(id, result, error) {
    if (!destroyed) frame.contentWindow?.postMessage({ channel: 'crateship-v1', id, result, error }, '*');
  }

  async function request(path, options = {}) {
    const controller = new AbortController(); controllers.add(controller);
    let timer, abortListener;
    try {
      return await Promise.race([
        Promise.resolve().then(() => api(path, { ...options, signal: controller.signal })),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); const error = new Error(); error.code = 'TIMEOUT'; reject(error); }, 10000); }),
        new Promise((_, reject) => { abortListener = () => { const error = new Error(); error.name = 'AbortError'; reject(error); }; controller.signal.addEventListener('abort', abortListener, { once: true }); }),
      ]);
    } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abortListener); controllers.delete(controller); }
  }

  async function process(data) {
    if (destroyed) return;
    let result, error;
    try {
      if (Date.now() / 1000 >= expiresAt) { const expired = new Error(); expired.status = 403; throw expired; }
      switch (data.action) {
        case 'ready':
          result = { cloudSaveAvailable, adsEnabled: false, rewardsEnabled: false }; onStatus('ready'); break;
        case 'configuration': result = { adsEnabled: false, rewardsEnabled: false, cloudSaveAvailable }; break;
        case 'pause': case 'resume': onStatus(data.action); result = { ok: true }; break;
        case 'progress.load': {
          if (!cloudSaveAvailable) { error = 'Sign in for cloud saves.'; break; }
          const loaded = await request(base + '/progress');
          if (!record(loaded) || !Number.isSafeInteger(loaded.revision) || loaded.revision < 0 || !boundedJson(loaded.progress)) throw new Error();
          result = { progress: loaded.progress, revision: loaded.revision }; break;
        }
        case 'progress.save': {
          if (!cloudSaveAvailable) { error = 'Sign in for cloud saves.'; break; }
          const saved = await request(base + '/progress', { method: 'PUT', body: { progress: data.payload.progress, revision: data.payload.revision } });
          if (!record(saved) || saved.saved !== true || !Number.isSafeInteger(saved.revision) || saved.revision < 1) throw new Error();
          result = { saved: true, revision: saved.revision }; break;
        }
        case 'ads.rewarded': result = { available: false, rewardGranted: false }; break;
      }
    } catch (failure) { error = publicError(failure); }
    respond(data.id, result, error);
  }

  const listener = (event) => {
    if (destroyed || event.source !== frame.contentWindow || event.origin !== 'null') return;
    if (Date.now() - bucket >= 60000) { bucket = Date.now(); count = 0; }
    if (++count > 90) return;
    const data = message(event.data);
    if (!data || seen.has(data.id) || seen.size >= 12000) return;
    // Validate and reserve bounded queue capacity before creating promise work.
    seen.add(data.id);
    if (pending >= 8) { respond(data.id, undefined, 'Too many pending requests. Try again later.'); return; }
    pending++;
    queue = queue.then(() => process(data)).catch(() => {}).finally(() => { pending--; });
  };
  addEventListener('message', listener); container.replaceChildren(frame);
  return { frame, destroy() {
    destroyed = true; removeEventListener('message', listener);
    for (const controller of controllers) controller.abort();
    controllers.clear(); seen.clear(); frame.remove();
  } };
}
