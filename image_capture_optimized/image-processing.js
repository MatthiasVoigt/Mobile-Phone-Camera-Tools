const movingAverageState = {
  width: 0,
  height: 0,
  data: null
};

function resetMovingAverage() {
  movingAverageState.width = 0;
  movingAverageState.height = 0;
  movingAverageState.data = null;
}

function updateAccumulator(imageData, alpha) {
  const { data, width, height } = imageData;
  const blend = clampMovingAverageRatio(alpha);
  const retain = 1.0 - blend;

  if (
    !movingAverageState.data ||
    movingAverageState.width !== width ||
    movingAverageState.height !== height
  ) {
    movingAverageState.width = width;
    movingAverageState.height = height;
    movingAverageState.data = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      movingAverageState.data[i] = data[i];
    }
  } else {
    const acc = movingAverageState.data;
    for (let i = 0; i < data.length; i++) {
      acc[i] = blend * data[i] + retain * acc[i];
    }
  }

  return { data, accumulator: movingAverageState.data, width, height };
}

function computeEdgeMap(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const output = new Uint8ClampedArray(data.length);
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const val = gray[(y + ky) * width + (x + kx)];
          gx += val * gxKernel[ki];
          gy += val * gyKernel[ki];
          ki++;
        }
      }
      const mag = Math.min(255, Math.hypot(gx, gy));
      const idx = (y * width + x) * 4;
      output[idx] = mag;
      output[idx + 1] = mag;
      output[idx + 2] = mag;
      output[idx + 3] = 255;
    }
  }

  return new ImageData(output, width, height);
}

function computeMovingAverage(imageData, alpha) {
  const { accumulator, width, height } = updateAccumulator(imageData, alpha);
  const output = new Uint8ClampedArray(accumulator.length);

  for (let i = 0; i < accumulator.length; i++) {
    output[i] = accumulator[i];
  }

  return new ImageData(output, width, height);
}

function computeChangeDetection(imageData, alpha) {
  const { data, width, height } = imageData;
  const blend = clampMovingAverageRatio(alpha);
  const retain = 1.0 - blend;
  const output = new Uint8ClampedArray(data.length);

  if (
    !movingAverageState.data ||
    movingAverageState.width !== width ||
    movingAverageState.height !== height
  ) {
    movingAverageState.width = width;
    movingAverageState.height = height;
    movingAverageState.data = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      movingAverageState.data[i] = data[i];
    }
    return new ImageData(output, width, height);
  }

  const acc = movingAverageState.data;

  for (let i = 0; i < data.length; i += 4) {
    output[i] = Math.abs(data[i] - acc[i]);
    output[i + 1] = Math.abs(data[i + 1] - acc[i + 1]);
    output[i + 2] = Math.abs(data[i + 2] - acc[i + 2]);
    output[i + 3] = 255;
  }

  for (let i = 0; i < data.length; i++) {
    acc[i] = blend * data[i] + retain * acc[i];
  }

  return new ImageData(output, width, height);
}

const imageProcessors = {
  none: (imageData) => imageData,
  edgeMap: (imageData) => computeEdgeMap(imageData),
  movingAverage: (imageData, settings) =>
    computeMovingAverage(imageData, settings.movingAverageRatio),
  changeDetection: (imageData, settings) =>
    computeChangeDetection(imageData, settings.movingAverageRatio)
};

function applyImageProcessing(imageData, settings) {
  const mode = settings.imageProcessing || 'none';
  const processor = imageProcessors[mode] || imageProcessors.none;
  return processor(imageData, settings);
}

function needsPixelProcessing(settings) {
  const mode = settings.imageProcessing || 'none';
  return mode === 'edgeMap' || mode === 'movingAverage' || mode === 'changeDetection';
}

function renderProcessedPreview(sourceCanvas, previewCanvas, previewCtx, displayCanvas, displayCtx, settings, squareSize) {
  const processSize = getPreviewProcessSize(squareSize);

  if (previewCanvas.width !== processSize || previewCanvas.height !== processSize) {
    previewCanvas.width = processSize;
    previewCanvas.height = processSize;
  }

  previewCtx.imageSmoothingEnabled = true;
  previewCtx.drawImage(sourceCanvas, 0, 0, processSize, processSize);

  const cropped = previewCtx.getImageData(0, 0, processSize, processSize);
  const processed = applyImageProcessing(cropped, settings);
  previewCtx.putImageData(processed, 0, 0);

  displayCtx.imageSmoothingEnabled = false;
  displayCtx.drawImage(previewCanvas, 0, 0, squareSize, squareSize);
}

function renderProcessedSave(sourceCanvas, saveCanvas, saveCtx, settings, squareSize) {
  if (saveCanvas.width !== squareSize || saveCanvas.height !== squareSize) {
    saveCanvas.width = squareSize;
    saveCanvas.height = squareSize;
  }

  saveCtx.drawImage(sourceCanvas, 0, 0, squareSize, squareSize);
  const cropped = saveCtx.getImageData(0, 0, squareSize, squareSize);
  const processed = applyImageProcessing(cropped, settings);
  saveCtx.putImageData(processed, 0, 0);
}

function getProcessingLabel(settings) {
  if (settings.imageProcessing === 'edgeMap') return 'Edge map';

  const ratio = settings.movingAverageRatio ?? DEFAULT_MOVING_AVERAGE_RATIO;
  const ratioLabel = formatMovingAverageRatio(ratio);

  if (settings.imageProcessing === 'movingAverage') {
    return `Moving average · ${ratioLabel}`;
  }
  if (settings.imageProcessing === 'changeDetection') {
    return `Change detection · ${ratioLabel}`;
  }
  if (settings.imageProcessing === 'barcodeDetection') {
    return 'Barcode detection';
  }
  return '';
}