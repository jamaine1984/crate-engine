/** Shared platform boundary. Never falls back to the legacy production database. */
export class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message); this.name = 'HttpError'; this.status = status; this.code = code;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  } });
}

export async function readJson(request, maxBytes = 16_384) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError(415, 'Send an application/json request.', 'JSON_REQUIRED');
  }
  if (Number(request.headers.get('content-length') || 0) > maxBytes) {
    throw new HttpError(413, 'Request is too large.', 'REQUEST_TOO_LARGE');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON object is required.', 'INVALID_JSON');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'Request is too large.', 'REQUEST_TOO_LARGE');
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'A valid JSON object is required.', 'INVALID_JSON');
  } finally { reader.releaseLock(); }
}

export const id = () => crypto.randomUUID();
export const now = () => Math.floor(Date.now() / 1000);

export function database(env) {
  if (!env.PLATFORM_DB?.prepare || !env.PLATFORM_DB?.batch) {
    throw new HttpError(503, 'The platform database is not configured.', 'DATABASE_UNAVAILABLE');
  }
  return env.PLATFORM_DB;
}

export function appOrigin(env) {
  let url;
  try { url = new URL(env.APP_ORIGIN); } catch {
    throw new HttpError(503, 'Authentication origin is not configured.', 'AUTH_UNAVAILABLE');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (!local && url.protocol !== 'https:') ||
      (local && String(env.AUTH_LOCAL_DEV) !== 'true') ||
      (!['http:', 'https:'].includes(url.protocol))) {
    throw new HttpError(503, 'Authentication origin configuration is invalid.', 'AUTH_UNAVAILABLE');
  }
  return { origin: url.origin, local };
}

export function requireMutationOrigin(request, env) {
  const { origin } = appOrigin(env);
  if (new URL(request.url).origin !== origin || request.headers.get('origin') !== origin) {
    throw new HttpError(403, 'This request must come from the application.', 'ORIGIN_DENIED');
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'Cross-site requests are not allowed.', 'ORIGIN_DENIED');
  }
}

function scrub(value, depth = 0) {
  if (depth > 5) return '[depth limit]';
  if (typeof value === 'string') return value.slice(0, 1024);
  if (Array.isArray(value)) return value.slice(0, 30).map(v => scrub(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 40)
    .map(([key, val]) => [key, /password|secret|token|authorization|cookie|private.?key/i.test(key)
      ? '[redacted]' : scrub(val, depth + 1)]));
  return value ?? null;
}

export async function audit(env, event) {
  const { actor, action, target, result = 'success', ...detail } = event;
  await database(env).prepare(`INSERT INTO platform_audit
    (id, actor_id, action, target_id, detail_json, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id(), typeof actor === 'object' ? actor?.id ?? null : actor ?? null,
      String(action || 'unknown').slice(0, 100), typeof target === 'object' ? target?.id ?? null : target ?? null,
      JSON.stringify(scrub(detail)), String(result).slice(0, 40), now()).run();
}
