import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { sqliteD1 } from '../platform/dev/sqlite-d1.mjs';
import { allocateRevenue, effectiveAgreement, validateTerms, REVENUE_TYPES,
  DisabledPaymentProvider, DisabledAdProvider } from '../platform/server/commerce.mjs';
import { recordVerifiedRevenue } from '../platform/server/ledger.mjs';
import { HttpError } from '../platform/server/common.mjs';

const migrationsDir = new URL('../platform/migrations/', import.meta.url);
const migrations = await Promise.all((await readdir(migrationsDir)).filter(n => n.endsWith('.sql')).sort()
  .map(name => readFile(new URL(name, migrationsDir), 'utf8')));
const timestamp = () => Math.floor(Date.now() / 1000);
const terms = creatorBps => Object.fromEntries(REVENUE_TYPES.map(type => [type, { creatorBps, platformBps: 10000 - creatorBps }]));
const rejection = (status, code) => e => e instanceof HttpError && e.status === status && (!code || e.code === code);
function fixture() {
  const sql = new DatabaseSync(':memory:'); migrations.forEach(migration => sql.exec(migration));
  const userId = crypto.randomUUID(); const ownerId = crypto.randomUUID();
  for (const id of [userId, ownerId]) sql.prepare(`INSERT INTO platform_users(id,email,username,display_name,email_verified,created_at,updated_at)
    VALUES(?,?,?,?,1,?,?)`).run(id, `${id}@example.test`, id, 'Internal accounting test fixture', timestamp(), timestamp());
  return { sql, env: { PLATFORM_DB: sqliteD1(sql) }, userId, ownerId };
}
function game(f, developer = f.userId) {
  const id = crypto.randomUUID();
  f.sql.prepare(`INSERT INTO platform_games(id,slug,developer_id,title,kind,created_at,updated_at)
    VALUES(?,?,?,'Internal test game','web',?,?)`).run(id, `test-${id}`, developer, timestamp(), timestamp());
  return id;
}
function agreement(f, gameId, options = {}) {
  const agreementId = options.agreementId || crypto.randomUUID(); const versionId = crypto.randomUUID();
  const creator = options.type === 'platform_owned' ? null : (options.creatorId || f.userId);
  const type = options.type || 'custom'; const effective = options.effectiveAt ?? timestamp() - 10000;
  if (!options.agreementId) f.sql.prepare('INSERT INTO platform_agreements VALUES(?,?,?,?,?,?)')
    .run(agreementId, 'Internal test agreement', type, creator, f.ownerId, timestamp());
  f.sql.prepare(`INSERT INTO platform_agreement_versions(id,agreement_id,version,terms_json,currency,effective_at,end_at,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(versionId, agreementId, options.version || 1,
    JSON.stringify(options.terms || terms(options.creatorBps ?? 2500)), options.currency || 'USD', effective,
    options.endAt ?? null, f.ownerId, timestamp());
  f.sql.prepare('INSERT INTO platform_game_agreements VALUES(?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), gameId, versionId, options.assignmentStart ?? effective, options.assignmentEnd ?? options.endAt ?? null, f.ownerId, timestamp());
  return { agreementId, versionId };
}
function event(gameId, overrides = {}) {
  return { provider: 'internal_test', providerReference: crypto.randomUUID(), gameId, revenueType: 'rewarded_ads',
    currency: 'USD', grossMinor: 1000, feesMinor: 100, occurredAt: timestamp() - 100,
    status: 'finalized', ...overrides };
}

test('allocation conserves safe integer minor units and assigns rounding remainder to platform', () => {
  assert.deepEqual(allocateRevenue({ grossMinor: 101, feesMinor: 0, creatorBps: 3333, currency: 'USD' }),
    { eligibleMinor: 101, creatorMinor: 33, platformMinor: 68, currency: 'USD' });
  const large = allocateRevenue({ grossMinor: Number.MAX_SAFE_INTEGER, creatorBps: 9999, currency: 'JPY' });
  assert.equal(large.creatorMinor + large.platformMinor, Number.MAX_SAFE_INTEGER);
  for (const input of [{ grossMinor: 1.5 }, { grossMinor: -1 }, { grossMinor: Number.MAX_SAFE_INTEGER + 1 },
    { feesMinor: 1001 }, { creatorBps: 10001 }, { currency: 'usd' }]) {
    assert.throws(() => allocateRevenue({ grossMinor: 1000, creatorBps: 2500, currency: 'USD', ...input }));
  }
});

test('terms require every revenue category, valid totals and explicit classification', () => {
  assert.deepEqual(validateTerms(terms(7000), 'custom'), terms(7000));
  const missing = terms(2500); delete missing.premium_sales;
  assert.throws(() => validateTerms(missing, 'custom'));
  assert.throws(() => validateTerms(terms(2500), 'platform_owned'));
  const wrong = terms(2500); wrong.rewarded_ads.platformBps = 10;
  assert.throws(() => validateTerms(wrong, 'custom'));
});

test('effective-time boundary uses exactly one version and rejects overlap/gap', () => {
  const versions = [{ version: 1, effective_at: 10, end_at: 20 }, { version: 2, effective_at: 20, end_at: null }];
  assert.equal(effectiveAgreement(versions, 19).version, 1); assert.equal(effectiveAgreement(versions, 20).version, 2);
  assert.throws(() => effectiveAgreement(versions, 9));
  assert.throws(() => effectiveAgreement([...versions, { effective_at: 19, end_at: 21 }], 20));
});

test('provider event derives actual game-specific agreement shares and finalized obligation atomically', async () => {
  const f = fixture(); const a = game(f); const b = game(f);
  const aa = agreement(f, a, { creatorBps: 2500 }); const ba = agreement(f, b, { creatorBps: 4000 });
  const first = await recordVerifiedRevenue(f.env, event(a)); const second = await recordVerifiedRevenue(f.env, event(b));
  assert.equal(first.agreementVersionId, aa.versionId); assert.equal(second.agreementVersionId, ba.versionId);
  assert.equal(first.creatorMinor, 225); assert.equal(first.platformMinor, 675);
  assert.equal(second.creatorMinor, 360); assert.equal(second.platformMinor, 540);
  assert.equal(first.payoutEligible, false); assert.equal(first.duplicate, false);
  const obligations = f.sql.prepare('SELECT amount_minor,status FROM platform_creator_obligations ORDER BY amount_minor').all();
  assert.deepEqual(obligations.map(r => [r.amount_minor, r.status]), [[225, 'finalized'], [360, 'finalized']]);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM platform_audit WHERE action='commerce.revenue.recorded'").get().n, 2);
  f.sql.close();
});

test('historic v1 events keep v1 allocation after v2 becomes effective', async () => {
  const f = fixture(); const g = game(f); const boundary = timestamp() - 1000;
  const v1 = agreement(f, g, { creatorBps: 1000, effectiveAt: boundary - 1000, endAt: boundary });
  const v2 = agreement(f, g, { agreementId: v1.agreementId, version: 2, creatorBps: 6000, effectiveAt: boundary });
  const old = await recordVerifiedRevenue(f.env, event(g, { occurredAt: boundary - 1 }));
  const current = await recordVerifiedRevenue(f.env, event(g, { occurredAt: boundary }));
  assert.equal(old.agreementVersionId, v1.versionId); assert.equal(old.creatorMinor, 90);
  assert.equal(current.agreementVersionId, v2.versionId); assert.equal(current.creatorMinor, 540);
  assert.throws(() => f.sql.prepare('UPDATE platform_agreement_versions SET terms_json=? WHERE id=?').run(JSON.stringify(terms(9999)), v1.versionId), /new agreement version/);
  assert.equal(f.sql.prepare('SELECT creator_minor FROM platform_revenue_events WHERE id=?').get(old.id).creator_minor, 90);
  f.sql.close();
});

test('estimated and pending provider revenue never create payout obligations', async () => {
  const f = fixture(); const g = game(f); agreement(f, g, { creatorBps: 7000 });
  for (const status of ['estimated', 'pending_provider_finalization']) {
    const recorded = await recordVerifiedRevenue(f.env, event(g, { status })); assert.equal(recorded.status, status); assert.equal(recorded.payoutEligible, false);
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_revenue_events').get().n, 2);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_creator_obligations').get().n, 0);
  f.sql.close();
});

test('platform-owned games allocate 100 percent to platform with no creator obligation', async () => {
  const f = fixture(); const g = game(f); agreement(f, g, { type: 'platform_owned', terms: terms(0) });
  const recorded = await recordVerifiedRevenue(f.env, event(g));
  assert.equal(recorded.creatorId, null); assert.equal(recorded.creatorMinor, 0); assert.equal(recorded.platformMinor, 900);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_creator_obligations').get().n, 0);
  f.sql.close();
});

test('identical provider references are idempotent and changed amounts/status/game are conflicts', async () => {
  const f = fixture(); const g = game(f); agreement(f, g); const input = event(g);
  const first = await recordVerifiedRevenue(f.env, input); const again = await recordVerifiedRevenue(f.env, { ...input });
  assert.equal(again.id, first.id); assert.equal(again.duplicate, true);
  for (const change of [{ grossMinor: 1001 }, { feesMinor: 101 }, { occurredAt: input.occurredAt + 1 },
    { status: 'estimated' }, { currency: 'EUR' }, { gameId: crypto.randomUUID() }, { revenueType: 'premium_sales' }]) {
    await assert.rejects(recordVerifiedRevenue(f.env, { ...input, ...change }), rejection(409, 'REVENUE_REFERENCE_CONFLICT'));
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_revenue_events').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_creator_obligations').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_audit').get().n, 1);
  f.sql.close();
});

test('caller-supplied shares/agreements, unsafe amounts, unknown categories and invalid statuses are denied', async () => {
  const f = fixture(); const g = game(f); agreement(f, g);
  for (const extra of [{ creatorMinor: 999 }, { agreementVersionId: 'forged' }, { creatorId: f.ownerId },
    { grossMinor: 1.1 }, { grossMinor: -1 }, { grossMinor: Number.MAX_SAFE_INTEGER + 1 }, { feesMinor: 1001 },
    { currency: 'usd' }, { currency: 'USD\n' }, { revenueType: 'unknown' }, { status: 'paid' },
    { occurredAt: timestamp() + 3600 }, { provider: 'https://evil.example' }, { providerReference: '' }]) {
    await assert.rejects(recordVerifiedRevenue(f.env, event(g, extra)), rejection(400));
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_revenue_events').get().n, 0); f.sql.close();
});

test('missing, corrupt, mismatched-currency and wrong-creator agreements fail closed', async () => {
  const f = fixture(); const missing = game(f);
  await assert.rejects(recordVerifiedRevenue(f.env, event(missing)), rejection(409, 'REVENUE_AGREEMENT_REQUIRED'));
  const corrupt = game(f); agreement(f, corrupt, { terms: {} });
  await assert.rejects(recordVerifiedRevenue(f.env, event(corrupt)), rejection(409, 'INVALID_AGREEMENT'));
  const foreignCurrency = game(f); agreement(f, foreignCurrency, { currency: 'EUR' });
  await assert.rejects(recordVerifiedRevenue(f.env, event(foreignCurrency)), rejection(409, 'REVENUE_CURRENCY_MISMATCH'));
  const wrongCreator = game(f); agreement(f, wrongCreator, { creatorId: f.ownerId });
  await assert.rejects(recordVerifiedRevenue(f.env, event(wrongCreator)), rejection(409, 'INVALID_AGREEMENT'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_revenue_events').get().n, 0); f.sql.close();
});

test('database rejects overlapping per-game agreement assignments', () => {
  const f = fixture(); const g = game(f); agreement(f, g);
  assert.throws(() => agreement(f, g, { creatorBps: 7000 }), /overlap/); f.sql.close();
});

test('immutable revenue events cannot be modified or deleted; obligation failure rolls back the event', async () => {
  const f = fixture(); const g = game(f); agreement(f, g);
  const recorded = await recordVerifiedRevenue(f.env, event(g));
  assert.throws(() => f.sql.prepare('UPDATE platform_revenue_events SET creator_minor=0 WHERE id=?').run(recorded.id), /immutable/);
  assert.throws(() => f.sql.prepare('DELETE FROM platform_revenue_events WHERE id=?').run(recorded.id), /immutable/);
  f.sql.exec("CREATE TRIGGER test_obligation_failure BEFORE INSERT ON platform_creator_obligations BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
  await assert.rejects(recordVerifiedRevenue(f.env, event(g)), /test rollback/);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_revenue_events').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_creator_obligations').get().n, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM platform_audit').get().n, 1); f.sql.close();
});

test('disabled provider implementations never report purchases or rewards as successful', async () => {
  const payment = new DisabledPaymentProvider(); const ads = new DisabledAdProvider();
  for (const operation of ['checkout', 'verifyPurchase', 'refund']) await assert.rejects(payment[operation](), e => e.status === 503);
  assert.deepEqual(await ads.requestRewardedAd(), { available: false, reason: 'ADVERTISING_NOT_ENABLED', rewardGranted: false });
  assert.deepEqual(await ads.requestInterstitial(), { available: false, reason: 'ADVERTISING_NOT_ENABLED' });
});
