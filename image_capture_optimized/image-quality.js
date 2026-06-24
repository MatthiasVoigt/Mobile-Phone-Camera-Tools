const FOCUS_REGION_SIZE = 200;
const FOCUS_TOP_RANK = 20;
const BRIGHTNESS_TOP_RANK = 20;
const FOCUS_AVERAGE_WINDOW_MS = 1000;

const focusScoreHistory = [];
let metricsSampleCanvas = null;
let metricsSampleCtx = null;
const GAUSSIAN_3X3 = [
  1, 2, 1,
  2, 4, 2,
  1, 2, 1
];
const GAUSSIAN_3X3_SUM = 16;

function getCenterRegionBounds(width, height) {
  const regionW = Math.min(FOCUS_REGION_SIZE, width);
  const regionH = Math.min(FOCUS_REGION_SIZE, height);
  return {
    startX: Math.floor((width - regionW) / 2),
    startY: Math.floor((height - regionH) / 2),
    regionW,
    regionH
  };
}

function sampleCenterRegionFromCanvas(sourceCanvas) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const { startX, startY, regionW, regionH } = getCenterRegionBounds(width, height);

  if (!metricsSampleCanvas) {
    metricsSampleCanvas = document.createElement('canvas');
    metricsSampleCtx = metricsSampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (metricsSampleCanvas.width !== regionW || metricsSampleCanvas.height !== regionH) {
    metricsSampleCanvas.width = regionW;
    metricsSampleCanvas.height = regionH;
  }

  metricsSampleCtx.drawImage(
    sourceCanvas,
    startX, startY, regionW, regionH,
    0, 0, regionW, regionH
  );

  return metricsSampleCtx.getImageData(0, 0, regionW, regionH);
}

function computeFocusScore(imageData) {
  const { data, width, height } = imageData;
  const { startX, startY, regionW, regionH } = getCenterRegionBounds(width, height);
  const gray = extractCenterGray(data, width, startX, startY, regionW, regionH);
  const blurred = applyGaussianBlur3x3(gray, regionW, regionH);
  const histogram = new Map();

  for (let y = 1; y < regionH - 1; y++) {
    for (let x = 1; x < regionW - 1; x++) {
      const lap = laplacianOnGray(blurred, regionW, x, y);
      const key = Math.round(lap);
      histogram.set(key, (histogram.get(key) || 0) + 1);
    }
  }

  return topValueFromHistogram(histogram, FOCUS_TOP_RANK);
}

function extractCenterGray(data, width, startX, startY, regionW, regionH) {
  const gray = new Float32Array(regionW * regionH);

  for (let y = 0; y < regionH; y++) {
    for (let x = 0; x < regionW; x++) {
      const srcIdx = ((startY + y) * width + (startX + x)) * 4;
      gray[y * regionW + x] = grayscaleFromRgb(data, srcIdx);
    }
  }

  return gray;
}

function applyGaussianBlur3x3(gray, regionW, regionH) {
  const output = new Float32Array(gray.length);

  for (let y = 0; y < regionH; y++) {
    for (let x = 0; x < regionW; x++) {
      let sum = 0;
      let ki = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sy = clamp(y + ky, 0, regionH - 1);
          const sx = clamp(x + kx, 0, regionW - 1);
          sum += gray[sy * regionW + sx] * GAUSSIAN_3X3[ki++];
        }
      }

      output[y * regionW + x] = sum / GAUSSIAN_3X3_SUM;
    }
  }

  return output;
}

function laplacianOnGray(gray, regionW, x, y) {
  const idx = y * regionW + x;
  return (
    gray[idx - regionW] +
    gray[idx - 1] -
    4 * gray[idx] +
    gray[idx + 1] +
    gray[idx + regionW]
  );
}

function topValueFromHistogram(histogram, rank) {
  if (histogram.size === 0) return 0;

  const sortedValues = Array.from(histogram.keys()).sort((a, b) => b - a);
  let count = 0;

  for (const value of sortedValues) {
    count += histogram.get(value);
    if (count >= rank) {
      return value;
    }
  }

  return sortedValues[sortedValues.length - 1];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function grayscaleFromRgb(data, index) {
  return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
}

function recordFocusScore(sample) {
  const now = performance.now();
  focusScoreHistory.push({ time: now, value: sample });

  const cutoff = now - FOCUS_AVERAGE_WINDOW_MS;
  while (focusScoreHistory.length > 0 && focusScoreHistory[0].time < cutoff) {
    focusScoreHistory.shift();
  }
}

function getSmoothedFocusScore() {
  if (focusScoreHistory.length === 0) return 0;

  let sum = 0;
  for (let i = 0; i < focusScoreHistory.length; i++) {
    sum += focusScoreHistory[i].value;
  }

  return sum / focusScoreHistory.length;
}

function resetFocusScoreHistory() {
  focusScoreHistory.length = 0;
}

function shouldUpdateMetrics(now, lastUpdateMs) {
  return now - lastUpdateMs >= METRICS_INTERVAL_MS;
}

function computeGrayscaleHistogram(imageData) {
  const { data, width, height } = imageData;
  const { startX, startY, regionW, regionH } = getCenterRegionBounds(width, height);
  const bins = new Uint32Array(256);

  for (let y = 0; y < regionH; y++) {
    for (let x = 0; x < regionW; x++) {
      const srcIdx = ((startY + y) * width + (startX + x)) * 4;
      const gray = Math.round(grayscaleFromRgb(data, srcIdx));
      bins[clamp(gray, 0, 255)]++;
    }
  }

  return bins;
}

function drawHistogram(ctx, bins, canvasWidth, canvasHeight) {
  const padding = 6;
  const plotW = canvasWidth - padding * 2;
  const plotH = canvasHeight - padding * 2;
  let max = 0;

  for (let i = 0; i < 256; i++) {
    if (bins[i] > max) max = bins[i];
  }
  if (max === 0) max = 1;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding + 0.5, padding + 0.5, plotW - 1, plotH - 1);

  ctx.fillStyle = 'rgba(96, 165, 250, 0.9)';
  const barW = plotW / 256;
  for (let i = 0; i < 256; i++) {
    const barH = (bins[i] / max) * plotH;
    if (barH <= 0) continue;
    ctx.fillRect(
      padding + i * barW,
      padding + plotH - barH,
      Math.max(barW, 0.75),
      barH
    );
  }
}

function topBrightnessFromHistogram(bins, rank) {
  let count = 0;

  for (let level = 255; level >= 0; level--) {
    count += bins[level];
    if (count >= rank) {
      return level;
    }
  }

  return 0;
}

function formatMaxPixelCount(brightness) {
  return `Max Pixel Count · ${brightness}`;
}

function drawMetricsRegionOverlay(ctx, squareSize) {
  const { regionW } = getCenterRegionBounds(squareSize, squareSize);
  const radius = regionW / 2;
  const center = squareSize / 2;

  ctx.clearRect(0, 0, squareSize, squareSize);
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function formatFocusScore(score) {
  return `Focus score · ${score.toFixed(1)}`;
}

function formatFocusScoreForFilename(score) {
  const value = Math.min(999, Math.max(0, Math.round(Number(score) || 0)));
  return `F${String(value).padStart(3, '0')}`;
}

async function canvasToPngBlob(canvas) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const offscreen = new OffscreenCanvas(canvas.width, canvas.height);
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const blob = await offscreen.convertToBlob({ type: 'image/png' });
      if (blob) {
        return blob;
      }
    } catch {
      // Fall through to canvas.toBlob.
    }
  }

  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
}