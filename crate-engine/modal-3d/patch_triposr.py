import pathlib
p = pathlib.Path('/opt/TripoSR/tsr/models/isosurface.py')
code = p.read_text()
new_import = """
try:
    from torchmcubes import marching_cubes
except ImportError:
    from skimage.measure import marching_cubes as _sk_mc
    import torch, numpy as np
    def marching_cubes(volume, threshold):
        vol_np = volume.cpu().numpy() if isinstance(volume, torch.Tensor) else volume
        verts, faces, normals, values = _sk_mc(vol_np, level=threshold)
        return torch.tensor(verts, dtype=torch.float32), torch.tensor(faces.astype(np.int64), dtype=torch.long)
"""
code = code.replace('from torchmcubes import marching_cubes', new_import)
p.write_text(code)
print('Patched!')
