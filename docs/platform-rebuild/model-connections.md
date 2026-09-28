# Bring your own model connection

Implemented locally, with 47 passing SQLite and mocked-provider tests. No real credentials were used, no model requests were purchased, and no provider or production deployment was activated.

## Boundary

The editor sends one user-approved request to one saved provider connection. There are no autonomous loops, tools, script execution, arbitrary endpoints, or automatic edits. The response is untrusted text plus optional allowlisted scene operations or a bounded procedural world recipe. The editor must render text as text, show the proposed changes, require Apply, validate again against current scene state, and support Undo.

Supported adapters: OpenAI Responses, Anthropic Messages, and OpenRouter Chat Completions. The user supplies the exact model ID. A metadata test confirms credential/model access; it does not establish generation compatibility or make a paid completion. Model names, capabilities, availability and billing remain provider-controlled.

## Setup

1. Apply `0004_model_connections.sql` to the isolated `PLATFORM_DB`, after the earlier migrations.
2. Configure real platform authentication and email verification as described in `identity.md`.
3. Supply the server secret `ENCRYPTION_KEY`: 32 cryptographically random bytes encoded as unpadded base64url (43 characters). This is the same server encryption key used by identity. Keep it in Workers secrets or ignored local server configuration. Customer API keys are entered through the authenticated form, never placed in `.env`, source, exports, or public config.
4. Bind `handleModelConnections(request, env, path)` into the same-origin platform router.
5. Keep database flag `ENGINE_AI_ENABLED=0` until the owner explicitly enables calls. Saving/listing/removing connections works while the flag is off. Testing and new proposals fail closed. A stored successful response may still be retrieved by replaying its original request ID while the flag is off.
6. Include `modelConnectionErasureStatements(env, userId)` in the trusted account erasure transaction.

Platform-funded AI and 3D generation are prohibited by the product contract. This adapter accepts only the authenticated user's saved provider credential; it never reads a platform provider key or falls back to shared credits. Users pay their chosen provider directly. Crate Ship does not supply or subsidize generation credits. Hosting, storage and other platform infrastructure still have their own operating costs.

Keys are encrypted with AES-GCM and a fresh 96-bit IV. Additional authenticated data binds ciphertext to its schema version, immutable user ID, connection ID, and provider. Keys are only decrypted server-side immediately before a fixed provider request. List/create responses contain only a last-four-character hint. Missing, corrupt or differently owned credentials fail closed, even if platform provider keys exist in the environment. The application establishes credential provenance in the user's vault; the provider determines which account owns and pays for that credential.

Key rotation currently requires a trusted migration that decrypts with the old key and re-encrypts with the new key, or users reconnecting. There is no automatic rotation job. Do not replace the encryption secret and assume saved keys will remain usable. This implementation has local security tests, not an independent cryptographic audit.

## HTTP contract

All paths are under `/api/platform`. Every route requires a real verified account. Mutations require the exact application Origin and session cookie.

| Method and path | Body / result |
|---|---|
| `GET /model-connections` | `{items, enabled, limits, billing}`; each item is `{id,provider,label,model,keyHint,createdAt,lastTestedAt,lastTestStatus}` |
| `POST /model-connections` | `{provider,label,apiKey,model}` → `201 {connection,billing}`; no provider call |
| `DELETE /model-connections/:id` | Recent primary authentication, plus recent MFA for enrolled accounts/owner → `{deleted:true}` |
| `POST /model-connections/:id/test` | `{}` → `{verified:true,provider,model,generationTested:false,billing}`; fixed metadata GET calls only |
| `POST /model-connections/:id/propose` | `{prompt,sceneSummary,maxOutputTokens,requestId,confirmProviderUsage:true}` → `{requestId,text,summary,operations,worldRecipe,baseFingerprint,sceneContext,usage,billing}` |

The server owns this immutable billing contract, including on stored-result replay. Client billing overrides and per-request credentials are rejected:

```json
{
  "mode": "user_provider_account",
  "credentialSource": "user_connection_only",
  "platformFundedGeneration": false,
  "platformCreditsProvided": false,
  "explicitUsageConfirmationRequired": true
}
```

No fal or Replicate adapter is implemented here. For current external GLB generation and the proposed integration boundary, see [3D provider research](3d-provider-research.md).

`requestId` is a fresh 16–100 character identifier (letters, numbers, `_`, `-`; UUID is suitable) for each explicit user approval. Reuse that same ID on client retry. A completed identical request returns its stored response with `replayed:true`. Changed input with the same ID returns `MODEL_IDEMPOTENCY_CONFLICT`. Pending, crashed, failed or timed-out reservations are never sent again under that ID. The UI must explain possible provider billing uncertainty before the user chooses to create a fresh request.

Default limits: 20 saved connections, prompt 8,000 characters, safe scene projection 32 KiB / 250 entities, 128–4,096 output tokens per request, 50 proposal operations, 3 reserved requests per rolling minute, 20 per UTC day, and 32,768 reserved output tokens per UTC day. Failed/ambiguous requests consume reservations. These are usage ceilings, **not monetary spending guarantees**; input tokens, reasoning behavior and provider prices affect charges. Users should also set limits with their provider.

Optional server limits:

| Variable | Default | Accepted range |
|---|---:|---:|
| `ENGINE_AI_REQUESTS_PER_MINUTE` | 3 | 1–10 |
| `ENGINE_AI_REQUESTS_PER_DAY` | 20 | 1–100 |
| `ENGINE_AI_OUTPUT_TOKENS_PER_DAY` | 32768 | 1–262144 |
| `ENGINE_AI_TIMEOUT_MS` | 25000 | 1–30000 |

Reservation count and token checks are one atomic SQLite insertion with a unique `(user_id, request_id)` constraint. A second Worker cannot bill the same reserved request. There are no network retries or redirect following. Generation responses are capped at 1 MiB and final text at 65,536 characters. OpenRouter metadata catalog responses are capped at 2 MiB. Key creation is limited to 10/hour and metadata tests to 5/hour per account.

## Scene data and proposals

Only bounded scene metadata and these settings are sent: `background`, `gravity`, `ambientIntensity`, `exposure`, `shadows`, `quality`, `fogDensity`. Entity projection includes IDs, names, allowed types, transforms, visibility, material, rigidbody/spin components, optional parent ID, and an existing listed model asset ID. Asset metadata contains only `{id,name,mime:'model/gltf-binary'}`; raw bytes, source URLs, cloud storage identifiers, and scripts are excluded. Entity/asset names and the prompt are user-supplied data: users should avoid including private information they do not want sent to their provider.

`sceneSummary` accepts optional `projectId`, `baseFingerprint` (64 lowercase hexadecimal characters), `entityCount`, `lightCount`, `truncated`, `assets`, `assetCount`, and `assetsTruncated`. Complete legacy summaries default to their listed counts. A partial entity summary must explicitly declare the total count, `truncated:true`, and total light count. A partial asset list similarly declares its total and `assetsTruncated:true`. Metadata supports at most 250 listed entities, 500 listed assets, 5,000 total entities, 32 lights, and 32 KiB of projected JSON. The full HTTP body is capped at 64 KiB. Invalid or contradictory totals fail before a paid call. The server cannot prove client totals match a local editor scene; the editor must validate against its full live project before committing.

Both result forms echo the optional base fingerprint unchanged (or `null`) and return `sceneContext:{entityCount,includedEntityCount,lightCount,truncated,assetCount,includedAssetCount,assetsTruncated}`. The fingerprint participates in the request input digest/idempotency check. It is a frontend stale-state binding, not server authentication or proof of ownership. The editor must compare the current full scene before preview/apply; the shared recipe runtime also guards its preview revision.

For `operations`, allowed new entity types remain `box`, `sphere`, `cylinder`, `capsule`, `plane`, `directionalLight`, `pointLight`, `camera`. Existing `model` and `empty` entities may appear in the summary. Runtime components are projected to `rigidbody.type` and `spin.speed`; unsupported component fields are dropped. Operations are exactly `add`, `update`, or `remove`; update/remove must reference an ID present in the submitted summary. Unknown fields, invalid bounds, arbitrary code/URLs/asset fields and more than 50 operations invalidate the proposal.

