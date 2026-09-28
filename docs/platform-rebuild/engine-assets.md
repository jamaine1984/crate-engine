# Private editor model storage

Implemented locally with 18 SQLite/storage-fixture tests. No production bucket was created or connected. This is private editor storage; it does not publish files to the games marketplace or replace quarantine, malware scanning and release review.

## Setup and API

Apply `0005_engine_assets.sql` after the earlier migrations. Bind a private R2 bucket as `ENGINE_ASSETS` with `get`, `put`, and `delete` available to the server. Do not attach a public bucket domain or expose bucket credentials to browsers. Dispatch `handleEngineAssets(request, env, path)` under `/api/platform`.

- `POST /engine/assets`: raw GLB bytes, `Content-Type: model/gltf-binary`, `X-Asset-Name: encodeURIComponent(displayName)`. Requires a real verified session and exact mutation Origin. Returns `201 {asset:{id,name,size,sha256}}`. Identical content already stored by that user returns `200` and `reused:true`.
- `GET /engine/assets/:id`: requires the verified owning account. Returns raw GLB with attachment, no-store, nosniff and same-origin resource policy headers. Unknown, pending or other-account IDs return 404. There is no public URL or cross-account asset sharing.

Without private storage, uploads return `503 ENGINE_ASSET_STORAGE_UNAVAILABLE`. The editor should retain its local project and offer an export; it must not claim a cloud save containing an unsaved model succeeded.

## Validation and quotas

The server streams a bounded body, runs the shared `engine/core/gltf.mjs` inspector, then computes SHA-256. Maximum file size is 32 MiB. Validation requires GLB 2.0, correct chunk lengths, bounded node/mesh counts, and embedded resources; HTTP/file resource URLs are rejected. It is structural validation, not malware scanning or a guarantee that every loader/GPU can safely render a model.

Default private quota is 512 MiB and 200 assets per user, counting pending reservations. Optional server settings are `ENGINE_ASSET_QUOTA_BYTES` (1–2147483648) and `ENGINE_ASSET_QUOTA_COUNT` (1–1000). Upload attempts are limited to 20/hour/account. Quota checks and ownership reservation are one atomic SQL insertion. Content deduplication is limited to the same user and does not expose another user's uploaded files.

The server creates object keys; a browser cannot choose a storage path. An asset is accessible only after its R2 write and database status transition succeed. Failed/ambiguous writes remove the access row and enqueue the possible object for delayed purge.

## Account erasure and physical deletion

Add `engineAssetErasureStatements(env, userId)` to the trusted identity erasure transaction. It inserts private object keys into `platform_engine_asset_purge_queue` before deleting access rows. This immediately removes API access while preserving the information needed for physical deletion.

`purgeEngineAssets(env, {limit:20})` is a trusted backend helper, with no public route. The included worker/engine-maintenance/index.mjs scheduled handler invokes it; provision its private bindings and schedule, and monitor failures before deployment. It deletes only the module's private key namespace, retries failed R2 deletions on the next run, and removes queue rows only after successful storage deletion. A 15-minute delay allows in-flight uploads to settle. This repository module does not install a scheduler automatically; physical deletion remains pending until a trusted scheduler is wired. Account deletion UI/retention wording must describe that pending physical cleanup instead of claiming immediate byte erasure.

R2 and D1 have no shared transaction. A Worker crash during upload can leave a pending reservation and possibly an object. The trusted maintenance helper now reconciles pending reservations older than 24 hours: it queues their keys with a further 15-minute delay before releasing the reservation and quota. Recent pending uploads and ready models are retained. Do not purge active pending uploads manually until any in-flight write has settled. Retain queued keys until successful deletion, and never discard the queue as part of account anonymization.

## Verification

Run `node --test tests/engine-assets.test.mjs`. Tests cover binary round trips, account/origin boundaries, fail-closed missing storage, GLB validation and body caps, per-account deduplication, concurrent reservation/quota behavior, storage failure states, deletion transaction rollback, delayed/retried purge, and deletion during an in-flight write. Storage fixtures never contact R2 or public URLs.
