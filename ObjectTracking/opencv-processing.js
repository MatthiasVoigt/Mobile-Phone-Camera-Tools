const OPENCV_SCRIPT_URL = 'https://docs.opencv.org/4.9.0/opencv.js';
const MAX_VISUALIZED_FEATURES = 100;
const MATCH_RATIO_THRESHOLD = 0.75;
const MIN_MATCHES_FOR_HOMOGRAPHY = 8;

let openCvReadyPromise = null;

function isOpenCvReady() {
  return Boolean(window.cv && cv.Mat && cv.imread);
}

function loadOpenCv() {
  if (isOpenCvReady()) {
    return Promise.resolve();
  }

  if (openCvReadyPromise) {
    return openCvReadyPromise;
  }

  openCvReadyPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (isOpenCvReady()) {
        resolve();
      } else {
        reject(new Error('OpenCV failed to initialize.'));
      }
    };

    const script = document.createElement('script');
    script.src = OPENCV_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (isOpenCvReady()) {
        finish();
        return;
      }

      cv['onRuntimeInitialized'] = () => finish();
    };
    script.onerror = () => reject(new Error('Could not load OpenCV.js.'));
    document.head.appendChild(script);
  });

  return openCvReadyPromise;
}

function imageDataToGrayMat(imageData) {
  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

function imageDataToRgbaMat(imageData) {
  return cv.matFromImageData(imageData);
}

function matToImageData(mat) {
  const canvas = document.createElement('canvas');
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  cv.imshow(canvas, mat);
  const ctx = canvas.getContext('2d');
  return ctx.getImageData(0, 0, mat.cols, mat.rows);
}

function applyBlurKernel3(imageData) {
  const src = imageDataToRgbaMat(imageData);
  const dst = new cv.Mat();

  try {
    const ksize = new cv.Size(3, 3);
    cv.GaussianBlur(src, dst, ksize, 0, 0, cv.BORDER_DEFAULT);
    return matToImageData(dst);
  } finally {
    src.delete();
    dst.delete();
  }
}

function preprocessImageData(imageData, applyBlur) {
  if (!applyBlur) {
    return cloneImageData(imageData);
  }

  return applyBlurKernel3(imageData);
}

function createFeatureDetector(detectorId) {
  switch (detectorId) {
    case 'akaze':
      return cv.AKAZE ? new cv.AKAZE() : null;
    case 'brisk':
      return cv.BRISK ? new cv.BRISK() : null;
    case 'fast':
      return cv.FastFeatureDetector ? new cv.FastFeatureDetector(25, true) : null;
    case 'kaze':
      return cv.KAZE ? new cv.KAZE() : null;
    case 'sift':
      return cv.SIFT_create ? cv.SIFT_create() : null;
    case 'orb':
    default:
      return cv.ORB ? new cv.ORB(500) : null;
  }
}

function getDetectorConfigDescription(detectorId) {
  switch (detectorId) {
    case 'akaze':
      return 'AKAZE · L2 matcher';
    case 'brisk':
      return 'BRISK · Hamming matcher';
    case 'fast':
      return 'FAST · ORB descriptors · Hamming matcher';
    case 'kaze':
      return 'KAZE · L2 matcher';
    case 'sift':
      return 'SIFT · L2 matcher';
    case 'orb':
    default:
      return 'ORB · 500 features · Hamming matcher';
  }
}

function getMatcherNorm(detectorId) {
  switch (detectorId) {
    case 'orb':
    case 'brisk':
    case 'fast':
      return cv.NORM_HAMMING;
    default:
      return cv.NORM_L2;
  }
}

function keypointVectorToArray(keypoints) {
  const items = [];
  const size = typeof keypoints.size === 'function' ? keypoints.size() : keypoints.length;

  for (let i = 0; i < size; i++) {
    items.push(typeof keypoints.get === 'function' ? keypoints.get(i) : keypoints[i]);
  }

  return items;
}

function getTopKeypoints(keypoints, limit = MAX_VISUALIZED_FEATURES) {
  return keypointVectorToArray(keypoints)
    .sort((a, b) => b.response - a.response)
    .slice(0, limit);
}

function arrayToKeypointVector(keypoints) {
  const vector = new cv.KeyPointVector();
  keypoints.forEach((point) => vector.push_back(point));
  return vector;
}

function cloneDescriptorMat(descriptors) {
  const cloned = new cv.Mat();
  descriptors.copyTo(cloned);
  return cloned;
}

function releaseReferenceFeatures(referenceFeatures) {
  if (!referenceFeatures) {
    return;
  }

  referenceFeatures.descriptors?.delete?.();
  referenceFeatures.keypointVector?.delete?.();
}

function detectAndComputeFeatures(imageData, detectorId) {
  const detector = createFeatureDetector(detectorId);
  if (!detector) {
    throw new Error(`Feature detector "${detectorId}" is not available in this OpenCV build.`);
  }

  const gray = imageDataToGrayMat(imageData);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();

  try {
    if (detectorId === 'fast') {
      detector.detect(gray, keypoints);
      if (!cv.ORB) {
        throw new Error('ORB is required to compute descriptors for FAST keypoints.');
      }
      const orb = new cv.ORB(500);
      try {
        orb.compute(gray, keypoints, descriptors);
      } finally {
        orb.delete();
      }
    } else if (typeof detector.detectAndCompute === 'function') {
      detector.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors);
    } else if (typeof detector.detect === 'function') {
      detector.detect(gray, keypoints);
    } else {
      throw new Error(`Feature detector "${detectorId}" does not support detection.`);
    }

    return { keypoints, descriptors };
  } finally {
    gray.delete();
    if (typeof detector.delete === 'function') {
      detector.delete();
    }
  }
}

