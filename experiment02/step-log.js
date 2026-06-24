(function (global) {
  const MAX_LINES = 80;
  const lines = [];
  let lastStep = '—';
  let logEl = null;
  let lastStepEl = null;
  let copyBtn = null;
  let frameCounter = 0;
  let copyResetTimer = null;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function timestamp() {
    const now = new Date();
    return pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()) +
      '.' + String(now.getMilliseconds()).padStart(3, '0');
  }

  function getLogText() {
    const header = 'Last step: ' + lastStep;
    if (lines.length === 0) return header + '\n';
    return header + '\n\n' + lines.join('\n');
  }

  function render() {
    if (!logEl) logEl = document.getElementById('stepLog');
    if (!lastStepEl) lastStepEl = document.getElementById('lastStep');
    if (lastStepEl) lastStepEl.textContent = 'Last step: ' + lastStep;
    if (!logEl) return;
    logEl.textContent = lines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function append(message) {
    lines.push('[' + timestamp() + '] ' + message);
    while (lines.length > MAX_LINES) lines.shift();
    render();
  }

  function step(message) {
    lastStep = message;
    append(message);
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
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
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (!copied) throw new Error('Copy command was blocked');
  }

  function setCopyButtonLabel(label) {
    if (copyBtn) copyBtn.textContent = label;
  }

  async function copyLog() {
    const text = getLogText();
    try {
      await copyToClipboard(text);
      setCopyButtonLabel('Copied!');
      if (copyResetTimer) window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(() => setCopyButtonLabel('Copy log'), 1500);
    } catch (error) {
      step('ERROR: Copy log failed: ' + (error.message || error));
      setCopyButtonLabel('Copy failed');
      if (copyResetTimer) window.clearTimeout(copyResetTimer);
      copyResetTimer = window.setTimeout(() => setCopyButtonLabel('Copy log'), 2000);
    }
  }

  function bindElements() {
    logEl = document.getElementById('stepLog');
    lastStepEl = document.getElementById('lastStep');
    copyBtn = document.getElementById('copyStepLogBtn');
    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = '1';
      copyBtn.addEventListener('click', () => {
        copyLog();
      });
    }
    render();
  }

  global.Exp02Log = {
    step,
    log: append,
    error(message) {
      step('ERROR: ' + message);
    },
    nextFrame() {
      frameCounter += 1;
      return frameCounter;
    },
    frameCounter() {
      return frameCounter;
    },
    getLogText,
    copyLog,
    bindElements,
    clear() {
      lines.length = 0;
      lastStep = '—';
      frameCounter = 0;
      render();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindElements);
  } else {
    bindElements();
  }
})(window);