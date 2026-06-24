#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

OUTPUT="image-processing-wasm.js"
BUILD_ID="$(date +%Y%m%d%H%M%S)"

em++ image-processing.cpp \
  -O3 \
  -s WASM=1 \
  -s SINGLE_FILE=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='ImageProcessingModule' \
  -s EXPORTED_FUNCTIONS='["_init_buffers","_get_input_buffer","_get_output_buffer","_process_canny","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=67108864 \
  -o "$OUTPUT"

# Stamp the build so the browser and step log can confirm the loaded file version.
{
  printf 'globalThis.EXP02_WASM_BUILD_ID="%s";\n' "$BUILD_ID"
  cat "$OUTPUT"
} > "${OUTPUT}.tmp"
mv "${OUTPUT}.tmp" "$OUTPUT"
echo "Built $OUTPUT (build $BUILD_ID)"