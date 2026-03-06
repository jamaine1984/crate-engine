#!/usr/bin/env python3
"""Batch download Mixamo animations and characters - V2 (working)."""
import requests, json, time, os, sys, re

TOKEN = open('/tmp/mixamo_token.txt').read().strip()
BASE = "https://www.mixamo.com/api/v1"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "X-Api-Key": "mixamo2",
    "Accept": "application/json",
    "Content-Type": "application/json",
}

ANIM_DIR = "mixamo_downloads/animations"
CHAR_DIR = "mixamo_downloads/characters"
os.makedirs(ANIM_DIR, exist_ok=True)
os.makedirs(CHAR_DIR, exist_ok=True)

CHARACTER_ID = "2dee24f8-3b49-48af-b735-c6377509eaac"  # X Bot

def extract_numeric_id(thumbnail_url):
    """Extract numeric model ID from thumbnail URL like .../motions/128600901/static.png"""
    m = re.search(r'/motions/(\d+)/', thumbnail_url or '')
    return int(m.group(1)) if m else None

def api_get(url, params=None, retries=3):
    for i in range(retries):
        r = requests.get(url, params=params, headers=HEADERS)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429:
            wait = 15 * (i + 1)
            print(f"  Rate limited, waiting {wait}s...", flush=True)
            time.sleep(wait)
        else:
            print(f"  GET error {r.status_code}: {r.text[:100]}", flush=True)
            time.sleep(2)
    return None

def export_animation(numeric_model_id, name, retries=3):
    """Export animation and return download URL."""
    payload = {
        "gms_hash": [{"model-id": numeric_model_id, "mirror": False, "trim": [0, 100],
                       "overdrive": 0, "params": "0,0", "arm-space": 0, "inplace": False}],
        "preferences": {"format": "fbx7_2019", "skin": "false", "fps": "30", "reducekf": "0"},
        "character_id": CHARACTER_ID,
        "type": "Motion",
        "product_name": name
    }
    
    for i in range(retries):
        try:
            r = requests.post(f"{BASE}/animations/export", json=payload, headers=HEADERS)
            if r.status_code == 429:
                wait = 20 * (i + 1)
                print(f"  Rate limited on export, waiting {wait}s...", flush=True)
                time.sleep(wait)
                continue
            if r.status_code not in (200, 202):
                print(f"  Export error {r.status_code}: {r.text[:100]}", flush=True)
                time.sleep(3)
                continue
            break
        except Exception as e:
            print(f"  Request error: {e}", flush=True)
            time.sleep(5)
    else:
        return None
    
    # Poll monitor endpoint
    for attempt in range(60):  # max 60 seconds
        time.sleep(1)
        try:
            mr = requests.get(f"{BASE}/characters/{CHARACTER_ID}/monitor", headers=HEADERS)
            if mr.status_code != 200:
                continue
            data = mr.json()
            status = data.get("status", "")
            if status == "completed":
                return data.get("job_result")
            elif status == "failed":
                msg = data.get("job_result", {})
                print(f"  Export failed: {msg}", flush=True)
                return None
        except:
            continue
    
    print(f"  Monitor timeout", flush=True)
    return None

