let focusWasmModule = null;
let focusWasmInitPromise = null;
let focusWasmBufferWidth = 0;
let focusWasmBufferHeight = 0;

function isFocusWasmReady() {
  return Boolean(focusWasmModule);
}

function initFocusWasm() {
  if (focusWasmInitPromise) {
    return focusWasmInitPromise;
  }

  if (typeof FocusScoreModule !== 'function') {
    focusWasmInitPromise = Promise.resolve(null);
    return focusWasmInitPromise;
  }

  focusWasmInitPromise = FocusScoreModule()
    .then((module) => module.ready.then(() => {
      focusWasmModule = module;
      return module;
    }))
    .catch((err) => {
      console.warn('Focus score WASM unavailable, using JavaScript fallback:', err);
      focusWasmModule = null;
      return null;
    });

  return focusWasmInitPromise;
}

function setupFocusWasmBuffers(width, height) {
  if (!focusWasmModule) {
    return false;
  }

  if (width === focusWasmBufferWidth && height === focusWasmBufferHeight) {
    return true;
  }

  focusWasmModule._init_focus_buffers(width, height);
  focusWasmBufferWidth = width;
  focusWasmBufferHeight = height;
  return true;
}

function computeFocusScoreWasm(imageData, topRank) {
  if (!focusWasmModule) {
    return null;
  }

  const { data, width, height } = imageData;
  if (!width || !height || data.length < width * height * 4) {
    return null;
  }

  if (!setupFocusWasmBuffers(width, height)) {
    return null;
  }

  const inputPtr = focusWasmModule._get_focus_input_buffer();
  if (!inputPtr) {
    return null;
  }

  focusWasmModule.HEAPU8.set(data, inputPtr);
  return focusWasmModule._compute_focus_score(width, height, topRank);
}