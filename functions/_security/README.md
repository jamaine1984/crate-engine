# Legacy API migration boundary

The existing `/api/games` and `/api/assets` read routes are retained. Every write
requires the real platform cookie session through `platform/server/identity.mjs`,
verified email, and `requireMutationOrigin`. Configure the separate `PLATFORM_DB`,
`APP_ORIGIN`, and identity secrets before enabling a signed-in application flow.
Missing configuration returns 503; anonymous/browser-token requests cannot write.
Never point `PLATFORM_DB` at the existing audit database as a fallback.

Legacy owner tokens remain read capabilities for previously uploaded private
assets and hidden games. They cannot claim an account or grant write permission.
Existing games without a verified `ownerUserId` cannot be changed, even by a
platform administrator, until an audited ownership migration is implemented.
New private assets use a server-derived account namespace. A valid platform
session reads that namespace; old capability reads use their existing namespace.

Platform roles map to existing moderation actions:

- `OWNER` and `PLATFORM_ADMIN`: administrative writes. Owner changes require MFA
  in the previous 15 minutes.
- `MODERATOR`: visibility and moderation status.
- `CONTENT_MANAGER`: featuring content.
- Account owners can change their own game metadata/content and delete it.
- An account cannot set its own moderation status or featured status by claiming
  ownership. Browser-supplied roles and configured legacy admin tokens grant no
  write permission.

Public asset IDs are derived by the server from verified account, game, and
source asset identity. A game must already belong to the account before an asset
can be published for it. Public references are checked against stored metadata.
Uploads and publication validate GLB containers/glTF JSON and embedded resources;
MIME types are fixed, and model downloads use `nosniff`, attachment disposition,
and a restrictive document CSP, including existing objects with unsafe MIME data.

Intentionally disabled: automatic public asset deletion during game save/delete,
and destructive `/api/assets/admin/public-cleanup`. Dry-run inspection is still
available to verified administrators. Objects remain stored until a transactional
ownership/reference index and reviewed migration make deletion safe. The separate
scheduled cleanup Worker is not changed by this patch; keep its delete flag off.

Remaining work: transactional slug uniqueness, concurrent quota reservation/index
writes, data migration, separate untrusted content origin, independent full glTF
validation/resource budgets, durable mutation audit, and live staging verification.
These changes are an incremental repair, not full platform production approval.

Regression command: `node --test tests/legacy-security.test.mjs`. Tests use the real
identity adapter against a test-only D1 boundary; no production auth bypass exists.
