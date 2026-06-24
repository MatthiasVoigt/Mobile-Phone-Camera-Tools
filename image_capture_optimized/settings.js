const SETTINGS_KEY = 'image-capture-optimized-settings';
const CAMERA_OPTIONS_KEY = 'image-capture-optimized-camera-options';
const DEFAULT_IMAGE_LABEL = 'Item_01';
const DEFAULT_IMAGE_COUNTER = 1;
const DEFAULT_CROP_SIZE = 800;
const CROP_SIZE_OPTIONS = [500, 800, 1000, 1500];
const IMAGE_RESOLUTION_OPTIONS = ['max', '1920x1080', '1280x720'];
const DEFAULT_IMAGE_RESOLUTION = '1280x720';
const IMAGE_RESOLUTION_PRESETS = {
  '1920x1080': { width: 1920, height: 1080 },
  '1280x720': { width: 1280, height: 720 }
};
const IMAGE_PROCESSING_OPTIONS = [
  'none',
  'edgeMap',
  'movingAverage',
  'changeDetection',
  'barcodeDetection'
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
  showHistogram: false
};
const IMAGE_MAGNIFICATION_OPTIONS = [1, 2, 3, 4, 6, 8];
const DEFAULT_IMAGE_MAGNIFICATION = 2;
const DEFAULT_CAMERA_SELECTION = 'environment';
const CAMERA_FACING_OPTIONS = ['environment', 'user'];
const CAMERA_FACING_LABELS = {
  environment: 'Environment facing',
  user: 'Front facing'
};
const CAMERA_DEVICE_PREFIX = 'device:';

const MAX_CENTER_FPS = 30;
const METRICS_INTERVAL_MS = 250;
const PREVIEW_PROCESS_SCALE = 0.5;
const PREVIEW_PROCESS_MIN_SIZE = 256;
const BARCODE_DETECT_INTERVAL_MS = 800;
const BARCODE_DETECT_MAX_EDGE = 640;
const WIDE_OVERLAY_INTERVAL_MS = 2;

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

function getPreviewProcessSize(squareSize) {
  const scaled = Math.round(squareSize * PREVIEW_PROCESS_SCALE);
  return Math.max(PREVIEW_PROCESS_MIN_SIZE, Math.min(squareSize, scaled));
}

function normalizeQualityMetrics(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    focusScore: 'focusScore' in source
      ? Boolean(source.focusScore)
      : DEFAULT_QUALITY_METRICS.focusScore,
    showHistogram: 'showHistogram' in source
      ? Boolean(source.showHistogram)
      : DEFAULT_QUALITY_METRICS.showHistogram
  };
}

function normalizeImageMagnification(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return DEFAULT_IMAGE_MAGNIFICATION;
  }

  if (IMAGE_MAGNIFICATION_OPTIONS.includes(num)) {
    return num;
  }

  return IMAGE_MAGNIFICATION_OPTIONS.reduce((best, option) =>
    Math.abs(option - num) < Math.abs(best - num) ? option : best,
    DEFAULT_IMAGE_MAGNIFICATION);
}

function formatMagnificationLabel(value) {
  return `${Number(value)}×`;
}

function isDeviceCameraSelection(value) {
  return typeof value === 'string' && value.startsWith(CAMERA_DEVICE_PREFIX);
}

function getCameraDeviceId(selection) {
  return isDeviceCameraSelection(selection) ? selection.slice(CAMERA_DEVICE_PREFIX.length) : null;
}

function buildCameraDeviceSelectionId(deviceId) {
  return `${CAMERA_DEVICE_PREFIX}${deviceId}`;
}

function normalizeCameraSelection(value, availableDeviceIds = null) {
  if (CAMERA_FACING_OPTIONS.includes(value)) {
    return value;
  }

  if (isDeviceCameraSelection(value)) {
    const deviceId = getCameraDeviceId(value);
    if (!deviceId) {
      return DEFAULT_CAMERA_SELECTION;
    }

    if (!availableDeviceIds || availableDeviceIds.includes(deviceId)) {
      return value;
    }
  }

  return DEFAULT_CAMERA_SELECTION;
}

function getCameraSelectionLabel(selection, deviceLabel = '') {
  if (selection === 'environment' || selection === 'user') {
    return CAMERA_FACING_LABELS[selection];
  }

  if (isDeviceCameraSelection(selection)) {
    const trimmed = String(deviceLabel ?? '').trim();
    return trimmed || 'Camera';
  }

  return CAMERA_FACING_LABELS[DEFAULT_CAMERA_SELECTION];
}

