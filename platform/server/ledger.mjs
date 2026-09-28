/**
 * Trusted backend ingestion ONLY. No HTTP route imports or exposes this function.
 * A future provider adapter must authenticate its webhook/report, reconcile the provider
 * reference, and perform readiness checks before calling this module. A browser's claims
 * of payment/ad completion/amounts are never suitable inputs. Providers remain disabled.
 * Tests call it only with an isolated in-memory SQLite database and explicit test fixtures.
 */
import { HttpError, database, id, now } from './common.mjs';
import { allocateRevenue, validateTerms, REVENUE_TYPES } from './commerce.mjs';

const INGEST_STATUSES = new Set(['estimated', 'pending_provider_finalization', 'finalized']);
const INPUT_KEYS = new Set(['provider', 'providerReference', 'gameId', 'revenueType', 'currency',
  'grossMinor', 'feesMinor', 'occurredAt', 'status']);
const fail = (status, message, code = 'INVALID_REVENUE_EVENT') => { throw new HttpError(status, message, code); };

function stringField(value, name, max = 255) {
  if (typeof value !== 'string' || !value.length || value.length > max || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) {
    fail(400, `${name} is invalid.`);
  }
  return value;
}
function validated(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'A verified provider event is required.');
  for (const key of Object.keys(input)) if (!INPUT_KEYS.has(key)) fail(400, `Unrecognized revenue field: ${key}.`);
  const provider = stringField(input.provider, 'Provider', 64);
  if (!/^[a-z][a-z0-9_-]*$/.test(provider)) fail(400, 'Provider must be a stable lowercase identifier.');
  const providerReference = stringField(input.providerReference, 'Provider reference');
  const gameId = stringField(input.gameId, 'Game ID', 100);
  if (!REVENUE_TYPES.includes(input.revenueType)) fail(400, 'Revenue type is not supported.');
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) fail(400, 'Use an uppercase three-letter currency code.');
  const feesMinor = input.feesMinor ?? 0;
  for (const amount of [input.grossMinor, feesMinor]) if (!Number.isSafeInteger(amount) || amount < 0) {
    fail(400, 'Revenue and fees must be nonnegative safe integer minor units.');
  }
  if (feesMinor > input.grossMinor) fail(400, 'Fees cannot exceed gross revenue.');
  if (!Number.isSafeInteger(input.occurredAt) || input.occurredAt < 0 || input.occurredAt > now() + 60) {
    fail(400, 'Event time must be a valid provider occurrence timestamp, not a future projection.');
  }
  if (!INGEST_STATUSES.has(input.status)) fail(400, 'Only estimated, pending-provider or finalized events may be ingested.');
  return { provider, providerReference, gameId, revenueType: input.revenueType, currency: input.currency,
    grossMinor: input.grossMinor, feesMinor, occurredAt: input.occurredAt, status: input.status };
}
function samePayload(row, event) {
  return row.provider === event.provider && row.provider_reference === event.providerReference &&
    row.game_id === event.gameId && row.type === event.revenueType && row.currency === event.currency &&
    row.gross_minor === event.grossMinor && row.fees_minor === event.feesMinor &&
    row.occurred_at === event.occurredAt && row.status === event.status;
}
function result(row, duplicate) {
  return { id: row.id, duplicate, gameId: row.game_id, creatorId: row.creator_id,
    agreementVersionId: row.agreement_version_id, provider: row.provider, providerReference: row.provider_reference,
    revenueType: row.type, currency: row.currency, grossMinor: row.gross_minor, feesMinor: row.fees_minor,
    eligibleMinor: row.eligible_minor, creatorMinor: row.creator_minor, platformMinor: row.platform_minor,
    status: row.status, occurredAt: row.occurred_at,
    // Finalization establishes an obligation, not payout authorization or disbursement.
    payoutEligible: false };
}
function duplicateResult(row, event) {
  if (!samePayload(row, event)) {
    fail(409, 'This provider reference already records a different event. Use an audited reconciliation/adjustment workflow.', 'REVENUE_REFERENCE_CONFLICT');
  }
  return result(row, true);
}

