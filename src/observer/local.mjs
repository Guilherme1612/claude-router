import { appendFile, chmod, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';

export const OBSERVER_SCHEMA_VERSION = 1;
export const DEFAULT_OBSERVER_ROOT = join(homedir(), '.route-build');
const MAX_TEXT = 32 * 1024;
const MAX_VALUE = 4096;
const SUCCESS = new Set(['completed', 'success', 'succeeded', 'verified']);
const PRIVATE_KEYS = new Set([
  'prompt', 'raw_prompt', 'cwd', 'working_directory', 'transcript_path',
  'session_id', 'tool_input', 'tool_response', 'stdout', 'stderr', 'downstream_event',
]);

const secretPatterns = [
  /(bearer\s+)[a-z0-9._~+/=-]+/gi,
  /\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])-[-_a-z0-9]{8,}\b/gi,
  /\bAKIA[0-9A-Z]{12,}\b/g,
  /(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
];

function safeText(value, max = MAX_VALUE) {
  if (value === undefined || value === null) return null;
  let text = String(value);
  for (const pattern of secretPatterns) text = text.replace(pattern, () => '[REDACTED]');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeValue(value, depth = 0) {
  if (depth > 2 || value === undefined || value === null) return value ?? null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? safeText(value) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 32).map(item => safeValue(item, depth + 1));
  if (typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_KEYS.has(String(key).toLowerCase()))
    .slice(0, 32).map(([key, item]) => [
    safeText(key, 128), safeValue(item, depth + 1),
  ]));
}

function privateHash(value) {
  if (value === undefined || value === null || value === '') return null;
  return createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 32);
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function technicalId(value, max = 128) {
  return typeof value === 'string' && value.length > 0 ? safeText(value, max) : null;
}

function feedbackIdentity(input = {}) {
  const route = input.route && typeof input.route === 'object' ? input.route : {};
  const source = input.source && typeof input.source === 'object' ? input.source : {};
  const outcome = input.outcome && typeof input.outcome === 'object' ? input.outcome : {};
  const identity = {
    decision_id: technicalId(input.decision_id || route.decision_id || source.decision_id),
    route_id: technicalId(input.route_id || route.route_id || route.selected),
    selection_id: technicalId(input.selection_id || route.selection_id || route.suggestion_id),
    receipt_id: technicalId(input.receipt_id || source.receipt_id || outcome.receipt_id),
    verification_id: technicalId(input.verification_id || source.verification_id || outcome.verification_id),
    runtime: technicalId(input.runtime || source.runtime || input.framework?.runtime, 32),
    session_id: privateHash(input.session_id || source.session_id),
  };
  const material = Object.fromEntries(Object.entries(identity).filter(([, value]) => value));
  if (!Object.keys(material).length) return null;
  const correlation_id = createHash('sha256')
    .update(stableStringify(material), 'utf8').digest('hex').slice(0, 32);
  return { ...material, correlation_id };
}

function safeSource(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    event: safeText(value.event, 128),
    seam: safeText(value.seam, 128),
    session_hash: privateHash(value.session_id || value.session_hash),
    tool_use_hash: privateHash(value.tool_use_id || value.tool_use_hash),
    receipt_id: technicalId(value.receipt_id),
    verification_id: technicalId(value.verification_id),
  };
}

function metricRecord(value = {}) {
  const actual = numberOrNull(value.actual_tokens);
  const estimated = numberOrNull(value.estimated_tokens);
  return {
    wall_ms: numberOrNull(value.wall_ms),
    actual_tokens: actual,
    estimated_tokens: estimated,
    token_source: actual !== null ? 'actual' : estimated !== null ? 'estimated' : 'missing',
    tool_calls: numberOrNull(value.tool_calls),
    retries: numberOrNull(value.retries),
  };
}

function safeMetadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    capabilities: Array.isArray(value.capabilities) ? value.capabilities.slice(0, 32).map(item => safeText(item, 256)).filter(Boolean) : [],
    event: safeText(value.event, 128),
    seam: safeText(value.seam, 128),
  };
}

