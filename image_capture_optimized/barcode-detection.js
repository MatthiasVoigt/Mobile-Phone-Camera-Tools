let zxingModule = null;
let zxingModuleReady = null;
let zxingLoadFailed = false;
let lastBarcodeResult = {
  text: null,
  box: null,
  decoder: null,
  format: null,
  notFound: true
};
let barcodeDetectPending = false;
let lastBarcodeDetectTime = 0;
let barcodeDetectionReady = false;

const ZXING_MODULE_URL = 'https://esm.sh/@zxing/library@0.21.3';

const detectCanvas = document.createElement('canvas');
const detectCtx = detectCanvas.getContext('2d', { willReadFrequently: true });

function resetBarcodeDetection() {
  lastBarcodeResult = {
    text: null,
    box: null,
    decoder: null,
    format: null,
    notFound: true
  };
  barcodeDetectPending = false;
  lastBarcodeDetectTime = 0;
  barcodeDetectionReady = false;
}

function getLastBarcodeResult() {
  return lastBarcodeResult;
}

function enableBarcodeDetection() {
  barcodeDetectionReady = true;
}

function ensureZxingModule() {
  if (zxingLoadFailed) {
    return Promise.reject(new Error('ZXing unavailable'));
  }
  if (!zxingModuleReady) {
    zxingModuleReady = import(ZXING_MODULE_URL)
      .then((mod) => {
        zxingModule = mod;
        return mod;
      })
      .catch((err) => {
        zxingLoadFailed = true;
        zxingModuleReady = null;
        throw err;
      });
  }
  return zxingModuleReady;
}

function boundingBoxFromPoints(points) {
  if (!points || points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.getX());
    minY = Math.min(minY, point.getY());
    maxY = Math.max(maxY, point.getY());
    maxX = Math.max(maxX, point.getX());
  }

  const pad = 8;
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2
  };
}

function getDetectionSize(width, height) {
  const longest = Math.max(width, height);
  if (longest <= BARCODE_DETECT_MAX_EDGE) {
    return { width, height, scale: 1 };
  }

  const scale = BARCODE_DETECT_MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale
  };
}

function prepareDetectionCanvas(sourceCanvas) {
  const { width, height, scale } = getDetectionSize(sourceCanvas.width, sourceCanvas.height);

  detectCanvas.width = width;
  detectCanvas.height = height;
  detectCtx.imageSmoothingEnabled = false;
  detectCtx.drawImage(sourceCanvas, 0, 0, width, height);

  return { canvas: detectCanvas, scale };
}

function scaleBarcodeBox(box, scale) {
  if (!box || scale === 1) return box;

  const inv = 1 / scale;
  return {
    x: box.x * inv,
    y: box.y * inv,
    w: box.w * inv,
    h: box.h * inv
  };
}

function buildDecodeHints(zxing, formatConfig) {
  const { DecodeHintType, BarcodeFormat } = zxing;
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat[formatConfig.zxing]]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

function formatFromZxingResult(result, zxing, formatConfig) {
  const barcodeFormat = result.getBarcodeFormat?.();
  if (barcodeFormat == null) return formatConfig.label;

  const { BarcodeFormat } = zxing;
  for (const format of BARCODE_FORMATS) {
    if (BarcodeFormat[format.zxing] === barcodeFormat) {
      return format.label;
    }
  }
  return formatConfig.label;
}

function formatFromNativeResult(code, formatConfig) {
  if (!code.format) return formatConfig.label;
  const match = BARCODE_FORMATS.find((format) => format.native === code.format);
  return match?.label || formatConfig.label;
}

function rgbaToGray(rgba, width, height) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    gray[p] = (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) | 0;
  }
  return gray;
}

function makeZxingResult(result, zxing, formatConfig, decoder) {
  return {
    text: result.getText(),
    box: boundingBoxFromPoints(result.getResultPoints()),
    decoder,
    format: formatFromZxingResult(result, zxing, formatConfig)
  };
}

async function detectWithZxingImageElement(canvas, zxing, hints, formatConfig) {
  const { BrowserMultiFormatReader } = zxing;
  const reader = new BrowserMultiFormatReader(hints);
  const img = new Image();

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = canvas.toDataURL('image/png');
  });

  const result = await reader.decodeFromImageElement(img);
  return makeZxingResult(result, zxing, formatConfig, 'ZXing Image');
}

function detectWithZxingBitmap(canvas, zxing, hints, formatConfig, decoder, BinarizerClass) {
  const { MultiFormatReader, RGBLuminanceSource, BinaryBitmap } = zxing;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = canvas.getContext('2d').getImageData(0, 0, width, height);
  const gray = rgbaToGray(imageData.data, width, height);
  const luminance = new RGBLuminanceSource(gray, width, height);

  const reader = new MultiFormatReader();
  reader.setHints(hints);
  const result = reader.decode(new BinaryBitmap(new BinarizerClass(luminance)));
  return makeZxingResult(result, zxing, formatConfig, decoder);
}

