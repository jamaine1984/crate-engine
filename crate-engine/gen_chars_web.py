"""Generate 20 diverse 3D characters via Modal web endpoint"""
import requests, base64, os, time, json

URL = "https://jamaine1984--crate-engine-3d-generate.modal.run"
OUT = "web/models/npcs"
os.makedirs(OUT, exist_ok=True)

CHARS = [
    ("businessman", "professional businessman in suit and tie, full body, standing, dark skin"),
    ("businesswoman", "professional businesswoman in blazer and skirt, full body, standing"),
    ("hoodie_guy", "young man in hoodie and jeans, full body, casual standing"),
    ("summer_dress", "woman in colorful summer dress, full body, dark skin"),
    ("chef", "chef in white uniform and hat, full body standing"),
    ("nurse", "nurse in blue scrubs, full body standing"),
    ("construction", "construction worker with hard hat and orange vest, full body"),
    ("athlete_male", "male athlete in basketball jersey and shorts, dark skin, full body"),
    ("athlete_female", "female athlete in sports outfit, ponytail, full body"),
    ("punk_girl", "punk girl with pink mohawk and leather jacket, full body"),
    ("cowboy", "cowboy with hat and boots, western outfit, full body"),
    ("scientist", "scientist in lab coat with glasses, full body"),
    ("hip_hop", "hip hop artist in streetwear gold chain snapback, dark skin, full body"),
    ("yoga_woman", "woman in yoga outfit, athletic build, full body"),
    ("firefighter", "firefighter in turnout gear with helmet, full body"),
    ("teacher", "female teacher in cardigan and glasses, brown skin, full body"),
    ("surfer", "surfer dude in board shorts, tanned, blonde hair, full body"),
    ("goth_girl", "goth woman in black dress with platform boots, pale skin, full body"),
    ("mechanic", "mechanic in blue coveralls with wrench, full body"),
    ("executive", "female executive in gray power suit, east asian, full body"),
]

for i, (name, prompt) in enumerate(CHARS):
    path = f"{OUT}/char_{name}.glb"
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(f"  [{i+1}] SKIP {name}", flush=True)
        continue
    
    print(f"  [{i+1}/{len(CHARS)}] {name}...", end=" ", flush=True)
    t0 = time.time()
    try:
        r = requests.post(URL, json={
            "mode": "text_to_3d",
            "text_prompt": prompt,
            "quality": "draft"
        }, timeout=300)
        data = r.json()
        if data.get("status") == "success":
            glb = base64.b64decode(data["model_base64"])
            with open(path, "wb") as f:
                f.write(glb)
            print(f"✅ {len(glb)/1024:.0f}KB {time.time()-t0:.0f}s", flush=True)
        else:
            print(f"❌ {data.get('message', 'unknown error')}", flush=True)
    except Exception as e:
        print(f"❌ {e}", flush=True)

print("\nDone!", flush=True)
