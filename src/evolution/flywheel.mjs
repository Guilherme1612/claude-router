import { createHash } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';

export const FLYWHEEL_STAGES = Object.freeze([
  'recommendation', 'selected', 'actual_invocation', 'receipt', 'completion',
  'verification', 'outcome', 'shadow', 'canary', 'promotion', 'rollback', 'refreshed_snapshot',
]);
export const EVIDENCE_CLASSES = Object.freeze(['synthetic', 'evaluation', 'installed', 'audit', 'live', 'unknown']);

const MAX_EVENTS = 64;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;
const FORBIDDEN = /raw|prompt[_ -]?text|tool[_ -]?(input|output)|private[_ -]?path|secret|credential|password/i;
const PROPOSAL_KINDS = new Set(['alias', 'equivalent', 'mapping', 'ranking', 'composition', 'staleness']);
const TERMINAL_STAGES = new Set(['failure', 'cancellation', 'recovery']);

function token(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && TOKEN.test(value) ? value : null;
}

function list(value) {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  return [...new Set(values.map(token).filter(Boolean))].sort().slice(0, 32);
}

function number(value, max = 1_000_000_000) {
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function containsForbidden(value, key = '') {
  if (FORBIDDEN.test(key)) return true;
  if (typeof value === 'string') return FORBIDDEN.test(value);
  if (Array.isArray(value)) return value.some(item => containsForbidden(item, key));
  return value && typeof value === 'object'
    ? Object.entries(value).some(([childKey, child]) => containsForbidden(child, childKey))
    : false;
}

function fingerprint(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function scopeOf(event) {
  return {
    runtime: token(event.runtime) || 'unknown',
    project_id: token(event.project_id) || 'unknown',
    workflow_id: token(event.workflow_id) || 'unknown',
    framework: token(event.framework) || 'unknown',
    role: token(event.role) || 'unknown',
    task_family: token(event.task_family) || 'unknown',
  };
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { error: 'event_malformed' };
  if (containsForbidden(event)) return { error: 'event_privacy_forbidden' };
  const stage = token(event.stage);
  const correlationId = token(event.correlation_id);
  if (!FLYWHEEL_STAGES.includes(stage) && !TERMINAL_STAGES.has(stage)) return { error: 'event_stage_invalid' };
  if (!correlationId) return { error: 'event_correlation_missing' };
  const evidenceClass = token(event.evidence_class) || 'unknown';
  if (!EVIDENCE_CLASSES.includes(evidenceClass)) return { error: 'event_evidence_class_invalid' };
  const scope = scopeOf(event);
  const normalized = {
    stage,
    correlation_id: correlationId,
    timestamp_ms: Number.isSafeInteger(event.timestamp_ms) ? event.timestamp_ms : null,
    ...scope,
    capability_ids: list(event.capability_ids),
    actual_capability_ids: list(event.actual_capability_ids),
    receipt_id: token(event.receipt_id),
    evidence_class: evidenceClass,
    verified: event.verified === true,
    outcome_kind: token(event.outcome_kind) || null,
    cost: {
      estimated_tokens: number(event.cost?.estimated_tokens),
      actual_tokens: number(event.cost?.actual_tokens),
      context_bytes: number(event.cost?.context_bytes),
      latency_ms: number(event.cost?.latency_ms),
      tool_calls: number(event.cost?.tool_calls, 256),
      retries: number(event.cost?.retries, 32),
      downstream_ms: number(event.cost?.downstream_ms),
    },
    reason_code: token(event.reason_code),
    snapshot_epoch: token(event.snapshot_epoch),
  };
  if (stage === 'selected' && !normalized.capability_ids.length) return { error: 'selected_capabilities_missing' };
  if (stage === 'actual_invocation' && !normalized.actual_capability_ids.length) return { error: 'actual_capabilities_missing' };
  if (stage === 'receipt' && !normalized.receipt_id) return { error: 'receipt_missing' };
  if (stage === 'verification' && normalized.verified !== true) normalized.verified = false;
  if (stage === 'outcome' && normalized.verified !== true) normalized.outcome_kind = 'unknown';
  return normalized;
}

function stageIndex(stage) {
  return FLYWHEEL_STAGES.indexOf(stage);
}

function sameScope(left, right) {
  return stableStringify(scopeOf(left)) === stableStringify(scopeOf(right));
}

function setEqual(left, right) {
  return stableStringify([...new Set(left)].sort()) === stableStringify([...new Set(right)].sort());
}

export function buildFlywheelChain(events = []) {
  if (!Array.isArray(events) || events.length > MAX_EVENTS) return { status: 'unknown', reason_codes: ['events_unbounded'] };
  const normalized = [];
  const errors = [];
  for (const event of events) {
    const result = normalizeEvent(event);
    if (result.error) errors.push(result.error);
    else normalized.push(result);
  }
  if (errors.length) return { status: 'unknown', reason_codes: [...new Set(errors)].sort(), privacy_safe: true };
  if (!normalized.length) return { status: 'unknown', reason_codes: ['evidence_missing'], privacy_safe: true };
  const correlationId = normalized[0].correlation_id;
  if (normalized.some(event => event.correlation_id !== correlationId)) return { status: 'unknown', reason_codes: ['correlation_mismatch'], privacy_safe: true };
  if (normalized.some(event => !sameScope(event, normalized[0]))) return { status: 'unknown', reason_codes: ['scope_mismatch'], privacy_safe: true };
  const orderErrors = [];
  let previous = -1;
  for (const event of normalized) {
    const index = stageIndex(event.stage);
    if (index >= 0 && index < previous) orderErrors.push('stage_out_of_order');
    if (index >= 0) previous = Math.max(previous, index);
  }
  if (orderErrors.length) return { status: 'unknown', reason_codes: [...new Set(orderErrors)], privacy_safe: true };
  const stages = new Set(normalized.map(event => event.stage));
  const required = ['recommendation', 'selected', 'actual_invocation', 'receipt', 'completion', 'verification', 'outcome'];
  const missing = required.filter(stage => !stages.has(stage));
  const selected = normalized.find(event => event.stage === 'selected');
  const actual = normalized.find(event => event.stage === 'actual_invocation');
  const verification = normalized.find(event => event.stage === 'verification');
  const outcome = normalized.find(event => event.stage === 'outcome');
  const selectedVsUsed = selected?.capability_ids?.length && actual?.actual_capability_ids?.length
    ? (setEqual(selected.capability_ids, actual.actual_capability_ids) ? 'match' : 'mismatch')
    : 'unknown';
  const verifiedOutcome = verification?.verified === true && outcome?.verified === true && outcome.outcome_kind !== 'unknown';
  const last = normalized.at(-1);
  const complete = missing.length === 0 && stages.has('shadow') && stages.has('canary')
    && (stages.has('promotion') || stages.has('rollback')) && stages.has('refreshed_snapshot');
  const nextStage = complete ? null : (missing[0] || (!stages.has('shadow') ? 'shadow' : !stages.has('canary') ? 'canary' : 'promotion'));
  return {
    status: complete ? 'complete' : (TERMINAL_STAGES.has(last.stage) ? 'terminal' : 'unknown'),
    privacy_safe: true,
    correlation_id: correlationId,
    scope: scopeOf(normalized[0]),
    stages: normalized.map(event => event.stage),
    missing_stages: missing,
    next_stage: nextStage,
    selected_vs_used: selectedVsUsed,
    verified_outcomes: verifiedOutcome ? 1 : 0,
    evidence_classes: [...new Set(normalized.map(event => event.evidence_class))].sort(),
    cost: normalized.reduce((result, event) => {
      for (const key of Object.keys(result)) if (event.cost[key] !== null) result[key] += event.cost[key];
      return result;
    }, { estimated_tokens: 0, actual_tokens: 0, context_bytes: 0, latency_ms: 0, tool_calls: 0, retries: 0, downstream_ms: 0 }),
    fingerprint: fingerprint(normalized),
  };
}

export function summarizeScopedEvidence(chains = []) {
  const summary = new Map();
  for (const chain of Array.isArray(chains) ? chains : []) {
    if (!chain?.scope || !chain.privacy_safe) continue;
    const key = stableStringify(chain.scope);
    if (!summary.has(key)) summary.set(key, { scope: chain.scope, verified: 0, unknown: 0, selected_vs_used: { match: 0, mismatch: 0, unknown: 0 }, evidence_classes: [] });
    const row = summary.get(key);
    if (chain.verified_outcomes > 0) row.verified += chain.verified_outcomes;
    else row.unknown += 1;
    row.selected_vs_used[chain.selected_vs_used] += 1;
    row.evidence_classes = [...new Set([...row.evidence_classes, ...(chain.evidence_classes || [])])].sort();
  }
  return [...summary.values()].sort((left, right) => stableStringify(left.scope).localeCompare(stableStringify(right.scope)));
}

export function proposeShadowImprovement({ chain, proposal, minimum_verified = 1 } = {}) {
  if (!chain || chain.privacy_safe !== true || chain.verified_outcomes < minimum_verified) {
    return { status: 'denied', reason_code: 'verified_evidence_insufficient', authority_unchanged: true };
  }
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) || Object.keys(proposal).some(key => !['kind', 'from', 'to', 'target_id', 'scope'].includes(key))) {
    return { status: 'denied', reason_code: 'proposal_shape_invalid', authority_unchanged: true };
  }
  const kind = token(proposal.kind);
  const target = token(proposal.target_id || proposal.from);
  const to = token(proposal.to);
  if (!PROPOSAL_KINDS.has(kind) || !target || !to) return { status: 'denied', reason_code: 'proposal_not_bounded', authority_unchanged: true };
  const scope = proposal.scope && typeof proposal.scope === 'object' ? scopeOf(proposal.scope) : chain.scope;
  const result = {
    schema_version: 1,
    status: 'shadow',
    proposal_id: `shadow-${fingerprint({ kind, target, to, scope }).slice(0, 32)}`,
    kind,
    target_id: target,
    to,
    scope,
    source_evidence_fingerprint: chain.fingerprint,
    requires_canary: true,
    authority_unchanged: true,
    permission_unchanged: true,
  };
  return { ...result, fingerprint: fingerprint(result) };
}

export function closeFlywheel({ chain, shadow, canary = 'pending', snapshot_epoch = null } = {}) {
  if (!chain || chain.status === 'unknown' || chain.verified_outcomes < 1) return { status: 'unknown', reason_code: 'verified_outcome_missing', authority_unchanged: true };
  if (!shadow || shadow.status !== 'shadow') return { status: 'unknown', reason_code: 'shadow_proposal_missing', authority_unchanged: true };
  if (canary === 'promoted') return { status: 'promoted', next_snapshot_epoch: token(snapshot_epoch), authority_unchanged: true, permission_unchanged: true };
  if (canary === 'rolled_back') return { status: 'rolled_back', next_snapshot_epoch: token(snapshot_epoch), authority_unchanged: true, permission_unchanged: true };
  return { status: 'shadow', reason_code: 'canary_pending', authority_unchanged: true, permission_unchanged: true };
}
