/* global cv, importScripts */
importScripts('https://docs.opencv.org/4.8.0/opencv.js');

const TRACK_MAX_SIZE = 480;
const ORB_FEATURES = 500;
const MIN_MATCHES = 8;
const MIN_INLIERS = 6;

const LOST_RESULT = { lost: true, corners: null, center: null };

const tracker = {
  active: false,
  trackScale: 1,
  displayScale: 1,
  centerW: 0,
  centerH: 0,
  refW: 0,
  refH: 0,
  orb: null,
  matcher: null,
  refKeypoints: null,
  refDescriptors: null
};

let cvReady = false;

cv.onRuntimeInitialized = () => {
  cvReady = true;
  self.postMessage({ type: 'opencvReady' });
};

function resetTracker() {
  tracker.active = false;
  tracker.trackScale = 1;
  tracker.displayScale = 1;
  tracker.centerW = 0;
  tracker.centerH = 0;
  tracker.refW = 0;
  tracker.refH = 0;

  if (tracker.refDescriptors) {
    tracker.refDescriptors.delete();
    tracker.refDescriptors = null;
  }
  if (tracker.refKeypoints) {
    tracker.refKeypoints.delete();
    tracker.refKeypoints = null;
  }
  if (tracker.orb) {
    tracker.orb.delete();
    tracker.orb = null;
  }
  if (tracker.matcher) {
    tracker.matcher.delete();
    tracker.matcher = null;
  }
}

function getTrackScale(width, height) {
  const maxDim = Math.max(width, height);
  if (maxDim <= TRACK_MAX_SIZE) return 1;
  return TRACK_MAX_SIZE / maxDim;
}

function imageDataToGrayMat(imageData) {
  const rgba = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

function scaleTrackingResult(result, displayScale) {
  if (!result || result.lost || !result.corners) return result;
  return {
    lost: false,
    corners: result.corners.map((corner) => ({
      x: corner.x * displayScale,
      y: corner.y * displayScale
    })),
    center: {
      x: result.center.x * displayScale,
      y: result.center.y * displayScale
    }
  };
}

function validateTrackedCorners(corners, refW, refH) {
  if (!corners || corners.length !== 4) return false;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) return false;
    minX = Math.min(minX, corner.x);
    minY = Math.min(minY, corner.y);
    maxX = Math.max(maxX, corner.x);
    maxY = Math.max(maxY, corner.y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (width < refW * 0.25 || height < refH * 0.25) return false;

  const refAspect = refW / refH;
  const boxAspect = width / Math.max(height, 1);
  if (Math.abs(boxAspect - refAspect) > refAspect * 1.2) return false;

  return true;
}

function cornersFromMat(mat) {
  const corners = [];
  for (let i = 0; i < 4; i++) {
    corners.push({
      x: mat.data32F[i * 2],
      y: mat.data32F[i * 2 + 1]
    });
  }

  return {
    lost: false,
    corners,
    center: {
      x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
      y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
    }
  };
}

function collectGoodMatches(matches, refKeypoints, frameKeypoints) {
  const refPoints = [];
  const framePoints = [];

  for (let i = 0; i < matches.size(); i++) {
    const match = matches.get(i);
    const refKp = refKeypoints.get(match.queryIdx);
    const frameKp = frameKeypoints.get(match.trainIdx);
    refPoints.push(refKp.pt.x, refKp.pt.y);
    framePoints.push(frameKp.pt.x, frameKp.pt.y);
  }

  return { refPoints, framePoints };
}

function countHomographyInliers(mask) {
  let inliers = 0;
  for (let i = 0; i < mask.rows; i++) {
    if (mask.data[i] === 1) inliers += 1;
  }
  return inliers;
}

function initTracker(reference, centerW, centerH, trackScale) {
  resetTracker();

  const refW = reference.width;
  const refH = reference.height;
  const scale = trackScale > 0 ? trackScale : getTrackScale(centerW, centerH);
  const refGray = imageDataToGrayMat(reference);
  const refKeypoints = new cv.KeyPointVector();
  const refDescriptors = new cv.Mat();
  const orb = cv.ORB.create(ORB_FEATURES);
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);

  const detectMask = new cv.Mat();
  orb.detectAndCompute(refGray, detectMask, refKeypoints, refDescriptors);
  refGray.delete();
  detectMask.delete();

  if (refKeypoints.size() < 4 || refDescriptors.empty()) {
    refKeypoints.delete();
    refDescriptors.delete();
    orb.delete();
    matcher.delete();
    return { success: false, result: LOST_RESULT };
  }

  tracker.orb = orb;
  tracker.matcher = matcher;
  tracker.refKeypoints = refKeypoints;
  tracker.refDescriptors = refDescriptors;
  tracker.centerW = centerW;
  tracker.centerH = centerH;
  tracker.refW = refW;
  tracker.refH = refH;
  tracker.trackScale = scale;
  tracker.displayScale = 1 / scale;
  tracker.active = true;

  return { success: true, result: LOST_RESULT };
}

