const referenceBuffer = document.createElement('canvas');
const referenceBufferCtx = referenceBuffer.getContext('2d');

const trackSnapshot = document.createElement('canvas');
const trackSnapshotCtx = trackSnapshot.getContext('2d', { willReadFrequently: true });

let referenceReady = false;
let worker = null;
let workerReady = null;
let workerFailed = false;
let trackerActive = false;
let trackPending = false;
let initPending = false;
let lastTrackTime = 0;
let captureGeneration = 0;

const TRACK_INTERVAL_MS = 200;
const TRACK_MAX_SIZE = 480;

const LOST_RESULT = { lost: true, corners: null, center: null };

const tracker = {
  lastResult: LOST_RESULT
};

let trackSourceCanvas = null;
let planarTrackLoopId = null;

function resetPlanarReference() {
  referenceReady = false;
  referenceBuffer.width = 0;
  referenceBuffer.height = 0;
  resetPlanarTracker();
}

function resetPlanarTracker() {
  trackerActive = false;
  tracker.lastResult = LOST_RESULT;
  trackPending = false;
  initPending = false;
  lastTrackTime = 0;
  stopPlanarTrackingLoop();
}

function hasPlanarReference() {
  return referenceReady && referenceBuffer.width > 0 && referenceBuffer.height > 0;
}

function getTrackScale(width, height) {
  const maxDim = Math.max(width, height);
  if (maxDim <= TRACK_MAX_SIZE) return 1;
  return TRACK_MAX_SIZE / maxDim;
}

function setPlanarTrackSource(canvas) {
  trackSourceCanvas = canvas;
}

function startPlanarTrackingLoop() {
  if (planarTrackLoopId) return;
  planarTrackLoopId = setInterval(() => {
    if (trackSourceCanvas && trackerActive && hasPlanarReference()) {
      schedulePlanarTracking(trackSourceCanvas);
    }
  }, TRACK_INTERVAL_MS);
}

function stopPlanarTrackingLoop() {
  if (!planarTrackLoopId) return;
  clearInterval(planarTrackLoopId);
  planarTrackLoopId = null;
}

function ensureTrackingWorker() {
  if (workerFailed) {
    return Promise.reject(new Error('Tracking worker unavailable'));
  }

  if (workerReady) {
    return workerReady;
  }

  workerReady = new Promise((resolve, reject) => {
    let resolved = false;

    try {
      worker = new Worker('planar-tracking-worker.js');
    } catch (err) {
      workerFailed = true;
      workerReady = null;
      reject(err);
      return;
    }

    worker.addEventListener('message', (event) => {
      const message = event.data;

      if (
        !resolved &&
        (message.type === 'opencvReady' || (message.type === 'pong' && message.cvReady))
      ) {
        resolved = true;
        resolve(worker);
      }

      handleWorkerMessage(event);
    });

    worker.addEventListener('error', (err) => {
      console.error('Tracking worker error:', err);
      if (!resolved) {
        workerFailed = true;
        workerReady = null;
        reject(err);
      }
    });

    worker.postMessage({ type: 'ping' });
  });

  return workerReady;
}

function handleWorkerMessage(event) {
  const message = event.data;

  if (message.type === 'initialized') {
    if (message.generation !== captureGeneration) return;
    initPending = false;
    trackerActive = message.success;
    tracker.lastResult = LOST_RESULT;
    if (trackerActive) {
      startPlanarTrackingLoop();
    }
    return;
  }

  if (message.type === 'tracked') {
    trackPending = false;
    if (message.generation !== captureGeneration || initPending) return;
    if (message.result) {
      tracker.lastResult = message.result;
    }
    return;
  }

  if (message.type === 'error') {
    if (message.generation != null && message.generation !== captureGeneration) return;
    trackPending = false;
    initPending = false;
    console.error('Planar tracking worker:', message.error);
  }
}

function copyTrackFrame(sourceCanvas) {
  const scale = getTrackScale(sourceCanvas.width, sourceCanvas.height);
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));

  if (trackSnapshot.width !== width || trackSnapshot.height !== height) {
    trackSnapshot.width = width;
    trackSnapshot.height = height;
  }

  trackSnapshotCtx.drawImage(sourceCanvas, 0, 0, width, height);
  return trackSnapshotCtx.getImageData(0, 0, width, height);
}

