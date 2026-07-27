// Phase 24 — Off-hot-path outcome observer. TRACER MINIMAL (Plan 24-01 Task 1):
// derives outcome_kind='selected' from a single telemetry record that carries a
// route_id. Plan 24-02 Task 1 wires the full ingestTelemetryEvidence path that
// reads the real telemetry.jsonl file and derives the other 8 outcome kinds
// from workflow-state diff + downstream-invocation signals.
//
// D-3 (post-work observation source): option (c) — the observer runs OFF the
// hot path. The router hook (~/.claude/hooks/router.mjs) is NOT modified and
// must NOT import this module (Pitfall 1, <100ms UserPromptSubmit invariant).
//
// D-2 / Pitfall 3: capability_id is stableCapabilityId(matchedCapability) —
// never record.name. The framework-prefix rejection in outcome-schema.mjs
// catches any stale caller that passes a prefixed name.
//
// D-6: the persisted field is `outcome_kind`, never `outcome`.

import { createHash } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';
import { validateOutcomeEnvelope } from './outcome-schema.mjs';

export const HEALTH_POLICY_VERSION = 'health-policy-v1';

// deriveSelectedOutcome takes a telemetry record (shape from router.mjs
// telemetry entry: ts, prompt_signature, suggested_mode, suggested_skills,
// suggested_agents, confidence_tier, guards_fired, route_id) and returns an
// accepted outcome record (outcome_kind='selected') or a denied result. The
// matched capability is the first suggested_skill or suggested_agent; the
// full 9-kind derivation lands in Plan 24-02.
//
// For the tracer, the telemetry record is passed a route_id directly. The
// full observer (24-02) maps the real telemetry `route` object onto route_id
// before calling this function.
export function deriveSelectedOutcome(telemetryRecord, { stableCapabilityIdFn } = {}) {
  if (!telemetryRecord || typeof telemetryRecord !== 'object' || Array.isArray(telemetryRecord)) {
    return { status: 'denied', reason_code: 'invalid_telemetry_record' };
  }
  if (typeof stableCapabilityIdFn !== 'function') {
    return { status: 'denied', reason_code: 'stable_capability_id_fn_required' };
  }

  const matched = (Array.isArray(telemetryRecord.suggested_skills) && telemetryRecord.suggested_skills[0])
    || (Array.isArray(telemetryRecord.suggested_agents) && telemetryRecord.suggested_agents[0]);
  if (!matched) return { status: 'denied', reason_code: 'no_matched_capability' };

  let capability_id;
  try { capability_id = stableCapabilityIdFn(matched); } catch { return { status: 'denied', reason_code: 'invalid_capability' }; }

  const guard_codes = Array.isArray(telemetryRecord.guards_fired) ? [...telemetryRecord.guards_fired] : [];
  const prompt_signature = telemetryRecord.prompt_signature === undefined ? null : telemetryRecord.prompt_signature;

  // Build the canonical record WITHOUT the fingerprint field, then hash it.
  // The fingerprint is the integrity anchor for the persisted record (T-24-04
  // tampering mitigation); computing it over a deterministic serialization
  // makes the record self-verifying.
  const canonicalRecord = {
    timestamp_ms: telemetryRecord.ts,
    capability_id,
    outcome_kind: 'selected',
    prompt_signature,
    route_id: telemetryRecord.route_id,
    confidence_band: telemetryRecord.confidence_tier,
    guard_codes,
    reason_code: 'route_selected',
    evidence_window_ms: 0,
    sample_size: 1,
    opportunity_count: 1,
    freshness: 'fresh',
    policy_version: HEALTH_POLICY_VERSION,
  };
  const fingerprint = createHash('sha256').update(stableStringify(canonicalRecord), 'utf8').digest('hex');
  const fullRecord = { ...canonicalRecord, fingerprint };

  return validateOutcomeEnvelope(fullRecord);
}