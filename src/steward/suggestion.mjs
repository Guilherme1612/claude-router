import { createHash } from 'node:crypto';
import { COOLDOWN_MS } from '../health/thresholds.mjs';
import { stableStringify } from '../registry/schema.mjs';

export const STEWARD_POLICY_VERSION = 'steward-policy-v1';

const MAX_OBSERVATIONS = 256;
const MAX_IDS = 32;
const MIN_CONFIDENCE = 8500;
const TOKEN = /^[a-z][a-z0-9_:-]{0,127}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const PRIORITY = Object.freeze({
  missing_dependency: 0,
  missing_category: 1,
  ineffective: 2,
  reusable_workflow: 3,
  stale: 4,
  unmapped: 5,
  overlap: 6,
  duplicate: 7,
  long_unused: 8,
});
const PROJECTION = Object.freeze({
  missing_dependency: ['restore_dependency_coverage', 'low', 'review_contract'],
  missing_category: ['restore_category_coverage', 'low', 'review_contract'],
  ineffective: ['reduce_failed_routes', 'medium', 'consider_deprecation'],
  reusable_workflow: ['reuse_proven_workflow', 'low', 'propose_reusable_skill'],
  stale: ['refresh_capability_contract', 'low', 'review_contract'],
  unmapped: ['improve_route_coverage', 'low', 'reassess_mapping'],
  overlap: ['reduce_route_ambiguity', 'medium', 'reassess_mapping'],
  duplicate: ['reduce_duplicate_routing', 'medium', 'reassess_mapping'],
  long_unused: ['reduce_stale_inventory', 'medium', 'consider_deprecation'],
});

function typeError(message) {
  throw new TypeError(message);
}

function safeInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) typeError(`${name} is out of bounds`);
  return value;
}

function validateObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) typeError('observation must be an object');
  if (!Object.hasOwn(PRIORITY, value.observation_kind)) typeError('unknown observation_kind');
  for (const field of ['reason_code', 'remedy']) {
    if (typeof value[field] !== 'string' || !TOKEN.test(value[field])) typeError(`invalid ${field}`);
  }
  if (!['fresh', 'stale'].includes(value.freshness)) typeError('invalid freshness');
  safeInteger(value.evidence_window_ms, 'evidence_window_ms');
  safeInteger(value.confidence_basis_points, 'confidence_basis_points', { max: 10_000 });
  if (!Array.isArray(value.affected_capability_ids)
    || value.affected_capability_ids.length < 1
    || value.affected_capability_ids.length > MAX_IDS) typeError('invalid affected_capability_ids');
  const affected = [...new Set(value.affected_capability_ids.map((id) => {
    if (typeof id !== 'string' || !TOKEN.test(id)) typeError('invalid affected capability id');
    return id;
  }))].sort();
  const evidence = { evidence_window_ms: value.evidence_window_ms };
  if (value.sample_size !== undefined) evidence.sample_size = safeInteger(value.sample_size, 'sample_size', { max: 10_000_000 });
  if (value.opportunity_count !== undefined) evidence.opportunity_count = safeInteger(value.opportunity_count, 'opportunity_count', { max: 10_000_000 });
  if (evidence.sample_size === undefined && evidence.opportunity_count === undefined) typeError('missing bounded evidence');
  return {
    observation_kind: value.observation_kind,
    reason_code: value.reason_code,
    remedy: value.remedy,
    freshness: value.freshness,
    confidence_basis_points: value.confidence_basis_points,
    affected_capability_ids: affected,
    evidence,
  };
}

function semanticProjection(value) {
  const observation = validateObservation(value);
  return {
    policy_version: STEWARD_POLICY_VERSION,
    observation_kind: observation.observation_kind,
    reason_code: observation.reason_code,
    remedy: observation.remedy,
    confidence_basis_points: observation.confidence_basis_points,
    affected_capability_ids: observation.affected_capability_ids,
    evidence: observation.evidence,
  };
}

export function suggestionFingerprint(observation) {
  return createHash('sha256').update(stableStringify(semanticProjection(observation))).digest('hex');
}