export function observerPaths(root = DEFAULT_OBSERVER_ROOT) {
  const data = join(root, 'observer-data');
  return {
    root,
    data,
    events: join(data, 'events.jsonl'),
    reports: join(data, 'reports'),
    proposals: join(data, 'proposals'),
  };
}

export function normalizeEvent(input = {}, { now = Date.now, id = randomUUID } = {}) {
  if (!input || typeof input !== 'object') return null;
  const cost = metricRecord(input.cost);
  return {
    schema_version: OBSERVER_SCHEMA_VERSION,
    event_id: safeText(input.event_id || id(), 128),
    ts: numberOrNull(input.ts) ?? now(),
    event_type: safeText(input.event_type || 'observation', 64),
    task_family: safeText(input.task_family, 128),
    capability_kind: safeText(input.capability_kind, 128),
    action_contract: safeText(input.action_contract, 512),
    evidence_contract: safeText(input.evidence_contract, 512),
    framework: safeValue(input.framework || {}),
    route: safeValue(input.route || {}),
    feedback: feedbackIdentity(input),
    cost,
    outcome: safeValue(input.outcome || {}),
    source: safeSource(input.source),
    metadata: safeMetadata(input.metadata),
  };
}

function markerEnabled(root) {
  try { return existsSync(root) && statSync(root).isDirectory(); } catch { return false; }
}

export function createLocalObserver({
  root = DEFAULT_OBSERVER_ROOT,
  enabled = markerEnabled(root),
  maxQueue = 256,
  autoFlush = true,
} = {}) {
  const paths = observerPaths(root);
  const stats = { accepted: 0, written: 0, dropped: 0, failed: 0, incomplete: false };
  const queue = [];
  let drainPromise = null;
  let closed = false;

  async function drain() {
    while (queue.length) {
      const batch = queue.splice(0, Math.min(queue.length, maxQueue));
      try {
        await mkdir(paths.data, { recursive: true, mode: 0o700 });
        await chmod(paths.data, 0o700);
        await appendFile(paths.events, batch.map(row => `${JSON.stringify(row)}\n`).join(''), { mode: 0o600 });
        await chmod(paths.events, 0o600);
        stats.written += batch.length;
      } catch {
        stats.failed += batch.length;
        stats.incomplete = true;
        queue.length = 0;
      }
    }
  }

  function schedule() {
    if (!enabled || !autoFlush || drainPromise) return;
    drainPromise = new Promise(resolve => setImmediate(async () => {
      try { await drain(); } finally { drainPromise = null; resolve(); }
    }));
  }

  const observer = {
    enabled: !!enabled,
    paths,
    record(input) {
      if (!enabled || closed) return false;
      const row = normalizeEvent(input);
      if (!row) return false;
      if (queue.length >= maxQueue) {
        stats.dropped += 1;
        stats.incomplete = true;
        return false;
      }
      queue.push(row);
      stats.accepted += 1;
      schedule();
      return true;
    },
    async flush() {
      if (!enabled || closed) return;
      if (drainPromise) await drainPromise;
      if (queue.length) await drain();
    },
    close() {
      closed = true;
      queue.length = 0;
    },
    stats() {
      return { ...stats, queued: queue.length, enabled: !!enabled };
    },
  };
  return observer;
}

let defaultObserver;
export function getLocalObserver() {
  if (!defaultObserver) defaultObserver = createLocalObserver();
  return defaultObserver;
}

export function recordDecision(prompt, decision, { runtime = null, startNs = null, source = {} } = {}) {
  const telemetry = decision?.telemetry_entry || {};
  const route = decision?.route || {};
  const wallMs = telemetry.latency_ms ?? (startNs ? Number(process.hrtime.bigint() - startNs) / 1e6 : null);
  return getLocalObserver().record({
    event_type: 'prompt',
    prompt,
    task_family: decision?.semantic?.task_family || route.task_family || decision?.intent || decision?.pass_through_reason || 'unknown',
    capability_kind: route.capability_kind || route.invoke_kind || decision?.invoke_kind || 'route',
    action_contract: route.action_contract || route.mode || null,
    evidence_contract: decision?.pass_through_reason || 'downstream_receipt',
    framework: { runtime },
    decision_id: telemetry.decision_id || decision?.decision_id || null,
    route_id: route.route_id || route.id || route.mode || null,
    selection_id: telemetry.suggestion_id || route.selection_id || null,
    runtime,
    route: {
      selected: route.id || route.mode || null,
      tier: decision?.tier || telemetry.confidence_tier || null,
      reason_code: decision?.pass_through_reason || null,
      cache_status: telemetry.cache_status || decision?.cache?.status || null,
      prompt_signature: telemetry.prompt_signature || null,
      suggestion_id: telemetry.suggestion_id || null,
      skills: telemetry.suggested_skills || route.recommended_skills || [],
      agents: telemetry.suggested_agents || route.recommended_agents || [],
      candidates: Array.isArray(decision?.candidates) ? decision.candidates.slice(0, 8).map(row => row?.id || row?.mode).filter(Boolean) : [],
    },
    cost: { ...telemetry, wall_ms: wallMs },
    outcome: { status: 'routed', verified: null },
    source: { seam: 'router.main', ...source },
  });
}

