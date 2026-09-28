# Building and playing on phones

The editor has responsive Scene, View, Inspector, and Assets panes. Use the header's Import control to pick your own `.glb` model or portable `.crate`/`.json` project from the phone's file picker. Inspector fields provide numeric transforms when a small viewport makes the transform handles difficult to use. Save a portable project backup before relying on browser storage: mobile browsers may clear local data under storage pressure.

## Play controls

Both editor Play and exported browser games use the same movement pad and Jump button. Controls appear during play on touch devices and viewports up to 900 CSS pixels wide. Stop removes the editor controls.

- Add a Player component to a renderable object. The editor adds its required dynamic rigid body. A player hidden by its own visibility setting or a hidden parent is inactive.
- Hold a direction to move. Hold two directions for normalized diagonal movement. Use another finger to tap Jump. A held Jump button produces one jump; release before jumping again.
- Movement follows world X/Z axes. It does not rotate with the camera. WASD/arrows and Space remain available on keyboards.
- An authored camera supplies the play view. With no authored camera, drag the unobstructed scene to orbit. Editor Stop restores the previous editing view and exact authored transforms.
- Buttons capture their touch pointers and prevent scrolling on the controls. Leaving the tab, hiding the document, cancelling a pointer, stopping, or closing the game releases held input.
- Controls have accessible names, visible focus, keyboard activation, and pressed states. If the scene has no active player, movement controls are visibly disabled with an explanation.

## Device and workflow limits

Use Low rendering quality on slower phones. Smaller models, fewer lights, and simpler scenes use less GPU memory. Shadows are capped at one directional light and two point lights. WebGL2 and WebAssembly support are required; memory limits and browser file downloads vary by device. Automated input and physics tests do not replace testing on the phones you intend to support.

The exported ZIP is a browser game, not an Android or iOS application package. Serve it over HTTP; direct `file://` loading is unsupported. The ZIP includes its runtime and model files, so no renderer CDN is needed.

The Blender bridge connects to `127.0.0.1` on the device running the editor. A phone cannot use that address to reach Blender on a different desktop. On a phone, import a GLB exported from Blender through the device's file picker. Hosted account model connections require their configured server capabilities and explicit approval before a billed provider request.

The current controls do not include a virtual camera joystick, camera-relative movement, gamepad mapping, custom touch layouts, or arbitrary executable game scripts. Physics uses bounding-box colliders. Those limits are shared by editor preview and the exported game.

## Verification

`tests/engine-touch.test.mjs` covers multi-pointer state, interruption cleanup, analog and diagonal movement, jump edges, and hidden-parent collider exclusion using the real Rapier runtime. `tests/engine-physics.test.mjs` covers authored-state preservation, collisions, transforms, collectibles, and listener disposal. Browser and physical-device checks should additionally confirm viewport layout, simultaneous touches, camera gestures, and export downloads.
