import { HttpError, json, readJson, id, now, database, requireMutationOrigin } from './common.mjs';
import { requireRole } from './identity.mjs';
import { demandFlag } from './data.mjs';
const fail = (status, message) => { throw new HttpError(status, message, 'RELEASE_BLOCKED'); };

export async function handleReleases(request, env, path) {
  const match = /^\/owner\/games\/([^/]+)\/publish$/.exec(path);
  if (!match || request.method !== 'POST') return null;
  requireMutationOrigin(request, env);
  const user = await requireRole(request, env, ['OWNER'], { mfa: true, recent: true });
  const db = database(env);
  await demandFlag(env, 'PUBLIC_CREATOR_PUBLISHING_ENABLED');
  if (await db.prepare("SELECT 1 FROM platform_feature_flags WHERE key='MAINTENANCE_MODE' AND enabled=1").first()) fail(503, 'Publication is paused for maintenance.');
  if (!env.GAME_PUBLISHER?.fetch || typeof env.PUBLISHER_INTERNAL_SECRET !== 'string' || env.PUBLISHER_INTERNAL_SECRET.length < 32) fail(503, 'Reviewed game delivery has not been configured.');
  try {
    const origin = new URL(env.GAME_CONTENT_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin === new URL(request.url).origin || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error();
  } catch { fail(503, 'Game delivery requires a separate secure origin.'); }
  const body = await readJson(request, 1000), reason = String(body.reason || '').trim();
  if (reason.length < 5) fail(400, 'Give a publication reason.');
  const game = await db.prepare("SELECT * FROM platform_games WHERE id=? AND status='approved'").bind(match[1]).first();
  if (!game) fail(409, 'A separately approved game is required.');
  if (game.price_minor > 0) fail(409, 'Paid delivery requires a separate commerce release.');
  const version = await db.prepare(`SELECT v.*,u.object_key FROM platform_game_versions v
    JOIN platform_uploads u ON u.id=v.upload_id AND u.game_id=v.game_id AND u.version_id=v.id
    WHERE v.id=? AND v.game_id=? AND v.platform='web' AND v.status='ready' AND v.scan_status='clean'
    AND u.status='ready' AND v.checksum=u.checksum`).bind(game.active_version_id, game.id).first();
  if (!version?.scan_reference || !version.checksum || !version.manifest_json) fail(409, 'The exact build must have a clean scan attestation and manifest.');
  const at = now();
  const assignment = await db.prepare(`SELECT a.id,a.version_id FROM platform_game_agreements a
    JOIN platform_agreement_versions v ON v.id=a.version_id WHERE a.game_id=?
    AND a.effective_at<=? AND (a.end_at IS NULL OR a.end_at>?) AND v.effective_at<=? AND (v.end_at IS NULL OR v.end_at>?)`)
    .bind(game.id, at, at, at, at).all();
  if (assignment.results.length !== 1) fail(409, 'Assign one explicit effective agreement, including for platform-owned games.');
  let response;
  try {
    response = await env.GAME_PUBLISHER.fetch(new Request('https://publisher.internal/promote', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PUBLISHER_INTERNAL_SECRET}` },
      body: JSON.stringify({ gameId: game.id, versionId: version.id, checksum: version.checksum }) }));
  } catch { fail(503, 'The build could not be promoted. It has not been published.'); }
  if (!response.ok) fail(503, 'The build could not be promoted. It has not been published.');
  let release;
  try { release = await response.json(); } catch { fail(502, 'Promotion proof was not valid JSON.'); }
  if (release?.checksum !== version.checksum || release?.gameId !== game.id || release?.versionId !== version.id || release?.status !== 'ready') fail(502, 'Promotion proof did not match the approved build.');
  const committedAt = now(), publicationId = id(), agreement = assignment.results[0];
  // This unique audit insertion claims the transaction only after every mutable
  // approval is rechecked. Later writes require THIS claim. Concurrent losers
  // cannot write another winner's manifest/audit. A failed batch rolls it back.
  const result = await db.batch([
    db.prepare(`INSERT INTO platform_audit(id,actor_id,action,target_id,detail_json,result,created_at)
      SELECT ?,?,?,?,?,?,? FROM platform_games g WHERE g.id=? AND g.developer_id=? AND g.status='approved'
      AND COALESCE(g.price_minor,0)=0 AND g.active_version_id=?
      AND EXISTS(SELECT 1 FROM platform_game_versions v JOIN platform_uploads u ON u.id=v.upload_id
        AND u.game_id=v.game_id AND u.version_id=v.id
        WHERE v.id=? AND v.game_id=g.id AND v.upload_id=? AND v.status='ready' AND v.platform='web'
        AND v.scan_status='clean' AND v.scan_reference=? AND v.checksum=? AND v.manifest_json=?
        AND u.status='ready' AND u.checksum=v.checksum AND u.object_key=?)
      AND EXISTS(SELECT 1 FROM platform_feature_flags WHERE key='PUBLIC_CREATOR_PUBLISHING_ENABLED' AND enabled=1)
      AND NOT EXISTS(SELECT 1 FROM platform_feature_flags WHERE key='MAINTENANCE_MODE' AND enabled=1)
      AND (SELECT COUNT(*) FROM platform_game_agreements a JOIN platform_agreement_versions v ON v.id=a.version_id
        WHERE a.game_id=g.id AND a.effective_at<=? AND (a.end_at IS NULL OR a.end_at>?)
        AND v.effective_at<=? AND (v.end_at IS NULL OR v.end_at>?))=1
      AND EXISTS(SELECT 1 FROM platform_game_agreements a JOIN platform_agreement_versions v ON v.id=a.version_id
        WHERE a.id=? AND a.version_id=? AND a.game_id=g.id AND a.effective_at<=? AND (a.end_at IS NULL OR a.end_at>?)
        AND v.effective_at<=? AND (v.end_at IS NULL OR v.end_at>?))
      AND EXISTS(SELECT 1 FROM platform_users u JOIN platform_user_roles r ON r.user_id=u.id
        JOIN platform_sessions s ON s.user_id=u.id WHERE u.id=? AND u.status='active' AND u.email_verified=1
        AND r.role='OWNER' AND s.id=? AND s.revoked_at IS NULL AND s.expires_at>?
        AND s.auth_time>=? AND s.mfa_time>=?)
      AND NOT EXISTS(SELECT 1 FROM platform_release_manifests m WHERE m.version_id=?
        AND (m.game_id!=g.id OR m.checksum!=? OR m.manifest_json!=?))`)
      .bind(publicationId, user.id, 'game.publish', game.id,
        JSON.stringify({ versionId: version.id, checksum: version.checksum, agreementId: agreement.id, agreementVersionId: agreement.version_id, reason: reason.slice(0, 500) }), 'success', committedAt,
        game.id, game.developer_id, version.id, version.id, version.upload_id, version.scan_reference, version.checksum, version.manifest_json, version.object_key,
        committedAt, committedAt, committedAt, committedAt, agreement.id, agreement.version_id, committedAt, committedAt, committedAt, committedAt,
        user.id, user.sessionId, committedAt, committedAt - 300, committedAt - 300, version.id, version.checksum, version.manifest_json),
    db.prepare(`UPDATE platform_games SET status='published',published_at=?,updated_at=? WHERE id=?
      AND EXISTS(SELECT 1 FROM platform_audit WHERE id=?)`).bind(committedAt, committedAt, game.id, publicationId),
    db.prepare(`UPDATE platform_game_versions SET status='published' WHERE id=?
      AND EXISTS(SELECT 1 FROM platform_audit WHERE id=?)`).bind(version.id, publicationId),
    db.prepare(`INSERT INTO platform_release_manifests(version_id,game_id,checksum,manifest_json,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM platform_audit WHERE id=?) ON CONFLICT(version_id) DO NOTHING`)
      .bind(version.id, game.id, version.checksum, version.manifest_json, committedAt, publicationId),
  ]);
  if (!result[0]?.meta?.changes) fail(409, 'Publication conditions changed while preparing the build. Review the current game and try again.');
  return json({ published: true, gameId: game.id, versionId: version.id });
}