export function recordHook(payload, { runtime = null } = {}) {
  if (!payload || typeof payload !== 'object') return false;
  const input = payload.tool_input && typeof payload.tool_input === 'object' ? payload.tool_input : {};
  const capabilities = [payload.command_name, payload.tool_name, input.skill, input.name, input.subagent_type]
    .map(value => safeText(value, 256)).filter(Boolean);
  return getLocalObserver().record({
    event_type: 'hook',
    capability_kind: payload.tool_name || payload.hook_event_name || 'hook',
    action_contract: payload.command_name || input.skill || input.name || input.subagent_type || null,
    evidence_contract: payload.hook_event_name || null,
    framework: { runtime },
    decision_id: payload.decision_id || null,
    route_id: payload.route_id || null,
    selection_id: payload.suggestion_id || null,
    receipt_id: payload.receipt_id || null,
    verification_id: payload.verification_id || null,
    runtime,
    cost: {
      actual_tokens: payload.usage?.total_tokens
        || (Number(payload.usage?.input_tokens) + Number(payload.usage?.output_tokens) || null),
      tool_calls: payload.hook_event_name === 'PostToolUse' ? 1 : 0,
    },
    outcome: { status: payload.hook_event_name || 'observed', verified: null },
    source: {
      seam: 'router.hook',
      event: payload.hook_event_name || null,
      session_id: payload.session_id || null,
      tool_use_id: payload.tool_use_id || null,
      receipt_id: payload.receipt_id || null,
      verification_id: payload.verification_id || null,
    },
    metadata: { capabilities },
  });
}

