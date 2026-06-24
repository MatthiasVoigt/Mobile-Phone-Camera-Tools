#include <emscripten.h>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>

namespace {

constexpr int CANNY_THRESHOLD1 = 50;
constexpr int CANNY_THRESHOLD2 = 150;
constexpr int CANNY_APERTURE_SIZE = 3;
constexpr bool CANNY_L2_GRADIENT = false;

uint8_t* input_buffer = nullptr;
uint8_t* output_buffer = nullptr;
size_t buffer_bytes = 0;
int frame_width = 0;
int frame_height = 0;

std::vector<uint8_t> gray;
std::vector<float> temp;
std::vector<float> blurred;
std::vector<uint8_t> blurred_u8;
std::vector<int16_t> dx;
std::vector<int16_t> dy;
std::vector<float> mag;
std::vector<float> nms;
std::vector<uint8_t> edges;
std::vector<int> hysteresis_stack;
float gaussian_kernel[7];
bool gaussian_ready = false;

inline int borderIndex(int index, int limit) {
  if (index < 0) return 0;
  if (index >= limit) return limit - 1;
  return index;
}

void initGaussianKernel() {
  if (gaussian_ready) return;
  const int ksize = 2 * CANNY_APERTURE_SIZE + 1;
  const double sigma = 0.3 * ((ksize - 1) * 0.5 - 1.0) + 0.8;
  const int half = (ksize - 1) / 2;
  double sum = 0.0;
  for (int i = 0; i < ksize; i++) {
    const double x = i - half;
    const double value = std::exp(-(x * x) / (2.0 * sigma * sigma));
    gaussian_kernel[i] = static_cast<float>(value);
    sum += value;
  }
  for (int i = 0; i < ksize; i++) {
    gaussian_kernel[i] = static_cast<float>(gaussian_kernel[i] / sum);
  }
  gaussian_ready = true;
}

void ensureWorkspace(int width, int height) {
  const size_t pixels = static_cast<size_t>(width) * static_cast<size_t>(height);
  gray.resize(pixels);
  temp.resize(pixels);
  blurred.resize(pixels);
  blurred_u8.resize(pixels);
  dx.resize(pixels);
  dy.resize(pixels);
  mag.resize(pixels);
  nms.resize(pixels);
  edges.resize(pixels);
  hysteresis_stack.clear();
  hysteresis_stack.reserve(pixels / 8 + 64);
  frame_width = width;
  frame_height = height;
}

void rgbaToGray(const uint8_t* rgba, int width, int height) {
  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      const int idx = (y * width + x) * 4;
      const int r = rgba[idx];
      const int g = rgba[idx + 1];
      const int b = rgba[idx + 2];
      gray[static_cast<size_t>(y * width + x)] =
          static_cast<uint8_t>(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
}

void convolveSeparable(int width, int height) {
  const int radius = CANNY_APERTURE_SIZE;
  const int ksize = 2 * CANNY_APERTURE_SIZE + 1;

  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      float sum = 0.0f;
      for (int k = -radius; k <= radius; k++) {
        const int sx = borderIndex(x + k, width);
        sum += gray[static_cast<size_t>(y * width + sx)] * gaussian_kernel[k + radius];
      }
      temp[static_cast<size_t>(y * width + x)] = sum;
    }
  }

  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      float sum = 0.0f;
      for (int k = -radius; k <= radius; k++) {
        const int sy = borderIndex(y + k, height);
        sum += temp[static_cast<size_t>(sy * width + x)] * gaussian_kernel[k + radius];
      }
      blurred[static_cast<size_t>(y * width + x)] = sum;
    }
  }
}

void sobelGradients(int width, int height) {
  const int gxKernel[9] = {-1, 0, 1, -2, 0, 2, -1, 0, 1};
  const int gyKernel[9] = {-1, -2, -1, 0, 0, 0, 1, 2, 1};

  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      int gx = 0;
      int gy = 0;
      int ki = 0;
      for (int ky = -1; ky <= 1; ky++) {
        for (int kx = -1; kx <= 1; kx++) {
          const int px = borderIndex(x + kx, width);
          const int py = borderIndex(y + ky, height);
          const int value = blurred_u8[static_cast<size_t>(py * width + px)];
          gx += value * gxKernel[ki];
          gy += value * gyKernel[ki];
          ki++;
        }
      }
      const size_t idx = static_cast<size_t>(y * width + x);
      dx[idx] = static_cast<int16_t>(gx);
      dy[idx] = static_cast<int16_t>(gy);
      mag[idx] = CANNY_L2_GRADIENT
                     ? std::hypot(static_cast<float>(gx), static_cast<float>(gy))
                     : static_cast<float>(std::abs(gx) + std::abs(gy));
    }
  }
}

