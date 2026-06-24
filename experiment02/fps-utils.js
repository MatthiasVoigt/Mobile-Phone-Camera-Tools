(function (global) {
  const WINDOW_MS = 1000;

  class FpsTracker {
    constructor() {
      this.timestamps = [];
      this.enabled = true;
    }

    record(now = performance.now()) {
      if (!this.enabled) return;
      this.timestamps.push(now);
      const cutoff = now - WINDOW_MS;
      while (this.timestamps.length > 0 && this.timestamps[0] < cutoff) {
        this.timestamps.shift();
      }
    }

    freeze() {
      this.enabled = false;
    }

    resume() {
      this.enabled = true;
      this.timestamps = [];
    }

    getFps(now = performance.now()) {
      const cutoff = now - WINDOW_MS;
      let count = 0;
      for (let i = this.timestamps.length - 1; i >= 0; i--) {
        if (this.timestamps[i] >= cutoff) count++;
        else break;
      }
      return count;
    }
  }

  function persistFps(storageKey, displayFps, processingFps, computeMs) {
    const existing = readStoredFps(storageKey);
    const payload = {
      displayFps,
      processingFps,
      updatedAt: new Date().toISOString(),
    };
    if (typeof computeMs === 'number') {
      payload.computeMs = computeMs;
    } else if (existing && typeof existing.computeMs === 'number') {
      payload.computeMs = existing.computeMs;
    }
    localStorage.setItem(storageKey, JSON.stringify(payload));
  }

  function readStoredFps(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  class TimingTracker {
    constructor() {
      this.samples = [];
      this.enabled = true;
      this.lastComputeMs = null;
    }

    record(sample, now = performance.now()) {
      if (!this.enabled) return;
      if (typeof sample.computeMs === 'number') {
        this.lastComputeMs = sample.computeMs;
      }
      this.samples.push({
        t: now,
        copyInMs: sample.copyInMs,
        computeMs: sample.computeMs,
        totalMs: sample.totalMs,
      });
      const cutoff = now - WINDOW_MS;
      while (this.samples.length > 0 && this.samples[0].t < cutoff) {
        this.samples.shift();
      }
    }

    freeze() {
      this.enabled = false;
    }

    resume() {
      this.enabled = true;
      this.samples = [];
    }

    getComputeMs(now = performance.now()) {
      const averages = this.getAverages(now);
      if (averages && typeof averages.computeMs === 'number') return averages.computeMs;
      return typeof this.lastComputeMs === 'number' ? this.lastComputeMs : null;
    }

    getAverages(now = performance.now()) {
      const cutoff = now - WINDOW_MS;
      let copyInMs = 0;
      let computeMs = 0;
      let totalMs = 0;
      let count = 0;

      for (let i = this.samples.length - 1; i >= 0; i--) {
        const sample = this.samples[i];
        if (sample.t < cutoff) break;
        copyInMs += sample.copyInMs;
        computeMs += sample.computeMs;
        totalMs += sample.totalMs;
        count++;
      }

      if (count === 0) return null;

      return {
        copyInMs: copyInMs / count,
        computeMs: computeMs / count,
        totalMs: totalMs / count,
        sampleCount: count,
      };
    }
  }

  global.Exp02Fps = {
    FpsTracker,
    TimingTracker,
    persistFps,
    readStoredFps,
  };
})(window);