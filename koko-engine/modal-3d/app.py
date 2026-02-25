"""Crate Engine — 3D Generation Service (Modal.com + L4 GPU + TripoSR + SDXL)"""
import modal, io, time

app = modal.App("crate-engine-3d")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch==2.2.1", "torchvision==0.17.1", "numpy<2", "Pillow", "trimesh",
        "rembg", "onnxruntime", "huggingface_hub", "transformers", "safetensors",
        "einops", "omegaconf", "tqdm", "scikit-image", "fastapi[standard]",
        "diffusers", "accelerate",
    )
    .run_commands(
        "cd /opt && git clone https://github.com/VAST-AI-Research/TripoSR.git",
        r"sed -i 's/from torchmcubes import marching_cubes/try:\n    from torchmcubes import marching_cubes\nexcept ImportError:\n    from skimage.measure import marching_cubes as _sk_mc\n    import torch as _torch, numpy as _np\n    def marching_cubes(volume, threshold):\n        v = volume.cpu().numpy() if isinstance(volume, _torch.Tensor) else volume\n        vt, fc, _, _ = _sk_mc(v, level=threshold)\n        return _torch.tensor(vt, dtype=_torch.float32), _torch.tensor(fc.astype(_np.int64), dtype=_torch.long)/' /opt/TripoSR/tsr/models/isosurface.py",
    )
)

volume = modal.Volume.from_name("crate-3d-models", create_if_missing=True)

@app.cls(gpu="L4", image=image, volumes={"/models": volume}, timeout=300, scaledown_window=60)
class TripoSRGenerator:
    @modal.enter()
    def load_model(self):
        import torch, sys
        sys.path.insert(0, "/opt/TripoSR")
        from tsr.system import TSR
        self.device = "cuda"
        print(f"[CRATE-3D] GPU: {torch.cuda.get_device_name(0)}")
        self.model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
        self.model.renderer.set_chunk_size(8192)
        self.model.to(self.device)
        # Load SDXL Turbo for text-to-image (fast, 1-4 steps)
        from diffusers import AutoPipelineForText2Image
        self.txt2img = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16"
        ).to(self.device)
        print("[CRATE-3D] TripoSR + SDXL Turbo loaded!")

    @modal.method()
    def generate_from_image(self, image_bytes: bytes, resolution: int = 256) -> bytes:
        import torch; from PIL import Image; from rembg import remove; import numpy as np; import trimesh
        start = time.time()
        image = Image.open(io.BytesIO(image_bytes))
        image = remove(image).convert("RGBA").resize((512, 512), Image.LANCZOS)
        with torch.no_grad():
            scene_codes = self.model([image], device=self.device)
        meshes = self.model.extract_mesh(scene_codes, resolution=resolution)
        mesh = meshes[0]
        tmesh = trimesh.Trimesh(vertices=mesh.vertices.cpu().numpy(), faces=mesh.faces.cpu().numpy())
        if hasattr(mesh, 'vertex_colors') and mesh.vertex_colors is not None:
            tmesh.visual.vertex_colors = (mesh.vertex_colors.cpu().numpy() * 255).astype(np.uint8)
        tmesh.fix_normals()
        out = io.BytesIO(); tmesh.export(out, file_type="glb")
        print(f"[CRATE-3D] Image→3D: {time.time()-start:.1f}s, {len(out.getvalue())/1048576:.1f}MB, {len(tmesh.vertices)} verts")
        return out.getvalue()

    @modal.method()
    def generate_from_text(self, prompt: str, resolution: int = 256) -> bytes:
        import torch; from PIL import Image; from rembg import remove; import numpy as np; import trimesh
        start = time.time()
        # Step 1: Text → Image via SDXL Turbo (1 step = ~0.5s)
        enhanced_prompt = f"3D game asset, {prompt}, centered, clean background, white background, studio lighting, isometric view, high quality, detailed"
        with torch.no_grad():
            result = self.txt2img(prompt=enhanced_prompt, num_inference_steps=4, guidance_scale=0.0, width=512, height=512)
        ref_image = result.images[0]
        t1 = time.time()
        print(f"[CRATE-3D] Text→Image: {t1-start:.1f}s")
        # Step 2: Image → 3D via TripoSR
        ref_image = remove(ref_image).convert("RGBA").resize((512, 512), Image.LANCZOS)
        with torch.no_grad():
            scene_codes = self.model([ref_image], device=self.device)
        meshes = self.model.extract_mesh(scene_codes, resolution=resolution)
        mesh = meshes[0]
        tmesh = trimesh.Trimesh(vertices=mesh.vertices.cpu().numpy(), faces=mesh.faces.cpu().numpy())
        if hasattr(mesh, 'vertex_colors') and mesh.vertex_colors is not None:
            tmesh.visual.vertex_colors = (mesh.vertex_colors.cpu().numpy() * 255).astype(np.uint8)
        tmesh.fix_normals()
        out = io.BytesIO(); tmesh.export(out, file_type="glb")
        # Also save reference image as base64 for preview
        img_buf = io.BytesIO(); ref_image.save(img_buf, format="PNG"); img_b64 = __import__('base64').b64encode(img_buf.getvalue()).decode()
        print(f"[CRATE-3D] Text→3D total: {time.time()-start:.1f}s, {len(out.getvalue())/1048576:.1f}MB, {len(tmesh.vertices)} verts")
        return {"glb": out.getvalue(), "ref_img_b64": img_b64}

    @modal.method()
    def health(self) -> dict:
        import torch
        return {"status": "ok", "gpu": torch.cuda.get_device_name(0), "models": ["TripoSR", "SDXL-Turbo"]}

@app.function(image=image, timeout=300)
@modal.fastapi_endpoint(method="POST", docs=True)
async def generate(request: dict):
    import base64
    mode = request.get("mode", "image_to_3d")
    res = {"draft": 128, "standard": 256, "hd": 512}.get(request.get("quality", "standard"), 256)
    gen = TripoSRGenerator()

    if mode == "text_to_3d":
        prompt = request.get("text_prompt", "")
        if not prompt:
            return {"status": "error", "message": "text_prompt required"}
        result = await gen.generate_from_text.remote.aio(prompt=prompt, resolution=res)
        glb_data, ref_img_b64 = result["glb"], result["ref_img_b64"]
        return {
            "status": "success",
            "model_base64": base64.b64encode(glb_data).decode(),
            "reference_image": ref_img_b64,
            "format": "glb",
            "file_size_mb": round(len(glb_data)/1048576, 2),
            "mode": "text_to_3d"
        }
    else:
        b64 = request.get("image_base64", "")
        if not b64:
            return {"status": "error", "message": "image_base64 required"}
        data = await gen.generate_from_image.remote.aio(image_bytes=base64.b64decode(b64), resolution=res)
        return {
            "status": "success",
            "model_base64": base64.b64encode(data).decode(),
            "format": "glb",
            "file_size_mb": round(len(data)/1048576, 2),
            "mode": "image_to_3d"
        }

@app.function(image=image)
@modal.fastapi_endpoint(method="GET", docs=True)
async def health():
    gen = TripoSRGenerator()
    return await gen.health.remote.aio()
