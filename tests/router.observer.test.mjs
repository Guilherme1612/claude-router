import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateEvents,
  analyzeLocalObserver,
  compareEvidence,
  correlateEvents,
  createLocalObserver,
  normalizeEvent,
  observerPaths,
  proposeChanges,
  readReceipts,
} from '../src/observer/local.mjs';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const tempRoot = () => mkdtempSync(join(tmpdir(), 'route-observer-test-'));

const event = (overrides = {}) => ({
  event_type: 'prompt',
  prompt: 'private prompt text',
  task_family: 'implementation',
  capability_kind: 'code_change',
  action_contract: 'modify repository',
  evidence_contract: 'tests pass',
  framework: { runtime: 'claude', provider: 'local', skills: ['superpowers'] },
  route: { selected: 'implementation', tier: 'high', reason_code: 'matched' },
  cost: { wall_ms: 12, estimated_tokens: 240 },
  outcome: { status: 'completed', verified: true },
  ...overrides,
});

test('marker absence is a true no-op', async () => {
  const root = join(tempRoot(), '.route-build');
  const observer = createLocalObserver({ root });

  assert.equal(observer.enabled, false);
  assert.equal(observer.record(event()), false);
  await observer.flush();
  assert.equal(existsSync(root), false);
  assert.equal(observer.stats().written, 0);
});

test('enabled observer persists ordered private events outside the repository', async () => {
  const root = join(tempRoot(), '.route-build');
  mkdirSync(root);
  const observer = createLocalObserver({ root });

  assert.equal(observer.record(event({ prompt: 'first private prompt' })), true);
  assert.equal(observer.record(event({ prompt: 'second private prompt' })), true);
  await observer.flush();

  const paths = observerPaths(root);
  const rows = readFileSync(paths.events, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(row => row.prompt), [undefined, undefined]);
  assert.equal(JSON.stringify(rows).includes('first private prompt'), false);
  assert.equal(JSON.stringify(rows).includes('second private prompt'), false);
  assert.equal(statSync(paths.data).mode & 0o777, 0o700);
  assert.equal(statSync(paths.events).mode & 0o777, 0o600);
  assert.equal(observer.stats().written, 2);
});

test('observer drops sensitive fields and pseudonymizes session identity', async () => {
  const root = join(tempRoot(), '.route-build');
  mkdirSync(root);
  const observer = createLocalObserver({ root });
  observer.record(event({
    source: {
      session_id: 'session-1',
      cwd: '/private/project',
      transcript_path: '/private/transcript.jsonl',
    },
    metadata: {
      tool_input: { secret: 'private tool input' },
      downstream_event: 'private downstream output',
    },
  }));
  await observer.flush();
  const raw = readFileSync(observerPaths(root).events, 'utf8');
  const row = JSON.parse(raw);
  assert.equal(raw.includes('/private/project'), false);
  assert.equal(raw.includes('/private/transcript.jsonl'), false);
  assert.equal(raw.includes('session-1'), false);
  assert.equal(raw.includes('private tool input'), false);
  assert.equal(raw.includes('private downstream output'), false);
  assert.match(row.feedback.session_id, /^[a-f0-9]{32}$/);
  assert.equal(row.source.session_hash, row.feedback.session_id);
});

test('queue overflow and writer failure are explicit and fail open', async () => {
  const root = join(tempRoot(), '.route-build');
  mkdirSync(root);
  const observer = createLocalObserver({ root, maxQueue: 1, autoFlush: false });
  assert.equal(observer.record(event()), true);
  assert.equal(observer.record(event()), false);
  assert.equal(observer.stats().dropped, 1);
  await observer.flush();
  assert.equal(observer.stats().incomplete, true);

  const brokenRoot = join(tempRoot(), '.route-build');
  mkdirSync(brokenRoot);
  writeFileSync(join(brokenRoot, 'observer-data'), 'not a directory');
  const broken = createLocalObserver({ root: brokenRoot });
  assert.equal(broken.record(event()), true);
  await assert.doesNotReject(() => broken.flush());
  assert.equal(broken.stats().incomplete, true);
  assert.ok(broken.stats().failed >= 1);
});

