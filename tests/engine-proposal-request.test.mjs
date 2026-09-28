import test from 'node:test';
import assert from 'node:assert/strict';
import { createProposalRequests } from '../engine/editor/proposal-request.mjs';

const input = () => ({ connectionId: 'my-connection', prompt: 'Move the cube', sceneSummary: { name: 'Scene', entities: [{ id: 'cube', position: [0, 0, 0] }] }, maxOutputTokens: 512, confirmProviderUsage: true });
const failure = (message, status, code) => Object.assign(new Error(message), { status, code });

test('requires a fresh explicit confirmation before allocating or sending an attempt', async () => {
  let calls = 0, ids = 0; const requests = createProposalRequests(async () => { calls++; }, { makeId: () => String(++ids) });
  await assert.rejects(requests.start({ ...input(), confirmProviderUsage: false }), /Confirm use/);
  assert.equal(calls, 0); assert.equal(ids, 0); assert.equal(requests.state, null);
});

test('network failure retry reuses exact approved input and request ID despite caller edits', async () => {
  const sent = []; let ids = 0;
  const requests = createProposalRequests(async attempt => { sent.push(attempt); if (sent.length === 1) throw new Error('Connection lost'); return { text: 'Stored result', operations: [] }; }, { makeId: () => `request-${++ids}` });
  const original = input(); await assert.rejects(requests.start(original), /Connection lost/);
  original.prompt = 'Different request'; original.sceneSummary.entities[0].position[0] = 100;
  assert.equal(requests.state.status, 'uncertain'); assert.equal(requests.state.sending, false);
  await requests.retry(); assert.equal(ids, 1); assert.deepEqual(sent[0], sent[1]); assert.equal(sent[1].body.prompt, 'Move the cube');
  assert.equal(sent[1].body.sceneSummary.entities[0].position[0], 0); assert.equal(requests.state.status, 'complete');
});

test('completed request returns cached result and requires a distinct explicit new-request action', async () => {
  let calls = 0; const requests = createProposalRequests(async () => { calls++; return { operations: [] }; });
  await requests.start(input()); await requests.retry(); assert.equal(calls, 1);
  await assert.rejects(requests.start(input()), /Start a new request/); assert.equal(calls, 1);
});

test('pending request rejects double submission and cannot be abandoned into a second paid request', async () => {
  let release, calls = 0; const gate = new Promise(resolve => { release = resolve; });
  const requests = createProposalRequests(async () => { calls++; await gate; return { operations: [] }; });
  const pending = requests.start(input()); assert.equal(requests.state.sending, true);
  await assert.rejects(requests.start(input()), /existing request/); await assert.rejects(requests.retry(), /still in progress/);
  assert.throws(() => requests.newRequest(), /Wait for the current/); assert.equal(calls, 1); release(); await pending;
});

test('a fresh attempt after uncertainty requires new consent and a new explicit request ID', async () => {
  const sent = []; let ids = 0;
  const requests = createProposalRequests(async attempt => { sent.push(attempt); throw failure('Timed out', 502, 'MODEL_TIMEOUT'); }, { makeId: () => `request-${++ids}` });
  await assert.rejects(requests.start(input()), /Timed out/); requests.newRequest(); assert.equal(requests.state, null);
  await assert.rejects(requests.start({ ...input(), confirmProviderUsage: false }), /Confirm use/); assert.equal(ids, 1);
  await assert.rejects(requests.start(input()), /Timed out/); assert.equal(ids, 2); assert.notEqual(sent[0].body.requestId, sent[1].body.requestId);
});

test('pending and previously failed backend reservations retain ambiguity and never retry automatically', async () => {
  for (const code of ['MODEL_REQUEST_PENDING', 'MODEL_REQUEST_PREVIOUSLY_FAILED']) {
    let calls = 0; const requests = createProposalRequests(async () => { calls++; throw failure('Existing reservation', 409, code); });
    await assert.rejects(requests.start(input()), /Existing reservation/); assert.equal(requests.state.status, 'uncertain'); assert.equal(calls, 1);
  }
});

test('definite authentication or validation failures do not silently start another request', async () => {
  let calls = 0; const requests = createProposalRequests(async () => { calls++; throw failure('Sign in', 401, 'AUTH_REQUIRED'); });
  await assert.rejects(requests.start(input()), /Sign in/); assert.equal(requests.state.status, 'failed');
  await assert.rejects(requests.start(input()), /existing request/); assert.equal(calls, 1);
});

test('state snapshots and transport payloads cannot mutate the stored approved request', async () => {
  const requests = createProposalRequests(async attempt => { attempt.body.prompt = 'transport mutation'; throw new Error('offline'); });
  await assert.rejects(requests.start(input()), /offline/); const state = requests.state; state.body.prompt = 'UI mutation';
  assert.equal(requests.state.body.prompt, 'Move the cube'); assert.equal(requests.state.body.confirmProviderUsage, true);
});

test('applied results remain marked across dialog reopening and are reset only for a new request', async () => {
  const requests = createProposalRequests(async () => ({ summary: 'Result', operations: [] }));
  await requests.start(input()); requests.markApplied(); assert.equal(requests.state.applied, true);
  assert.equal((await requests.retry()).summary, 'Result'); assert.equal(requests.state.applied, true);
  requests.newRequest(); assert.equal(requests.state, null);
});
