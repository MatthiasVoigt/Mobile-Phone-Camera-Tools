const DEFAULT_CAMERA_SELECTION = 'environment';
const CAMERA_FACING_OPTIONS = ['environment', 'user'];
const CAMERA_FACING_LABELS = {
  environment: 'Environment facing (rear)',
  user: 'Front facing (selfie)'
};
const CAMERA_DEVICE_PREFIX = 'device:';

const PROPERTY_LABELS = {
  width: 'Width',
  height: 'Height',
  aspectRatio: 'Aspect ratio',
  frameRate: 'Frame rate',
  facingMode: 'Facing mode',
  resizeMode: 'Resize mode',
  zoom: 'Zoom',
  torch: 'Torch',
  focusMode: 'Focus mode',
  focusDistance: 'Focus distance',
  exposureMode: 'Exposure mode',
  exposureCompensation: 'Exposure compensation',
  exposureTime: 'Exposure time',
  whiteBalanceMode: 'White balance mode',
  colorTemperature: 'Color temperature',
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  sharpness: 'Sharpness',
  iso: 'ISO',
  pan: 'Pan',
  tilt: 'Tilt',
  pointsOfInterest: 'Points of interest',
  deviceId: 'Device ID',
  groupId: 'Group ID'
};

const COMMON_VIDEO_PROPERTIES = [
  'width',
  'height',
  'aspectRatio',
  'frameRate',
  'facingMode',
  'resizeMode',
  'zoom',
  'torch',
  'focusMode',
  'focusDistance',
  'exposureMode',
  'exposureCompensation',
  'exposureTime',
  'whiteBalanceMode',
  'colorTemperature',
  'brightness',
  'contrast',
  'saturation',
  'sharpness',
  'iso',
  'pan',
  'tilt',
  'pointsOfInterest'
];

function isDeviceCameraSelection(value) {
  return typeof value === 'string' && value.startsWith(CAMERA_DEVICE_PREFIX);
}

function getCameraDeviceId(selection) {
  return isDeviceCameraSelection(selection) ? selection.slice(CAMERA_DEVICE_PREFIX.length) : null;
}

function buildCameraDeviceSelectionId(deviceId) {
  return `${CAMERA_DEVICE_PREFIX}${deviceId}`;
}

function normalizeCameraSelection(value) {
  if (CAMERA_FACING_OPTIONS.includes(value)) {
    return value;
  }

  if (isDeviceCameraSelection(value) && getCameraDeviceId(value)) {
    return value;
  }

  return DEFAULT_CAMERA_SELECTION;
}

function formatCameraDeviceLabel(device, index) {
  const label = String(device?.label ?? '').trim();
  return label || `Camera ${index + 1}`;
}

function buildVideoConstraintsForCamera(selection) {
  const normalized = normalizeCameraSelection(selection);
  const deviceId = getCameraDeviceId(normalized);

  if (deviceId) {
    return { deviceId: { exact: deviceId } };
  }

  if (normalized === 'user') {
    return { facingMode: { ideal: 'user' } };
  }

  return { facingMode: { ideal: 'environment' } };
}

async function listVideoInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

function getPropertyLabel(key) {
  return PROPERTY_LABELS[key] || key;
}

function formatDisplayValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatDisplayValue(item)).join(', ');
  }

  if (typeof value === 'object') {
    const parts = [];

    if ('min' in value) parts.push(`min ${value.min}`);
    if ('max' in value) parts.push(`max ${value.max}`);
    if ('step' in value) parts.push(`step ${value.step}`);
    if ('exact' in value) parts.push(`exact ${formatDisplayValue(value.exact)}`);
    if ('ideal' in value) parts.push(`ideal ${formatDisplayValue(value.ideal)}`);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    return JSON.stringify(value);
  }

  return String(value);
}

function capabilityIsAdjustable(capability) {
  if (capability === undefined || capability === null) {
    return false;
  }

  if (typeof capability === 'boolean') {
    return true;
  }

  if (Array.isArray(capability)) {
    return capability.length > 1;
  }

  if (typeof capability === 'object') {
    if ('min' in capability && 'max' in capability) {
      return capability.min !== capability.max;
    }

    return Object.keys(capability).length > 0;
  }

  return false;
}

