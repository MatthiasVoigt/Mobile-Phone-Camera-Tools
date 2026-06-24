#include <algorithm>
#include <cmath>
#include <cstdint>
#include <unordered_map>
#include <vector>

#include <emscripten.h>

namespace {

constexpr int kGaussian3x3[9] = {1, 2, 1, 2, 4, 2, 1, 2, 1};
constexpr float kGaussianSum = 16.0f;

std::vector<uint8_t> input_rgba;
std::vector<float> gray;
std::vector<float> blurred;
int buffer_width = 0;
int buffer_height = 0;

inline int clamp_int(int value, int min_value, int max_value) {
  return std::max(min_value, std::min(max_value, value));
}

inline float grayscale_from_rgba(const uint8_t* rgba, int index) {
  return 0.299f * rgba[index] + 0.587f * rgba[index + 1] + 0.114f * rgba[index + 2];
}

void ensure_workspace(int width, int height) {
  if (width == buffer_width && height == buffer_height) {
    return;
  }

  buffer_width = width;
  buffer_height = height;
  const size_t pixels = static_cast<size_t>(width) * static_cast<size_t>(height);
  input_rgba.resize(pixels * 4);
  gray.resize(pixels);
  blurred.resize(pixels);
}

void rgb_to_gray(int width, int height) {
  const size_t pixels = static_cast<size_t>(width) * static_cast<size_t>(height);
  for (size_t i = 0; i < pixels; ++i) {
    gray[i] = grayscale_from_rgba(input_rgba.data(), static_cast<int>(i) * 4);
  }
}

void gaussian_blur_3x3(int width, int height) {
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      float sum = 0.0f;
      int kernel_index = 0;

      for (int ky = -1; ky <= 1; ++ky) {
        for (int kx = -1; kx <= 1; ++kx) {
          const int sy = clamp_int(y + ky, 0, height - 1);
          const int sx = clamp_int(x + kx, 0, width - 1);
          sum += gray[sy * width + sx] * kGaussian3x3[kernel_index++];
        }
      }

      blurred[y * width + x] = sum / kGaussianSum;
    }
  }
}

float laplacian_at(int width, int x, int y) {
  const int idx = y * width + x;
  return blurred[idx - width] + blurred[idx - 1] - 4.0f * blurred[idx] + blurred[idx + 1] +
         blurred[idx + width];
}

double top_value_from_histogram(const std::unordered_map<int, int>& histogram, int top_rank) {
  if (histogram.empty() || top_rank <= 0) {
    return 0.0;
  }

  std::vector<std::pair<int, int>> entries;
  entries.reserve(histogram.size());
  for (const auto& entry : histogram) {
    entries.push_back(entry);
  }

  std::sort(entries.begin(), entries.end(),
            [](const std::pair<int, int>& a, const std::pair<int, int>& b) {
              return a.first > b.first;
            });

  int count = 0;
  for (const auto& entry : entries) {
    count += entry.second;
    if (count >= top_rank) {
      return static_cast<double>(entry.first);
    }
  }

  return static_cast<double>(entries.back().first);
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init_focus_buffers(int width, int height) {
  ensure_workspace(width, height);
}

EMSCRIPTEN_KEEPALIVE
uint8_t* get_focus_input_buffer() {
  return input_rgba.data();
}

EMSCRIPTEN_KEEPALIVE
double compute_focus_score(int width, int height, int top_rank) {
  if (width <= 0 || height <= 0 || top_rank <= 0) {
    return 0.0;
  }

  ensure_workspace(width, height);

  rgb_to_gray(width, height);
  gaussian_blur_3x3(width, height);

  std::unordered_map<int, int> histogram;
  for (int y = 1; y < height - 1; ++y) {
    for (int x = 1; x < width - 1; ++x) {
      const int key = static_cast<int>(std::lround(laplacian_at(width, x, y)));
      histogram[key]++;
    }
  }

  return top_value_from_histogram(histogram, top_rank);
}

}  // extern "C"