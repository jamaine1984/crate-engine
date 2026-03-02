#!/bin/bash
set -e
echo "⚡ Building KOKO Engine for Web..."

cd "$(dirname "$0")/.."

# Build WASM
echo "🔨 Compiling WASM..."
cargo build --target wasm32-unknown-unknown --release -p koko-app

# Generate JS bindings
echo "📦 Generating web package..."
wasm-bindgen target/wasm32-unknown-unknown/release/koko.wasm \
    --out-dir web/pkg \
    --target web \
    --no-typescript

# Optimize WASM size (if wasm-opt is installed)
if command -v wasm-opt &> /dev/null; then
    echo "🗜️ Optimizing WASM..."
    wasm-opt -Oz web/pkg/koko_bg.wasm -o web/pkg/koko_bg.wasm
fi

echo ""
echo "✅ Build complete!"
echo "   WASM: $(du -h web/pkg/koko_bg.wasm | cut -f1)"
echo "   JS:   $(du -h web/pkg/koko.js | cut -f1)"
echo ""
echo "🌐 To test: cd web && python3 -m http.server 8080"
echo "   Then open http://localhost:8080"
