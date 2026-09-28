# Editor, import/export, and advertising readiness

Review date: September 27, 2026. Scope: current local source and current primary Google documentation. This is a readiness report; it does not enable ads, change assets, activate accounts, or establish production approval.

## Current product decision

The editor is intended to be **free and funded by advertising after the editor is ready**. The previously discussed $1.99 subscription is superseded. Paid AI and 3D services use the user's own provider account and API credentials; free editor access does not include provider credits. Blender desktop integration remains optional.

Recommendation: keep ordinary editing, local saving, opening/importing personal work, and existing backup/web exports available without completing an ad. Advertising must not become a dependency of preserving work. A different optional benefit would need a specific policy review before it is presented as a rewarded placement.

## What the current editor actually imports and exports

| Workflow | Current source behavior | Limits and remaining work |
| --- | --- | --- |
| Import a model | Validated GLB 2.0 model import; original model bytes retained. | 32 MiB per model; 80 MiB per import batch. Separate `.gltf` plus external resources, FBX, OBJ, and native engine project import are not implemented in this editor. |
| Open a project | `.crate` or supported project JSON; validated schema and embedded models; legacy migration preserves unsupported source without executing it. | One project at a time; 128 MiB project input limit. This does not promise that every feature from the old editor is reproduced. |
| Local save | Project and model bytes persisted in IndexedDB; completion is awaited. | Device/browser storage can fail or be cleared. Local save is not a server backup or a guarantee against browser eviction. |
| Cloud save | Private, authenticated project with revision checks; exact original models uploaded into the current account's private storage. Local backup precedes network save. | Requires configured identity, database, and private asset storage. A failed upload does not count as cloud success. Live deployment/account flows still need verification. |
| Export Crate project | Editable `.crate` backup with embedded original model bytes and editor scene/components. Cloud asset references are removed. | Maximum 80 MiB model payload and 128 MiB resulting project JSON. Legacy source retained for recovery remains inert. |
| Build browser game | ZIP containing the project, bundled JavaScript runtime, HTML/bootstrap, referenced original GLBs, and third-party notices. | Serve over HTTP; direct `file://` opening is unsupported. Export is not publication. No native executable or automatic store upload. |
| Export entire scene as GLB | No whole-scene GLB exporter in the new editor's current export menu/runtime. | A future exporter would need to flatten/translate authored transforms, primitives, materials, hierarchy, lights, and animations and document unsupported features. |
| Unity / Unreal / Godot project export | **Not implemented.** | No conversion into native scenes, prefabs, scripts, physics components, project configuration, or build pipelines. Requires separately designed and tested target adapters. |

Evidence: `engine/runtime/editor.mjs` (`importBatch`, `persistLocal`, `cloudSave`, `exportProject`), `engine/storage/local.mjs`, `engine/player/export.mjs`, `engine/editor/app.mjs` (`exportDialog`). The ZIP contains original GLB assets referenced by the scene; those files can be reused separately. It does not bake every Crate-authored scene edit into a new GLB.

