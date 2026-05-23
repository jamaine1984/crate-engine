const workerUrl = String(process.env.CRATE_CLEANUP_WORKER_URL || 'https://crateship-public-asset-cleanup.koikes2021.workers.dev').replace(/\/+$/, '');
const adminToken = String(process.env.CRATE_SMOKE_ADMIN_TOKEN || process.env.CRATE_ADMIN_TOKEN || '').trim();

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function main() {
  const healthResponse = await fetch(`${workerUrl}/health`, {
    headers: { Accept: 'application/json' },
  });
  const health = await readJson(healthResponse);
  if (healthResponse.status !== 200 || health?.ok !== true) {
    throw new Error(`Cleanup worker health failed: ${healthResponse.status} ${JSON.stringify(health)}`);
  }
  if (health.worker !== 'crateship-public-asset-cleanup') {
    throw new Error(`Cleanup worker health returned unexpected worker name: ${JSON.stringify(health)}`);
  }
  if (health.hasR2Binding !== true || health.hasGameStore !== true) {
    throw new Error(`Cleanup worker bindings are missing: ${JSON.stringify(health)}`);
  }
  if (health.deleteEnabled === true) {
    throw new Error(`Cleanup worker scheduled deletion is enabled; expected safe dry-run default: ${JSON.stringify(health)}`);
  }
  if (!Object.prototype.hasOwnProperty.call(health, 'lastRun')) {
    throw new Error(`Cleanup worker health does not expose lastRun state: ${JSON.stringify(health)}`);
  }
  const healthLastRun = health.lastRun && typeof health.lastRun === 'object' ? health.lastRun : null;

  const blockedResponse = await fetch(`${workerUrl}/cleanup`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dryRun: true, limit: 1 }),
  });
  const blocked = await readJson(blockedResponse);
  if (blockedResponse.status !== 403 || !/admin authorization/i.test(blocked?.error || '')) {
    throw new Error(`Cleanup worker unauthenticated guard failed: ${blockedResponse.status} ${JSON.stringify(blocked)}`);
  }

  let authed = null;
  if (adminToken) {
    const dryRunResponse = await fetch(`${workerUrl}/cleanup`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Crate-Admin-Token': adminToken,
      },
      body: JSON.stringify({ dryRun: true, limit: 10 }),
    });
    const dryRun = await readJson(dryRunResponse);
    authed = {
      status: dryRunResponse.status,
      ok: dryRun?.ok === true,
      dryRun: dryRun?.dryRun === true,
      scanned: Number(dryRun?.scanned) || 0,
      orphaned: Number(dryRun?.orphaned) || 0,
      deleted: Number(dryRun?.deleted) || 0,
      errors: Array.isArray(dryRun?.errors) ? dryRun.errors.length : 0,
      lastRunPersisted: dryRun?.lastRunPersisted === true,
    };
    if (authed.status !== 200 || !authed.ok || !authed.dryRun || authed.deleted !== 0 || authed.errors !== 0 || !authed.lastRunPersisted) {
      throw new Error(`Cleanup worker authenticated dry run failed: ${JSON.stringify(authed)}`);
    }

    const updatedHealthResponse = await fetch(`${workerUrl}/health`, {
      headers: { Accept: 'application/json' },
    });
    const updatedHealth = await readJson(updatedHealthResponse);
    if (updatedHealthResponse.status !== 200 || updatedHealth?.ok !== true || !updatedHealth.lastRun) {
      throw new Error(`Cleanup worker lastRun did not persist after authenticated dry run: ${updatedHealthResponse.status} ${JSON.stringify(updatedHealth)}`);
    }
    if (updatedHealth.lastRun.reason !== 'manual-api' || updatedHealth.lastRun.dryRun !== true || Number(updatedHealth.lastRun.deleted) !== 0) {
      throw new Error(`Cleanup worker lastRun has unexpected data after authenticated dry run: ${JSON.stringify(updatedHealth.lastRun)}`);
    }
  }

  console.log('Cleanup worker smoke passed.');
  console.log(`URL: ${workerUrl}`);
  console.log(`Health: deleteEnabled=${health.deleteEnabled}, limit=${health.limit}, bindings=${health.hasR2Binding && health.hasGameStore ? 'ready' : 'missing'}`);
  console.log(healthLastRun
    ? `Last run: ${healthLastRun.reason || 'unknown'} scanned ${healthLastRun.scanned || 0}, orphaned ${healthLastRun.orphaned || 0}, deleted ${healthLastRun.deleted || 0}, errors ${healthLastRun.errorCount || 0}`
    : 'Last run: none persisted yet.');
  console.log(`Guard: ${blockedResponse.status}`);
  if (authed) {
    console.log(`Authed dry run: scanned ${authed.scanned}, orphaned ${authed.orphaned}, deleted ${authed.deleted}, errors ${authed.errors}, persisted ${authed.lastRunPersisted ? 'yes' : 'no'}`);
  } else {
    console.log('Authed dry run: skipped because no admin token env var is present.');
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
