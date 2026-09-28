# ZIP validation and the required malware-scanner integration

`platform/server/archive.mjs` implements web-game ZIP structural validation and
bounded extraction. It never runs uploaded HTML, JavaScript, WebAssembly, native
binaries, install scripts, or package-manager hooks. A structural pass is **not a
malware scan** and cannot authorize publication.

## Validator contract

```js
import { validateGameArchive } from '../../platform/server/archive.mjs';

const result = await validateGameArchive(quarantinedBytes, {
  maxArchiveBytes: 64 * 1024 * 1024,
  maxFiles: 1000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxExtractedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxPathBytes: 512,
  maxDepth: 24,
});
```

Input is an `ArrayBuffer` or `Uint8Array`. The validator snapshots its input before
asynchronous hashing, so the archive checksum and extracted files use the same
bytes. It returns:

```text
status: "structurally_valid"
malwareScan: "required"
sha256: lowercase SHA-256 of the exact archive bytes
sizeBytes: compressed archive byte count
extractedBytes: total declared and verified extracted bytes
entryPoint: "index.html"
manifest: [{ path, size, sha256 }, ...]
files: Map<string, Uint8Array>
```

`files` preserves binary content exactly and is for the private scanner/extraction
job. Serialize only the manifest and status/checksum metadata. No filesystem
paths are created by the validator. Upload-limit aliases `uploadBytes`, `files`,
`extractedBytes`, and `compressionRatio` are accepted for the existing platform
`LIMITS` object; explicit `max*` fields take precedence. Entry, path, and depth
limits still apply when aliases are used. Invalid scanner configuration fails
with `SCANNER_CONFIGURATION`; hostile archives raise `HttpError` with 422, or 413
for resource-limit failures.

## Implemented checks

- ZIP end, central, local, and optional data-descriptor records must agree;
  offsets must be in bounds and local records must cover their declared region
  exactly. Prefix executables, extra local entries, overlaps, unreferenced gaps,
  appended bytes, and contradictory filenames/sizes/CRC values are rejected.
- Only single-volume, non-ZIP64, unencrypted ZIP stored/DEFLATE compression is
  accepted. Unsupported flags, methods, versions, and alternate-path/encryption
  extra fields are rejected. Allowed extra fields contain timestamps or UID/GID;
  extracted ownership, permission, and timestamp attributes are never applied.
- Paths must be UTF-8 (or ASCII without the UTF-8 flag), normalized, relative,
  and unambiguous. Traversal, drive/UNC/backslash paths, control characters,
  encoded separators, URL query/fragment syntax, alternate data streams, Windows
  device names, trailing dots/spaces, duplicate names, case collisions, and
  file/directory collisions are rejected. Symlinks and special files are rejected.
- A nonempty root file named exactly `index.html` is required. This is a web-game
  validator; native Windows/macOS/Linux builds need a separate approved validator
  and remain quarantined until that pipeline exists.
- File count, compressed bytes, per-entry bytes, total extracted bytes, ratio,
  path length, and directory depth are bounded before extraction. Actual output
  is checked again during small DEFLATE steps, preventing forged size fields from
  bypassing budgets. DEFLATE trees, back-references, stored-block length
  complements, final boundaries, and declared output lengths are independently
  inspected before fflate extraction. More than 10,000 DEFLATE blocks per entry
  is rejected as a CPU-budget guard.
- CRC-32 verifies each entry after extraction. SHA-256 is recorded for the exact
  archive and each extracted regular file. These hashes establish byte identity;
  they do not establish that content is harmless.

The default budget is deliberately smaller than the platform's upload reservation
maximum. A scanner service must choose resource limits it can actually support.
This implementation snapshots the archive and holds extracted output in memory;
use an isolated job with explicit memory/CPU/time limits. Do not execute a 500 MiB
upload / 2 GiB expansion job inside an ordinary Pages HTTP request merely because
the reservation API allows those sizes. Larger builds require a bounded streaming
extraction pipeline in a suitably provisioned scanner runtime.

## Current upload service integration boundary

`platform/server/uploads.mjs` currently calls the trusted `GAME_SCANNER` service
binding at `POST https://scanner.internal/scan` with the server-generated
`uploadId`, `objectKey`, `versionId`, and configured limits. It accepts a result
only when that service returns `status: "clean"`, a lowercase SHA-256, the exact
reserved `sizeBytes`, a durable `reference`, and a nonempty manifest. There is no
public callback that should accept a creator's scan assertion. The structural
validator intentionally returns a different status, so forwarding its result
directly cannot satisfy this gate.

The actual `GAME_SCANNER` adapter still needs to be deployed and verified:

1. Authenticate the service binding/job and resolve the upload and immutable
   quarantine object from trusted metadata. Confirm upload/account/game/version
   ownership, expected size, and object version/ETag. Never accept a caller's
   public URL or filesystem extraction destination as authority.
2. Fetch that exact private object, enforce job/resource limits, run this
   structural validator for web builds, and preserve the original checksum.
   Validate native packages through their separate platform policy.
3. Run a real, configured malware engine against the original archive and every
   extracted file with current approved signatures, engine version, nested-archive
   policy, and timeout/memory limits. A missing engine, stale signatures, timeout,
   unsupported nested archive, or incomplete scan must stay pending or fail.
   No placeholder, unconditional success, client report, or structural-only result
   may produce a clean verdict.
4. Persist a durable scan record tied to upload ID, version ID, object version,
   archive checksum, every manifest hash, validator version, engine/signature
   versions, scan start/end, findings, and final policy decision. Make retries
   idempotent and guard against object replacement between scan and promotion.
5. Return `status: "clean"` only when structural validation, the real malware
   engine, and the required content policy all succeed. Include `sha256`,
   `sizeBytes`, `reference`, and the validated `manifest`. Return distinct infected,
   failed, and pending outcomes otherwise. Keep sensitive findings in owner
   review/audit channels rather than exposing internal storage details to players.
6. A separate release step must approve and copy the exact scanned bytes into an
   immutable game-version namespace, using the safe manifest instead of re-parsing
   the ZIP with different path rules. Publish on the isolated game-content origin;
   platform cookies, owner privileges, and payment controls must never be present
   there. Malware scanning cannot replace origin isolation or manual moderation.

No real malware engine or scanner service was connected by this change. Uploads
must remain private/quarantined while that dependency is unavailable, and public
creator-upload flags must stay disabled until integration and staging checks pass.

## Verification

Run `node --test tests/archive.test.mjs`. The suite builds real archives with
fflate and independently generated zlib DEFLATE payloads. It verifies byte-for-byte
binary preservation, checksums, stored/fixed/dynamic compression, streaming ZIP
descriptors, and hostile archive cases covering each boundary above. It never
executes uploaded content or asserts a malware-clean outcome.
