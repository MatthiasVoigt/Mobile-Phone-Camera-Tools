(function (global) {
  const { TimingTracker } = global.Exp02Fps;

  let wasmModule = null;
  let outputImageData = null;
  let bufferWidth = 0;
  let bufferHeight = 0;
  let verboseLogging = true;
  const timingTracker = new TimingTracker();

  function logStep(message) {
    if (!verboseLogging) return;
    if (global.Exp02Log) global.Exp02Log.step(message);
  }

  function logError(message) {
    if (global.Exp02Log) global.Exp02Log.error(message);
  }

  function formatMs(value) {
    return typeof value === 'number' ? value.toFixed(2) + ' ms' : '— ms';
  }

  function createWasmModule() {
    if (typeof ImageProcessingModule !== 'function') {
      return Promise.reject(new Error('image-processing-wasm.js did not load'));
    }

    logStep('Loading embedded WebAssembly module');
    return ImageProcessingModule();
  }

  async function initWasmBridge() {
    wasmModule = await createWasmModule();
    await wasmModule.ready;
    const buildId = global.EXP02_WASM_BUILD_ID || 'unknown (cached old wasm file?)';
    logStep('WebAssembly runtime initialized (build ' + buildId + ')');
  }

  function setupWasmBuffers(width, height) {
    if (!wasmModule) throw new Error('WASM module not loaded');
    if (width <= 0 || height <= 0) throw new Error('Invalid frame size');

    logStep('WASM init_buffers(' + width + ', ' + height + ')');
    try {
      wasmModule._init_buffers(width, height);
    } catch (error) {
      const buildId = global.EXP02_WASM_BUILD_ID || 'unknown';
      throw new Error(
        (error && error.message ? error.message : error) +
        ' [wasm build ' + buildId + ' — hard-refresh if you still see UTF8ToString]'
      );
    }
    bufferWidth = width;
    bufferHeight = height;
    outputImageData = new ImageData(width, height);

    const inputPtr = wasmModule._get_input_buffer();
    const outputPtr = wasmModule._get_output_buffer();
    logStep('WASM buffers ready (input ptr=' + inputPtr + ', output ptr=' + outputPtr + ')');
  }

  function processFrameWasm(imageData, width, height) {
    if (!wasmModule) throw new Error('WASM module not loaded');

    if (width !== bufferWidth || height !== bufferHeight || !outputImageData) {
      setupWasmBuffers(width, height);
    }

    const bytes = width * height * 4;
    const inputPtr = wasmModule._get_input_buffer();
    const outputPtr = wasmModule._get_output_buffer();
    if (!inputPtr || !outputPtr) {
      throw new Error('WASM pixel buffers are not ready');
    }

    const t0 = performance.now();

    logStep('WASM copy input pixels (' + bytes + ' bytes)');
    wasmModule.HEAPU8.set(imageData.data, inputPtr);
    const t1 = performance.now();

    logStep('WASM process_canny start (rgbaToGray → convolve → sobel → nms → hysteresis)');
    wasmModule._process_canny(width, height);
    const t2 = performance.now();

    logStep('WASM copy output pixels');
    outputImageData.data.set(wasmModule.HEAPU8.subarray(outputPtr, outputPtr + bytes));
    const t3 = performance.now();

    timingTracker.record({
      copyInMs: t1 - t0,
      computeMs: t2 - t1,
      totalMs: t3 - t0,
    });

    logStep(
      'WASM frame timings copyIn=' + formatMs(t1 - t0) +
      ' compute=' + formatMs(t2 - t1) +
      ' total=' + formatMs(t3 - t0)
    );
    logStep('WASM frame output ready');
    return outputImageData;
  }

  function getTimingAverages(now) {
    return timingTracker.getAverages(now);
  }

  function getComputeMs(now) {
    return timingTracker.getComputeMs(now);
  }

  function freezeTiming() {
    timingTracker.freeze();
  }

  function resumeTiming() {
    timingTracker.resume();
  }

  function setVerboseLogging(enabled) {
    verboseLogging = !!enabled;
  }

  global.Exp02Wasm = {
    initWasmBridge,
    setupWasmBuffers,
    processFrameWasm,
    getTimingAverages,
    getComputeMs,
    freezeTiming,
    resumeTiming,
    setVerboseLogging,
  };
})(window);