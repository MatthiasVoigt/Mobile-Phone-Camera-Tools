const FOCUS_REGION_SIZE = 200;
const FOCUS_TOP_RANK = 100;
const FOCUS_AVERAGE_WINDOW_MS = 1000;

const focusScoreHistory = [];
const GAUSSIAN_3X3 = [
  1, 2, 1,
  2, 4, 2,
  1, 2, 1
];
const GAUSSIAN_3X3_SUM = 16;

function computeFocusScore(imageData) {
  const { data, width, height } = imageData;
  const regionW = Math.min(FOCUS_REGION_SIZE, width);
  const regionH = Math.min(FOCUS_REGION_SIZE, height);
  const startX = Math.floor((width - regionW) / 2);
  const startY = Math.floor((height - regionH) / 2);
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

function formatFocusScore(score) {
  return `Focus score · ${score.toFixed(1)}`;
}