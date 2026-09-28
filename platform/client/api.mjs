const BASE = '/api/platform';
export class ApiError extends Error {
  constructor(message, status, code, details) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details; }
}
export async function api(path, options = {}) {
  const { body, headers: supplied = {}, timeout = 20000, ...rest } = options;
  const method = (rest.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...supplied };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const isBinary = body instanceof Blob || body instanceof ArrayBuffer;
  if (body !== undefined && !isForm && !isBinary) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(BASE + path, { ...rest, method, headers, credentials: 'same-origin', signal: rest.signal || controller.signal, body: body === undefined ? undefined : isForm || isBinary ? body : JSON.stringify(body) });
    const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    if (!response.ok || data?.ok === false) throw new ApiError(data?.error?.message || (typeof data?.error === 'string' ? data.error : data?.message) || 'This request could not be completed. Please try again.', response.status, data?.code || data?.error?.code, data);
    if (!data) throw new ApiError('The platform service did not return a valid response.', 502, 'INVALID_RESPONSE');
    const normalizeGame = g => g && ({...g,coverUrl:g.coverUrl||g.cover,heroUrl:g.heroUrl||g.hero,priceCents:g.priceCents??g.priceMinor,genre:g.genre||g.genres?.[0],controls:g.controls||g.metadata?.controls});
    if(data.game)data.game=normalizeGame(data.game);
    if(Array.isArray(data.games))data.games=data.games.map(normalizeGame);
    if(Array.isArray(data.items)&&['/library','/favorites','/history'].includes(path))data.items=data.items.map(normalizeGame);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('The request took too long. Please try again.', 408, 'TIMEOUT');
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reach the platform. Check your connection and try again.', 0, 'NETWORK');
  } finally { clearTimeout(timer); }
}
export function listOf(data, key = 'items') { return Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : []; }
export function messageFor(error) { if (error.status === 401) return 'Please log in to continue.'; if (error.status === 429) return 'Too many requests. Please wait a moment and try again.'; return error.message || 'Something went wrong. Please try again.'; }