Alternatively the provider returns `{summary,worldRecipe}`. The shared `engine/core/procedural.mjs` validator recognizes versioned seeded `add`, `grid`, and `scatter` recipes. It enforces 64 recipe operations, 500 generated entities, project/light limits, existing model asset IDs, and component invariants. Recipes may create supported `model`/`empty` entities and the fuller allowlisted gameplay component set; they cannot fetch assets or run scripts. Context totals include entities omitted from the provider projection. Exactly one proposal representation is allowed: mixed `operations` and `worldRecipe` output is rejected. A valid recipe returns `operations:null`; a valid direct-edit proposal returns `worldRecipe:null`. Invalid output remains inert text with both fields `null`. The server never applies or saves either form.

## Data retention and failures

The database stores encrypted keys, masked connection metadata, request input digests, status, final response text and reported token counts. It does not store original prompts or scene summaries in the request table, although returned text may repeat user data. Results remain private to the account and currently persist until account erasure; no scheduled expiry job is installed. Deleting a connection removes its encrypted key while retaining request reservations/results so deletion cannot reset usage caps. Account erasure removes both. Audit entries retain only pseudonymous actor/connection IDs and provider name.

Raw provider error bodies are discarded. Provider response text is scrubbed for the exact credential before persistence/return. Infrastructure administrators still require appropriately restricted access to application secrets and the database. Provider-side processing and retention are governed by that provider and account settings. OpenAI requests use `store:false`; this alone is not a promise of zero provider retention.

A request can reach the provider before a timeout, disconnect, or Worker crash. Its reservation stays pending or `billing_unknown`; no automatic retry occurs. Operators should inspect provider usage when resolving such requests. Persistence failure after a provider response leaves the reservation pending, preventing duplicate completion calls.

## Official references

- [OpenAI text generation / Responses](https://developers.openai.com/api/docs/guides/text)
- [OpenAI API data controls and retention](https://developers.openai.com/api/docs/guides/your-data)
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create)
- [Anthropic model metadata](https://platform.claude.com/docs/en/api/http/models/retrieve)
- [OpenRouter current-key metadata](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
- [OpenRouter model catalog](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenRouter Chat Completions quickstart](https://openrouter.ai/docs/quickstart)

## Retired legacy AI worker

`worker/index.js` now returns HTTP 410 for every method, without parsing requests, reading environment keys or calling a provider. It no longer contains the previous `userKey || env.OPENROUTER_API_KEY` fallback, wildcard CORS or command execution fallback. Its Wrangler file no longer instructs operators to install a platform provider key.

This is a local source change. **An existing deployed `crate-engine-ai` Worker remains separate until an authorized operator disables it or deploys the retired handler.** Existing provider secrets should then be removed and revoked where appropriate. No such deployment, secret removal or revocation was performed in this work. Until that operation is completed, the old deployed code may retain its former billing behavior.

A targeted search of `functions/`, `platform/server/` and `worker/` found no other paid-generation platform-key fallback after retirement. Email-service keys remain infrastructure credentials, not generation credentials. This source inspection does not prove the state of Cloudflare deployments whose source is absent from this checkout.

## Verification

Run `node --test tests/model-connections.test.mjs`. Coverage includes actual SQLite migrations, AES-GCM binding, real opaque session lookup, ownership, origin protection, disabled-provider behavior, fixed URLs/headers, no generation on credential tests, explicit consent, safe projection/parser, concurrent idempotency, atomic caps, timeout/failure states, body limits, key redaction, and erasure. Regression cases install throwing environment getters for platform provider keys, confirm all three adapters still use only the user's credential, reject missing/corrupt credentials and billing overrides, and prove the retired worker cannot fetch or read its environment. Tests replace `fetch` only within test cases; production has no fixture authentication or transport bypass.