function startPlanarTrackerInit(centerW, centerH, generation) {
  if (!hasPlanarReference() || initPending) return;

  initPending = true;

  ensureTrackingWorker()
    .then(() => {
      const reference = referenceBufferCtx.getImageData(
        0,
        0,
        referenceBuffer.width,
        referenceBuffer.height
      );

      const trackScale = getTrackScale(centerW, centerH);

      worker.postMessage(
        {
          type: 'init',
          generation,
          reference,
          centerW,
          centerH,
          trackScale
        },
        [reference.data.buffer]
      );
    })
    .catch(() => {
      if (generation !== captureGeneration) return;
      initPending = false;
      trackerActive = false;
      tracker.lastResult = LOST_RESULT;
    });
}

function schedulePlanarTracking(sourceCanvas) {
  if (!hasPlanarReference() || !trackerActive || trackPending || initPending) {
    return;
  }

  lastTrackTime = performance.now();
  trackPending = true;
  const generation = captureGeneration;

  ensureTrackingWorker()
    .then(() => {
      if (generation !== captureGeneration) {
        trackPending = false;
        return;
      }
      const frame = copyTrackFrame(sourceCanvas);
      worker.postMessage(
        { type: 'track', generation, frame },
        [frame.data.buffer]
      );
    })
    .catch(() => {
      trackPending = false;
    });
}

function capturePlanarReference(sourceCanvas) {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  if (!srcW || !srcH) return false;

  const cropW = Math.floor(srcW / 2);
  const cropH = Math.floor(srcH / 2);
  const srcX = Math.floor((srcW - cropW) / 2);
  const srcY = Math.floor((srcH - cropH) / 2);

  resetPlanarTracker();
  captureGeneration += 1;
  const generation = captureGeneration;

  referenceBuffer.width = cropW;
  referenceBuffer.height = cropH;
  referenceBufferCtx.drawImage(
    sourceCanvas,
    srcX, srcY, cropW, cropH,
    0, 0, cropW, cropH
  );
  referenceReady = true;
  tracker.lastResult = LOST_RESULT;

  startPlanarTrackerInit(srcW, srcH, generation);
  return true;
}

function drawPlanarReference(displayCanvas) {
  const ctx = displayCanvas.getContext('2d');
  const size = referenceBuffer.width;

  if (!hasPlanarReference()) {
    ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    return false;
  }

  if (displayCanvas.width !== size || displayCanvas.height !== size) {
    displayCanvas.width = size;
    displayCanvas.height = size;
  }

  ctx.drawImage(referenceBuffer, 0, 0);
  return true;
}

function getPlanarTrackingResult() {
  return tracker.lastResult;
}

function drawPlanarTrackingOverlay(ctx, result, canvasSize) {
  if (!result || result.lost || !result.corners) return;

  const arm = Math.max(10, Math.round(canvasSize * 0.035));
  const crossSize = Math.max(12, Math.round(canvasSize * 0.04));
  const { corners, center } = result;

  ctx.save();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = Math.max(2, canvasSize * 0.004);

  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].x, corners[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  for (const corner of corners) {
    ctx.beginPath();
    ctx.moveTo(corner.x, corner.y);
    ctx.lineTo(corner.x + (corner.x < center.x ? arm : -arm), corner.y);
    ctx.moveTo(corner.x, corner.y);
    ctx.lineTo(corner.x, corner.y + (corner.y < center.y ? arm : -arm));
    ctx.stroke();
  }

  if (center) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(2, canvasSize * 0.003);
    ctx.beginPath();
    ctx.moveTo(center.x - crossSize, center.y);
    ctx.lineTo(center.x + crossSize, center.y);
    ctx.moveTo(center.x, center.y - crossSize);
    ctx.lineTo(center.x, center.y + crossSize);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlanarTrackingStatus(ctx, result, canvasSize) {
  const fontSize = Math.max(12, Math.round(canvasSize * 0.028));
  const padding = 6;
  const margin = 8;
  const found = Boolean(result && !result.lost && result.center);
  const label = found
    ? `${Math.round(result.center.x)}, ${Math.round(result.center.y)}`
    : 'not found';

  ctx.save();
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  const labelW = Math.min(ctx.measureText(label).width + padding * 2, canvasSize - margin * 2);
  const labelH = fontSize + padding * 2;

  ctx.fillStyle = found ? 'rgba(0, 0, 0, 0.72)' : 'rgba(40, 20, 20, 0.82)';
  ctx.fillRect(margin, margin, labelW, labelH);

  ctx.fillStyle = found ? '#ffffff' : '#ffb4b4';
  ctx.textBaseline = 'top';
  ctx.fillText(label, margin + padding, margin + padding, labelW - padding * 2);

  ctx.restore();
}