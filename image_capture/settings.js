const SETTINGS_KEY = 'experiment1-settings';
const DEFAULT_IMAGE_LABEL = '';
const DEFAULT_IMAGE_COUNTER = 1;
const DEFAULT_CROP_SIZE = 1500;
const CROP_SIZE_OPTIONS = [500, 800, 1000, 1500];
const IMAGE_RESOLUTION_OPTIONS = ['max', '1920x1080', '1280x720'];
const DEFAULT_IMAGE_RESOLUTION = 'max';
const IMAGE_RESOLUTION_PRESETS = {
  '1920x1080': { width: 1920, height: 1080 },
  '1280x720': { width: 1280, height: 720 }
};
const IMAGE_PROCESSING_OPTIONS = [
  'none',
  'edgeMap',
  'movingAverage',
  'changeDetection',
  'barcodeDetection',
  'planarTracking'
];
const MIN_MOVING_AVERAGE_RATIO = 0.01;
const MAX_MOVING_AVERAGE_RATIO = 0.9;
const DEFAULT_MOVING_AVERAGE_RATIO = 0.5;
const BARCODE_DECODER_OPTIONS = [
  'barcodeDetector',
  'zxingHybrid',
  'zxingGlobal',
  'zxingImage'
];
const DEFAULT_BARCODE_DECODER = 'zxingHybrid';
const BARCODE_DECODER_LABELS = {
  barcodeDetector: 'BarcodeDetector',
  zxingHybrid: 'ZXing Bitmap (Hybrid)',
  zxingGlobal: 'ZXing Bitmap (Global)',
  zxingImage: 'ZXing Image'
};
const BARCODE_FORMATS = [
  { id: 'data_matrix', label: 'Data Matrix', native: 'data_matrix', zxing: 'DATA_MATRIX' },
  { id: 'qr_code', label: 'QR Code', native: 'qr_code', zxing: 'QR_CODE' },
  { id: 'aztec', label: 'Aztec', native: 'aztec', zxing: 'AZTEC' },
  { id: 'pdf417', label: 'PDF417', native: 'pdf417', zxing: 'PDF_417' },
  { id: 'ean_13', label: 'EAN-13', native: 'ean_13', zxing: 'EAN_13' },
  { id: 'ean_8', label: 'EAN-8', native: 'ean_8', zxing: 'EAN_8' },
  { id: 'code_128', label: 'Code 128', native: 'code_128', zxing: 'CODE_128' },
  { id: 'code_39', label: 'Code 39', native: 'code_39', zxing: 'CODE_39' },
  { id: 'code_93', label: 'Code 93', native: 'code_93', zxing: 'CODE_93' },
  { id: 'upc_a', label: 'UPC-A', native: 'upc_a', zxing: 'UPC_A' },
  { id: 'upc_e', label: 'UPC-E', native: 'upc_e', zxing: 'UPC_E' },
  { id: 'itf', label: 'ITF', native: 'itf', zxing: 'ITF' },
  { id: 'codabar', label: 'Codabar', native: 'codabar', zxing: 'CODABAR' }
];
const BARCODE_FORMAT_OPTIONS = BARCODE_FORMATS.map((format) => format.id);
const DEFAULT_BARCODE_FORMAT = 'data_matrix';
const DEFAULT_QUALITY_METRICS = {
  focusScore: true,
  showHistogram: true
};
const ZOOM_CAPABILITIES_KEY = 'experiment1-zoom-capabilities';
const DEFAULT_IMAGE_MAGNIFICATION = 2;
const ZOOM_STEP = 0.5;
const DEFAULT_CAPTURE_SEQUENCE_LENGTH = 1;
const MIN_CAPTURE_SEQUENCE_LENGTH = 1;
const MAX_CAPTURE_SEQUENCE_LENGTH = 99;

function getBarcodeFormatConfig(formatId) {
  return BARCODE_FORMATS.find((format) => format.id === formatId) ||
    BARCODE_FORMATS.find((format) => format.id === DEFAULT_BARCODE_FORMAT);
}

function getBarcodeDecoderLabel(decoderId) {
  return BARCODE_DECODER_LABELS[decoderId] || BARCODE_DECODER_LABELS[DEFAULT_BARCODE_DECODER];
}

function clampMovingAverageRatio(ratio) {
  return Math.min(MAX_MOVING_AVERAGE_RATIO, Math.max(MIN_MOVING_AVERAGE_RATIO, ratio));
}