test('aggregation reports independent evidence and keeps prompts out of proposals', () => {
  const summary = aggregateEvents([
    event(),
    event({
      prompt: 'another private prompt',
      framework: { runtime: 'codex', provider: 'cloud', agents: ['reviewer'] },
      outcome: { status: 'failed', verified: false },
      cost: { wall_ms: 28, actual_tokens: 500 },
    }),
  ]);

  assert.equal(summary.events, 2);
  assert.deepEqual(summary.outcomes, { completed: 1, failed: 1 });
  assert.equal(summary.latency_ms.count, 2);
  assert.equal(summary.tokens.estimated.count, 1);
  assert.equal(summary.tokens.actual.count, 1);
  assert.equal(summary.by_task_family.implementation.events, 2);
  assert.equal(summary.by_framework.claude.events, 1);
  assert.equal(summary.by_framework.codex.events, 1);
  assert.equal(JSON.stringify(summary).includes('private prompt'), false);

  const proposal = proposeChanges({
    baseline: aggregateEvents([event({ cost: { wall_ms: 30, estimated_tokens: 300 } })]),
    candidate: aggregateEvents([event({ cost: { wall_ms: 10, estimated_tokens: 100 } })]),
    minSamples: 1,
  });
  assert.equal(proposal.status, 'candidate_better');
  assert.equal(proposal.framework_neutral, true);
  assert.equal(JSON.stringify(proposal).includes('private prompt'), false);

  const actualTokenComparison = compareEvidence({
    baseline: aggregateEvents([event({ cost: { wall_ms: 10, actual_tokens: 100 } })]),
    candidate: aggregateEvents([event({ cost: { wall_ms: 10, actual_tokens: 50 } })]),
    minSamples: 1,
  });
  assert.equal(actualTokenComparison.status, 'candidate_better');
});

test('candidate comparison refuses unsupported promotion evidence', () => {
  const result = compareEvidence({
    baseline: { events: 10, success_rate: 0.9, latency_ms: { p95: 20 }, tokens: { estimated: { mean: 10 } } },
    candidate: { events: 2, success_rate: 1, latency_ms: { p95: 10 }, tokens: { estimated: { mean: 5 } } },
    minSamples: 3,
  });
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.promote, false);
});

test('correlation marks only observed completion or failure, never inferred success', () => {
  const rows = correlateEvents([
    event({ ts: 1, source: { session_id: 'a' } }),
    event({ ts: 2, event_type: 'hook', prompt: null, source: { session_id: 'a', event: 'PostToolUse' }, cost: { tool_calls: 1 } }),
    event({ ts: 3, event_type: 'hook', prompt: null, source: { session_id: 'a', event: 'Stop' } }),
    event({ ts: 4, source: { session_id: 'b' } }),
  ]);

  assert.equal(rows[0].outcome.status, 'completed');
  assert.equal(rows[0].outcome.correlation, 'session_id');
  assert.equal(rows[0].cost.tool_calls, 1);
  assert.equal(rows[3].outcome.status, 'routed');
});

test('correlation records matched downstream use before observed completion', () => {
  const rows = correlateEvents([
    event({
      ts: 1,
      source: { session_id: 'use-session' },
      route: { selected: 'implementation', skills: ['debug-skill'], agents: [] },
    }),
    event({
      ts: 2,
      event_type: 'hook',
      prompt: null,
      source: { session_id: 'use-session', event: 'PostToolUse' },
      capability_kind: 'Skill',
      metadata: { capabilities: ['Skill', 'debug-skill'] },
      cost: { tool_calls: 1 },
    }),
    event({ ts: 3, event_type: 'hook', prompt: null, source: { session_id: 'use-session', event: 'Stop' } }),
  ]);
  assert.equal(rows[0].outcome.status, 'completed');
  assert.equal(rows[0].outcome.verified, true);
  assert.equal(rows[0].outcome.actual_used, true);
  assert.equal(rows[0].outcome.downstream_invoked, true);
  assert.equal(rows[0].outcome.observed_capability, 'debug-skill');
});

