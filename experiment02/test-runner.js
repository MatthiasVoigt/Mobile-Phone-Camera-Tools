(function (global) {
  const { FpsTracker, persistFps } = global.Exp02Fps;

  function logStep(message) {
    if (global.Exp02Log) global.Exp02Log.step(message);
  }

  function logError(message) {
    if (global.Exp02Log) global.Exp02Log.error(message);
  }

  const TARGET_WIDTH = 1920;
  const TARGET_HEIGHT = 1080;

  const CAMERA_CONSTRAINT_ATTEMPTS = [
    {
      label: '1080p rear camera',
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: TARGET_WIDTH },
        height: { ideal: TARGET_HEIGHT },
      },
    },
    {
      label: '720p rear camera',
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      label: 'default rear camera',
      video: {
        facingMode: { ideal: 'environment' },
      },
    },
    {
      label: 'default camera',
      video: true,
    },
  ];

  async function openCameraStream() {
    let lastError = null;
    for (const attempt of CAMERA_CONSTRAINT_ATTEMPTS) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: attempt.video,
        });
        return { stream, label: attempt.label };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Could not open camera');
  }

  async function waitForVideoDimensions(video) {
    if (video.videoWidth > 0 && video.videoHeight > 0) return;

    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Timed out waiting for camera frames'));
      }, 10000);

      function tryResolve() {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          window.clearTimeout(timeout);
          video.removeEventListener('loadedmetadata', tryResolve);
          video.removeEventListener('loadeddata', tryResolve);
          video.removeEventListener('resize', tryResolve);
          resolve();
        }
      }

      video.addEventListener('loadedmetadata', tryResolve);
      video.addEventListener('loadeddata', tryResolve);
      video.addEventListener('resize', tryResolve);
      tryResolve();
    });
  }

  function getFrameSize(video, canvas) {
    const width = video.videoWidth || canvas.width || 0;
    const height = video.videoHeight || canvas.height || 0;
    return { width, height };
  }

  function getProcessDimensions(fullWidth, fullHeight, processScale) {
    const scale = Math.max(0.25, Math.min(1, processScale || 1));
    return {
      width: Math.max(1, Math.round(fullWidth * scale)),
      height: Math.max(1, Math.round(fullHeight * scale)),
      scale,
    };
  }

  async function startTestRunner({
    title,
    storageKey,
    processFrame,
    onReady,
    onResize,
    onError,
    optimization = 'none',
    processScale = 0.5,
  }) {
    const video = document.getElementById('camera');
    const canvas = document.getElementById('preview');
    const isFullOptimization = optimization === 'full';
    const verboseFrameLog = !isFullOptimization;
    const ctx = canvas.getContext('2d', {
      willReadFrequently: !isFullOptimization,
    });
    const processCanvas = isFullOptimization ? document.createElement('canvas') : null;
    const processCtx = processCanvas
      ? processCanvas.getContext('2d', { willReadFrequently: true })
      : null;
    let processWidth = 0;
    let processHeight = 0;
    const toggleBtn = document.getElementById('toggleProcessing');
    const resolutionEl = document.getElementById('resolutionLabel');
    const displayFpsEl = document.getElementById('displayFps');
    const processingFpsEl = document.getElementById('processingFps');
    const wasmTimingGroupEl = document.getElementById('wasmTimingGroup');
    const wasmCopyInEl = document.getElementById('wasmCopyInMs');
    const wasmComputeEl = document.getElementById('wasmComputeMs');
    const wasmTotalEl = document.getElementById('wasmTotalMs');
    const hasWasmTiming = !!(wasmCopyInEl && wasmComputeEl && wasmTotalEl);
    const jsComputeEl = document.getElementById('jsComputeMs');
    const hasJsTiming = !!jsComputeEl;
    const statusEl = document.getElementById('status');
    const titleEl = document.getElementById('pageTitle');

    if (titleEl) titleEl.textContent = title;

    let processingActive = false;
    let processingEverEnabled = false;
    let frozenDisplayFps = 0;
    let frozenProcessingFps = 0;
    let frozenWasmTiming = null;
    let frozenJsTiming = null;
    let lastComputeMs = null;
    let frameWidth = 0;
    let frameHeight = 0;
    let reportedResolution = '';

    const displayTracker = new FpsTracker();
    const processingTracker = new FpsTracker();

    function setStatus(message) {
      statusEl.textContent = message;
    }

    function formatAvgMs(value) {
      return typeof value === 'number' ? value.toFixed(2) + ' ms' : '— ms';
    }

    function renderWasmTiming(timing) {
      if (!hasWasmTiming) return;
      wasmCopyInEl.textContent = 'WASM copy in (avg): ' + formatAvgMs(timing && timing.copyInMs);
      wasmComputeEl.textContent = 'WASM compute (avg): ' + formatAvgMs(timing && timing.computeMs);
      wasmTotalEl.textContent = 'WASM total (avg): ' + formatAvgMs(timing && timing.totalMs);
    }

    function renderJsTiming(timing) {
      if (!hasJsTiming) return;
      jsComputeEl.textContent = 'JS compute (avg): ' + formatAvgMs(timing && timing.computeMs);
    }

    function updateJsTimingOverlay(now) {
      if (!hasJsTiming || !global.Exp02Js?.getTimingAverages) return;

      if (processingActive) {
        const timing = global.Exp02Js.getTimingAverages(now);
        if (timing) frozenJsTiming = timing;
        renderJsTiming(frozenJsTiming);
        jsComputeEl.classList.remove('hidden');
      } else if (processingEverEnabled) {
        renderJsTiming(frozenJsTiming);
        jsComputeEl.classList.remove('hidden');
      }
    }

    function updateWasmTimingOverlay(now) {
      if (!hasWasmTiming || !global.Exp02Wasm?.getTimingAverages) return;

      if (processingActive) {
        const timing = global.Exp02Wasm.getTimingAverages(now);
        if (timing) frozenWasmTiming = timing;
        renderWasmTiming(frozenWasmTiming);
        if (wasmTimingGroupEl) wasmTimingGroupEl.classList.remove('hidden');
      } else if (processingEverEnabled) {
        renderWasmTiming(frozenWasmTiming);
        if (wasmTimingGroupEl) wasmTimingGroupEl.classList.remove('hidden');
      }
    }

    function readComputeMs(now) {
      if (hasJsTiming && global.Exp02Js?.getComputeMs) {
        const value = global.Exp02Js.getComputeMs(now);
        if (typeof value === 'number') return value;
      }
      if (hasWasmTiming && global.Exp02Wasm?.getComputeMs) {
        const value = global.Exp02Wasm.getComputeMs(now);
        if (typeof value === 'number') return value;
      }
      if (frozenJsTiming && typeof frozenJsTiming.computeMs === 'number') {
        return frozenJsTiming.computeMs;
      }
      if (frozenWasmTiming && typeof frozenWasmTiming.computeMs === 'number') {
        return frozenWasmTiming.computeMs;
      }
      return null;
    }

    function persistOverlay(now) {
      const computeMs = readComputeMs(now);
      if (typeof computeMs === 'number') lastComputeMs = computeMs;
      persistFps(
        storageKey,
        frozenDisplayFps,
        frozenProcessingFps,
        typeof lastComputeMs === 'number' ? lastComputeMs : undefined
      );
    }

    function updateResolutionLabel(width, height) {
      if (!resolutionEl || width <= 0 || height <= 0) return;
      let text = width + ' × ' + height + ' px';
      if (isFullOptimization && processWidth > 0 && processHeight > 0) {
        text += ' (proc ' + processWidth + '×' + processHeight + ')';
      }
      if (text !== reportedResolution) {
        reportedResolution = text;
        resolutionEl.textContent = text;
      }
    }

    function syncProcessCanvasSize(fullWidth, fullHeight) {
      if (!isFullOptimization || !processCanvas || !processCtx) return;
      const dims = getProcessDimensions(fullWidth, fullHeight, processScale);
      processWidth = dims.width;
      processHeight = dims.height;
      processCanvas.width = processWidth;
      processCanvas.height = processHeight;
    }

    function applyFrameSize(width, height) {
      if (width <= 0 || height <= 0) return false;
      const changed = width !== frameWidth || height !== frameHeight;
      if (!changed) return false;

      const isInitialSize = frameWidth === 0 || frameHeight === 0;
      frameWidth = width;
      frameHeight = height;
      video.width = width;
      video.height = height;
      canvas.width = width;
      canvas.height = height;
      syncProcessCanvasSize(width, height);
      updateResolutionLabel(width, height);

      if (!isInitialSize && onResize) {
        logStep('Frame size changed to ' + width + ' x ' + height + ' px');
        if (isFullOptimization) {
          onResize(processWidth, processHeight, width, height);
        } else {
          onResize(width, height);
        }
      } else if (isInitialSize) {
        logStep('Frame size set to ' + width + ' x ' + height + ' px');
        if (isFullOptimization) {
          logStep('Full optimization process size ' + processWidth + ' x ' + processHeight + ' px');
        }
      }
      return true;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      logError('Camera API not supported');
      setStatus('Camera access is not supported in this browser.');
      toggleBtn.disabled = true;
      return;
    }

    function updateOverlay(now) {
      if (!processingActive) {
        const fps = displayTracker.getFps(now);
        displayFpsEl.textContent = `Display FPS: ${fps}`;
        frozenDisplayFps = fps;
        if (processingEverEnabled) {
          processingFpsEl.textContent = `Processing FPS: ${frozenProcessingFps}`;
          processingFpsEl.classList.remove('hidden');
        }
      } else {
        displayFpsEl.textContent = `Display FPS: ${frozenDisplayFps}`;
        const fps = processingTracker.getFps(now);
        processingFpsEl.textContent = `Processing FPS: ${fps}`;
        frozenProcessingFps = fps;
        processingFpsEl.classList.remove('hidden');
      }

      updateWasmTimingOverlay(now);
      updateJsTimingOverlay(now);
      persistOverlay(now);
    }

    toggleBtn.addEventListener('click', () => {
      processingActive = !processingActive;
      toggleBtn.classList.toggle('active', processingActive);
      toggleBtn.textContent = processingActive ? 'Turn Processing OFF' : 'Turn Processing ON';

      if (processingActive) {
        processingEverEnabled = true;
        frozenDisplayFps = displayTracker.getFps();
        displayFpsEl.textContent = `Display FPS: ${frozenDisplayFps}`;
        displayTracker.freeze();
        processingTracker.resume();
        processingFpsEl.classList.remove('hidden');
        if (hasWasmTiming && global.Exp02Wasm?.resumeTiming) {
          global.Exp02Wasm.resumeTiming();
        }
        if (hasJsTiming && global.Exp02Js?.resumeTiming) {
          global.Exp02Js.resumeTiming();
        }
        logStep('Processing toggled ON');
      } else {
        frozenProcessingFps = processingTracker.getFps();
        processingFpsEl.textContent = `Processing FPS: ${frozenProcessingFps}`;
        processingTracker.freeze();
        displayTracker.resume();
        if (hasWasmTiming && global.Exp02Wasm?.getTimingAverages) {
          const timing = global.Exp02Wasm.getTimingAverages();
          if (timing) frozenWasmTiming = timing;
          renderWasmTiming(frozenWasmTiming);
        }
        if (hasJsTiming && global.Exp02Js?.getTimingAverages) {
          const timing = global.Exp02Js.getTimingAverages();
          if (timing) frozenJsTiming = timing;
          renderJsTiming(frozenJsTiming);
        }
        const computeMs = readComputeMs();
        if (typeof computeMs === 'number') lastComputeMs = computeMs;
        if (hasWasmTiming && global.Exp02Wasm?.freezeTiming) {
          global.Exp02Wasm.freezeTiming();
        }
        if (hasJsTiming && global.Exp02Js?.freezeTiming) {
          global.Exp02Js.freezeTiming();
        }
        persistOverlay();
        logStep('Processing toggled OFF');
      }
    });

    processingFpsEl.classList.add('hidden');
    setStatus('Requesting camera access…');
    logStep('Requesting camera access');

    try {
      const { stream, label } = await openCameraStream();
      logStep('Camera stream opened (' + label + ')');

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      logStep('Video element playing');
      await waitForVideoDimensions(video);
      logStep('Video dimensions available');

      const initialSize = getFrameSize(video, canvas);
      applyFrameSize(initialSize.width, initialSize.height);

      if (!isFullOptimization) {
        setStatus('Camera active at ' + frameWidth + ' × ' + frameHeight + ' px (' + label + ')');
      }
      toggleBtn.disabled = false;

      if (onReady && frameWidth > 0 && frameHeight > 0) {
        logStep('Calling onReady callback');
        if (isFullOptimization) {
          await onReady(processWidth, processHeight, frameWidth, frameHeight);
        } else {
          await onReady(frameWidth, frameHeight);
        }
        logStep('onReady callback finished');
      }

      if (isFullOptimization) {
        setStatus(
          'Camera active at ' + frameWidth + ' × ' + frameHeight + ' px (' + label +
          ') — Full Optimization: WASM at ' + processWidth + '×' + processHeight
        );
      }

      let running = true;

      function frame(now) {
        if (!running) return;

        const { width, height } = getFrameSize(video, canvas);
        if (width > 0 && height > 0) {
          applyFrameSize(width, height);
        }

        if (frameWidth <= 0 || frameHeight <= 0) {
          requestAnimationFrame(frame);
          return;
        }

        try {
          if (processingActive) {
            const frameNo = global.Exp02Log ? global.Exp02Log.nextFrame() : 0;

            if (isFullOptimization) {
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': downscale draw');
              processCtx.drawImage(video, 0, 0, processWidth, processHeight);
              const imageData = processCtx.getImageData(0, 0, processWidth, processHeight);
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': WASM process');
              const result = processFrame(imageData, processWidth, processHeight);
              processCtx.putImageData(result, 0, 0);
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(processCanvas, 0, 0, processWidth, processHeight, 0, 0, frameWidth, frameHeight);
              ctx.imageSmoothingEnabled = true;
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': upscale complete');
            } else {
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': draw video to canvas');
              ctx.drawImage(video, 0, 0, frameWidth, frameHeight);
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': getImageData');
              const imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': processFrame start');
              const result = processFrame(imageData, frameWidth, frameHeight);
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': processFrame done');
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': putImageData');
              ctx.putImageData(result, 0, 0);
              if (verboseFrameLog) logStep('Frame ' + frameNo + ': complete');
            }
            processingTracker.record(now);
          } else {
            ctx.drawImage(video, 0, 0, frameWidth, frameHeight);
            displayTracker.record(now);
          }
        } catch (error) {
          console.error('Frame processing failed:', error);
          logError('Frame processing failed: ' + (error.message || error));
          setStatus('Processing error: ' + (error.message || error));
        }

        updateOverlay(now);
        requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);

      function saveOnExit() {
        persistOverlay();
      }

      window.addEventListener('pagehide', saveOnExit);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveOnExit();
      });

      return {
        stop() {
          running = false;
          window.removeEventListener('pagehide', saveOnExit);
          saveOnExit();
          stream.getTracks().forEach((t) => t.stop());
          video.srcObject = null;
        },
      };
    } catch (error) {
      const detail = error?.message || error?.name || String(error);
      logError('Camera startup failed: ' + detail);
      setStatus(
        'Could not open the environment camera. Grant camera permission and reload. ' + detail
      );
      toggleBtn.disabled = true;
      if (onError) onError(error);
      throw error;
    }
  }

  global.Exp02TestRunner = { startTestRunner };
})(window);