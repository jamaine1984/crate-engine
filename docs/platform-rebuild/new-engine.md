# New Crate Ship engine

The user's later direction replaces the earlier engine-preservation plan: build a new engine and editor, keep existing catalog models optional, allow users' own model-provider connections, and add a local Blender/MCP connection. The new `/play` authoring experience uses the `engine/` modules described here. Historical engine files and audit notes are not a claim that the new editor runs the old command agent or script engine.

## Use the editor

1. Open **Build** (`/play`) and create a project. The initial scene contains ground, a falling cube and a light.
2. Add primitives, lights or a camera. Select objects in the hierarchy or viewport; use move/rotate/scale tools and the inspector. Environment controls include background, ambient light, exposure, fog, gravity, quality and shadows.
3. Import self-contained `.glb` files or `.crate` project backups. **My project** holds your imported assets. **Existing catalog** is optional and loads only when requested; its external availability is independent of the editor.
4. Add supported components: static/dynamic rigid body, player movement, collectible value, spin, or model animation. Press **Play** to preview; use the phone movement pad and Jump, or WASD/arrows and Space. A player requires a dynamic rigid body; Spin cannot be combined with a rigid body. **Stop** restores the authored scene and editing camera. There is no arbitrary user JavaScript component execution in this runtime.
5. **Save** writes the project to this browser's IndexedDB. Export a portable project backup for transfer or recovery. **Save to account** uses the authenticated platform project and private model APIs when those services are configured.
6. Export a **web game ZIP** to obtain the bundled runtime, project data, model files and licenses. Extract and serve it through an HTTP static server; opening `index.html` directly as `file://` is unsupported. Publishing that ZIP to the public platform is a separate reviewed workflow.

Undo/redo keeps up to 80 changes in memory. Scene proposals apply as one undo step; an invalid operation rolls back the whole proposed change. Deleting a hierarchy from the editor includes descendants. Undo history is not persisted in project backups.

## Implemented runtime pieces

| Area | Source | Current behavior |
| --- | --- | --- |
| Project format | `engine/core/schema.mjs` | `crateship-project` version 4; allowlisted entities/components, unique asset/object IDs, parent/cycle/depth checks and bounded values |
| Editing state | `engine/core/project-store.mjs` | Validated snapshot commits, selection-related edits, clone/remove, undo/redo, declarative proposals with rollback |
| Model validation | `engine/core/gltf.mjs` | GLB 2 container/UTF-8/chunk/buffer checks, embedded texture rules, complexity caps, SHA-256 |
| Rendering | `engine/runtime/scene.mjs` | Three.js 0.186.1 WebGL, PBR materials, environment lighting, shadows, optional GTAO at high quality, model animation, BVH picking |
| Editor orchestration | `engine/runtime/editor.mjs` | Orbit/transform tools, picking, framing, import, project saves, play/stop, export and lifecycle cleanup |
| Physics | `engine/runtime/physics.mjs` | Rapier 0.21.0 WASM (`@dimforge/rapier3d-compat`), fixed 60 Hz stepping, static/dynamic bounding-box colliders, bounded catch-up, player movement/jump and collectible score |
| Authoring UI | `engine/editor/app.mjs`, `panels.mjs`, `styles.css` | Hierarchy, viewport, inspector, project assets, optional catalog, console, dialogs and connections |
| Local persistence | `engine/storage/local.mjs` | Separate version-4 IndexedDB project and model storage |
| Portable runtime | `engine/player/main.mjs`, `export.mjs` | Static web game entry and ZIP assembly; built artifact in `engine/distribution/game-runtime.js` |
| Account assets | `platform/server/engine-assets.mjs` | Authenticated owner-bound private GLB storage, quotas and metadata; service bindings required |
| Own provider connections | `platform/server/model-connections.mjs` | Encrypted account-bound keys, fixed provider adapters, explicit bounded requests and inert scene proposals |
| Local Blender | `integrations/blender/` | Per-start paired loopback GLB transfer, addon and bounded optional stdio MCP tools |

The runtime does not include a bundled AI agent, OpenClaw, a general Python execution tool, or an automatic provider request loop. A provider connection is optional; manual authoring/import/export uses no model account.

## Own model-provider connection

**Blender & models → Model providers** supports the implemented OpenAI, Anthropic and OpenRouter adapters. Supply your provider's exact model ID and your own key. The server encrypts credentials with AES-GCM bound to the account, connection and provider. Browser responses contain a key hint, not the saved key. Provider origins are fixed in server code; users cannot point the proxy at arbitrary hosts.

Requests require a verified real platform session, configured server vault and enabled engine-AI flag. You explicitly confirm use of your provider account before a request. The server sends a bounded scene summary, excludes asset bytes/URLs/scripts, limits request/output budgets and reserves request IDs to prevent duplicate submissions from creating duplicate calls. Ambiguous failures are not automatically retried. The UI retains the approved request in page memory for an explicit same-request lookup; a fresh request requires fresh consent. These limits are not a provider billing guarantee or a live usage invoice.

Returned text is untrusted. Only allowlisted declarative object operations can become a proposal. Review the proposal and choose **Apply these changes**; it does not execute code. The provider-side schema currently covers primitives/lights/cameras, transforms/materials and a narrower rigid-body/spin subset than the manual editor. Do not promise provider generation of every gameplay component.

No real provider key was used to establish a successful live provider request in this work. Local tests exercise encrypted storage and controlled provider responses; real credentials, exact model access, account billing and deployed behavior remain to be verified by the owner.

