#!/usr/bin/env bash
# Processes transcripts one at a time — safe to kill and re-run
CLEAN_DIR="/Users/jamainemartin/.openclaw/workspace/crate-engine/ai-knowledge/transcripts/clean"
DONE_DIR="/Users/jamainemartin/.openclaw/workspace/crate-engine/ai-knowledge/transcripts/done"
OUT="/Users/jamainemartin/.openclaw/workspace/crate-engine/ai-knowledge/game_knowledge.json"
mkdir -p "$DONE_DIR"

# Init JSON if missing
[ -f "$OUT" ] || echo '[]' > "$OUT"

for f in "$CLEAN_DIR"/*.txt; do
  fname=$(basename "$f")
  [ -f "$DONE_DIR/$fname" ] && echo "skip: $fname" && continue

  topic=$(echo "$fname" | cut -d_ -f1)
  text=$(head -c 5000 "$f")
  words=$(wc -w < "$f")
  [ "$words" -lt 80 ] && touch "$DONE_DIR/$fname" && continue

  case "$topic" in
    fps)      focus="first person camera, mouse look, camera bob, weapon sway, FOV" ;;
    tps)      focus="third person camera, spring arm, orbit, camera collision, smoothing" ;;
    interior) focus="building interiors, seamless room transitions, door triggers, portals" ;;
    dungeon)  focus="dungeon/cave generation, procedural rooms, corridors, underground levels" ;;
    shooting) focus="shooting mechanics, raycast, bullet physics, hitscan, damage, recoil" ;;
    water)    focus="water rendering, swimming physics, buoyancy, underwater post-process, waves" ;;
    *)        focus="game physics, NPC AI, city building, rendering, vehicles, combat" ;;
  esac

  PROMPT="Extract specific game dev knowledge from this transcript.
Focus: $focus
Source: $fname

Text:
$text

Return JSON array, each item: {\"topic\":\"fps|tps|interior|dungeon|shooting|water|physics|npc|city|vehicles\",\"fact\":\"specific technical fact with numbers or code patterns\",\"context\":\"1 sentence\",\"source\":\"$fname\"}
Only actionable facts. Max 6. Return ONLY the JSON array, nothing else."

  result=$(echo "$PROMPT" | claude -p - 2>/dev/null)
  
  if echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'got {len(d)} facts')" 2>/dev/null; then
    # Merge into main file
    python3 - "$OUT" "$result" << 'PY'
import sys, json
out_path = sys.argv[1]
new_data = json.loads(sys.argv[2])
with open(out_path) as f:
    existing = json.load(f)
existing.extend(new_data)
with open(out_path, 'w') as f:
    json.dump(existing, f, indent=2)
PY
    echo "✅ $fname"
  else
    echo "⚠️  $fname (no valid JSON)"
  fi

  touch "$DONE_DIR/$fname"
  sleep 1
done

total=$(python3 -c "import json; d=json.load(open('$OUT')); print(len(d))")
echo ""
echo "=== DONE: $total total knowledge chunks ==="