function normalizeState(state) {
  if (state === undefined || state === null) return {};
  if (typeof state !== 'object' || Array.isArray(state)) typeError('state must be an object');
  return state;
}

function timestampFor(state, field, fingerprint) {
  const value = state[field]?.[fingerprint];
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isSuppressed(state, fingerprint, now) {
  return timestampFor(state, 'dismissed', fingerprint) !== null
    || (timestampFor(state, 'snoozed_until', fingerprint) ?? 0) > now
    || (timestampFor(state, 'cooldown_at', fingerprint) ?? -COOLDOWN_MS) > now - COOLDOWN_MS;
}

function ranking(a, b) {
  return PRIORITY[a.observation_kind] - PRIORITY[b.observation_kind]
    || b.confidence_basis_points - a.confidence_basis_points
    || b.evidence.evidence_window_ms - a.evidence.evidence_window_ms
    || (b.evidence.sample_size ?? b.evidence.opportunity_count ?? 0)
      - (a.evidence.sample_size ?? a.evidence.opportunity_count ?? 0)
    || a.reason_code.localeCompare(b.reason_code)
    || a.affected_capability_ids.join('\0').localeCompare(b.affected_capability_ids.join('\0'))
    || a.fingerprint.localeCompare(b.fingerprint);
}

export function selectSuggestion({ observations, state, now = Date.now() } = {}) {
  if (!Array.isArray(observations) || observations.length > MAX_OBSERVATIONS) typeError('observations must be a bounded array');
  safeInteger(now, 'now');
  const interaction = normalizeState(state);
  const eligible = observations.map((value) => {
    const observation = validateObservation(value);
    const fingerprint = suggestionFingerprint(value);
    return { ...observation, fingerprint };
  }).filter((value) => value.freshness === 'fresh'
    && value.confidence_basis_points >= MIN_CONFIDENCE
    && value.remedy !== 'no_action'
    && !isSuppressed(interaction, value.fingerprint, now));

  if (eligible.length === 0) {
    return {
      schema_version: 1,
      policy_version: STEWARD_POLICY_VERSION,
      reason_code: 'suggestion_none',
      suggestion: null,
      overview: { actionable_count: 0 },
    };
  }
  eligible.sort(ranking);
  const selected = eligible[0];
  const [expected_benefit, risk, safe_next_action] = PROJECTION[selected.observation_kind];
  return {
    schema_version: 1,
    policy_version: STEWARD_POLICY_VERSION,
    reason_code: 'suggestion_selected',
    suggestion: {
      fingerprint: selected.fingerprint,
      observation_kind: selected.observation_kind,
      reason_code: selected.reason_code,
      evidence: selected.evidence,
      confidence_basis_points: selected.confidence_basis_points,
      affected_capability_ids: selected.affected_capability_ids,
      expected_benefit,
      risk,
      safe_next_action,
    },
    overview: { actionable_count: eligible.length },
  };
}

export function startupPointer(selected, state, now = Date.now()) {
  safeInteger(now, 'now');
  const suggestion = selected?.reason_code === 'suggestion_selected' ? selected.suggestion : null;
  if (!suggestion || !FINGERPRINT.test(suggestion.fingerprint)) {
    return {
      schema_version: 1,
      policy_version: STEWARD_POLICY_VERSION,
      fingerprint: null,
      available: false,
      cooldown_until_ms: null,
    };
  }
  const interaction = normalizeState(state);
  const cooldownAt = timestampFor(interaction, 'cooldown_at', suggestion.fingerprint);
  const snoozedUntil = timestampFor(interaction, 'snoozed_until', suggestion.fingerprint);
  const cooldownUntil = Math.max(cooldownAt === null ? 0 : cooldownAt + COOLDOWN_MS, snoozedUntil ?? 0);
  const available = !isSuppressed(interaction, suggestion.fingerprint, now);
  const activeUntil = cooldownUntil > now ? cooldownUntil : null;
  return {
    schema_version: 1,
    policy_version: STEWARD_POLICY_VERSION,
    fingerprint: suggestion.fingerprint,
    available,
    cooldown_until_ms: activeUntil,
  };
}