function extractReferenceFeatures(imageData, detectorId) {
  const { keypoints, descriptors } = detectAndComputeFeatures(imageData, detectorId);
  const allKeypoints = keypointVectorToArray(keypoints);
  const visualizationKeypoints = getTopKeypoints(keypoints);
  const storedDescriptors = cloneDescriptorMat(descriptors);

  keypoints.delete();
  descriptors.delete();

  return {
    detectorId,
    configDescription: getDetectorConfigDescription(detectorId),
    keypoints: allKeypoints,
    keypointVector: arrayToKeypointVector(allKeypoints),
    descriptors: storedDescriptors,
    totalCount: allKeypoints.length,
    visualizedCount: visualizationKeypoints.length
  };
}

function detectFeatures(imageData, detectorId) {
  const { keypoints } = detectAndComputeFeatures(imageData, detectorId);
  try {
    return getTopKeypoints(keypoints);
  } finally {
    keypoints.delete();
  }
}

function drawFeaturesOnImage(imageData, keypoints) {
  const rgba = imageDataToRgbaMat(imageData);
  const output = new cv.Mat();

  try {
    const vector = arrayToKeypointVector(keypoints);
    const color = new cv.Scalar(0, 255, 120, 255);
    cv.drawKeypoints(rgba, vector, output, color);
    vector.delete();
    return matToImageData(output);
  } finally {
    rgba.delete();
    output.delete();
  }
}

function filterGoodMatches(knnMatches) {
  const goodMatches = [];

  for (let i = 0; i < knnMatches.size(); i++) {
    const pair = knnMatches.get(i);
    if (pair.size() < 2) {
      continue;
    }

    const best = pair.get(0);
    const second = pair.get(1);
    if (best.distance < MATCH_RATIO_THRESHOLD * second.distance) {
      goodMatches.push(best);
    }
  }

  return goodMatches;
}

