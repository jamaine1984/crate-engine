#!/bin/bash
# Fab.com Batch Asset Downloader
# Uses browser session cookies for auth

DEST="/Users/jamainemartin/.openclaw/workspace/crate-engine/fab_assets"
mkdir -p "$DEST"

download_listing() {
    local listing_id="$1"
    local name="$2"
    local quality="${3:-mid}"  # raw, high, mid, low
    
    echo "[$name] Getting file list..."
    
    # Get FBX format files
    local files_json=$(curl -s "https://www.fab.com/i/listings/$listing_id/asset-formats/fbx" \
        -H "Cookie: $(cat /tmp/fab_cookies.txt 2>/dev/null)" \
        -b /tmp/fab_cookies.txt 2>/dev/null)
    
    if [ -z "$files_json" ] || echo "$files_json" | grep -q "error"; then
        echo "  ⚠️  No FBX format, trying any format..."
        return 1
    fi
    
    # Find the file matching quality
    local file_uid=$(echo "$files_json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
files = d.get('files', [])
quality = '$quality'
for f in files:
    if quality in f['name']:
        print(f['uid'])
        break
else:
    if files:
        # Pick smallest if quality not found
        smallest = min(files, key=lambda x: x['size'])
        print(smallest['uid'])
")
    
    if [ -z "$file_uid" ]; then
        echo "  ❌ No file found"
        return 1
    fi
    
    echo "  Getting download URL for $file_uid..."
    # This needs browser auth — will need to be called from browser context
    echo "$listing_id|$name|$file_uid|$quality" >> "$DEST/download_queue.txt"
}

echo "Building download queue..."