function sliderToMovingAverageRatio(slider) {
  const t = slider / 100;
  return MIN_MOVING_AVERAGE_RATIO * Math.pow(MAX_MOVING_AVERAGE_RATIO / MIN_MOVING_AVERAGE_RATIO, t);
}

function movingAverageRatioToSlider(ratio) {
  const clamped = clampMovingAverageRatio(ratio);
  const t = Math.log(clamped / MIN_MOVING_AVERAGE_RATIO) /
    Math.log(MAX_MOVING_AVERAGE_RATIO / MIN_MOVING_AVERAGE_RATIO);
  return Math.round(t * 100);
}

function formatMovingAverageRatio(ratio) {
  const clamped = clampMovingAverageRatio(ratio);
  return clamped < 0.1 ? clamped.toFixed(2) : clamped.toFixed(1);
}

function getImageResolutionLabel(resolutionId) {
  if (resolutionId === 'max') return 'Maximum';
  const preset = IMAGE_RESOLUTION_PRESETS[resolutionId];
  return preset ? `${preset.width} × ${preset.height}` : 'Maximum';
}

function normalizeQualityMetrics(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    focusScore: Boolean(source.focusScore),
    showHistogram: Boolean(source.showHistogram)
  };
}

function saveZoomCapabilities(min, max) {
  const zoomMin = Number(min);
  const zoomMax = Number(max);
  if (!Number.isFinite(zoomMin) || !Number.isFinite(zoomMax) || zoomMax < zoomMin) {
    return;
  }

  localStorage.setItem(ZOOM_CAPABILITIES_KEY, JSON.stringify({
    min: zoomMin,
    max: zoomMax
  }));
}

function loadZoomCapabilities() {
  try {
    const raw = localStorage.getItem(ZOOM_CAPABILITIES_KEY);
    if (!raw) {
      return { min: 1, max: DEFAULT_IMAGE_MAGNIFICATION };
    }

    const parsed = JSON.parse(raw);
    const min = Number(parsed.min);
    const max = Number(parsed.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      return { min: 1, max: DEFAULT_IMAGE_MAGNIFICATION };
    }

    return { min, max };
  } catch {
    return { min: 1, max: DEFAULT_IMAGE_MAGNIFICATION };
  }
}

function getZoomOptions(min, max, step = ZOOM_STEP) {
  const options = [];
  let value = Math.ceil(min / step) * step;

  while (value <= max + 0.001) {
    options.push(Math.round(value * 10) / 10);
    value += step;
  }

  if (options.length === 0) {
    const fallback = Math.min(max, Math.max(min, DEFAULT_IMAGE_MAGNIFICATION));
    options.push(Math.round(fallback * 10) / 10);
  }

  return options;
}

function normalizeImageMagnification(value, caps = loadZoomCapabilities()) {
  const options = getZoomOptions(caps.min, caps.max);
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return options.includes(DEFAULT_IMAGE_MAGNIFICATION)
      ? DEFAULT_IMAGE_MAGNIFICATION
      : options[0];
  }

  if (options.includes(num)) {
    return num;
  }

  return options.reduce((best, option) =>
    Math.abs(option - num) < Math.abs(best - num) ? option : best, options[0]);
}

function formatMagnificationLabel(value) {
  return `${Number(value).toFixed(1)}×`;
}

function normalizeCaptureSequenceLength(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_CAPTURE_SEQUENCE_LENGTH;
  }

  return Math.min(
    MAX_CAPTURE_SEQUENCE_LENGTH,
    Math.max(MIN_CAPTURE_SEQUENCE_LENGTH, Math.floor(num))
  );
}