function estimatePlanarPatternCenter(referenceFeatures, frameImageData, referenceSize) {
  const { keypoints, descriptors } = detectAndComputeFeatures(
    frameImageData,
    referenceFeatures.detectorId
  );

  const extractedCount = keypoints.size();
  const result = {
    extractedCount,
    matchedCount: 0,
    found: false,
    center: null,
    crossSegments: null
  };

  if (!extractedCount || referenceFeatures.totalCount === 0 || descriptors.rows === 0) {
    keypoints.delete();
    descriptors.delete();
    return result;
  }

  const matcher = new cv.BFMatcher(getMatcherNorm(referenceFeatures.detectorId), false);
  const knnMatches = new cv.DMatchVectorVector();

  try {
    matcher.knnMatch(referenceFeatures.descriptors, descriptors, knnMatches, 2);
    const goodMatches = filterGoodMatches(knnMatches);
    result.matchedCount = goodMatches.length;

    if (goodMatches.length < MIN_MATCHES_FOR_HOMOGRAPHY) {
      return result;
    }

    const frameKeypoints = keypointVectorToArray(keypoints);
    const refPoints = [];
    const framePoints = [];

    goodMatches.forEach((match) => {
      const refPoint = referenceFeatures.keypoints[match.queryIdx];
      const framePoint = frameKeypoints[match.trainIdx];
      refPoints.push(refPoint.pt.x, refPoint.pt.y);
      framePoints.push(framePoint.pt.x, framePoint.pt.y);
    });

    const srcMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, refPoints);
    const dstMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, framePoints);
    const mask = new cv.Mat();
    const homography = cv.findHomography(srcMat, dstMat, cv.RANSAC, 5, mask);

    try {
      if (homography.empty()) {
        return result;
      }

      const centerX = referenceSize.width / 2;
      const centerY = referenceSize.height / 2;
      const crossSize = Math.min(referenceSize.width, referenceSize.height) * 0.18;
      const srcCenter = cv.matFromArray(1, 1, cv.CV_32FC2, [centerX, centerY]);
      const dstCenter = new cv.Mat();
      cv.perspectiveTransform(srcCenter, dstCenter, homography);

      const horizontalSrc = cv.matFromArray(2, 1, cv.CV_32FC2, [
        centerX - crossSize, centerY,
        centerX + crossSize, centerY
      ]);
      const verticalSrc = cv.matFromArray(2, 1, cv.CV_32FC2, [
        centerX, centerY - crossSize,
        centerX, centerY + crossSize
      ]);
      const horizontalDst = new cv.Mat();
      const verticalDst = new cv.Mat();
      cv.perspectiveTransform(horizontalSrc, horizontalDst, homography);
      cv.perspectiveTransform(verticalSrc, verticalDst, homography);

      result.found = true;
      result.center = {
        x: dstCenter.data32F[0],
        y: dstCenter.data32F[1]
      };
      result.crossSegments = [
        {
          x1: horizontalDst.data32F[0],
          y1: horizontalDst.data32F[1],
          x2: horizontalDst.data32F[2],
          y2: horizontalDst.data32F[3]
        },
        {
          x1: verticalDst.data32F[0],
          y1: verticalDst.data32F[1],
          x2: verticalDst.data32F[2],
          y2: verticalDst.data32F[3]
        }
      ];

      srcCenter.delete();
      dstCenter.delete();
      horizontalSrc.delete();
      verticalSrc.delete();
      horizontalDst.delete();
      verticalDst.delete();
    } finally {
      srcMat.delete();
      dstMat.delete();
      mask.delete();
      homography.delete();
    }

    return result;
  } finally {
    matcher.delete();
    knnMatches.delete();
    keypoints.delete();
    descriptors.delete();
  }
}

function getCenterCropRegion(videoWidth, videoHeight, cropSize) {
  const squareSize = Math.min(cropSize, videoWidth, videoHeight);
  return {
    sqX: Math.floor((videoWidth - squareSize) / 2),
    sqY: Math.floor((videoHeight - squareSize) / 2),
    squareSize
  };
}

function captureCenterCrop(video, cropSize) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return null;
  }

  const { sqX, sqY, squareSize } = getCenterCropRegion(vw, vh, cropSize);
  const canvas = document.createElement('canvas');
  canvas.width = squareSize;
  canvas.height = squareSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, sqX, sqY, squareSize, squareSize, 0, 0, squareSize, squareSize);
  return ctx.getImageData(0, 0, squareSize, squareSize);
}

function captureVideoFrame(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, vw, vh);
  return ctx.getImageData(0, 0, vw, vh);
}

function cloneImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

function putImageDataOnCanvas(canvas, imageData) {
  const ctx = canvas.getContext('2d');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
}

function drawPerspectiveCross(ctx, trackingResult, scaleX, scaleY) {
  if (!trackingResult?.found || !trackingResult.crossSegments) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 4;

  trackingResult.crossSegments.forEach((segment) => {
    ctx.beginPath();
    ctx.moveTo(segment.x1 * scaleX, segment.y1 * scaleY);
    ctx.lineTo(segment.x2 * scaleX, segment.y2 * scaleY);
    ctx.stroke();
  });

  const centerX = trackingResult.center.x * scaleX;
  const centerY = trackingResult.center.y * scaleY;
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}