# Engine rendering and asset research

Checked official GitHub repositories and Hugging Face model cards on 27 September 2026. This is an integration decision record, not a claim that every candidate was installed or benchmarked.

## Added to this rebuild

| Capability | Implementation | Source |
| --- | --- | --- |
| Physically based materials, image based illumination, exposure and soft shadows | Three.js r186.1, GLB material preservation, RoomEnvironment / PMREM, ACES tone mapping | [Three.js](https://github.com/mrdoob/three.js) |
| Ambient occlusion | Three.js GTAOPass, enabled by the High quality option; Low/Balanced avoid its extra render passes | [Three.js GTAOPass](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/postprocessing/GTAOPass.js) |
| Faster mesh selection | three-mesh-bvh 0.9.15, bounded static mesh acceleration; skinned models use ordinary raycasts | [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) |
| Physics | Rapier 0.21, fixed simulation steps, rigid bodies, box colliders, keyboard player, jump and collectible components | [Rapier JS](https://github.com/dimforge/rapier.js) |
| Portable models | Embedded GLB validation, meshopt decoder, local/project/cloud asset ownership, Blender transfer | [glTF specification](https://github.com/KhronosGroup/glTF) |

The new editor bundles no agent loop or default AI model weights. API model connections are optional, user supplied, encrypted on the server, and make a single explicitly requested proposal. The user reviews typed operations before applying them.

## Current candidates and decisions

- **Three.js WebGPU / TSL:** current upstream examples include screen-space indirect lighting. A renderer migration requires material, platform and browser regression coverage. The current rebuilt editor uses the tested WebGL2 path; WebGPU SSGI is a future renderer milestone, not a shipped toggle. [Official SSGI example](https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_postprocessing_ssgi.html).
- **three-gpu-pathtracer:** promising for a still-frame look-development mode. Progressive accumulation and scene rebuild costs need representative scene benchmarks before inclusion. It is not installed in this rebuild. [Official project](https://github.com/gkjohnson/three-gpu-pathtracer).
- **glTF Transform:** existing pinned SDK can deduplicate, prune and optimize authored assets. Animation, instancing, materials and texture quality must be compared before destructive optimization. The existing CLI is separate from editor import; imports preserve originals. [Official project](https://github.com/donmccurdy/glTF-Transform).
- **TRELLIS.2-4B:** an available MIT-licensed image-to-3D model with PBR output and GLB export. The official model card says Linux-tested and at least 24 GB NVIDIA GPU memory. Keep it as an optional external generation workflow whose GLB is imported; it is too large to bundle into the browser or assume free inference. Additional pipeline dependencies require their own license check. [Microsoft model card](https://huggingface.co/microsoft/TRELLIS.2-4B), [code](https://github.com/microsoft/TRELLIS.2).
- **Hunyuan3D 2.1:** available PBR generation candidate. Official repository lists 10 GB VRAM for shape, 21 GB for texture, 29 GB total. It uses the Tencent Hunyuan community license, so eligibility and redistribution terms need review for the intended deployment. It remains an external asset workflow. [Model card](https://huggingface.co/tencent/Hunyuan3D-2.1), [official code](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1).
- **Hunyuan3D-Buffalo 1.0:** newer August 2026 research for generating, understanding and editing 3D. At inspection the official repository contained the report README and presentation assets, without a usable inference implementation or weights. Track its release; do not offer a nonfunctional integration. [Official repository](https://github.com/Tencent-Hunyuan/Hunyuan3D-Buffalo1.0).

## Next rendering milestones

Use real scene budgets for triangles, draw calls, texture memory, frame time and loading time; measure on integrated graphics and mobile as well as desktop. Next work should add GPU texture compression, LOD/streaming, authored terrain, navigation and a richer animation/gameplay system. Benchmark WebGPU SSGI against the current renderer before making it the default. The present rebuild is a functioning browser engine foundation, not an Unreal/Unity feature-equivalence claim.
