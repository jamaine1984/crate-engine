# Mixamo Batch Download — Resume Guide

## Status
- **2,444 animations** cataloged in `mixamo_downloads/animation_list_v2.json`
- **25 NPC characters** to download after animations
- Download script: `mixamo_batch_v3.py` (the working one)
- Log: `mixamo_downloads/download_log_v3.txt`
- Output: `mixamo_downloads/animations/*.fbx` and `mixamo_downloads/characters/*.fbx`

## How to Resume
```bash
cd /Users/jamainemartin/.openclaw/workspace/crate-engine

# Check how many downloaded so far
ls mixamo_downloads/animations/ | wc -l

# If token expired (test with):
curl -s "https://www.mixamo.com/api/v1/products?page=1&limit=1&type=Motion&query=walk" \
  -H "Authorization: Bearer $(cat /tmp/mixamo_token.txt)" \
  -H "X-Api-Key: mixamo2" | head -c 100

# If token expired, get new one:
# 1. Open mixamo.com in openclaw browser
# 2. Login with midnightsinglessales@gmail.com (Google sign-in)
# 3. Extract token: localStorage.getItem('access_token') → save to /tmp/mixamo_token.txt

# Resume download (skips already-downloaded files automatically):
nohup python3 mixamo_batch_v3.py > mixamo_downloads/download_log_v3.txt 2>&1 &
```

## Key Technical Details
- Character ID (X Bot): `2dee24f8-3b49-48af-b735-c6377509eaac`
- Export payload MUST use `"params": ""` (empty string, NOT "0,0")
- Export payload uses numeric `model-id` from thumbnail URL (e.g., 128600901)
- Monitor: `GET /api/v1/characters/{char_id}/monitor` → poll until status=completed
- Rate limit: 3-4 second delay between exports, script handles 429s automatically
- Files are FBX with skin (~1.8-2.4MB each)

## After Download Complete
1. Convert FBX → GLB: `npx fbx2gltf-node` or `npx @nicepkg/fbx2gltf`
2. Wire into character.mjs animation system
3. Update engine.mjs animation registry
4. Bump character.mjs version