export async function recordVerifiedRevenue(env, input) {
  const event = validated(input); const db = database(env);
  const lookup = () => db.prepare('SELECT * FROM platform_revenue_events WHERE provider = ? AND provider_reference = ?')
    .bind(event.provider, event.providerReference).first();
  const existing = await lookup();
  if (existing) return duplicateResult(existing, event);

  const game = await db.prepare('SELECT id, developer_id FROM platform_games WHERE id = ?').bind(event.gameId).first();
  if (!game) fail(404, 'The referenced game does not exist.', 'REVENUE_GAME_NOT_FOUND');
  const candidates = (await db.prepare(`SELECT v.*, a.type AS agreement_type, a.creator_id,
    ga.id AS assignment_id, ga.effective_at AS assignment_start, ga.end_at AS assignment_end
    FROM platform_game_agreements ga
    JOIN platform_agreement_versions v ON v.id = ga.version_id
    JOIN platform_agreements a ON a.id = v.agreement_id
    WHERE ga.game_id = ? AND ga.effective_at <= ? AND (ga.end_at IS NULL OR ? < ga.end_at)
    AND v.effective_at <= ? AND (v.end_at IS NULL OR ? < v.end_at)`)
    .bind(game.id, event.occurredAt, event.occurredAt, event.occurredAt, event.occurredAt).all()).results;
  if (candidates.length !== 1) fail(409, 'Exactly one game agreement version must apply at the event time.', 'REVENUE_AGREEMENT_REQUIRED');
  const agreement = candidates[0];
  if (!['platform_owned', 'creator_revenue_share', 'custom'].includes(agreement.agreement_type)) {
    fail(409, 'The agreement classification is invalid.', 'INVALID_AGREEMENT');
  }
  if (agreement.currency !== event.currency) fail(409, 'The event currency does not match its agreement. Currency conversion must be separately reconciled.', 'REVENUE_CURRENCY_MISMATCH');
  if (agreement.agreement_type !== 'platform_owned' && !agreement.creator_id) {
    fail(409, 'Creator revenue requires an explicitly assigned creator.', 'INVALID_AGREEMENT');
  }
  if (agreement.creator_id && agreement.creator_id !== game.developer_id) {
    fail(409, 'The agreement creator does not match the game developer.', 'INVALID_AGREEMENT');
  }
  let terms;
  try { terms = validateTerms(JSON.parse(agreement.terms_json), agreement.agreement_type); }
  catch { fail(409, 'The stored agreement terms are invalid; owner review is required.', 'INVALID_AGREEMENT'); }
  const allocation = allocateRevenue({ grossMinor: event.grossMinor, feesMinor: event.feesMinor,
    creatorBps: terms[event.revenueType].creatorBps, currency: event.currency });
  const eventId = id(); const createdAt = now();
  await db.batch([
    db.prepare(`INSERT INTO platform_revenue_events
      (id, game_id, creator_id, agreement_version_id, provider, provider_reference, type, currency,
       gross_minor, fees_minor, eligible_minor, creator_minor, platform_minor, status, occurred_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_reference) DO NOTHING`)
      .bind(eventId, game.id, agreement.creator_id, agreement.id, event.provider, event.providerReference,
        event.revenueType, event.currency, event.grossMinor, event.feesMinor, allocation.eligibleMinor,
        allocation.creatorMinor, allocation.platformMinor, event.status, event.occurredAt, createdAt),
    db.prepare(`INSERT INTO platform_creator_obligations
      (id, event_id, creator_id, amount_minor, currency, status, created_at)
      SELECT ?, id, creator_id, creator_minor, currency, 'finalized', ? FROM platform_revenue_events
      WHERE id = ? AND status = 'finalized' AND creator_id IS NOT NULL AND creator_minor > 0
      ON CONFLICT(event_id) DO NOTHING`).bind(id(), createdAt, eventId),
    db.prepare(`INSERT INTO platform_audit (id, actor_id, action, target_id, detail_json, result, created_at)
      SELECT ?, NULL, 'commerce.revenue.recorded', id, ?, 'success', ? FROM platform_revenue_events WHERE id = ?`)
      .bind(id(), JSON.stringify({ provider: event.provider, revenueType: event.revenueType, status: event.status }), createdAt, eventId),
  ]);
  const stored = await lookup();
  if (!stored) fail(503, 'The revenue event was not committed.', 'REVENUE_STORAGE_FAILED');
  if (stored.id !== eventId) return duplicateResult(stored, event);
  return result(stored, false);
}
