let spectorPromise = null;
let overlayShown = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-spector-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (window.SPECTOR) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.spectorSrc = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function ensureSpector() {
  if (!spectorPromise) {
    spectorPromise = (async () => {
      if (!window.SPECTOR) {
        await loadScript('https://spectorcdn.babylonjs.com/spector.bundle.js');
      }
      return new window.SPECTOR.Spector();
    })();
  }
  return spectorPromise;
}

export async function toggleSpectorOverlay() {
  const spector = await ensureSpector();
  if (!overlayShown) {
    spector.displayUI();
    overlayShown = true;
  } else {
    const host = document.getElementById('SPECTOR_UI') || document.querySelector('[id^="SPECTOR"]');
    if (host) host.remove();
    overlayShown = false;
  }
  return overlayShown;
}

export async function captureFrameWithSpector(canvas) {
  const spector = await ensureSpector();
  spector.captureCanvas(canvas, 1);
  return true;
}
