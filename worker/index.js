/**
 * Retired legacy AI proxy. The active engine only uses authenticated, encrypted
 * user-owned connections in /api/platform/model-connections. This endpoint must
 * never fall back to a platform provider key or spend platform-funded credits.
 */
export default {
  async fetch() {
    return Response.json({
      error: { code: 'LEGACY_AI_PROXY_RETIRED', message: 'Use your own provider connection in the Crate Ship editor. This legacy AI endpoint is disabled.' },
      commands: [],
      billing: { mode: 'user_provider_account', platformFundedGeneration: false, platformCreditsProvided: false },
    }, { status: 410, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  },
};