test('correlation falls back to the pseudonymous session when feedback IDs differ', () => {
  const rows = correlateEvents([
    normalizeEvent({
      event_type: 'prompt',
      source: { session_id: 'same-session' },
      route: { selected: 'implementation', skills: ['debug-skill'] },
    }),
    normalizeEvent({
      event_type: 'hook',
      source: { session_id: 'same-session', event: 'PostToolUse' },
      capability_kind: 'Skill',
      metadata: { capabilities: ['Skill', 'debug-skill'] },
    }),
    normalizeEvent({ event_type: 'hook', source: { session_id: 'same-session', event: 'Stop' } }),
  ]);
  assert.equal(rows[0].outcome.actual_used, true);
  assert.equal(rows[0].outcome.verified, true);
});

test('offline analysis consumes existing local receipts without copying them into observer data', () => {
  const home = tempRoot();
  const root = join(home, '.route-build');
  const receiptDir = join(home, '.claude', 'router', 'receipts');
  mkdirSync(root);
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, 'receipt.json'), JSON.stringify({
    receipt_id: 'receipt-1',
    goal_id: 'implementation',
    invocation_identity: { runtime: 'claude', command: 'agent', spawned_at: new Date(1).toISOString() },
    selected: { route_id: 'implementation' },
    actual: { route_id: 'implementation' },
    completion_evidence: { state: 'completed', verified: true },
  }));

  assert.equal(readReceipts(root).length, 1);
  const report = analyzeLocalObserver(root);
  assert.equal(report.evidence_sources.receipts, 1);
  assert.equal(report.receipts.outcomes.completed, 1);
  assert.equal(existsSync(observerPaths(root).events), false);
});

test('router integration is inert without marker and captures prompt plus hook seams when enabled', () => {
  const root = tempRoot();
  const contextModule = join(root, 'prompt-route.mjs');
  writeFileSync(contextModule, `export function routeContextPrompt() { return { additional_context: '', handled: false }; }\n`);
  const router = fileURLToPath(new URL('../src/runtime/router.mjs', import.meta.url));
  const run = (payload, extraEnv = {}) => spawnSync(process.execPath, [router], {
    cwd: root,
    env: { ...process.env, HOME: root, USERPROFILE: root, ROUTER_CONTEXT_MODULE_PATH: contextModule, ...extraEnv },
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
    timeout: 30000,
  });

  const disabled = run({ prompt: 'disabled private prompt' });
  assert.equal(disabled.status, 0);
  assert.equal(existsSync(join(root, '.route-build')), false);

  mkdirSync(join(root, '.route-build'));
  const enabled = run({ prompt: 'enabled private prompt' });
  assert.equal(enabled.status, 0);
  const hook = run({
    hook_event_name: 'PostToolUse',
    tool_name: 'Task',
    tool_input: { subagent_type: 'reviewer' },
  });
  assert.equal(hook.status, 0);
  const rows = readFileSync(observerPaths(join(root, '.route-build')).events, 'utf8')
    .trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].prompt, undefined);
  assert.equal(JSON.stringify(rows).includes('enabled private prompt'), false);
  assert.equal(rows[1].event_type, 'hook');
  assert.deepEqual(rows[1].metadata.capabilities, ['Task', 'reviewer']);

  const timings = [];
  for (let index = 0; index < 5; index += 1) {
    const sample = run({ prompt: `observer benchmark ${index}` }, { ROUTER_DEBUG_LATENCY: '1' });
    assert.equal(sample.status, 0);
    const match = sample.stderr.match(/__router_latency_ms=([0-9.]+)/);
    assert.ok(match, 'benchmark must expose router latency');
    timings.push(Number(match[1]));
  }
  timings.sort((a, b) => a - b);
  assert.ok(timings[Math.ceil(timings.length * 0.95) - 1] < 50, `observer-enabled p95 exceeded 50ms: ${timings}`);
});