async function detectWithNativeApi(canvas, formatConfig) {
  if (!('BarcodeDetector' in window)) return null;

  try {
    const detector = new BarcodeDetector({ formats: [formatConfig.native] });
    const codes = await detector.detect(canvas);
    if (!codes.length) return null;

    const code = codes[0];
    const box = code.boundingBox;
    return {
      text: code.rawValue,
      box: {
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height
      },
      decoder: 'BarcodeDetector',
      format: formatFromNativeResult(code, formatConfig)
    };
  } catch {
    return null;
  }
}

async function detectBarcodeFromCanvas(sourceCanvas, settings) {
  const { canvas, scale } = prepareDetectionCanvas(sourceCanvas);
  const formatConfig = getBarcodeFormatConfig(settings.barcodeFormat);
  const decoder = settings.barcodeDecoder || DEFAULT_BARCODE_DECODER;

  let result = null;

  if (decoder === 'barcodeDetector') {
    result = await detectWithNativeApi(canvas, formatConfig);
  } else {
    const zxing = await ensureZxingModule();
    const hints = buildDecodeHints(zxing, formatConfig);

    try {
      if (decoder === 'zxingHybrid') {
        result = detectWithZxingBitmap(
          canvas,
          zxing,
          hints,
          formatConfig,
          'ZXing Bitmap (Hybrid)',
          zxing.HybridBinarizer
        );
      } else if (decoder === 'zxingGlobal') {
        result = detectWithZxingBitmap(
          canvas,
          zxing,
          hints,
          formatConfig,
          'ZXing Bitmap (Global)',
          zxing.GlobalHistogramBinarizer
        );
      } else if (decoder === 'zxingImage') {
        result = await detectWithZxingImageElement(canvas, zxing, hints, formatConfig);
      }
    } catch {
      result = null;
    }
  }

  if (!result) return null;

  return {
    ...result,
    box: scaleBarcodeBox(result.box, scale)
  };
}

function scheduleBarcodeDetection(canvas, settings) {
  if (!barcodeDetectionReady) return;

  const now = performance.now();
  if (barcodeDetectPending || now - lastBarcodeDetectTime < BARCODE_DETECT_INTERVAL_MS) {
    return;
  }

  barcodeDetectPending = true;
  lastBarcodeDetectTime = now;

  const frame = canvas;
  const scanSettings = { ...settings };

  setTimeout(() => {
    detectBarcodeFromCanvas(frame, scanSettings)
      .then((result) => {
        lastBarcodeResult = result
          ? {
              text: result.text,
              box: result.box,
              decoder: result.decoder,
              format: result.format,
              notFound: false
            }
          : {
              text: null,
              box: null,
              decoder: null,
              format: null,
              notFound: true
            };
      })
      .catch(() => {
        lastBarcodeResult = {
          text: null,
          box: null,
          decoder: null,
          format: null,
          notFound: true
        };
      })
      .finally(() => {
        barcodeDetectPending = false;
      });
  }, 0);
}

function drawBarcodeOverlay(ctx, result, canvasSize) {
  const fontSize = Math.max(12, Math.round(canvasSize * 0.028));
  const subFontSize = Math.max(10, Math.round(fontSize * 0.82));
  const padding = 6;
  const margin = 8;
  const lineGap = 3;
  const found = Boolean(result?.text);
  const line1 = found ? `${result.text} · ${result.decoder}` : 'No barcode found';
  const line2 = found ? result.format : null;

  ctx.save();
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  const line1Width = ctx.measureText(line1).width;
  let line2Width = 0;
  if (line2) {
    ctx.font = `500 ${subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    line2Width = ctx.measureText(line2).width;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  }

  const labelW = Math.min(Math.max(line1Width, line2Width) + padding * 2, canvasSize - margin * 2);
  const labelH = line2
    ? fontSize + subFontSize + padding * 2 + lineGap
    : fontSize + padding * 2;

  if (result?.box) {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = Math.max(2, canvasSize * 0.004);
    ctx.strokeRect(result.box.x, result.box.y, result.box.w, result.box.h);
  }

  ctx.fillStyle = found ? 'rgba(0, 0, 0, 0.72)' : 'rgba(40, 20, 20, 0.82)';
  ctx.fillRect(margin, margin, labelW, labelH);

  ctx.fillStyle = found ? '#ffffff' : '#ffb4b4';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(line1, margin + padding, margin + padding, labelW - padding * 2);

  if (line2) {
    ctx.fillStyle = '#d4d4d4';
    ctx.font = `500 ${subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(
      line2,
      margin + padding,
      margin + padding + fontSize + lineGap,
      labelW - padding * 2
    );
  }

  ctx.restore();
}