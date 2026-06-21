const TRACKING_SETTINGS_KEY = 'object-tracking-settings';
const CROP_SIZE_OPTIONS = [300, 500, 800, 1000];
const DEFAULT_CROP_SIZE = 300;
const FEATURE_DETECTOR_OPTIONS = ['orb', 'akaze', 'brisk', 'fast', 'kaze', 'sift'];
const DEFAULT_FEATURE_DETECTOR = 'orb';
const FEATURE_DETECTOR_LABELS = {
  orb: 'ORB',
  akaze: 'AKAZE',
  brisk: 'BRISK',
  fast: 'FAST',
  kaze: 'KAZE',
  sift: 'SIFT'
};

function getDefaultTrackingSettings() {
  return {
    testOpenCvIntegration: false,
    cropSize: DEFAULT_CROP_SIZE,
    featureDetector: DEFAULT_FEATURE_DETECTOR
  };
}

function normalizeCropSize(value) {
  const size = Number(value);
  return CROP_SIZE_OPTIONS.includes(size) ? size : DEFAULT_CROP_SIZE;
}

function normalizeFeatureDetector(value) {
  return FEATURE_DETECTOR_OPTIONS.includes(value) ? value : DEFAULT_FEATURE_DETECTOR;
}

function loadTrackingSettings() {
  try {
    const raw = localStorage.getItem(TRACKING_SETTINGS_KEY);
    if (!raw) {
      return getDefaultTrackingSettings();
    }

    const parsed = JSON.parse(raw);
    return {
      testOpenCvIntegration: Boolean(parsed.testOpenCvIntegration),
      cropSize: normalizeCropSize(parsed.cropSize),
      featureDetector: normalizeFeatureDetector(parsed.featureDetector)
    };
  } catch {
    return getDefaultTrackingSettings();
  }
}

function saveTrackingSettings(settings) {
  localStorage.setItem(TRACKING_SETTINGS_KEY, JSON.stringify(settings));
}

function getFeatureDetectorLabel(detectorId) {
  return FEATURE_DETECTOR_LABELS[detectorId] || FEATURE_DETECTOR_LABELS[DEFAULT_FEATURE_DETECTOR];
}