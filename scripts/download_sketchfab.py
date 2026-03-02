#!/usr/bin/env python3
"""
Bulk download free GLB models from Sketchfab API
Targets: CC-BY licensed, downloadable, GLB format
"""
import json, os, sys, time, urllib.request, urllib.parse

API_BASE = "https://api.sketchfab.com/v3"
OUTPUT_DIR = "/Users/jamainemartin/.openclaw/workspace/crate-engine/web/models"

def search_models(query, count=20):
    """Search Sketchfab for free downloadable models"""
    params = urllib.parse.urlencode({
        'type': 'models',
        'q': query,
        'downloadable': 'true',
        'sort_by': '-likeCount',  # most liked first
        'count': count,
        'file_format': 'glb',
    })
    url = f"{API_BASE}/search?{params}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get('results', [])
    except Exception as e:
        print(f"  Search error: {e}")
        return []

def get_download_url(uid):
    """Get the GLB download URL for a model (requires no auth for free models)"""
    url = f"{API_BASE}/models/{uid}/download"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            # Look for glb format
            if 'glb' in data:
                return data['glb']['url']
            elif 'gltf' in data:
                return data['gltf']['url']
    except Exception as e:
        # 401 = needs auth, skip
        pass
    return None

def download_model(url, filepath):
    """Download a model file"""
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            with open(filepath, 'wb') as f:
                f.write(data)
            size_mb = len(data) / (1024*1024)
            return size_mb
    except Exception as e:
        print(f"  Download error: {e}")
        return 0

# Categories to search
CATEGORIES = {
    'modern_car': ['modern car vehicle', 'sedan car realistic', 'sports car 3d', 'suv car', 'pickup truck'],
    'helicopter': ['helicopter aircraft', 'military helicopter', 'police helicopter'],
    'airplane': ['airplane commercial', 'fighter jet', 'small airplane cessna', 'passenger plane'],
    'modern_building': ['modern building office', 'apartment building', 'skyscraper', 'modern house exterior', 'suburban house'],
    'character': ['character human rigged', 'male character game', 'female character game', 'soldier character', 'civilian character'],
    'road': ['road segment', 'street road', 'highway road piece'],
    'furniture': ['modern furniture room', 'office furniture', 'living room sofa'],
}

print("=== Sketchfab Model Discovery ===")
print(f"Output: {OUTPUT_DIR}\n")

all_models = {}
for category, queries in CATEGORIES.items():
    print(f"\n📦 Category: {category}")
    for query in queries:
        results = search_models(query, count=5)
        for r in results:
            uid = r['uid']
            name = r['name'][:50].replace(' ', '_').replace('/', '_').lower()
            safe_name = f"hd_{category}_{name}"
            # Clean filename
            safe_name = ''.join(c for c in safe_name if c.isalnum() or c in '_-')
            
            if uid not in all_models:
                all_models[uid] = {
                    'name': safe_name,
                    'original_name': r['name'],
                    'uid': uid,
                    'likes': r.get('likeCount', 0),
                    'category': category,
                    'url': r.get('viewerUrl', ''),
                }
                print(f"  Found: {r['name']} ({r.get('likeCount', 0)} likes)")
        time.sleep(0.3)  # Rate limit

print(f"\n=== Found {len(all_models)} unique models ===")

# Save manifest
manifest_path = os.path.join(OUTPUT_DIR, 'hd_assets', 'manifest.json')
os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
with open(manifest_path, 'w') as f:
    json.dump(list(all_models.values()), f, indent=2)
print(f"Manifest saved to {manifest_path}")

# Print summary by category
for cat in CATEGORIES:
    count = sum(1 for m in all_models.values() if m['category'] == cat)
    print(f"  {cat}: {count} models found")
