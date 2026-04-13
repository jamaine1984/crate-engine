export function initBridge() {
  if (!window._engineBridge) {
    throw new Error('Engine bridge is not ready');
  }
  window._engineBus = window._engineBridge;
  return window._engineBridge;
}
