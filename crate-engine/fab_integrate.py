#!/usr/bin/env python3
"""Extract Fab ZIPs, convert FBX→GLB, output to web/models/fab/"""
import os, sys, subprocess, zipfile, shutil, glob, json, re

BLENDER = "/opt/homebrew/bin/blender"
FAB_DIR = "/Users/jamainemartin/.openclaw/workspace/crate-engine/fab_assets"
OUT_DIR = "/Users/jamainemartin/.openclaw/workspace/crate-engine/web/models/fab"
WORK = "/tmp/fab_work"
BLENDER_SCRIPT = "/tmp/blender_convert.py"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

# Blender headless conversion script
with open(BLENDER_SCRIPT, 'w') as f:
    f.write('''
import bpy, sys
bpy.ops.wm.read_homefile(use_empty=True)
fbx_path, glb_path = sys.argv[-2], sys.argv[-1]
try:
    bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)
    bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB',
        export_animations=True, export_skins=True, export_apply=False, export_yup=True)
    sys.exit(0)
except Exception as e:
    print(f"ERROR: {e}"); sys.exit(1)
''')

catalog = {}  # name → glb path (relative to web/)

def safe_name(s):
    return re.sub(r'[^a-zA-Z0-9_-]', '_', s).strip('_').lower()

def convert_fbx(fbx_path, out_glb):
    if os.path.exists(out_glb) and os.path.getsize(out_glb) > 500:
        return True
    r = subprocess.run([BLENDER, "--background", "--python", BLENDER_SCRIPT,
                        "--", fbx_path, out_glb],
                       capture_output=True, timeout=90)
    return r.returncode == 0 and os.path.exists(out_glb) and os.path.getsize(out_glb) > 500

def process_zip(zip_path, pack_name):
    results = []
    ex_dir = os.path.join(WORK, pack_name)
    os.makedirs(ex_dir, exist_ok=True)
    
    try:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(ex_dir)
    except Exception as e:
        print(f"  ZIP error: {e}"); return results

    # Find FBX files
    fbx_files = glob.glob(os.path.join(ex_dir, "**/*.fbx"), recursive=True)
    glb_files = glob.glob(os.path.join(ex_dir, "**/*.glb"), recursive=True)
    gltf_files = glob.glob(os.path.join(ex_dir, "**/*.gltf"), recursive=True)

    # Copy GLBs directly (already web-ready)
    for glb in glb_files:
        fname = safe_name(os.path.splitext(os.path.basename(glb))[0])
        out = os.path.join(OUT_DIR, f"{pack_name}_{fname}.glb")
        if not (os.path.exists(out) and os.path.getsize(out) > 500):
            shutil.copy2(glb, out)
        size = os.path.getsize(out)
        results.append({'name': f"{pack_name}/{fname}", 'file': f"fab/{pack_name}_{fname}.glb", 'size': size})
        print(f"  ✅ [GLB] {fname} ({size//1024}KB)")

    # Convert FBX → GLB
    for fbx in fbx_files[:10]:  # max 10 meshes per pack
        base = safe_name(os.path.splitext(os.path.basename(fbx))[0])
        # Skip texture-only or tiny files
        if os.path.getsize(fbx) < 10000:
            continue
        out = os.path.join(OUT_DIR, f"{pack_name}_{base}.glb")
        print(f"  Converting {base}.fbx...", end=" ", flush=True)
        if convert_fbx(fbx, out):
            size = os.path.getsize(out)
            print(f"✅ {size//1024}KB")
            results.append({'name': f"{pack_name}/{base}", 'file': f"fab/{pack_name}_{base}.glb", 'size': size})
        else:
            print("❌")

    shutil.rmtree(ex_dir, ignore_errors=True)
    return results

# ─── Process loose FBX files first (fastest) ───
print("=" * 55)
print("PROCESSING LOOSE FBX FILES")
print("=" * 55)
for fbx in glob.glob(os.path.join(FAB_DIR, "*.fbx")):
    base = safe_name(os.path.splitext(os.path.basename(fbx))[0])
    out = os.path.join(OUT_DIR, f"{base}.glb")
    print(f"  {base}...", end=" ", flush=True)
    if convert_fbx(fbx, out):
        size = os.path.getsize(out)
        print(f"✅ {size//1024}KB")
        catalog[base] = {'name': base, 'file': f"fab/{base}.glb", 'size': size,
                         'tags': ['fab', 'prop']}
    else:
        print("❌")

# ─── Process ZIPs ───
PACKS = {
    'junkyard': 'junkyard_mid.zip',
    'saloon': 'saloon_interior_mid.zip',
    'bench': 'Bench.zip',
    'brick_wall_damaged': 'Brick_Wall_Damaged.zip',
    'broken_concrete': 'Broken_Concrete_Slab.zip',
    'broken_wall': 'Broken_Wall.zip',
    'cement_rubble': 'Cement_Rubble.zip',
    'city_ruins': 'City_Ruins.zip',
    'gravel_pile': 'Construction_Gravel_Pile.zip',
    'graffiti_wall': 'Graffiti_Wall.zip',
    'mailbox': 'Mailbox.zip',
    'manhole': 'Manhole_Cover.zip',
    'metal_barricade': 'Metal_Barricade.zip',
    'metal_manhole': 'Metal_Manhole.zip',
    'moroccan_urban': 'Moroccan_Urban_Block.zip',
    'concrete_barrier': 'Old_Concrete_Barrier.zip',
    'forklift': 'Orange_Forklift.zip',
    'stairs_street': 'Stairs_Street.zip',
    'statue_liberty': 'Statue_of_Liberty.zip',
    'stone_rubble': 'Stone_Rubble_Pile.zip',
    'traffic_sign': 'Stop_Traffic_Sign.zip',
    'street_props': 'Street_Props_GLB.zip',
    'traffic_light': 'Traffic_Light.zip',
    'trash_can': 'Trash_Can.zip',
    'trash_can2': 'Trash_Can_Garbage.zip',
    'wooden_door': 'Wooden_Door.zip',
    'city_ruins2': 'City_Ruins.zip',
    'brick_wall2': 'Brick_Wall_Damaged.zip',
}

print("\n" + "=" * 55)
print("PROCESSING ZIP PACKS")
print("=" * 55)

for pack_name, zip_file in PACKS.items():
    zip_path = os.path.join(FAB_DIR, zip_file)
    if not os.path.exists(zip_path):
        print(f"[{pack_name}] ⚠️  {zip_file} not found")
        continue
    print(f"\n[{pack_name}] {zip_file} ({os.path.getsize(zip_path)//1024//1024}MB)")
    results = process_zip(zip_path, pack_name)
    for r in results:
        catalog[r['name']] = {**r, 'tags': ['fab', pack_name]}
    print(f"  → {len(results)} models extracted")

# ─── Write catalog JSON ───
catalog_path = os.path.join(OUT_DIR, "fab_catalog.json")
with open(catalog_path, 'w') as f:
    json.dump(list(catalog.values()), f, indent=2)

print(f"\n{'='*55}")
print(f"✅ FAB INTEGRATION DONE")
print(f"   {len(catalog)} models → {OUT_DIR}")
print(f"   Catalog: {catalog_path}")
