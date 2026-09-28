import { HttpError, json, id, now, database, requireMutationOrigin, audit } from './common.mjs';
import { requireRole, requireUser } from './identity.mjs';
import { ownGame, rate } from './data.mjs';

/** Game screenshots: three still images per game. Video is deliberately unsupported. */
export const MEDIA_LIMITS = Object.freeze({ slots: 3, maxBytes: 1024 * 1024, minWidth: 320, minHeight: 180, maxSide: 4096 });
const DEVELOPER_ROLES = ['DEVELOPER', 'PARTNER_DEVELOPER', 'OWNER'];
const LOCKED = ['submitted', 'under_review', 'approved', 'published'];
const EXTENSIONS = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const fail = (status, message, code = 'MEDIA_INVALID') => { throw new HttpError(status, message, code); };
export const mediaUrl = mediaId => `/api/platform/media/${mediaId}`;

/** Reads the real format and pixel size from the file header; the declared type is never trusted. */
export function imageInfo(bytes) {
  const b = bytes, n = b.length, u16 = i => (b[i] << 8) | b[i + 1], u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const le16 = i => b[i] | (b[i + 1] << 8), le24 = i => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (n > 24 && u32(0) === 0x89504e47 && u32(4) === 0x0d0a1a0a && u32(12) === 0x49484452) return { type: 'image/png', width: u32(16), height: u32(20) };
  if (n > 30 && u32(0) === 0x52494646 && u32(8) === 0x57454250) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8X') return { type: 'image/webp', width: le24(24) + 1, height: le24(27) + 1 };
    if (chunk === 'VP8L' && b[20] === 0x2f) { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { type: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { type: 'image/webp', width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    return null;
  }
  if (n > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < n) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const length = u16(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { type: 'image/jpeg', width: u16(i + 7), height: u16(i + 5) };
      if (length < 2) return null;
      i += 2 + length;
    }
  }
  return null;
}

async function listMedia(db, gameId) {
  return ((await db.prepare('SELECT id,position,content_type contentType,width,height,size_bytes sizeBytes FROM platform_game_media WHERE game_id=? ORDER BY position').bind(gameId).all()).results || [])
    .map(m => ({ ...m, url: mediaUrl(m.id) }));
}
export { listMedia };

export async function handleMedia(request, env, path) {
  const db = database(env), method = request.method;
  const serve = /^\/media\/([A-Za-z0-9-]{1,80})$/.exec(path);
  if (serve && method === 'GET') {
    const media = await db.prepare('SELECT m.*,g.status,g.developer_id FROM platform_game_media m JOIN platform_games g ON g.id=m.game_id WHERE m.id=?').bind(serve[1]).first();
    if (!media) fail(404, 'Image not found.', 'NOT_FOUND');
    const isPublic = media.status === 'published';
    if (!isPublic) {
      // Unpublished screenshots are visible to their creator, assigned members and the owner (for review).
      let user; try { user = await requireUser(request, env); } catch { fail(404, 'Image not found.', 'NOT_FOUND'); }
      const allowed = user.id === media.developer_id || user.roles.includes('OWNER') ||
        await db.prepare('SELECT 1 FROM platform_game_members WHERE game_id=? AND user_id=?').bind(media.game_id, user.id).first();
      if (!allowed) fail(404, 'Image not found.', 'NOT_FOUND');
    }
    const object = await env.PLATFORM_UPLOADS?.get(media.object_key);
    if (!object) fail(404, 'Image not found.', 'NOT_FOUND');
    return new Response(object.body, { headers: {
      'content-type': media.content_type, 'content-length': String(media.size_bytes),
      // Media ids change on every replacement, so a published image can be cached for good.
      'cache-control': isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'content-security-policy': "default-src 'none'; sandbox", 'x-content-type-options': 'nosniff',
      'content-disposition': 'inline', 'cross-origin-resource-policy': 'same-origin',
    } });
  }
  const slot = /^\/developer\/games\/([^/]+)\/media\/([1-3])$/.exec(path);
  if (!slot || !['PUT', 'DELETE'].includes(method)) return null;
  requireMutationOrigin(request, env);
  const user = await requireRole(request, env, DEVELOPER_ROLES);
  if (!user.emailVerified) fail(403, 'Verify your email first.', 'EMAIL_VERIFICATION_REQUIRED');
  if (!env.PLATFORM_UPLOADS) fail(503, 'Image storage is not available right now.', 'STORAGE_UNAVAILABLE');
  const game = await ownGame(env, user, slot[1]), position = Number(slot[2]);
  if (LOCKED.includes(game.status)) fail(409, 'Screenshots are locked while your game is in review or live. Submit a new version to change them.', 'LISTING_LOCKED');
  await rate(env, user.id, 'media-change', 30, 3600);
  const existing = await db.prepare('SELECT * FROM platform_game_media WHERE game_id=? AND position=?').bind(game.id, position).first();
  if (method === 'DELETE') {
    if (!existing) return json({ media: await listMedia(db, game.id) });
    await db.prepare('DELETE FROM platform_game_media WHERE id=?').bind(existing.id).run();
    await env.PLATFORM_UPLOADS.delete(existing.object_key);
    if (position === 1) await db.prepare('UPDATE platform_games SET cover_url=NULL,updated_at=? WHERE id=?').bind(now(), game.id).run();
    await audit(env, { actor: user.id, action: 'media.remove', target: game.id, detail: { position } });
    return json({ media: await listMedia(db, game.id) });
  }
  const declared = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(declared) || declared < 1 || declared > MEDIA_LIMITS.maxBytes) fail(413, 'Each screenshot must be 1 MB or smaller.');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== declared || bytes.length > MEDIA_LIMITS.maxBytes) fail(413, 'Each screenshot must be 1 MB or smaller.');
  const info = imageInfo(bytes);
  if (!info) fail(415, 'Use a PNG, JPEG or WebP image.');
  if (info.width < MEDIA_LIMITS.minWidth || info.height < MEDIA_LIMITS.minHeight) fail(400, 'Screenshots must be at least 320 × 180 pixels.');
  if (info.width > MEDIA_LIMITS.maxSide || info.height > MEDIA_LIMITS.maxSide) fail(400, 'Screenshots can be at most 4096 pixels on each side.');
  const mediaId = id(), key = `media/${game.id}/${mediaId}.${EXTENSIONS[info.type]}`;
  await env.PLATFORM_UPLOADS.put(key, bytes, { httpMetadata: { contentType: info.type }, customMetadata: { game: game.id, owner: user.id } });
  const statements = [];
  if (existing) statements.push(db.prepare('DELETE FROM platform_game_media WHERE id=?').bind(existing.id));
  statements.push(db.prepare('INSERT INTO platform_game_media(id,game_id,position,object_key,content_type,size_bytes,width,height,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(mediaId, game.id, position, key, info.type, bytes.length, info.width, info.height, user.id, now()));
  if (position === 1) statements.push(db.prepare('UPDATE platform_games SET cover_url=?,updated_at=? WHERE id=?').bind(mediaUrl(mediaId), now(), game.id));
  try { await db.batch(statements); } catch (error) { await env.PLATFORM_UPLOADS.delete(key); throw error; }
  if (existing) await env.PLATFORM_UPLOADS.delete(existing.object_key);
  await audit(env, { actor: user.id, action: 'media.upload', target: game.id, detail: { position, sizeBytes: bytes.length } });
  return json({ media: await listMedia(db, game.id) }, 201);
}
