(function (global) {
const { TimingTracker } = global.Exp02Fps;
const timingTracker = new TimingTracker();

const CANNY_THRESHOLD1 = 50;
const CANNY_THRESHOLD2 = 150;
const CANNY_APERTURE_SIZE = 3;
const CANNY_L2_GRADIENT = false;

function sigmaFromKernelSize(ksize) {
  if (ksize <= 1) return 0;
  return 0.3 * ((ksize - 1) * 0.5 - 1) + 0.8;
}

function createGaussianKernel1D(size, sigma) {
  const kernel = new Float32Array(size);
  const half = (size - 1) / 2;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    const value = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernel[i] = value;
    sum += value;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function borderIndex(index, limit) {
  if (index < 0) return 0;
  if (index >= limit) return limit - 1;
  return index;
}

function getGray(pixels, width, x, y) {
  const idx = (y * width + x) * 4;
  const r = pixels[idx];
  const g = pixels[idx + 1];
  const b = pixels[idx + 2];
  return (0.299 * r + 0.587 * g + 0.114 * b) | 0;
}

function rgbaToGray(pixels, width, height) {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      gray[y * width + x] = getGray(pixels, width, x, y);
    }
  }
  return gray;
}

function convolveSeparable(src, width, height, kernel) {
  const radius = (kernel.length - 1) >> 1;
  const temp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = borderIndex(x + k, width);
        sum += src[y * width + sx] * kernel[k + radius];
      }
      temp[y * width + x] = sum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = borderIndex(y + k, height);
        sum += temp[sy * width + x] * kernel[k + radius];
      }
      dst[y * width + x] = sum;
    }
  }

  return dst;
}

function sobelGradients(gray, width, height, apertureSize) {
  const dx = new Int16Array(width * height);
  const dy = new Int16Array(width * height);
  const mag = new Float32Array(width * height);

  const gxKernel = apertureSize === 3
    ? [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    : null;
  const gyKernel = apertureSize === 3
    ? [-1, -2, -1, 0, 0, 0, 1, 2, 1]
    : null;

  if (!gxKernel) {
    throw new Error(`Unsupported aperture size: ${apertureSize}`);
  }

  const half = 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let gx = 0;
      let gy = 0;
      let ki = 0;
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const px = borderIndex(x + kx, width);
          const py = borderIndex(y + ky, height);
          const value = gray[py * width + px];
          gx += value * gxKernel[ki];
          gy += value * gyKernel[ki];
          ki++;
        }
      }
      const idx = y * width + x;
      dx[idx] = gx;
      dy[idx] = gy;
      mag[idx] = CANNY_L2_GRADIENT
        ? Math.hypot(gx, gy)
        : Math.abs(gx) + Math.abs(gy);
    }
  }

  return { dx, dy, mag };
}

function nonMaxSuppression(mag, dx, dy, width, height) {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = dx[idx];
      const gy = dy[idx];
      const magnitude = mag[idx];
      let q = 0;
      let r = 0;

      const absGx = Math.abs(gx);
      const absGy = Math.abs(gy);

      if (absGx > absGy) {
        q = mag[idx + (gx > 0 ? 1 : -1)];
        r = mag[idx + (gx > 0 ? -1 : 1)];
      } else if (absGy > absGx) {
        q = mag[idx + (gy > 0 ? width : -width)];
        r = mag[idx + (gy > 0 ? -width : width)];
      } else {
        q = mag[idx + (gx > 0 && gy > 0 ? width + 1 : gx > 0 ? width - 1 : gy > 0 ? -width + 1 : -width - 1)];
        r = mag[idx + (gx > 0 && gy > 0 ? -width - 1 : gx > 0 ? -width + 1 : gy > 0 ? width - 1 : width + 1)];
      }

      out[idx] = magnitude >= q && magnitude >= r ? magnitude : 0;
    }
  }
  return out;
}

function hysteresis(nms, width, height, low, high) {
  const edges = new Uint8Array(width * height);
  const weak = 1;
  const strong = 2;
  const stack = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const value = nms[idx];
      if (value >= high) {
        edges[idx] = strong;
        stack.push(idx);
      } else if (value >= low) {
        edges[idx] = weak;
      }
    }
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % width;
    const y = (idx / width) | 0;
    for (let ny = y - 1; ny <= y + 1; ny++) {
      for (let nx = x - 1; nx <= x + 1; nx++) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (edges[nidx] === weak) {
          edges[nidx] = strong;
          stack.push(nidx);
        }
      }
    }
  }

  for (let i = 0; i < edges.length; i++) {
    edges[i] = edges[i] === strong ? 255 : 0;
  }
  return edges;
}

function grayEdgesToRgba(edges) {
  const rgba = new Uint8ClampedArray(edges.length * 4);
  for (let i = 0; i < edges.length; i++) {
    const value = edges[i];
    const offset = i * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function logStep(message) {
  if (global.Exp02Log) global.Exp02Log.step('[JS] ' + message);
}

function cannyEdgeDetect(imageData, width, height) {
  const t0 = performance.now();

  const ksize = 2 * CANNY_APERTURE_SIZE + 1;
  const sigma = sigmaFromKernelSize(ksize);
  const kernel = createGaussianKernel1D(ksize, sigma);

  logStep('rgbaToGray');
  const gray = rgbaToGray(imageData.data, width, height);
  logStep('convolveSeparable');
  const blurred = convolveSeparable(gray, width, height, kernel);
  const blurredU8 = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i++) blurredU8[i] = blurred[i];

  logStep('sobelGradients');
  const { dx, dy, mag } = sobelGradients(blurredU8, width, height, CANNY_APERTURE_SIZE);
  logStep('nonMaxSuppression');
  const nms = nonMaxSuppression(mag, dx, dy, width, height);
  logStep('hysteresis');
  const edges = hysteresis(nms, width, height, CANNY_THRESHOLD1, CANNY_THRESHOLD2);
  logStep('grayEdgesToRgba');
  const result = new ImageData(grayEdgesToRgba(edges), width, height);

  const computeMs = performance.now() - t0;
  timingTracker.record({ copyInMs: 0, computeMs, totalMs: computeMs });
  return result;
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

global.cannyEdgeDetect = cannyEdgeDetect;
global.Exp02Js = {
  getTimingAverages,
  getComputeMs,
  freezeTiming,
  resumeTiming,
};
})(window);