GLB is an asset interchange route: Godot documents GLB import, Unity documents its glTFast import route, and Unreal documents glTF/GLB support. Importer support and material/animation fidelity depend on the target engine and asset. Crate gameplay logic still needs a target implementation. [Godot formats](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html), [Unity GLB guidance](https://docs.unity.com/en-us/asset-transformer-sdk/2026.1/manual/sdktips/export-guidelines), [Unreal glTF support](https://dev.epicgames.com/documentation/unreal-engine/gltf-file-format-support-in-unreal-engine).

## Can Google ads fund saving, import, or export?

**The API can offer rewarded/interstitial placements, but that does not establish approval for a development editor or the proposed rewards.** Google's API overview includes interactive HTML5 content beyond games. Its H5 Games Ads product separately requires an application and approved AdSense account; acceptance depends on eligibility. The exact Crate editor surface and proposed placements need confirmation through the publisher's Google account/support process. No approval has been established in this audit. [API overview](https://developers.google.com/ad-placement), [H5 application requirements](https://support.google.com/adsense/answer/1705831?hl=en).

Google's rewarded policy requires clear disclosure and affirmative choice, permits dismissal, and says declining must not impair normal site use. It restricts rewards to qualifying benefits usable within the publisher's platform and non-transferable to others; cash rewards are prohibited. Our inference: gating routine save/import/export would jeopardize that normal-use requirement. Downloadable project or asset rewards also require review because users can use or transfer them outside the platform. Do not describe those rewards as approved. [Rewarded ad policies](https://support.google.com/adsense/answer/9121589?hl=en-8).

The H5 API guide additionally describes rewards as in-app benefits without external monetary or exchange value. That makes monetizable downloadable content a particularly uncertain reward design. A technically successful ad callback would not resolve this policy question. [Ad Placement API reward guidance](https://developers.google.com/ad-placement/apis).

| Proposal | Recommendation before implementation |
| --- | --- |
| Watch an ad to save, recover, import, or download the only copy of work | Do not implement this dependency. Keep the baseline operation available. |
| Optional reward beyond baseline editing | Define the precise benefit, limits, disclosure, and decline path; obtain eligibility/policy confirmation. No benefit is assumed approved yet. |
| Interstitial when returning from the editor to the game catalog | Possible candidate only after a confirmed save and at the actual screen transition, subject to approval and frequency controls. |
| Random timed ads while editing, dragging objects, typing, or playing | Reject this placement design. |
| Ad on closing the browser or after leaving the page | Do not use this exit behavior. Preserve work beforehand. |

Google's H5 guidance places full-screen ads at natural transitions, such as between activities or catalog/game screens. It prohibits unexpected interruptions, ads after every interaction, interference with navigation, and ads after the application/page has closed. An editor-specific transition still needs eligibility review. [H5 placement guidance](https://support.google.com/adsense/answer/9959170?hl=en).

## Current advertising gates

Advertising is deliberately unavailable in the inspected source:

- `platform/server/data.mjs`: `DISABLED_PROVIDER_FLAGS` forces Google/H5/rewarded/interstitial flags false, along with payment and payout flags. The owner flag endpoint rejects their activation with `RELEASE_GATE`; changing a database flag alone cannot enable them.
- `platform/migrations/0002_platform.sql`: advertising flags start disabled.
- `platform/server/commerce.mjs`: `DisabledAdProvider` returns unavailable and never grants a reward.
- `platform/server/data.mjs`: `/ads`, `/rewards`, payment, and payout routes return `PROVIDER_DISABLED`; no transaction is created.
- `platform/server/player.mjs`: authenticated game configuration reports ads and rewards disabled.
- `platform/client/player-bridge.mjs`: `ads.rewarded` returns unavailable with no reward grant.
- The new editor has no Ad Placement API placement integration or ad-based save/export entitlement flow. Its save-before-leaving dialog explicitly says ads are not enabled.

These are safety gates, not a completed monetization integration. The existing agreement and immutable revenue ledger foundations do not establish live ad collection, verified rewards, reconciliation, or payouts. A generic `subscriptions` revenue category in agreement bookkeeping does not enable an editor subscription.

## Save and navigation behavior

Current source has an explicit Save & continue / Leave without saving / Stay in editor dialog for controlled navigation. `engine/editor/navigation.mjs` waits for preview stop and successful local save before navigating; errors preserve the pending destination and permit retry. Cloud save also first writes a local backup. Regression cases exist in `tests/engine-navigation.test.mjs` and `tests/engine-export.test.mjs`; this review inspected them and did not rerun the suite.

There is also an unsaved-change `beforeunload` warning. The source does not establish periodic autosave or reliable recovery from a browser/process termination. Do not market that warning as guaranteed recovery. Before an advertising rollout, verify storage-full/private-mode behavior, restore after reload, multi-tab conflicts, phone interruptions, and export/download recovery on target browsers.

Recommended future flow:

1. Finish the current editor operation and preserve an exact editable snapshot plus required model bytes. Report actual save success or failure.
2. If save fails, retain the scene and offer retry or a backup download. Never start an ad in order to repair saving.
3. At an approved natural navigation break, consider one eligible placement. Respect consent, session frequency limits, and the user's navigation choice.
4. Continue normally when ads are disabled, blocked, unavailable, or offline. No data deletion, lost export, infinite spinner, or forced provider retry.
5. Restore focus and paused input/audio after an ad. Keep ad completion, successful saving, reward allocation, and actual provider revenue as separate events.

`adBreakDone` supplies completion status even when the loaded API does not display an ad; the before/after callbacks are not sufficient for no-fill handling. Reward prompts belong in `beforeReward`; completed and dismissed ads have distinct callbacks. An unloaded/blocked script also needs an application-level availability check and bounded fallback. Do not bypass a displayed ad's controls or grant an ad reward merely because a timeout elapsed. [adBreak reference](https://developers.google.com/ad-placement/apis/adbreak).

## Work and approvals still required

1. **Editor readiness:** finish the requested editor acceptance checks, inspect unresolved data recovery/import/export issues, verify real device behavior, and report supported formats accurately. Native engine conversion remains a separate unimplemented feature.
2. **Google eligibility and placements:** confirm publisher/account/site approval, whether this editor is accepted, and the exact optional reward and interstitial design. Do not promise inventory, fill rate, or sufficient revenue to cover costs.
3. **Consent:** implement the applicable publisher consent flow and propagation. A saved `advertisingConsent` preference alone is not a certified CMP implementation. Google specifies certified CMP/TCF requirements for relevant European traffic; evaluate the actual audience before enabling serving. [Google consent requirements](https://support.google.com/adsense/answer/13554020?hl=en-GB).
4. **Provider implementation:** add the approved integration, isolated-origin/CSP plan, no-fill recovery, frequency controls, and test-mode verification. No publisher tag should be injected into arbitrary exported customer games by default.
5. **Reward security:** if rewards are retained, define server-side request identity, account/session binding, replay prevention, limits, and auditable grants. Browser callbacks alone are not cryptographic evidence. Confirm the verification facilities actually available for this web product; do not assume a mobile server-verification feature exists here.
6. **Accounting and rollout:** map real provider reports to the correct placement/game and effective agreement, distinguish estimates from finalized revenue, validate duplicate handling and reconciliation, then obtain explicit owner go-live approval. Keep the disable switch available.

No source changes, assets, ads, subscriptions, provider calls, account setup, or deployment were performed for this report.
