# Design and browser verification

Reviewed 27 September 2026 against the supplied Crate Ship Games image and the locally built application. The image is a website reference; the engine has a new purpose-built editing layout in the same forest green, orange and mint palette.

## Reference comparison

The reference and the rendered desktop hub were inspected side by side. The implemented page retains the header, left navigation, central featured area and game shelves, right account/library/engine rail, large Creator Hub banner, two creator program cards, creator-upload strip, four information panels and footer. The creator-upload strip was added during this comparison. The mobile account control was resized to remove header overflow; closed mobile navigation no longer leaves offscreen keyboard targets.

Real empty catalog states replace the reference's fictional games, activity counts, prices and ratings. The page is consequently less dense until reviewed inventory exists. It is a branded implementation of the reference, not a pixel-identical reproduction with fabricated platform activity.

## Browser checks completed

The Codex in-app browser exercised the built local application at 1440×1000 and 390×844. This is responsive desktop-browser testing, not a physical phone certification.

| Workflow | Observed result |
| --- | --- |
| Desktop editor | Real Three.js viewport, scene hierarchy, transform controls, inspector and asset panels rendered |
| Numeric editing / Undo | Changed an object's Y position from 2 to 3 and restored it to 2 with Undo, including at phone size |
| Import GLB | Imported the locally authored QA pyramid; its geometry and materials rendered |
| Save and reopen | Local project reopened; account project with a private model saved and reopened at its project URL with the edited X=4 transform |
| Project backup | Portable project assembled with the same exporter, imported through the browser file chooser, and recovered objects, components and embedded model; account URL cleared |
| Optional existing catalog | Explicitly loaded the remote catalog and imported `tree cone 14`; it rendered alongside the user's own-model path |
| Physics preview | Cube fell onto the ground; Stop restored the authored Y=2 transform |
| Phone editing panels | Scene selection, Inspector editing, Assets and Viewport tabs usable at 390 CSS pixels |
| Phone Play | Play from Inspector switched to Viewport; D-pad and Jump appeared; Jump accepted pointer interaction; Stop removed play controls |
| Standalone export | Actual generated runtime ZIP, extracted and served at a separate local origin, started with the imported GLB and physics; no console error recorded in that game tab |
| Provider connections | Shows account billing, no platform AI credits, disabled service state, optional external generation links and explicit GLB import workflow |
| Blender | Local bridge pairing instructions and file-import alternative visible; actual Blender execution blocked by Windows |

The engine displayed about 60 FPS for the small five-object QA scene on this host after loading. This is not a representative mobile hardware benchmark. High quality ambient occlusion was also exercised separately; Low and Balanced remain available.

## Screenshots and artifacts

Saved under `outputs/verification/` beside the repository:

- `engine-desktop.png`: editing workspace with an imported model and optional catalog tree.
- `engine-mobile.png`: narrow viewport, Play state and touch controls.
- `engine-mobile-inspector.png`: phone inspector with numeric transform editing.
- `hub-desktop.png` and `hub-mobile.png`: website reference implementation.
- `exported-game.png` and `exported-game-mobile.png`: standalone game runtime, including the final shared phone controls.
- `Engine-Rebuild-QA.crate` and `Engine-Rebuild-QA-web.zip`: disposable QA project and portable game assembled using the real exporter.

The in-app browser displayed a ready export and its explicit download link, but its download-event/file retrieval APIs timed out. Actual browser download persistence therefore remains unverified. The ZIP and project artifacts above were assembled from the disposable local QA account using the same exporter; this is deliberately distinguished from a successfully captured browser download.

## Remaining acceptance

Test real iOS Safari and Android Chrome devices, simultaneous touches, landscape/safe-area layouts, file-picker/download behavior, memory pressure and representative complex scenes. Also verify real user-provider credentials/billing, the live Blender addon, and separately configured staging/production services. No paid provider requests or production deployment were performed for these checks.
