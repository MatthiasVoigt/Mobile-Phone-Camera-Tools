const SETTINGS_KEY = 'experiment1-settings';
const DEFAULT_CROP_SIZE = 1500;
const CROP_SIZE_OPTIONS = [500, 800, 1000, 1500];
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

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        cropSize: DEFAULT_CROP_SIZE,
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

    return {
      cropSize: CROP_SIZE_OPTIONS.includes(cropSize) ? cropSize : DEFAULT_CROP_SIZE,
      imageProcessing,
      movingAverageRatio: Number.isFinite(movingAverageRatio)
        ? clampMovingAverageRatio(movingAverageRatio)
        : DEFAULT_MOVING_AVERAGE_RATIO,
      barcodeDecoder,
      barcodeFormat
    };
  } catch {
    return {
      cropSize: DEFAULT_CROP_SIZE,
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