export function correlateEvents(events = []) {
  const rows = Array.isArray(events)
    ? events.map(row => ({ ...row })).sort((a, b) => Number(a.ts) - Number(b.ts))
    : [];
  const active = new Map();
  for (const row of rows) {
    const correlationKeys = [...new Set([
      row.feedback?.correlation_id,
      row.source?.session_hash,
      row.source?.session_id,
    ].filter(Boolean))];
    if (!correlationKeys.length) continue;
    if (row.event_type === 'prompt') {
      row.outcome = {
        ...(row.outcome || {}), status: 'routed', verified: null,
        correlation: row.feedback?.correlation_id ? 'feedback_id' : 'session_id',
      };
      for (const key of correlationKeys) active.set(key, row);
      continue;
    }
    const prompt = correlationKeys.map((key) => active.get(key)).find(Boolean);
    if (!prompt) continue;
    const eventName = row.source?.event;
    const previous = prompt.outcome?.status;
    const selected = [
      prompt.route?.selected,
      ...(Array.isArray(prompt.route?.skills) ? prompt.route.skills : []),
      ...(Array.isArray(prompt.route?.agents) ? prompt.route.agents : []),
    ].map(value => typeof value === 'string' ? value.trim().toLowerCase() : '').filter(Boolean);
    const observed = [
      row.capability_kind,
      row.action_contract,
      ...(Array.isArray(row.metadata?.capabilities) ? row.metadata.capabilities : []),
    ].map(value => typeof value === 'string' ? value.trim().toLowerCase() : '').filter(Boolean);
    const matchedCapability = ['PostToolUse', 'PostToolUseFailure'].includes(eventName)
      ? observed.find(value => selected.includes(value)) || null
      : null;
    const correlation = row.feedback?.correlation_id ? 'feedback_id' : 'session_id';
    const invocationEvidence = matchedCapability
      ? {
        downstream_invoked: true,
        observed_capability: matchedCapability,
        ...(eventName === 'PostToolUse' ? { actual_used: true } : { invocation_failed: true }),
      }
      : {};
    if (eventName === 'PostToolUseFailure') {
      prompt.outcome = { ...(prompt.outcome || {}), ...invocationEvidence, status: 'failed', verified: false, correlation, failure_event: row.event_id };
    } else if (eventName === 'Stop' && previous !== 'failed') {
      prompt.outcome = {
        ...(prompt.outcome || {}), status: 'completed', verified: true, correlation,
        verification: 'observed_stop',
      };
    } else if (eventName === 'PostToolUse' && matchedCapability) {
      prompt.outcome = { ...(prompt.outcome || {}), ...invocationEvidence, status: 'routed', verified: null, correlation };
    }
    prompt.cost = {
      ...(prompt.cost || {}),
      tool_calls: Number(prompt.cost?.tool_calls || 0) + Number(row.cost?.tool_calls || 0),
      actual_tokens: prompt.cost?.actual_tokens ?? row.cost?.actual_tokens ?? null,
    };
  }
  return rows;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function groupSummary(rows) {
  return aggregateEvents(rows, { includeGroups: false });
}

function frameworkKey(row) {
  const framework = row.framework || {};
  return safeText(framework.runtime || framework.provider || 'unknown', 128) || 'unknown';
}

export function aggregateEvents(events = [], { includeGroups = true } = {}) {
  const rows = Array.isArray(events) ? events.filter(row => row && typeof row === 'object') : [];
  const measured = rows.filter(row => row.event_type === 'prompt');
  const outcomeRows = measured.length ? measured : rows;
  const latencies = outcomeRows.map(row => Number(row.cost?.wall_ms)).filter(Number.isFinite);
  const outcomeCounts = {};
  const taskRows = new Map();
  const capabilityRows = new Map();
  const frameworkRows = new Map();
  const actual = rows.map(row => Number(row.cost?.actual_tokens)).filter(Number.isFinite);
  const estimated = rows.map(row => Number(row.cost?.estimated_tokens)).filter(Number.isFinite);
  for (const row of outcomeRows) {
    const status = safeText(row.outcome?.status || 'unknown', 64) || 'unknown';
    outcomeCounts[status] = (outcomeCounts[status] || 0) + 1;
  }
  for (const row of rows) {
    for (const [map, key] of [
      ...(row.event_type === 'prompt' ? [[taskRows, row.task_family]] : []),
      [capabilityRows, row.capability_kind],
      [frameworkRows, frameworkKey(row)],
    ]) {
      const normalized = safeText(key || 'unknown', 128) || 'unknown';
      if (!map.has(normalized)) map.set(normalized, []);
      map.get(normalized).push(row);
    }
  }
  const summary = {
    schema_version: OBSERVER_SCHEMA_VERSION,
    events: rows.length,
    outcomes: outcomeCounts,
    runs: measured.length,
    success_rate: outcomeRows.length ? outcomeRows.filter(row => SUCCESS.has(row.outcome?.status)).length / outcomeRows.length : null,
    latency_ms: { count: latencies.length, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.length ? Math.max(...latencies) : null },
    tokens: {
      actual: { count: actual.length, sum: actual.reduce((a, b) => a + b, 0), mean: actual.length ? actual.reduce((a, b) => a + b, 0) / actual.length : null, source: 'actual' },
      estimated: { count: estimated.length, sum: estimated.reduce((a, b) => a + b, 0), mean: estimated.length ? estimated.reduce((a, b) => a + b, 0) / estimated.length : null, source: 'estimated' },
    },
  };
  if (includeGroups) {
    summary.by_task_family = Object.fromEntries([...taskRows].map(([key, values]) => [key, groupSummary(values)]));
    summary.by_capability = Object.fromEntries([...capabilityRows].map(([key, values]) => [key, groupSummary(values)]));
    summary.by_framework = Object.fromEntries([...frameworkRows].map(([key, values]) => [key, groupSummary(values)]));
  }
  return summary;
}

export function compareEvidence({ baseline, candidate, minSamples = 20 } = {}) {
  if (!candidate || Number(candidate.events) < minSamples) return { status: 'insufficient_evidence', promote: false, reason_code: 'candidate_samples' };
  if (!baseline || Number(baseline.events) < minSamples) return { status: 'insufficient_evidence', promote: false, reason_code: 'baseline_samples' };
  const successDelta = Number(candidate.success_rate ?? 0) - Number(baseline.success_rate ?? 0);
  const latencyDelta = Number(candidate.latency_ms?.p95 ?? Infinity) - Number(baseline.latency_ms?.p95 ?? Infinity);
  const tokenMean = summary => Number(summary.tokens?.actual?.mean ?? summary.tokens?.estimated?.mean ?? Infinity);
  const tokenDelta = tokenMean(candidate) - tokenMean(baseline);
  const better = successDelta >= 0 && latencyDelta <= 0 && tokenDelta <= 0 && (successDelta > 0 || latencyDelta < 0 || tokenDelta < 0);
  return {
    status: better ? 'candidate_better' : 'no_promotion',
    promote: better,
    deltas: { success_rate: successDelta, latency_p95_ms: latencyDelta, tokens_mean: tokenDelta },
  };
}

export function proposeChanges({ baseline, candidate, minSamples = 20 } = {}) {
  const comparison = compareEvidence({ baseline, candidate, minSamples });
  return {
    ...comparison,
    framework_neutral: true,
    changes: comparison.promote ? {
      route_contract: 'candidate',
      required_gates: ['cross_framework_fixture', 'canary', 'rollback_receipt'],
    } : null,
  };
}

export function readEvents(root = DEFAULT_OBSERVER_ROOT) {
  const path = observerPaths(root).events;
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch { return []; }
}

export function readReceipts(root = DEFAULT_OBSERVER_ROOT) {
  const home = join(root, '..');
  const receipts = [];
  for (const runtime of ['claude', 'codex']) {
    const directory = join(home, `.${runtime}`, 'router', 'receipts');
    if (!existsSync(directory)) continue;
    let names = [];
    try { names = readdirSync(directory); } catch { continue; }
    for (const name of names.filter(file => file.endsWith('.json')).slice(0, 10000)) {
      try {
        const receipt = JSON.parse(readFileSync(join(directory, name), 'utf8'));
        if (!receipt || typeof receipt !== 'object') continue;
        const identity = receipt.invocation_identity || {};
        const selected = receipt.selected || {};
        const actual = receipt.actual || {};
        const completion = receipt.completion_evidence || {};
        receipts.push(normalizeEvent({
          event_type: 'receipt',
          ts: Date.parse(completion.finished_at || identity.spawned_at || '') || Date.now(),
          task_family: receipt.goal_id || null,
          capability_kind: identity.command || 'receipt',
          action_contract: selected.route_id || selected.route || null,
          evidence_contract: completion.state || receipt.route_state || null,
          framework: { runtime: identity.runtime || runtime },
          route: {
            selected: selected.route_id || selected.route || null,
            actual: actual.route_id || actual.route || null,
            changed: Boolean(selected.route_id && actual.route_id && selected.route_id !== actual.route_id),
          },
          cost: { wall_ms: receipt.timing?.wall_ms, actual_tokens: receipt.usage?.total_tokens },
          outcome: { status: completion.state || receipt.route_state || 'unknown', verified: completion.verified ?? null },
          source: { seam: 'receipt', receipt_id: receipt.receipt_id, goal_id: receipt.goal_id || null },
          metadata: { alternatives: receipt.alternatives, corrections: receipt.corrections, evidence: receipt.bounded_evidence },
        }));
      } catch { /* malformed receipt is an incomplete analysis input */ }
    }
  }
  return receipts;
}

export function analyzeLocalObserver(root = DEFAULT_OBSERVER_ROOT) {
  const events = correlateEvents(readEvents(root));
  const receipts = readReceipts(root);
  return {
    ...aggregateEvents(events),
    receipts: aggregateEvents(receipts),
    evidence_sources: { observer_events: events.length, receipts: receipts.length },
  };
}
