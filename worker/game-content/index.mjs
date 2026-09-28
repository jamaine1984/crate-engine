/** Deploy on an unrelated content domain; bind only read access to released objects. */
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', wasm: 'application/wasm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', glb: 'model/gltf-binary', gltf: 'model/gltf+json', bin: 'application/octet-stream', woff2: 'font/woff2' };
const hash = /^[a-f0-9]{64}$/;
const identifier = /^[a-zA-Z0-9-]{1,80}$/;

function deny(status) {
  return new Response('Game content unavailable', { status, headers: {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'content-type': 'text/plain; charset=utf-8', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
  } });
}

function secureOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid origin');
  return url;
}

function relatedHosts(a, b) {
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a) || a.split('.').slice(-2).join('.') === b.split('.').slice(-2).join('.');
}

function safePath(path) {
  if (typeof path !== 'string' || !path || new TextEncoder().encode(path).length > 512 || path !== path.normalize('NFC') || /[\\:%?#\x00-\x1f\x7f-\x9f]/u.test(path)) return false;
  const parts = path.split('/');
  return parts.length <= 24 && parts.every((part) => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

function requestedFile(url) {
  const rawParts = url.pathname.split('/');
  if (rawParts.length < 5 || rawParts[0] || rawParts[1] !== 'games' || !identifier.test(rawParts[2]) || !identifier.test(rawParts[3])) return null;
  const parts = rawParts.slice(4).map((part) => {
    const decoded = decodeURIComponent(part);
    if (!decoded || decoded.includes('/') || decoded.includes('\\')) throw new Error('Encoded separator');
    return decoded;
  });
  const path = parts.join('/');
  return safePath(path) ? { gameId: rawParts[2], versionId: rawParts[3], path } : null;
}

function releaseManifest(raw) {
  if (typeof raw !== 'string' || raw.length > 4 * 1024 * 1024) return null;
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) return null;
  const paths = new Set(), prefixes = new Map();
  for (const row of rows) {
    if (!row || !safePath(row.path) || !Number.isSafeInteger(row.size) || row.size < 0 || !hash.test(row.sha256 || '')) return null;
    const folded = row.path.toUpperCase(); if (paths.has(folded)) return null; paths.add(folded);
    const segments = row.path.split('/');
    for (let i = 1; i <= segments.length; i++) {
      const prefix = segments.slice(0, i).join('/'), isFile = i === segments.length;
      const previous = prefixes.get(prefix.toUpperCase());
      if (previous && (previous.path !== prefix || previous.isFile !== isFile)) return null;
      prefixes.set(prefix.toUpperCase(), { path: prefix, isFile });
    }
  }
  if (!rows.some((row) => row.path === 'index.html' && row.size > 0)) return null;
  return rows;
}

export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return deny(405);
    if (!env.PLATFORM_DB?.prepare || !env.PUBLISHED_GAMES?.get || !env.APP_ORIGIN || !env.GAME_CONTENT_ORIGIN) return deny(503);
    try {
      const app = secureOrigin(env.APP_ORIGIN), content = secureOrigin(env.GAME_CONTENT_ORIGIN), url = new URL(request.url);
      if (url.origin !== content.origin || relatedHosts(app.hostname, content.hostname) || url.username || url.password || url.hash) return deny(503);
      let target;
      try { target = requestedFile(url); } catch { return deny(400); }
      if (!target) return deny(404);
      const { gameId, versionId, path } = target;
      // Every normalized URL is authorized against its own exact game/version;
      // no request path is ever joined to a different release's object prefix.
      const release = await env.PLATFORM_DB.prepare(`SELECT r.manifest_json, r.checksum
        FROM platform_release_manifests r
        JOIN platform_games g ON g.id = r.game_id
        JOIN platform_game_versions v ON v.id = r.version_id AND v.game_id = r.game_id
        WHERE r.game_id = ? AND r.version_id = ? AND g.status = 'published'
          AND g.active_version_id = v.id AND v.status = 'published'
          AND v.platform = 'web' AND v.scan_status = 'clean' AND v.checksum = r.checksum
          AND (g.price_minor IS NULL OR g.price_minor = 0)`)
        .bind(gameId, versionId).first();
      // No bearer query string or cookie bypass: paid delivery needs a separate
      // entitlement-bound protocol and is deliberately unavailable here.
      if (!release || !hash.test(release.checksum || '')) return deny(404);
      const manifest = releaseManifest(release.manifest_json);
      if (!manifest) return deny(503);
      const file = manifest.find((entry) => entry.path === path); if (!file) return deny(404);
      const object = await env.PUBLISHED_GAMES.get(`games/${gameId}/${versionId}/${path}`);
      if (!object) return deny(404);
      // A trusted immutable-promotion step must stamp each file's scanner hash.
      if (object.size !== file.size || object.customMetadata?.sha256 !== file.sha256) return deny(503);
      const extension = path.split('.').pop().toLowerCase();
      const headers = new Headers({
        'content-type': types[extension] || 'application/octet-stream',
        'content-length': String(file.size), 'etag': `"${file.sha256}"`,
        'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'cross-origin',
        // A sandboxed game has opaque Origin and needs CORS for its own assets.
        'access-control-allow-origin': '*',
        'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=(), clipboard-read=(), clipboard-write=()',
      });
      const source = content.origin;
      headers.set('content-security-policy', `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' ${source} blob:; style-src 'unsafe-inline' ${source} blob:; img-src ${source} data: blob:; media-src ${source} blob: data:; font-src ${source} data: blob:; connect-src ${source} blob:; worker-src ${source} blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; sandbox allow-scripts allow-pointer-lock; frame-ancestors ${app.origin}`);
      if (!types[extension]) headers.set('content-disposition', 'attachment');
      return new Response(request.method === 'HEAD' ? null : object.body, { headers });
    } catch {
      // Backend exceptions, manifest JSON, binding names and object keys never
      // cross into an untrusted game response.
      return deny(503);
    }
  },
};