function trackFrame(frame) {
  if (!tracker.active || !tracker.orb || !tracker.refDescriptors || !tracker.refKeypoints) {
    return LOST_RESULT;
  }

  const refW = tracker.refW * tracker.trackScale;
  const refH = tracker.refH * tracker.trackScale;
  let frameGray = null;
  let frameKeypoints = null;
  let frameDescriptors = null;
  let matches = null;
  let srcPoints = null;
  let dstPoints = null;
  let mask = null;
  let homography = null;
  let refCorners = null;
  let sceneCorners = null;

  try {
    frameGray = imageDataToGrayMat(frame);
    frameKeypoints = new cv.KeyPointVector();
    frameDescriptors = new cv.Mat();
    const detectMask = new cv.Mat();
    tracker.orb.detectAndCompute(frameGray, detectMask, frameKeypoints, frameDescriptors);
    frameGray.delete();
    frameGray = null;
    detectMask.delete();

    if (frameKeypoints.size() < 4 || frameDescriptors.empty()) {
      return LOST_RESULT;
    }

    matches = new cv.DMatchVector();
    tracker.matcher.match(tracker.refDescriptors, frameDescriptors, matches);

    if (matches.size() < MIN_MATCHES) {
      return LOST_RESULT;
    }

    const { refPoints, framePoints } = collectGoodMatches(
      matches,
      tracker.refKeypoints,
      frameKeypoints
    );

    srcPoints = cv.matFromArray(refPoints.length / 2, 1, cv.CV_32FC2, refPoints);
    dstPoints = cv.matFromArray(framePoints.length / 2, 1, cv.CV_32FC2, framePoints);
    mask = new cv.Mat();
    homography = cv.findHomography(srcPoints, dstPoints, cv.RANSAC, 4, mask);

    if (!homography || homography.empty()) {
      return LOST_RESULT;
    }

    if (countHomographyInliers(mask) < MIN_INLIERS) {
      return LOST_RESULT;
    }

    refCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      tracker.refW, 0,
      tracker.refW, tracker.refH,
      0, tracker.refH
    ]);
    sceneCorners = new cv.Mat();
    cv.perspectiveTransform(refCorners, sceneCorners, homography);

    const tracked = cornersFromMat(sceneCorners);
    if (!validateTrackedCorners(tracked.corners, refW, refH)) {
      return LOST_RESULT;
    }

    return scaleTrackingResult(tracked, tracker.displayScale);
  } catch (trackErr) {
    return LOST_RESULT;
  } finally {
    if (frameGray) frameGray.delete();
    if (frameKeypoints) frameKeypoints.delete();
    if (frameDescriptors) frameDescriptors.delete();
    if (matches) matches.delete();
    if (srcPoints) srcPoints.delete();
    if (dstPoints) dstPoints.delete();
    if (mask) mask.delete();
    if (homography) homography.delete();
    if (refCorners) refCorners.delete();
    if (sceneCorners) sceneCorners.delete();
  }
}

self.onmessage = (event) => {
  const message = event.data;

  if (!cvReady && message.type !== 'ping') {
    self.postMessage({ type: 'error', error: 'OpenCV not ready' });
    return;
  }

  try {
    if (message.type === 'ping') {
      self.postMessage({ type: 'pong', cvReady });
      return;
    }

    if (message.type === 'reset') {
      resetTracker();
      self.postMessage({ type: 'resetDone' });
      return;
    }

    if (message.type === 'init') {
      const outcome = initTracker(
        message.reference,
        message.centerW,
        message.centerH,
        message.trackScale
      );
      self.postMessage({
        type: 'initialized',
        generation: message.generation,
        success: outcome.success,
        result: outcome.result
      });
      return;
    }

    if (message.type === 'track') {
      const result = trackFrame(message.frame);
      self.postMessage({
        type: 'tracked',
        generation: message.generation,
        result
      });
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err && err.message ? err.message : String(err)
    });
  }
};