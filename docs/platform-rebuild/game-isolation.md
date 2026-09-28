# Published-game isolation boundary

The content Worker and parent bridge are implemented and exercised with real
SQLite and Node browser-surface mocks. These checks do not establish live browser,
Cloudflare, scanner, or publication readiness. A complete published release has
not been demonstrated against real services in this work.

## Content delivery

`worker/game-content/index.mjs` requires explicit HTTPS `APP_ORIGIN` and
`GAME_CONTENT_ORIGIN` values, a `PLATFORM_DB` query binding, and the released-only
`PUBLISHED_GAMES` object binding. Deploy it on an unrelated registrable domain that
has no account cookies, owner tools, payment endpoints, or platform API. The host
guard conservatively rejects equal, parent/child, and shared final-two-label
hostnames. It intentionally rejects some otherwise separate sites under public
suffixes such as `co.uk`; it is not a general public-suffix-list implementation.

Every request must match `/games/<gameId>/<versionId>/<manifest path>`. The Worker
queries that exact target and requires all of the following:

- The game is published and its active version matches the requested version.
- The version belongs to that game, is a published web build, has a clean scan
  state, and has the exact release checksum.
- The game is free. Paid files remain unavailable even when the caller presents
  cookies, an Authorization header, a query token, or a claimed license. Licensed
  content needs a separate entitlement-bound delivery protocol.
- The release manifest contains the exact safe filename, size, and SHA-256, and
  contains no duplicate, case-colliding, or file/directory-colliding paths.
- The stored object's size and `customMetadata.sha256` equal that manifest entry.

The trusted release promoter must copy the exact scanned bytes to immutable
version keys and stamp the verified file hash. The delivery Worker checks that
attestation; it does not rehash streamed object bodies on every request. Protect
the release bucket from arbitrary writers and never overwrite a published
version. Public URL query strings do not alter the storage key or grant access.

URL parsing can normalize dot segments before application code sees a request.
The security property is that the resulting game/version/path receives its own
authorization query and exact manifest match. The Worker never reuses access
from the pre-normalized target. Encoded separators, double encoding, drive/UNC
paths, controls, unsafe names, and unlisted paths cannot construct another R2 key.

HTML and other assets receive `nosniff`, no-referrer, private/no-store caching,
disabled sensitive browser permissions, and a CSP with an opaque-origin sandbox.
The CSP permits scripts, CSS, fetches, images, fonts, and media only from the
configured content origin plus the required local blob/data forms. WebAssembly
compilation is allowed; unrestricted JavaScript `eval` is not. There is no general
`https:` script or connection permission. Forms, child frames, plugin objects,
and base-URL changes are disabled. The only allowed frame ancestor is the app
origin. Cookies are neither read for access nor emitted. Wildcard CORS without
credentials lets an opaque sandbox retrieve its own static game assets.

## Parent bridge and SDK

`platform/client/player-bridge.mjs` validates the server-issued session and pins
the game ID, session ID, content URL, save capability, and expiry at mount time.
The iframe uses `allow-scripts allow-pointer-lock`, omitting `allow-same-origin`,
form, popup, and top-navigation grants. Only messages from that iframe's exact
WindowProxy with the expected opaque `Origin: null` are considered.

The message allowlist is ready/configuration, pause/resume, progress load/save,
and an unavailable rewarded-ad result. Unknown actions, arbitrary account/game
IDs, wallet amounts, extra payload fields, invalid revisions, non-JSON values,
cycles, excessive depth, and oversized progress are rejected. The bridge calls
only its captured session's progress endpoint. Backend session/account/game
authorization and revision checks remain authoritative.

Validation and queue admission happen before creating asynchronous work: at
most eight requests wait/run, at most 90 messages are admitted to validation per
minute, and at most 12,000 request IDs are retained per mounted session. IDs
cannot replay across rate-window resets. API requests time out and are aborted
when the player is destroyed. Only approved progress/revision fields return to
the game; arbitrary API response fields and exception text are not forwarded.

The child SDK pins parent source/origin and matches outstanding request IDs.
Replies to the opaque iframe necessarily use `postMessage(..., '*')` from the
parent, after its source check, and contain no account credentials. Ads and
rewards always report disabled/unavailable and never grant a reward.

## Remaining verification and dependencies

- Deploy and verify a real malware engine, scanner attestation storage, reviewed
  release/promotion workflow, and immutable published objects before enabling
  public uploads or claiming the full pipeline works.
- Test CSP, sandbox, opaque-origin CORS, WebAssembly, blob workers, asset loading,
  pointer lock, fullscreen, and teardown in actual supported browsers. Node
  mocks cannot establish browser enforcement or game compatibility.
- Exercise malicious games in staging, including iframe navigation, nested
  workers, protocol errors, CPU/memory abuse, and progress conflicts. CSP and
  structural ZIP checks do not make arbitrary JavaScript trustworthy.
- Keep paid delivery and advertising/rewards unavailable until their real
  entitlement/provider verification systems are connected and independently
  verified. Do not weaken the content-origin boundary to make a build load.

Verification command: `node --test tests/isolation.test.mjs`.
