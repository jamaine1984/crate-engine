# User-funded 3D generation

Primary documentation checked on **2026-09-27**. No user key was accessed, no paid job was submitted, and no provider account or production integration was activated. Prices and model availability can change.

## Current usable workflow

The editor imports self-contained GLB files. Its saved model connections currently support OpenAI, Anthropic and OpenRouter scene proposals. **A fal/Replicate 3D API adapter is not implemented.** Do not put a fal or Replicate key into one of those provider fields.

1. Open a provider below using your own provider account. You are responsible for its charges and account terms; Crate Ship supplies no generation credits.
2. Supply an image you have permission to use. For TRELLIS.2, a practical starting configuration is resolution `512`, texture size `1024`, and a vertex target of `20000`. This is a proposed mobile starting point, not a promise of output quality or performance.
3. Review the provider's current price, explicitly generate, then download the GLB result to your device.
4. Import that `.glb` into the editor. Keep the original downloaded file and inspect the scene before saving/exporting. The engine currently rejects files over 32 MiB, external resources and invalid or excessively large geometry descriptors.

A successfully generated asset may still be unsuitable for the engine or exceed its limits. Provider generation can be charged even when the later editor import fails. Do not silently generate again, pay for a second optimization service, or promise a refund. Reduce settings or optimize your own asset locally when needed.

## Available providers