function getRequestedResolution(imageResolution, maxWidth, maxHeight) {
  if (imageResolution === 'max' || !IMAGE_RESOLUTION_PRESETS[imageResolution]) {
    return {
      width: maxWidth ?? 4096,
      height: maxHeight ?? 4096
    };
  }

  const preset = IMAGE_RESOLUTION_PRESETS[imageResolution];
  return { width: preset.width, height: preset.height };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        imageLabel: DEFAULT_IMAGE_LABEL,
        imageCounter: DEFAULT_IMAGE_COUNTER,
        imageResolution: DEFAULT_IMAGE_RESOLUTION,
        imageMagnification: DEFAULT_IMAGE_MAGNIFICATION,
        captureSequenceLength: DEFAULT_CAPTURE_SEQUENCE_LENGTH,
        cropSize: DEFAULT_CROP_SIZE,
        qualityMetrics: { ...DEFAULT_QUALITY_METRICS },
        imageProcessing: 'none',
        movingAverageRatio: DEFAULT_MOVING_AVERAGE_RATIO,
        barcodeDecoder: DEFAULT_BARCODE_DECODER,
        barcodeFormat: DEFAULT_BARCODE_FORMAT
      };
    }

    const parsed = JSON.parse(raw);
    const cropSize = Number(parsed.cropSize);
    let imageProcessing = parsed.imageProcessing;

    if (!IMAGE_PROCESSING_OPTIONS.includes(imageProcessing)) {
      imageProcessing = parsed.edgeMap ? 'edgeMap' : 'none';
    }

    const movingAverageRatio = Number(parsed.movingAverageRatio);

    const barcodeDecoder = BARCODE_DECODER_OPTIONS.includes(parsed.barcodeDecoder)
      ? parsed.barcodeDecoder
      : DEFAULT_BARCODE_DECODER;
    const barcodeFormat = BARCODE_FORMAT_OPTIONS.includes(parsed.barcodeFormat)
      ? parsed.barcodeFormat
      : DEFAULT_BARCODE_FORMAT;
    const imageResolution = IMAGE_RESOLUTION_OPTIONS.includes(parsed.imageResolution)
      ? parsed.imageResolution
      : DEFAULT_IMAGE_RESOLUTION;

    const imageCounter = Number(parsed.imageCounter);
    const zoomCaps = loadZoomCapabilities();

    return {
      imageLabel: typeof parsed.imageLabel === 'string' ? parsed.imageLabel : DEFAULT_IMAGE_LABEL,
      imageCounter: Number.isFinite(imageCounter) && imageCounter >= 1
        ? Math.floor(imageCounter)
        : DEFAULT_IMAGE_COUNTER,
      imageResolution,
      imageMagnification: normalizeImageMagnification(parsed.imageMagnification, zoomCaps),
      captureSequenceLength: normalizeCaptureSequenceLength(parsed.captureSequenceLength),
      cropSize: CROP_SIZE_OPTIONS.includes(cropSize) ? cropSize : DEFAULT_CROP_SIZE,
      qualityMetrics: normalizeQualityMetrics(parsed.qualityMetrics),
      imageProcessing,
      movingAverageRatio: Number.isFinite(movingAverageRatio)
        ? clampMovingAverageRatio(movingAverageRatio)
        : DEFAULT_MOVING_AVERAGE_RATIO,
      barcodeDecoder,
      barcodeFormat
    };
  } catch {
    return {
      imageLabel: DEFAULT_IMAGE_LABEL,
      imageCounter: DEFAULT_IMAGE_COUNTER,
      imageResolution: DEFAULT_IMAGE_RESOLUTION,
      imageMagnification: DEFAULT_IMAGE_MAGNIFICATION,
      captureSequenceLength: DEFAULT_CAPTURE_SEQUENCE_LENGTH,
      cropSize: DEFAULT_CROP_SIZE,
      qualityMetrics: { ...DEFAULT_QUALITY_METRICS },
      imageProcessing: 'none',
      movingAverageRatio: DEFAULT_MOVING_AVERAGE_RATIO,
      barcodeDecoder: DEFAULT_BARCODE_DECODER,
      barcodeFormat: DEFAULT_BARCODE_FORMAT
    };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function sanitizeImageLabel(label) {
  const trimmed = String(label ?? '').trim();
  if (!trimmed) return 'experiment1';
  const sanitized = trimmed
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return sanitized || 'experiment1';
}

function buildImageFilename(settings, sequenceIndex = null) {
  const base = sanitizeImageLabel(settings.imageLabel);
  const counter = Number.isFinite(Number(settings.imageCounter)) && Number(settings.imageCounter) >= 1
    ? Number(settings.imageCounter)
    : DEFAULT_IMAGE_COUNTER;
  const sequenceLength = normalizeCaptureSequenceLength(settings.captureSequenceLength);

  if (sequenceLength > 1 && Number.isFinite(sequenceIndex) && sequenceIndex >= 1) {
    return `${base}-${counter}-SEQU${Math.floor(sequenceIndex)}.png`;
  }

  return `${base}-${counter}.png`;
}

function incrementImageCounter(settings) {
  const current = Number.isFinite(Number(settings.imageCounter)) && Number(settings.imageCounter) >= 1
    ? Number(settings.imageCounter)
    : DEFAULT_IMAGE_COUNTER;
  settings.imageCounter = current + 1;
  saveSettings(settings);
}