function formatCameraDeviceLabel(device, index) {
  const label = String(device?.label ?? '').trim();
  if (label) {
    return label;
  }

  return `Camera ${index + 1}`;
}

function buildVideoConstraintsForCamera(selection, extras = {}) {
  const video = { ...extras };
  const normalized = normalizeCameraSelection(selection);
  const deviceId = getCameraDeviceId(normalized);

  if (deviceId) {
    delete video.facingMode;
    video.deviceId = extras.deviceId ?? { exact: deviceId };
    return video;
  }

  if (normalized === 'user') {
    video.facingMode = extras.facingMode ?? { ideal: 'user' };
    return video;
  }

  video.facingMode = extras.facingMode ?? { ideal: 'environment' };
  return video;
}

async function listVideoInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

function serializeCameraOptions(devices) {
  return devices.map((device, index) => ({
    deviceId: device.deviceId,
    label: formatCameraDeviceLabel(device, index)
  }));
}

function loadCameraOptions() {
  try {
    const raw = sessionStorage.getItem(CAMERA_OPTIONS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((device) =>
      device &&
      typeof device.deviceId === 'string' &&
      device.deviceId &&
      typeof device.label === 'string'
    );
  } catch {
    return [];
  }
}

function saveCameraOptions(devices) {
  sessionStorage.setItem(
    CAMERA_OPTIONS_KEY,
    JSON.stringify(serializeCameraOptions(devices))
  );
}

async function refreshAndStoreCameraOptions() {
  const devices = await listVideoInputDevices();
  saveCameraOptions(devices);
  return devices;
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

function getDefaultSettings() {
  return {
    imageLabel: DEFAULT_IMAGE_LABEL,
    imageCounter: DEFAULT_IMAGE_COUNTER,
    imageResolution: DEFAULT_IMAGE_RESOLUTION,
    cameraSelection: DEFAULT_CAMERA_SELECTION,
    imageMagnification: DEFAULT_IMAGE_MAGNIFICATION,
    cropSize: DEFAULT_CROP_SIZE,
    qualityMetrics: { ...DEFAULT_QUALITY_METRICS },
    imageProcessing: 'none',
    movingAverageRatio: DEFAULT_MOVING_AVERAGE_RATIO,
    barcodeDecoder: DEFAULT_BARCODE_DECODER,
    barcodeFormat: DEFAULT_BARCODE_FORMAT
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return getDefaultSettings();
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

    return {
      imageLabel: typeof parsed.imageLabel === 'string' && parsed.imageLabel.trim()
        ? parsed.imageLabel
        : DEFAULT_IMAGE_LABEL,
      imageCounter: Number.isFinite(imageCounter) && imageCounter >= 1
        ? Math.floor(imageCounter)
        : DEFAULT_IMAGE_COUNTER,
      imageResolution,
      cameraSelection: normalizeCameraSelection(parsed.cameraSelection),
      imageMagnification: normalizeImageMagnification(
        parsed.imageMagnification ?? DEFAULT_IMAGE_MAGNIFICATION
      ),
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
    return getDefaultSettings();
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

function labelEndsWithNumber(label) {
  return /\d+$/.test(String(label ?? '').trim());
}

function incrementLabelTrailingNumber(label) {
  const trimmed = String(label ?? '').trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return trimmed;

  const prefix = match[1];
  const digits = match[2];
  const next = Number(digits) + 1;
  if (!Number.isFinite(next)) return trimmed;

  return `${prefix}${String(next).padStart(digits.length, '0')}`;
}

function buildImageFilename(settings, focusScoreTag = '') {
  const base = sanitizeImageLabel(settings.imageLabel);
  const counter = Number.isFinite(Number(settings.imageCounter)) && Number(settings.imageCounter) >= 1
    ? Number(settings.imageCounter)
    : DEFAULT_IMAGE_COUNTER;
  const focusSuffix = focusScoreTag ? `_${focusScoreTag}` : '';
  return `${base}_seq_${counter}${focusSuffix}.png`;
}

function incrementImageCounter(settings) {
  const current = Number.isFinite(Number(settings.imageCounter)) && Number(settings.imageCounter) >= 1
    ? Number(settings.imageCounter)
    : DEFAULT_IMAGE_COUNTER;
  settings.imageCounter = current + 1;
  saveSettings(settings);
}