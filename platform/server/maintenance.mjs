// Daily housekeeping, run by worker/engine-maintenance on a Cloudflare cron schedule (03:17 UTC every day).
// Every step is capped, so one run can never turn into a huge delete, and a backlog simply finishes over the next days.
// Every step is independent: if one fails, the others still run and the failure is reported in the log line.
import { database, now } from './common.mjs';
import { purgeEngineAssets } from './engine-assets.mjs';
import { rollUpVisits } from './analytics.mjs';

const DAY = 86400;
export const MAINTENANCE_LIMITS = Object.freeze({
  assetBatches: 5, assetBatchSize: 20,            // up to 100 private model files removed per run
  rowsPerStep: 2000,                              // up to 2,000 rows removed per table per run
  aiCommandDays: 1, aiLinkDays: 7, aiLinkIdleDays: 30, // AI app tool calls and editor links
  oauthCodeDays: 1, oauthTokenDays: 7,            // one-time codes; expired tokens (kept past expiry so reuse is still detected)
  sessionDays: 7,                                 // expired sign-in sessions
});

const removeSome = async (db, table, where, binds, limit) => {
  const result = await db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ?)`).bind(...binds, limit).run();
  return result.meta?.changes ?? 0;
};

export async function runMaintenance(env, { at = now(), limits = MAINTENANCE_LIMITS } = {}) {
  const db = database(env), cap = limits.rowsPerStep, summary = {};
  const step = async (name, task) => { try { summary[name] = await task(); } catch (error) { summary[name] = { failed: String(error?.message || error).slice(0, 160) }; } };

  await step('engineAssets', async () => {
    let deleted = 0, failed = 0;
    if (!env.ENGINE_ASSETS) return { skipped: 'no storage binding' };
    for (let i = 0; i < limits.assetBatches; i++) {
      const batch = await purgeEngineAssets(env, { limit: limits.assetBatchSize });
      deleted += batch.deleted; failed += batch.failed;
      if (batch.deleted + batch.failed < limits.assetBatchSize) break;
    }
    return { deleted, failed };
  });
  await step('visitStats', () => rollUpVisits(env));
  await step('rateLimits', async () => ({ removed: await removeSome(db, 'platform_rate_limits', 'expires_at < ?', [at], cap) }));
  await step('sessions', async () => ({ removed: await removeSome(db, 'platform_sessions', 'expires_at < ?', [at - limits.sessionDays * DAY], cap) }));
  await step('oauthCodes', async () => ({ removed: await removeSome(db, 'platform_oauth_codes', 'expires_at < ?', [at - limits.oauthCodeDays * DAY], cap) }));
  await step('oauthTokens', async () => ({ removed: await removeSome(db, 'platform_oauth_tokens', 'expires_at < ?', [at - limits.oauthTokenDays * DAY], cap) }));
  await step('aiCommands', async () => ({ removed: await removeSome(db, 'platform_ai_commands', 'created_at < ?', [at - limits.aiCommandDays * DAY], cap) }));
  await step('aiLinks', async () => {
    // A link can only go once its tool calls are gone (foreign key), so those are removed first.
    const stale = "(closed_at IS NOT NULL AND closed_at < ?) OR last_seen_at < ?", binds = [at - limits.aiLinkDays * DAY, at - limits.aiLinkIdleDays * DAY];
    const commands = await removeSome(db, 'platform_ai_commands', `link_id IN (SELECT id FROM platform_ai_editor_links WHERE ${stale})`, binds, cap);
    const links = await removeSome(db, 'platform_ai_editor_links', `(${stale}) AND NOT EXISTS (SELECT 1 FROM platform_ai_commands c WHERE c.link_id = platform_ai_editor_links.id)`, binds, cap);
    return { commandsRemoved: commands, linksRemoved: links };
  });
  return summary;
}
