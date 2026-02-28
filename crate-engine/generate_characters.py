"""Generate diverse 3D character models via Modal TripoSR + SDXL"""
import modal
import os, time

# 20 diverse character prompts
CHARACTERS = [
    ("businessman", "professional businessman in suit and tie, full body, standing pose, dark skin"),
    ("businesswoman", "professional businesswoman in blazer and skirt, full body, standing pose"),
    ("hoodie_guy", "young man in hoodie and jeans, full body, casual standing pose"),
    ("summer_dress", "woman in colorful summer dress, full body, standing pose, dark skin"),
    ("chef", "chef in white uniform and hat, full body, standing pose"),
    ("nurse", "nurse in scrubs with stethoscope, full body, standing pose"),
    ("construction", "construction worker with hard hat and vest, full body, standing pose"),
    ("athlete_male", "male athlete in jersey and shorts, full body, athletic build, dark skin"),
    ("athlete_female", "female athlete in sports outfit, full body, athletic build"),
    ("punk_girl", "punk girl with colored hair and leather jacket, full body, standing pose"),
    ("cowboy", "cowboy with hat and boots, full body, western outfit"),
    ("scientist", "scientist in lab coat with glasses, full body, standing pose"),
    ("hip_hop", "hip hop artist in streetwear, gold chain, snapback, full body, dark skin"),
    ("yoga_woman", "woman in yoga outfit, full body, standing pose, athletic build"),
    ("firefighter", "firefighter in turnout gear with helmet, full body, standing pose"),
    ("teacher", "female teacher in cardigan and glasses, full body, standing pose"),
    ("surfer", "surfer in board shorts and tank top, full body, tanned skin"),
    ("goth_girl", "goth woman in black dress with boots, full body, pale skin"),
    ("mechanic", "mechanic in coveralls with wrench, full body, standing pose"),
    ("executive", "female executive in power suit, full body, confident pose"),
]

out_dir = "web/models/npcs"
os.makedirs(out_dir, exist_ok=True)

# Use the deployed app's web endpoint or call via function
TripoSRGenerator = modal.Cls.from_name("crate-engine-3d", "TripoSRGenerator")
gen = TripoSRGenerator()

for name, prompt in CHARACTERS:
    out_path = f"{out_dir}/char_{name}.glb"
    if os.path.exists(out_path):
        print(f"  SKIP: {name} (exists)")
        continue
    print(f"Generating: {name}...")
    t0 = time.time()
    try:
        glb_bytes = gen.generate_from_text.remote(prompt, resolution=256)
        with open(out_path, "wb") as f:
            f.write(glb_bytes)
        print(f"  ✅ {name}.glb ({len(glb_bytes)/1024:.0f}KB) in {time.time()-t0:.1f}s")
    except Exception as e:
        print(f"  ❌ {name}: {e}")

print("\nDone!")