| Service | Current offering and cost evidence | Suitability |
| --- | --- | --- |
| [fal TRELLIS.2](https://fal.ai/models/fal-ai/trellis-2) | Image-to-GLB; listed $0.25 at 512, $0.30 at 1024, $0.35 at 1536; marked for commercial use. | Recommended first fixed adapter: direct GLB output and explicit size controls. |
| [fal Hunyuan 3D 3.1 Pro, image input](https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/image-to-3d) | $0.375 base; additional $0.15 each for PBR, multiple views and custom face count. | Current alternative; example output is over the editor's 32 MiB limit. |
| [fal Hunyuan 3D 3.1 Pro, text input](https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/text-to-3d) | Separate text-to-3D endpoint with GLB output and the same listed base/options pricing. | Text workflow without an automatic extra image-generation purchase. |
| [Replicate Tencent Hunyuan 3D 3.1](https://replicate.com/tencent/hunyuan-3d-3.1) | Official model, listed $0.50 per output unit. | Alternative hosted API; output size still requires validation. |
| [Replicate community TRELLIS.2](https://replicate.com/fishwowater/trellis2) | Runtime-dependent estimate, roughly $0.75–$0.77 in retrieved pages; model author notes long setup and additional dependency licenses. | Less predictable cost; no recommendation to use it as the first adapter. |

The former [fal Hunyuan 3D 2.1 endpoint](https://fal.ai/models/fal-ai/hunyuan3d-v21) is marked deprecated and unsupported. New integration work should use current endpoints instead.

Replicate's [Hunyuan schema](https://replicate.com/tencent/hunyuan-3d-3.1/api/schema) accepts an image or prompt, with image limits of 128–5000 pixels per side and 6 MB, prompt limit 1024 characters, optional PBR, and 40,000–1,500,000 faces. Its official prediction endpoint is `POST https://api.replicate.com/v1/models/tencent/hunyuan-3d-3.1/predictions`. These are research findings, not a configured Crate Ship adapter.

## Recommended fixed fal adapter contract — proposed, not implemented

Use only `fal-ai/trellis-2`, with a server-side credential decrypted from the authenticated user's own vault record. Set `Authorization: Key <user credential>` explicitly on each request. Do not install a platform `FAL_KEY`, use a global SDK credential, accept an arbitrary endpoint, or fall back to credits funded by Crate Ship.

The [published OpenAPI schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/trellis-2) defines these paths on `https://queue.fal.run`:

| Operation | Method and path |
| --- | --- |
| Submit | `POST /fal-ai/trellis-2` |
| Poll | `GET /fal-ai/trellis-2/requests/{request_id}/status` |
| Result | `GET /fal-ai/trellis-2/requests/{request_id}` |
| Request cancellation | `PUT /fal-ai/trellis-2/requests/{request_id}/cancel` |

The same schema requires `image_url`; `resolution` is integer 512/1024/1536, `texture_size` is integer 1024/2048/4096, and `decimation_target` is 5,000–2,000,000. The three sampling-step fields range 1–50. `remesh` is a boolean. Return data includes `model_glb.url` with optional file metadata. The [API guide](https://fal.ai/models/fal-ai/trellis-2/api) supports a data URI for image input and recommends 20,000–50,000 vertices for web/mobile.

Proposed first input, with the image value supplied only after validation:

```json
{
  "image_url": "data:image/png;base64,<validated user image>",
  "resolution": 512,
  "texture_size": 1024,
  "decimation_target": 20000,
  "remesh": true
}
```

These are **application design limits**, not claimed fal limits: one active job per account; input at most 4 MiB after actual image decoding/type checks; JPEG, PNG or WebP only; no remote input URL field in the first version. Prefer a 16 MiB mobile download target and retain the engine's absolute 32 MiB GLB import ceiling. A vertex target does not guarantee file size, texture memory, topology or frame rate.

### Durable requests and billing

Before submission, atomically persist the account, connection, input digest, fixed model/settings, unique client request ID and explicit charge consent. Store the provider request ID as soon as received. A crash after submission but before recording that ID is a billing-unknown state; do not auto-resubmit. Polling and result access must resolve only the stored owner-bound provider ID. Browser refresh must recover that job rather than start a second one.

fal documents persistent queue states and provider-side automatic retries; cancelling a running job may still allow completion. The adapter must distinguish requested cancellation from confirmed cancellation and never promise that cancellation guarantees no charge. [fal queue documentation](https://fal.ai/docs/documentation/model-apis/inference/queue)

Users fund their own prepaid fal accounts. fal describes billing for successful outputs, with no charge for server errors or queue waiting. Read current account/model pricing before confirmation; advertised prices are not a permanent quote. Pricing is available through `GET https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/trellis-2` using the same user's credential. The existing Crate Ship billing contract must remain `user_provider_account`, with platform generation funding and platform credits both false. [fal billing documentation](https://fal.ai/docs/documentation/model-apis/pricing)

### Download and privacy boundaries

Construct queue URLs from fixed code, not arbitrary response URL fields. Treat the resulting GLB URL as untrusted: validate HTTPS and explicitly supported fal media origins, deny credentials/ports, block redirects, set timeouts and stream byte limits, and never attach the provider API key to a media CDN request. Validate the actual downloaded bytes with `inspectGLB`, hash them, then store them as an owner-bound private asset. No uploaded/generated JavaScript executes. Do not turn this into a general URL proxy.

Review provider media ACLs before describing any generated file as private. fal distinguishes retained JSON from media: `X-Fal-Store-IO: 0` suppresses JSON payload storage, while `X-Fal-Object-Lifecycle-Preference` controls generated-media expiry. Neither alone establishes zero retention or private access. Download before expiry; preserve only the user's accepted model and bounded job metadata under the platform retention policy. [fal retention documentation](https://fal.ai/docs/documentation/model-apis/media-expiration)

### License boundary

Microsoft distributes TRELLIS.2 model and code under MIT and identifies separately licensed dependencies. fal's commercial-use label does not clear a user's input-image rights, trademarks or every self-hosted dependency. The community Replicate wrapper additionally identifies DINOv3 and BRIA RMBG obligations. No weights or hosted dependency packages are redistributed in this editor. [Microsoft TRELLIS.2](https://github.com/microsoft/TRELLIS.2), [MIT license](https://github.com/microsoft/TRELLIS.2/blob/main/LICENSE), [Replicate wrapper notes](https://replicate.com/fishwowater/trellis2)

The current Hunyuan hosted service must be used under its current provider/Tencent terms; this research does not classify Hunyuan 3.1 as MIT or grant blanket rights to generated content. Confirm those terms for the selected service before an embedded paid integration.

## Evidence still required for an integrated release

Implement the durable job schema/routes and owner-bound fal vault adapter; exercise timeout/crash/idempotency, cancellation, quota and URL/download attack cases; verify actual provider privacy/access controls; and then perform one expressly authorized live job with the user's own funded account. No live job or first-class adapter verification is claimed by the external workflow above.