function buildCapabilityRows(capabilities, settings) {
  const capabilityKeys = new Set([
    ...COMMON_VIDEO_PROPERTIES,
    ...Object.keys(capabilities || {}),
    ...Object.keys(settings || {})
  ]);

  const rows = [];

  for (const key of capabilityKeys) {
    const capability = capabilities?.[key];
    const setting = settings?.[key];
    const supported = capability !== undefined;

    let changeType = 'Not supported';
    let allowedValues = 'Not supported';
    let currentValue = 'Not supported';

    if (supported) {
      changeType = capabilityIsAdjustable(capability) ? 'Adjustable' : 'Read-only';
      allowedValues = formatDisplayValue(capability) || '—';
      currentValue = setting !== undefined ? formatDisplayValue(setting) : '—';
    }

    rows.push({
      key,
      label: getPropertyLabel(key),
      changeType,
      allowedValues,
      currentValue
    });
  }

  rows.sort((a, b) => a.label.localeCompare(b.label));
  return rows;
}

function getCameraSelectionLabel(selection, deviceLabel = '') {
  if (selection === 'environment' || selection === 'user') {
    return CAMERA_FACING_LABELS[selection];
  }

  if (isDeviceCameraSelection(selection)) {
    const trimmed = String(deviceLabel ?? '').trim();
    return trimmed || 'Camera device';
  }

  return CAMERA_FACING_LABELS[DEFAULT_CAMERA_SELECTION];
}

function buildExportMetadata({ cameraLabel, deviceId, groupId, userAgent }) {
  return {
    cameraLabel: cameraLabel || CAMERA_FACING_LABELS[DEFAULT_CAMERA_SELECTION],
    deviceId: deviceId ? String(deviceId) : '—',
    groupId: groupId ? String(groupId) : '—',
    exportedAt: new Date().toISOString(),
    userAgent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '—')
  };
}

function formatExportTimestamp(isoString) {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

function padTableCell(value, width) {
  const text = String(value);
  if (text.length >= width) {
    return `${text.slice(0, width - 1)}…`;
  }

  return `${text}${' '.repeat(width - text.length)}`;
}

function escapeMarkdownTableCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function sanitizeExportFilename(cameraLabel) {
  const slug = String(cameraLabel ?? '')
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'camera';
}

function formatCapabilitiesAsText(metadata, rows) {
  const lines = [
    'Camera Capabilities Export',
    '==========================',
    '',
    `Camera: ${metadata.cameraLabel}`,
    `Device ID: ${metadata.deviceId}`,
    `Group ID: ${metadata.groupId}`,
    `Exported: ${formatExportTimestamp(metadata.exportedAt)}`,
    `User agent: ${metadata.userAgent}`,
    '',
    'Capabilities',
    '------------'
  ];

  const propertyWidth = 24;
  const statusWidth = 16;
  const allowedWidth = 28;
  const currentWidth = 20;

  lines.push(
    `${padTableCell('Property', propertyWidth)}  ` +
    `${padTableCell('Status', statusWidth)}  ` +
    `${padTableCell('Allowed values', allowedWidth)}  ` +
    padTableCell('Current value', currentWidth)
  );
  lines.push(
    `${'-'.repeat(propertyWidth)}  ` +
    `${'-'.repeat(statusWidth)}  ` +
    `${'-'.repeat(allowedWidth)}  ` +
    '-'.repeat(currentWidth)
  );

  for (const row of rows) {
    lines.push(
      `${padTableCell(row.label, propertyWidth)}  ` +
      `${padTableCell(row.changeType, statusWidth)}  ` +
      `${padTableCell(row.allowedValues, allowedWidth)}  ` +
      padTableCell(row.currentValue, currentWidth)
    );
  }

  return `${lines.join('\n')}\n`;
}

function formatCapabilitiesAsMarkdown(metadata, rows) {
  const lines = [
    '# Camera Capabilities Export',
    '',
    '## Metadata',
    '',
    `- **Camera:** ${metadata.cameraLabel}`,
    `- **Device ID:** ${metadata.deviceId}`,
    `- **Group ID:** ${metadata.groupId}`,
    `- **Exported:** ${formatExportTimestamp(metadata.exportedAt)}`,
    `- **User agent:** ${metadata.userAgent}`,
    '',
    '## Capabilities',
    '',
    '| Property | Status | Allowed values | Current value |',
    '| --- | --- | --- | --- |'
  ];

  for (const row of rows) {
    lines.push(
      `| ${escapeMarkdownTableCell(row.label)} ` +
      `| ${escapeMarkdownTableCell(row.changeType)} ` +
      `| ${escapeMarkdownTableCell(row.allowedValues)} ` +
      `| ${escapeMarkdownTableCell(row.currentValue)} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function downloadTextFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}