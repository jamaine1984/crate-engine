"""Batch generate 20 diverse 3D characters via Modal TripoSR"""
import modal, os, time, concurrent.futures

CHARACTERS = [
    ("businessman", "professional businessman in suit and tie, full body, standing pose, dark skin"),
    ("businesswoman", "professional businesswoman in blazer, full body, standing pose"),
    ("hoodie_guy", "young man in hoodie and jeans, full body, casual pose"),
    ("summer_dress", "woman in colorful summer dress, full body, dark skin"),
    ("chef", "chef in white uniform and hat, full body"),
    ("nurse", "nurse in scrubs, full body, standing pose"),
    ("construction", "construction worker with hard hat and vest, full body"),
    ("athlete_male", "male athlete in jersey and shorts, full body, dark skin"),
    ("athlete_female", "female athlete in sports outfit, full body"),
    ("punk_girl", "punk girl with colored hair and leather jacket, full body"),
    ("cowboy", "cowboy with hat and boots, full body, western outfit"),
    ("scientist", "scientist in lab coat with glasses, full body"),
    ("hip_hop", "hip hop artist in streetwear, gold chain, snapback, full body, dark skin"),
    ("yoga_woman", "woman in yoga outfit, full body, athletic build"),
    ("firefighter", "firefighter in turnout gear with helmet, full body"),
    ("teacher", "female teacher in cardigan and glasses, full body"),
    ("surfer", "surfer in board shorts and tank top, full body"),
    ("goth_girl", "goth woman in black dress with boots, full body"),
    ("mechanic", "mechanic in coveralls with wrench, full body"),
    ("executive", "female executive in power suit, full body"),
]

out_dir = "web/models/npcs"
os.makedirs(out_dir, exist_ok=True)

TripoSRGenerator = modal.Cls.from_name("crate-engine-3d", "TripoSRGenerator")
gen = TripoSRGenerator()

print(f"[{time.strftime('%H:%M:%S')}] Starting batch generation of {len(CHARACTERS)} characters...")
print("(First call may take 2-3 min for GPU cold start)")

for i, (name, prompt) in enumerate(CHARACTERS):
    out_path = f"{out_dir}/char_{name}.glb"
    if os.path.exists(out_path):
        print(f"  [{i+1}/{len(CHARACTERS)}] SKIP: {name}")
        continue
    t0 = time.time()
    try:
        glb = gen.generate_from_text.remote(prompt, resolution=256)
        with open(out_path, "wb") as f:
            f.write(glb)
        print(f"  [{i+1}/{len(CHARACTERS)}] ✅ char_{name}.glb ({len(glb)/1024:.0f}KB) {time.time()-t0:.0f}s")
    except Exception as e:
        print(f"  [{i+1}/{len(CHARACTERS)}] ❌ {name}: {e}")

print(f"\n[{time.strftime('%H:%M:%S')}] Done!")
for f in sorted(os.listdir(out_dir)):
    if f.startswith("char_"):
        print(f"  {f} ({os.path.getsize(out_dir+'/'+f)/1024:.0f}KB)")
