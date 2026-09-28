# Editor behavior and current limits

This document describes implemented behavior and focused regression checks. It is not a claim that every code path, browser, account configuration, or device has been tested.

## Edit and Play

| Area | Supported behavior | Current limits |
| --- | --- | --- |
| Selection | Click/tap a visible mesh in Edit, or choose any entity in the hierarchy. Gizmo drags, camera drags, secondary clicks, and interrupted gestures do not select an object underneath. | Play is a simulation. Stop before selecting and repositioning scene objects. Cameras, lights, and empty groups have no clickable mesh; select them from the hierarchy. |
| Transform | Position, rotation, and positive scale; local/world gizmos; numeric inspector fields; cancelled drags restore their starting transform. | Negative/mirrored scales and sheared transforms are unsupported. Transform gizmos inherit Three.js limitations under nonuniformly scaled ancestors. |
| Parent | Parent references are validated against cycles, missing parents, and the 64-level depth cap. Changing a parent through the editor preserves world pose when representable as position/rotation/scale. | Reparenting that would require shear or mirroring rejects with an explanation. Physical parenting does not create a joint or welded body. |
| Duplicate / Undo | Duplicate copies an entire selected subtree with new IDs, remapped internal parents, and shared model assets. It is one undo step. Up to 80 undo records are retained. | Undo history is in the current editor session; loading another project resets it. |
| Imported models | GLB root transforms, materials, textures, animation binding names, and original bytes are preserved. Each entity uses a separate transform wrapper and animation mixer. | Self-contained GLB only. A model material inspector does not replace its original imported materials. No arbitrary external texture URLs or JavaScript. |
| Animation | Embedded animation clips, named clip selection, autoplay, speed, and reset at each preview. Unknown clip names generate a fallback warning. | No animation timeline, retargeting, blend trees, or animation authoring. Bounding-box colliders do not deform with skeletal animation. |
| Lighting / camera | Point and directional lights, material PBR values, ambient environment, exposure, fog, quality settings. The first visible authored camera is used in both preview and exported games. Stop restores the editing camera. | Directional lights currently aim at the world origin, so changing position changes their direction. Camera lens/FOV editing, automatic player-follow cameras, and multiple camera switching are not exposed. Shadows are limited to one directional and two point lights; total lights are capped at 32. |
| Physics | Rapier fixed stepping, static/dynamic bounding-box colliders, gravity, restitution/friction/mass, player movement/jump, and collectibles. Collected bodies and their descendant bodies leave the simulation. | No mesh-accurate collision, joints, vehicle controller, terrain collision mesh, or physics editor. Renderables need geometry for a body; empty cameras/lights cannot collide. Spin and rigid body cannot be combined. |
| Player controls | WASD/arrows + Space and touch movement + Jump. Diagonal speed is normalized and interrupted input clears. | Multiple Player components share the same input and produce an explicit warning. This is not independent local or network multiplayer, and clicking an entity during Play does not transfer possession. |
| Save / import | Version 4 projects, inert legacy version 3 migration, local and account storage, original GLB export, portable project export, and browser-game ZIP. Saves/imports/exports lock competing edits and validate bytes. | Cloud save depends on configured account storage. Browser local storage may be evicted. A direct `file://` game launch is unsupported; serve the exported package over HTTP. |

## Declarative world generation

The same `engine/core/procedural.mjs` compiler serves local recipes, reviewed BYOK responses, and the editor MCP bridge. It can build arrangements from primitives and already imported models using:

- **Add:** one entity, optionally with a key that later operations can use as their parent.
- **Grid:** repeated entities with explicit counts, spacing, and local origin.
- **Scatter:** seeded, repeatable placement within X/Z bounds, with optional size variation and Y rotation.

Recipes are plain versioned JSON. They cannot execute scripts, run network requests, add arbitrary fields or external URLs, or refer to an unimported model. Current limits are 64 operations, 500 generated entities, 5,000 total project entities, 32 total lights, and 128 KB per recipe. The compiler checks finite transforms, physics requirements, hierarchy, referenced asset IDs, and project totals. These are data limits, not frame-rate guarantees; use smaller scenes on phones.

`previewWorld(recipe)` returns a review ID, counts, and generated entities without changing the project. `applyWorld({previewId})` applies that exact preview as one Undo step. Changes, undo, project switching, or changed cloud persistence metadata make older previews unusable. A preview can be applied once. Reviewing a new recipe replaces the previous review.

Village and forest examples are **stylized blockouts**, not finished realistic environments. They can omit their starter player and sun to reuse existing scene controls. The forest can place an existing imported tree model. No catalog files are added or removed by a recipe.

Generation arranges supported objects. It does not synthesize new model geometry, textures, rigging, audio, navigation meshes, or arbitrary gameplay code from text. Import models created in a separate 3D tool or service when those assets are needed. Provider requests still require the user's configured connection and explicit cost confirmation; applying changes is a separate action.

## Evidence and remaining verification

- `tests/engine-runtime-behavior.test.mjs`: pointer selection/cancellation, reparenting, subtree duplication/undo, imported-root animation preservation, collectible collider removal, and shared-player input behavior.
- `tests/engine-procedural.test.mjs`: strict schema, bounded generation, deterministic transforms, hierarchy and model references, no mutation during preview, revision rejection, one-time atomic insertion and undo, and examples with optional player/sun.
- Existing core, export, physics, touch, and legacy safety suites cover format validation, original bytes, ZIP contents, input interruption, and inert legacy script handling.

GPU/browser checks remain necessary for visual output, gizmo interaction on real touch screens, import/export downloads, and performance under large scenes. Production account/provider/MCP configuration and physical phone behavior require their own environment checks.
