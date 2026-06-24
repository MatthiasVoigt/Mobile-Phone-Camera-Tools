#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OUTPUT="focus-score-wasm.js"
BUILD_ID="$(date +%Y%m%d%H%M%S)"

em++ focus-score.cpp \
  -O3 \
  -std=c++17 \
  -s WASM=1 \
  -s SINGLE_FILE=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='FocusScoreModule' \
  -s EXPORTED_FUNCTIONS='["_init_focus_buffers","_get_focus_input_buffer","_compute_focus_score","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=16777216 \
  -o "$OUTPUT"

{
  printf 'globalThis.FOCUS_SCORE_WASM_BUILD_ID="%s";\n' "$BUILD_ID"
  cat "$OUTPUT"
} > "${OUTPUT}.tmp"
mv "${OUTPUT}.tmp" "$OUTPUT"
echo "Built $OUTPUT (build $BUILD_ID)"