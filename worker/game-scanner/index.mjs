import { scanGameArchive, WEB_BUILD_LIMITS } from '../../platform/server/game-scan.mjs';
import { readJson } from '../../platform/server/common.mjs';

/**
 * Service-binding-only build checker (workers_dev = false, no routes). The Pages
 * app is the only caller; it trusts this response as the scan attestation.
 */
export default {
  async fetch(request, env) {
    const json = (data, status = 200) => Response.json(data, { status });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/scan') return json({ error: 'Not found' }, 404);
    if (!env.PLATFORM_UPLOADS?.get) return json({ error: 'Unavailable' }, 503);
    let body;
    try { body = await readJson(request, 4000); } catch { return json({ error: 'Invalid request' }, 400); }
    const key = String(body.objectKey || '');
    if (!/^quarantine\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.zip$/.test(key)) return json({ error: 'Invalid object' }, 400);
    const object = await env.PLATFORM_UPLOADS.get(key);
    if (!object) return json({ error: 'Not found' }, 404);
    if (object.size > WEB_BUILD_LIMITS.maxArchiveBytes) {
      return json({ status: 'rejected', errors: ['The ZIP is larger than 16 MB. Browser games must be 16 MB or smaller.'] });
    }
    const result = await scanGameArchive(new Uint8Array(await object.arrayBuffer()));
    return json(result.status === 'clean' ? { ...result, sizeBytes: object.size } : result);
  },
};