def download_file(url, filepath):
    r = requests.get(url, stream=True)
    with open(filepath, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    return os.path.getsize(filepath)

# =====================================================
# PHASE 1: Collect ALL animations with numeric IDs
# =====================================================
print("=" * 60, flush=True)
print("PHASE 1: COLLECTING ANIMATIONS WITH NUMERIC IDS", flush=True)
print("=" * 60, flush=True)

# Load existing list if available
existing_list = "mixamo_downloads/animation_list_v2.json"
all_anims = {}

SEARCHES = [
    # Core movement
    "walk", "run", "sprint", "jog", "jump", "fall", "land",
    "crouch", "crawl", "sneak", "strafe", "backward",
    # Water/air
    "swim", "fly", "float", "dive", "hover",
    # Melee combat
    "sword", "slash", "attack", "punch", "kick",
    "block", "dodge", "roll", "parry", "stab",
    "shield", "axe", "hammer", "spear", "dagger",
    # Ranged combat
    "shoot", "aim", "reload", "rifle", "pistol", "bow", "throw", "grenade",
    # Hit/death
    "hit", "death", "die", "knockout", "get up", "flinch", "stumble",
    # Zombie/monster
    "zombie", "mutant", "creature", "monster",
    # Idle/emotes
    "idle", "breathing", "sit", "wave", "dance", "hip hop",
    "talk", "laugh", "cry", "angry", "scared", "taunt",
    # Movement extras
    "climb", "hang", "pull", "ladder", "wall",
    # Interaction
    "pick up", "open", "push", "carry", "throw", "door",
    # Vehicle
    "drive", "ride", "motorcycle", "steering",
    # Tactical
    "prone", "cover", "peek", "salute", "clap",
    # Social
    "pray", "stretch", "yawn", "celebrate", "cheer",
    # Magic
    "magic", "cast", "spell", "summon",
    # Music/misc
    "guitar", "drink", "eat", "sleep", "lay",
    # Sports
    "soccer", "basketball", "golf", "tennis", "boxing",
    # Parkour
    "flip", "vault", "slide", "parkour", "cartwheel",
    # Standing actions
    "turn", "look", "point", "gesture", "shrug",
    # Breakdance
    "breakdance", "capoeira", "martial",
]

for query in SEARCHES:
    for page in range(1, 4):  # Get 3 pages per search
        data = api_get(f"{BASE}/products", params={
            "page": page, "limit": 96, "type": "Motion", "query": query
        })
        if not data or not data.get("results"):
            break
        for anim in data["results"]:
            if anim.get("type") != "Motion":
                continue
            aid = anim["id"]
            if aid in all_anims:
                continue
            numeric_id = extract_numeric_id(anim.get("thumbnail", ""))
            if not numeric_id:
                continue
            all_anims[aid] = {
                "id": aid,
                "name": anim.get("description", anim.get("name", "unknown")),
                "numeric_id": numeric_id,
            }
        if len(data["results"]) < 96:
            break
    print(f"  '{query}': total unique = {len(all_anims)}", flush=True)
    time.sleep(0.3)

# Also grab from general catalog
for page in range(1, 60):
    data = api_get(f"{BASE}/products", params={
        "page": page, "limit": 96, "type": "Motion", "query": ""
    })
    if not data or not data.get("results"):
        break
    for anim in data["results"]:
        if anim.get("type") != "Motion":
            continue
        aid = anim["id"]
        if aid in all_anims:
            continue
        numeric_id = extract_numeric_id(anim.get("thumbnail", ""))
        if not numeric_id:
            continue
        all_anims[aid] = {
            "id": aid,
            "name": anim.get("description", anim.get("name", "unknown")),
            "numeric_id": numeric_id,
        }
    print(f"  Catalog page {page}: total = {len(all_anims)}", flush=True)
    time.sleep(0.3)
    if len(data["results"]) < 96:
        break

with open(existing_list, "w") as f:
    json.dump(list(all_anims.values()), f, indent=2)
print(f"\n✅ Collected {len(all_anims)} unique animations with numeric IDs\n", flush=True)

# =====================================================
# PHASE 2: Download animations
# =====================================================
print("=" * 60, flush=True)
print("PHASE 2: DOWNLOADING ANIMATIONS", flush=True)
print("=" * 60, flush=True)

downloaded = 0
failed = 0
skipped = 0
anim_list = list(all_anims.values())

for i, anim in enumerate(anim_list):
    name = anim["name"].replace("/", "_").replace(" ", "_").replace("'", "").replace('"', '').replace("\\", "_")
    filepath = os.path.join(ANIM_DIR, f"{name}.fbx")
    
    if os.path.exists(filepath) and os.path.getsize(filepath) > 1000:
        skipped += 1
        if skipped % 50 == 0:
            print(f"  Skipped {skipped} already downloaded...", flush=True)
        continue
    
    print(f"[{i+1}/{len(anim_list)}] {name} (id={anim['numeric_id']})...", end=" ", flush=True)
    
    url = export_animation(anim["numeric_id"], anim["name"])
    if url:
        try:
            size = download_file(url, filepath)
            print(f"✅ {size:,}B", flush=True)
            downloaded += 1
        except Exception as e:
            print(f"❌ download error: {e}", flush=True)
            failed += 1
    else:
        print(f"❌ export failed", flush=True)
        failed += 1
    
    # Pace: ~4 seconds between exports to avoid rate limits
    time.sleep(4)
    
    # Progress update every 25
    if (downloaded + failed) % 25 == 0 and (downloaded + failed) > 0:
        print(f"\n--- Progress: {downloaded} downloaded, {failed} failed, {skipped} skipped ---\n", flush=True)

print(f"\n✅ Animations: {downloaded} downloaded, {failed} failed, {skipped} skipped\n", flush=True)

# =====================================================
# PHASE 3: Download characters (20 NPCs)
# =====================================================
print("=" * 60, flush=True)
print("PHASE 3: DOWNLOADING CHARACTERS (NPCs)", flush=True)
print("=" * 60, flush=True)

char_data = api_get(f"{BASE}/products", params={"page": 1, "limit": 96, "type": "Character", "query": ""})
characters = char_data.get("results", []) if char_data else []
print(f"Found {len(characters)} characters", flush=True)

char_downloaded = 0
for i, char in enumerate(characters[:25]):
    name = char.get("description", char.get("name", "unknown")).replace("/", "_").replace(" ", "_")
    filepath = os.path.join(CHAR_DIR, f"{name}.fbx")
    
    if os.path.exists(filepath) and os.path.getsize(filepath) > 1000:
        char_downloaded += 1
        continue
    
    print(f"[{i+1}/25] {name}...", end=" ", flush=True)
    
    # For characters, we need skin=true
    payload = {
        "gms_hash": [],
        "preferences": {"format": "fbx7_2019", "skin": "true", "fps": "30", "reducekf": "0"},
        "character_id": char["id"],
        "type": "Character",
        "product_name": name
    }
    
    try:
        r = requests.post(f"{BASE}/animations/export", json=payload, headers=HEADERS)
        if r.status_code not in (200, 202):
            print(f"❌ {r.status_code}", flush=True)
            continue
    except:
        print(f"❌ request error", flush=True)
        continue
    
    # Poll monitor for this character
    url = None
    for attempt in range(90):
        time.sleep(1)
        try:
            mr = requests.get(f"{BASE}/characters/{char['id']}/monitor", headers=HEADERS)
            if mr.status_code != 200:
                continue
            data = mr.json()
            if data.get("status") == "completed":
                url = data.get("job_result")
                break
            elif data.get("status") == "failed":
                break
        except:
            continue
    
    if url:
        size = download_file(url, filepath)
        print(f"✅ {size:,}B", flush=True)
        char_downloaded += 1
    else:
        print(f"❌", flush=True)
    
    time.sleep(4)

print(f"\n{'=' * 60}", flush=True)
print(f"DONE: {downloaded} animations + {char_downloaded} characters", flush=True)
print(f"{'=' * 60}", flush=True)
