import http from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateModelFile } from '../../functions/_security/model-file.mjs';

const MAX_ASSET_BYTES = 16 * 1024 * 1024, MAX_ASSETS = 4;
function originValue(value) {
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password || !['http:', 'https:'].includes(url.protocol)
    || (url.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('Use one exact HTTPS app origin or local development origin.');
  return value;
}
const equalToken = (value, token) => typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(value), Buffer.from(token));
async function readBody(request, limit) {
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw Object.assign(new Error(), { status: 413 });
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > limit) throw Object.assign(new Error(), { status: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks, size);
}

/** In-memory, per-start paired bridge. It never accepts a disk path or runs model code. */
export function createAssetBridge({ origin = 'http://127.0.0.1:4173', port = 9877 } = {}) {
  originValue(origin);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local bridge port.');
  const token = randomBytes(32).toString('base64url'), assets = new Map(); let activeUploads = 0;
  const server = http.createServer(async (req, res) => {
    const send = (status, data, extra = {}) => { if (res.destroyed) return; res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(JSON.stringify(data)); };
    const boundPort = server.address()?.port;
    if (req.headers.host !== `127.0.0.1:${boundPort}` || !/^\/(?:status|assets(?:\/[a-f0-9-]{36})?)$/.test(req.url || '')) return send(403, { error: 'Invalid local endpoint.' });
    const browserOrigin = req.headers.origin;
    if (browserOrigin !== undefined && browserOrigin !== origin) return send(403, { error: 'Origin not allowed.' });
    if (browserOrigin === origin) {
      res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin');
      res.setHeader('access-control-expose-headers', 'Content-Type, Content-Length, ETag');
    }
    if (req.method === 'OPTIONS') {
      if (browserOrigin !== origin || !['GET', 'POST'].includes(req.headers['access-control-request-method'])) return send(403, { error: 'Preflight denied.' });
      const headers = String(req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
      if (headers.some(x => !['authorization', 'content-type', 'x-asset-name'].includes(x))) return send(403, { error: 'Preflight denied.' });
      return send(204, undefined, { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'Authorization, Content-Type, X-Asset-Name', 'access-control-max-age': '60', 'access-control-allow-private-network': 'true' });
    }
    if (!equalToken(req.headers.authorization, `Bearer ${token}`)) return send(401, { error: 'Pairing required.' });
    if (req.method !== 'POST' && browserOrigin !== origin) return send(403, { error: 'App origin required.' });
    if (req.method === 'GET' && req.url === '/status') return send(200, { ok: true, protocol: 1, assetCount: assets.size, maxAssetBytes: MAX_ASSET_BYTES });
    if (req.method === 'GET' && req.url === '/assets') return send(200, { assets: [...assets.values()].map(({ bytes, ...metadata }) => metadata).reverse(), latestId: [...assets.keys()].at(-1) || null });
    if (req.method === 'GET' && req.url.startsWith('/assets/')) {
      const asset = assets.get(req.url.slice(8)); if (!asset) return send(404, { error: 'Asset not found.' });
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': asset.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'", 'content-disposition': 'attachment; filename="blender-export.glb"', etag: `"${asset.sha256}"` }); return res.end(asset.bytes);
    }
    if (req.method !== 'POST' || req.url !== '/assets') return send(405, { error: 'Method not allowed.' });
    if (req.headers['content-type'] !== 'model/gltf-binary' || req.headers['content-encoding']) return send(415, { error: 'Send an uncompressed GLB.' });
    if (activeUploads >= 2) return send(429, { error: 'Bridge busy.' });
    activeUploads++;
    try {
      let name; try { name = decodeURIComponent(req.headers['x-asset-name'] || 'Blender export'); } catch { return send(400, { error: 'Invalid asset name.' }); }
      if (name.length < 1 || name.length > 80 || /[\x00-\x1f\x7f/\\]/.test(name)) return send(400, { error: 'Invalid asset name.' });
      const bytes = await readBody(req, MAX_ASSET_BYTES);
      validateModelFile(bytes, 'glb');
      const metadata = { id: randomUUID(), name: name.normalize('NFC'), size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), createdAt: new Date().toISOString() };
      while (assets.size >= MAX_ASSETS) assets.delete(assets.keys().next().value);
      assets.set(metadata.id, { ...metadata, bytes }); return send(201, { asset: metadata });
    } catch (error) { return send(error.status === 413 ? 413 : 400, { error: error.status === 413 ? 'Asset exceeds 16 MiB.' : 'Invalid self-contained GLB.' }); }
    finally { activeUploads--; }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 2000; server.maxHeadersCount = 30;
  server.on('clientError', (_error, socket) => { if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return { token, origin, server,
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(server.address()); }); }),
    close: () => new Promise(resolve => { assets.clear(); server.closeAllConnections(); server.close(resolve); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] === '--origin' && args[i + 1]) options.origin = args[i + 1];
      else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] || '')) options.port = Number(args[i + 1]);
      else throw new Error('Usage: node integrations/blender/bridge.mjs [--origin exact-origin] [--port 9877]');
    }
    const bridge = createAssetBridge(options), address = await bridge.listen();
    process.stdout.write(`Crate Ship Blender bridge: http://127.0.0.1:${address.port}\nApp origin: ${bridge.origin}\nPairing token (local only): ${bridge.token}\nAssets stay in memory. Closing the bridge removes them and invalidates pairing.\n`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await bridge.close(); process.exit(0); });
  } catch (error) { process.stderr.write(error.code === 'EADDRINUSE' ? 'Local bridge port is already in use.\n' : 'Could not start bridge. Check origin and port arguments.\n'); process.exitCode = 1; }
}
