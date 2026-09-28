/** One approved input snapshot and ID until an explicit new-request action. */
export function createProposalRequests(send, { makeId = () => crypto.randomUUID() } = {}) {
  let attempt = null, sending = false;
  const snapshot = () => attempt ? structuredClone({ ...attempt, sending }) : null;
  const message = text => { throw new Error(text); };
  async function dispatch() {
    if (sending) message('This request is still in progress.');
    sending = true; attempt.status = 'pending'; attempt.error = null;
    try {
      const result = await send(structuredClone({ connectionId: attempt.connectionId, body: attempt.body }));
      attempt.status = 'complete'; attempt.result = structuredClone(result); return result;
    } catch (error) {
      const uncertain = !error.status || error.status >= 500 || ['MODEL_REQUEST_PENDING', 'MODEL_REQUEST_PREVIOUSLY_FAILED'].includes(error.code);
      attempt.status = uncertain ? 'uncertain' : 'failed';
      attempt.error = { message: error.message || 'The request could not be completed.', code: error.code || null, status: error.status || null };
      throw error;
    } finally { sending = false; }
  }
  return {
    get state() { return snapshot(); },
    async start(input) {
      if (attempt) message('Check the existing request or choose Start a new request first.');
      if (input.confirmProviderUsage !== true) message('Confirm use of your provider account for this request.');
      attempt = { connectionId: input.connectionId, status: 'pending', applied: false, result: null, error: null,
        body: structuredClone({ prompt: input.prompt, sceneSummary: input.sceneSummary, maxOutputTokens: input.maxOutputTokens,
          requestId: makeId(), confirmProviderUsage: true }) };
      return dispatch();
    },
    async retry() {
      if (!attempt) message('There is no existing request to check.');
      if (attempt.status === 'complete') return structuredClone(attempt.result);
      return dispatch();
    },
    newRequest() {
      if (sending) message('Wait for the current request before starting another.');
      attempt = null;
    },
    markApplied() { if (attempt?.status === 'complete') attempt.applied = true; },
  };
}