void nonMaxSuppression(int width, int height) {
  std::fill(nms.begin(), nms.end(), 0.0f);
  for (int y = 1; y < height - 1; y++) {
    for (int x = 1; x < width - 1; x++) {
      const int idx = y * width + x;
      const int gx = dx[static_cast<size_t>(idx)];
      const int gy = dy[static_cast<size_t>(idx)];
      const float magnitude = mag[static_cast<size_t>(idx)];
      float q = 0.0f;
      float r = 0.0f;

      const int absGx = std::abs(gx);
      const int absGy = std::abs(gy);

      if (absGx > absGy) {
        q = mag[static_cast<size_t>(idx + (gx > 0 ? 1 : -1))];
        r = mag[static_cast<size_t>(idx + (gx > 0 ? -1 : 1))];
      } else if (absGy > absGx) {
        q = mag[static_cast<size_t>(idx + (gy > 0 ? width : -width))];
        r = mag[static_cast<size_t>(idx + (gy > 0 ? -width : width))];
      } else {
        q = mag[static_cast<size_t>(idx + (gx > 0 && gy > 0 ? width + 1 : gx > 0 ? width - 1 : gy > 0 ? -width + 1 : -width - 1))];
        r = mag[static_cast<size_t>(idx + (gx > 0 && gy > 0 ? -width - 1 : gx > 0 ? -width + 1 : gy > 0 ? width - 1 : width + 1))];
      }

      nms[static_cast<size_t>(idx)] = (magnitude >= q && magnitude >= r) ? magnitude : 0.0f;
    }
  }
}

void hysteresis(int width, int height, float low, float high) {
  std::fill(edges.begin(), edges.end(), 0);
  const uint8_t weak = 1;
  const uint8_t strong = 2;
  hysteresis_stack.clear();

  for (int y = 0; y < height; y++) {
    for (int x = 0; x < width; x++) {
      const size_t idx = static_cast<size_t>(y * width + x);
      const float value = nms[idx];
      if (value >= high) {
        edges[idx] = strong;
        hysteresis_stack.push_back(static_cast<int>(idx));
      } else if (value >= low) {
        edges[idx] = weak;
      }
    }
  }

  size_t stack_pos = 0;
  while (stack_pos < hysteresis_stack.size()) {
    const int idx = hysteresis_stack[stack_pos++];
    const int x = idx % width;
    const int y = idx / width;
    for (int ny = y - 1; ny <= y + 1; ny++) {
      for (int nx = x - 1; nx <= x + 1; nx++) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const size_t nidx = static_cast<size_t>(ny * width + nx);
        if (edges[nidx] == weak) {
          edges[nidx] = strong;
          hysteresis_stack.push_back(static_cast<int>(nidx));
        }
      }
    }
  }

  for (uint8_t& edge : edges) {
    edge = edge == strong ? 255 : 0;
  }
}

void grayEdgesToRgba(uint8_t* rgba) {
  const size_t count = edges.size();
  for (size_t i = 0; i < count; i++) {
    const uint8_t value = edges[i];
    const size_t offset = i * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init_buffers(int width, int height) {
  if (width <= 0 || height <= 0) return;

  initGaussianKernel();
  ensureWorkspace(width, height);

  const size_t bytes = static_cast<size_t>(width) * static_cast<size_t>(height) * 4;
  if (!input_buffer || !output_buffer || bytes != buffer_bytes) {
    if (input_buffer) std::free(input_buffer);
    if (output_buffer) std::free(output_buffer);
    input_buffer = static_cast<uint8_t*>(std::malloc(bytes));
    output_buffer = static_cast<uint8_t*>(std::malloc(bytes));
    buffer_bytes = bytes;
  }
}

EMSCRIPTEN_KEEPALIVE
uint8_t* get_input_buffer() { return input_buffer; }

EMSCRIPTEN_KEEPALIVE
uint8_t* get_output_buffer() { return output_buffer; }

EMSCRIPTEN_KEEPALIVE
void process_canny(int width, int height) {
  if (!input_buffer || !output_buffer) return;
  if (width != frame_width || height != frame_height) {
    init_buffers(width, height);
  }

  rgbaToGray(input_buffer, width, height);
  convolveSeparable(width, height);

  for (size_t i = 0; i < blurred.size(); i++) {
    blurred_u8[i] = static_cast<uint8_t>(blurred[i]);
  }

  sobelGradients(width, height);
  nonMaxSuppression(width, height);
  hysteresis(width, height, static_cast<float>(CANNY_THRESHOLD1),
               static_cast<float>(CANNY_THRESHOLD2));
  grayEdgesToRgba(output_buffer);
}

}