Every paid generation uses the user's own provider account. Crate Ship supplies no generation credits and has no platform-key fallback. The historical AI proxy now returns 410 in local source; any old deployed copy still requires a separate authorized retirement. See [the billing contract](model-connections.md).

For generated 3D assets, use your own external provider account, download its GLB and import it. The current editor does not have a fal or Replicate generation adapter. [The provider guide](3d-provider-research.md) records current TRELLIS.2/Hunyuan options, charges, suggested mobile settings and the proposed API boundary.

## Blender

See [the Blender setup guide](../../integrations/blender/README.md). The addon explicitly sends the selected scene to a bridge bound only to `127.0.0.1:9877`. Pairing tokens are local and change on each start. Browser Host/Origin/token checks, native command guards, size limits and queue limits are enforced. MCP commands can read bounded scene data, list exports, export the selection and, with two explicit local opt-ins, transform objects or add supported primitives.

The bridge retains the latest four GLBs in memory, at most 16 MiB each. General editor GLB import allows up to 32 MiB. No addon was installed into the user's Blender automatically.

Both installed Microsoft Store Blender binaries were denied by Windows when launched for headless testing: 5.2.2 returned `spawn EPERM`, and 4.5.14 LTS returned **Access is denied**. The live Blender exporter and panel are therefore unverified. The addon HTTP queue/transfer logic was tested in a separate Python process with an explicit mocked `bpy`; that is not a substitute for Blender integration. An opt-in factory-startup headless test is provided for a runnable installation.

## Bounds and compatibility

- Projects: at most 5,000 entities, 500 assets, 64 hierarchy levels and 32 combined point/directional lights. These are validation ceilings, not promised interactive performance at every ceiling.
- Models: self-contained GLB 2, up to 32 MiB, 10,000 nodes and 5,000 meshes. A conservative 128 MiB aggregate geometry budget checks buffer/view/accessor storage, meshopt decoded counts/strides, and sparse accessor ranges before loading. Required EXT/KHR meshopt placeholder buffers are supported; sparse matrix/interleaved layouts unsupported by the loader are rejected. External buffer/image URLs and executable HTML/SVG texture resources are rejected. This is not a full glTF conformance test, malware scan or total texture/browser/GPU-memory guarantee.
- Physics: bounding-box approximation, including local geometry offsets and object rotation. There is no authored convex/triangle-mesh collider editor, vehicle solver UI, network physics or advanced character controller in this implementation.
- Backups and web exports: at most 80 MiB of resolved models per package. Imported project files are limited to 128 MiB. Browser memory, IndexedDB quotas and graphics limits can impose lower practical limits.
- Web ZIP: local runtime and models are included. Serving needs HTTP; this is not a native executable, service-worker installation or assertion of all-browser offline compatibility. The public publisher's bounded Worker mode currently accepts smaller builds: 16 MiB compressed and 48 MiB expanded, with real scan attestation and approval still required.
- Legacy v3 imports: migrate available transforms/basic solids and model references; retain legacy source and warnings as inert data. Legacy scripts, advanced command history and every old component are not automatically recreated. Keep original backups for comparison. A web export removes preserved legacy source and private cloud asset references.
- Advanced terrain editing, animation graphs, multiplayer authoring, scripting extensions, production profiling, physical-device mobile certification, multi-user live collaboration and complete accessibility/browser coverage are not established by these modules. Responsive editing and shared touch play controls are implemented; see [phone workflow](touch-controls.md).

## Verification evidence

**Final primary run:** 412 tests total, **411 passed**, zero failures, one explicitly skipped live-Blender test. `npm run check` checked 130 source files; `npm run build` passed. The build reports large renderer/physics chunks; that warning and mobile network/memory costs still warrant profiling. Detailed browser evidence and download limitations are recorded in [design-qa.md](design-qa.md). These final totals include the later touch, request-retry, billing-boundary, export-lifecycle and decoded-geometry regressions beyond the earlier focused runs below.

An additional **42 tests** in `tests/engine-gltf-limits.test.mjs` exercise geometry allocation guards, tiny-file expansion attempts, meshopt placeholders/descriptors and sparse accessors. Real MeshoptEncoder output is packed into a GLB and decoded through the actual Three.js GLTFLoader for both EXT and KHR meshopt extension names; decoded positions and indices match. Sparse and zero-initialized accessors also use the real loader. The combined GLB/core run passed 62 tests after the later core gameplay invariant test was added.

The focused engine run passed **31 tests** with Three.js 0.186.1 and Rapier 0.21.0: `tests/engine-core.test.mjs` (19) and `tests/engine-physics.test.mjs` (12). It checks real schema migration, IDs/hierarchy/light limits, immutable snapshots, undo/redo, proposal rollback, malicious GLB references/chunks/buffers, and a ZIP assembled from the **actual built runtime** with exact GLB bytes and licenses. The ZIP is independently parsed by the hostile-archive validator. Physics tests use actual Rapier WASM and Three.js geometry with a minimal window/input mock: falling/settling, fixed stepping, rotated/offset colliders, child-before-parent hierarchy synchronization, movement, blur/jump, one-time score, hidden collectibles and disposal. Parent-space tests compare against the actual solver body transform, allowing bounded contact drift rather than assuming unchanged horizontal coordinates. This is not visual rendering or exported-game browser proof.

The Blender suite passed **23 tests**, with **one real Blender test explicitly skipped** in the normal run. It includes real loopback HTTP, actual Node MCP subprocess framing/allowlists, and Python addon transport with mocked `bpy`. Passing source/unit/subprocess tests does not establish deployed Cloudflare bindings, signed-in browser behavior, model-provider credentials, live Blender import, production performance or end-to-end publication. Record those separately from the primary browser/build QA.
