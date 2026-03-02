#!/usr/bin/env bash
# Build koko-wasm for the browser.
# Output goes to web/pkg/ with wasm-bindgen JS glue.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building koko-wasm → web/pkg/ ..."

wasm-pack build \
  "$ROOT_DIR/crates/koko-wasm" \
  --target web \
  --out-dir "$ROOT_DIR/web/pkg" \
  --release

echo ""
echo "Build complete. Output:"
ls -lh "$ROOT_DIR/web/pkg/"*.wasm "$ROOT_DIR/web/pkg/"*.js 2>/dev/null || true
echo ""

# Show WASM binary size
WASM_FILE="$ROOT_DIR/web/pkg/koko_wasm_bg.wasm"
if [ -f "$WASM_FILE" ]; then
  SIZE=$(wc -c < "$WASM_FILE" | tr -d ' ')
  SIZE_KB=$((SIZE / 1024))
  echo "WASM binary: ${SIZE_KB}KB (uncompressed)"
fi
