// Counts a page visit for the Owner Portal overview. No cookies, no stored IP address (see migration 0012).
// Skipped when the browser asks not to be tracked and on the owner's own pages.
let lastPath = '';
export function trackVisit() {
  try {
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
    if (/^\/owners?-portal(\/|$)/.test(path)) return;
    fetch('/api/platform/analytics/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), keepalive: true, credentials: 'omit' }).catch(() => {});
  } catch {}
}
