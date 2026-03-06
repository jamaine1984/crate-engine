#!/usr/bin/env python3
"""Batch download Mixamo animations V3 — fixed params + skin."""
import requests, json, time, os, re

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
    m = re.search(r'/motions/(\d+)/', thumbnail_url or '')
    return int(m.group(1)) if m else None

def api_get(url, params=None, retries=5):
    for i in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                wait = 20 * (i + 1)
                print(f"  Rate limited GET, waiting {wait}s...", flush=True)
                time.sleep(wait)
            else:
                time.sleep(2)
        except Exception as e:
            time.sleep(5)
    return None

def export_and_download(numeric_model_id, name, filepath, retries=3):
    """Export animation, poll, download. Returns filesize or 0."""
    payload = {
        "gms_hash": [{"model-id": numeric_model_id, "mirror": False, "trim": [0, 100],
                       "overdrive": 0, "params": "", "arm-space": 0, "inplace": False}],
        "preferences": {"format": "fbx7_2019", "skin": "true", "fps": "30", "reducekf": "0"},
        "character_id": CHARACTER_ID,
        "type": "Motion",
        "product_name": name
    }
    
    for attempt in range(retries):
        try:
            r = requests.post(f"{BASE}/animations/export", json=payload, headers=HEADERS, timeout=30)
            if r.status_code == 429:
                wait = 30 * (attempt + 1)
                print(f"  429, wait {wait}s...", end=" ", flush=True)
                time.sleep(wait)
                continue
            if r.status_code not in (200, 202):
                print(f"  Export {r.status_code}", end=" ", flush=True)
                time.sleep(5)
                continue
            break
        except Exception as e:
            time.sleep(10)
            continue
    else:
        return 0
    
    # Poll monitor — up to 90 seconds
    for _ in range(90):
        time.sleep(1)
        try:
            mr = requests.get(f"{BASE}/characters/{CHARACTER_ID}/monitor", headers=HEADERS, timeout=15)
            if mr.status_code != 200:
                continue
            data = mr.json()
            if data.get("status") == "completed":
                url = data.get("job_result")
                if url and isinstance(url, str) and url.startswith("http"):
                    r = requests.get(url, stream=True, timeout=60)
                    with open(filepath, 'wb') as f:
                        for chunk in r.iter_content(8192):
                            f.write(chunk)
                    return os.path.getsize(filepath)
                return 0
            elif data.get("status") == "failed":
                return 0
        except:
            continue
    return 0

# Load animation list from V2
with open("mixamo_downloads/animation_list_v2.json") as f:
    anim_list = json.load(f)

print(f"Loaded {len(anim_list)} animations to download", flush=True)
print("=" * 60, flush=True)

downloaded = 0
failed = 0
skipped = 0

for i, anim in enumerate(anim_list):
    name_clean = re.sub(r'[/\\\'\"<>|?*]', '', anim["name"]).replace(" ", "_")
    filepath = os.path.join(ANIM_DIR, f"{name_clean}.fbx")
    
    if os.path.exists(filepath) and os.path.getsize(filepath) > 5000:
        skipped += 1
        continue
    
    print(f"[{i+1}/{len(anim_list)}] {name_clean}...", end=" ", flush=True)
    
    size = export_and_download(anim["numeric_id"], anim["name"], filepath)
    if size > 5000:
        print(f"✅ {size:,}B", flush=True)
        downloaded += 1
    else:
        print(f"❌", flush=True)
        failed += 1
        # Clean up bad file
        if os.path.exists(filepath):
            os.remove(filepath)
    
    time.sleep(3)
    
    if (downloaded + failed) % 25 == 0 and (downloaded + failed) > 0:
        print(f"\n--- {downloaded} ✅ | {failed} ❌ | {skipped} skipped | {i+1}/{len(anim_list)} ---\n", flush=True)

print(f"\n{'=' * 60}", flush=True)
print(f"ANIMATIONS DONE: {downloaded} ✅ | {failed} ❌ | {skipped} skipped", flush=True)
print(f"{'=' * 60}\n", flush=True)

# =====================================================
# PHASE 2: Characters
# =====================================================
print("DOWNLOADING 25 CHARACTERS...", flush=True)
char_data = api_get(f"{BASE}/products", params={"page": 1, "limit": 96, "type": "Character", "query": ""})
characters = char_data.get("results", []) if char_data else []

char_dl = 0
for i, char in enumerate(characters[:25]):
    name = re.sub(r'[/\\\'\"<>|?*]', '', char.get("description", "unknown")).replace(" ", "_")
    filepath = os.path.join(CHAR_DIR, f"{name}.fbx")
    if os.path.exists(filepath) and os.path.getsize(filepath) > 5000:
        char_dl += 1
        continue
    
    print(f"[{i+1}/25] {name}...", end=" ", flush=True)
    payload = {
        "gms_hash": [],
        "preferences": {"format": "fbx7_2019", "skin": "true", "fps": "30", "reducekf": "0"},
        "character_id": char["id"],
        "type": "Character",
        "product_name": name
    }
    try:
        r = requests.post(f"{BASE}/animations/export", json=payload, headers=HEADERS, timeout=30)
        if r.status_code not in (200, 202):
            print(f"❌", flush=True); time.sleep(5); continue
    except:
        print(f"❌", flush=True); continue
    
    url = None
    for _ in range(90):
        time.sleep(1)
        try:
            mr = requests.get(f"{BASE}/characters/{char['id']}/monitor", headers=HEADERS, timeout=15)
            if mr.status_code == 200:
                d = mr.json()
                if d.get("status") == "completed":
                    url = d.get("job_result"); break
                elif d.get("status") == "failed":
                    break
        except: continue
    
    if url and isinstance(url, str):
        r = requests.get(url, stream=True, timeout=60)
        with open(filepath, 'wb') as f:
            for chunk in r.iter_content(8192): f.write(chunk)
        sz = os.path.getsize(filepath)
        print(f"✅ {sz:,}B", flush=True)
        char_dl += 1
    else:
        print(f"❌", flush=True)
    time.sleep(4)

print(f"\nALL DONE: {downloaded} animations + {char_dl} characters", flush=True)
