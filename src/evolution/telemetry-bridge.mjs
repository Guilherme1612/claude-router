// Telemetry → D-05 evidence bridge. Stdlib-only, off the hot path.
//
// Transforms ~/.claude/router/telemetry.jsonl records (produced by the
// router hook) into the bounded content-free D-05 evidence envelope schema,
// then defers to validateEvidenceEnvelope which rejects forbidden fields
// BEFORE persistence. The bridge never accesses raw prompts, never reads
// active.json, and never computes a new prompt signature (the hook already
// suppresses signatures for privacy-denied records).

import { readFileSync } from 'node:fs';
import { validateEvidenceEnvelope } from './evidence.mjs';

// From src/prompt/compile-index.mjs:8 — hardcoded to avoid coupling the bridge
// to the hot-path index builder.
const POLICY_VERSION = 'workflow-transitions-v1';

// Mirrors evidence.mjs:12 PRIVACY_GUARDS (not exported there). Records carrying
// any of these guard codes — or confidence_tier 'deny_filtered' — are privacy-
// denied and must NOT become canary evidence (RESEARCH.md Pitfall 3).
const PRIVACY_GUARDS = new Set(['privacy_guard', 'deny_filtered', 'secret_detected', 'content_detected']);

function isPrivacyDenied(record) {
  if (record.confidence_tier === 'deny_filtered') return true;
  const guards = Array.isArray(record.guards_fired) ? record.guards_fired : [];
  return guards.some((code) => PRIVACY_GUARDS.has(code));
}

// Map confidence_tier + invoke_kind → FIXTURE_CLASSES (evidence.mjs:10).
// Returns null when the record is not canary-relevant (must be skipped).
function classifyFixtureClass(record) {
  if (record.confidence_tier === 'user_explicit') return 'explicit-override';
  if (record.confidence_tier === 'stale') return 'stale-context';
  if (record.confidence_tier === 'deny_filtered') return null; // privacy-denied
  if (record.invoke_kind === 'agent') return 'dependency';
  // Non-canary-relevant tiers produce no envelope.
  if (record.confidence_tier === 'trivial'
    || record.confidence_tier === 'reentry_skipped'
    || record.confidence_tier === 'manifest_missing') return null;
  return 'minimal-prompt'; // default for high/medium/low routed prompts
}

function deriveReasonCode(record) {
  if (record.confidence_tier === 'deny_filtered') return 'deny_filtered';
  if (record.confidence_tier === 'user_explicit') return 'user_explicit';
  if (record.confidence_tier === 'stale') return 'stale_context';
  if (record.confidence_tier === 'manifest_missing') return 'manifest_missing';
  return 'route_selected';
}

// Returns either { status: 'skipped', reason_code } (non-canary-relevant) or
// the result of validateEvidenceEnvelope(envelope) ({ status: 'accepted', signal }
// or { status: 'denied', reason_code }).
export function telemetryRecordToEvidence(record, { candidate_version = null } = {}) {
  if (!record || typeof record !== 'object') return { status: 'skipped', reason_code: 'invalid_record' };
  // Privacy-denied records never become canary evidence (RESEARCH.md Pitfall 3).
  // The hook already nulls prompt_signature for these; the bridge skips them
  // entirely rather than emitting an envelope with a non-null signature.
  if (isPrivacyDenied(record)) return { status: 'skipped', reason_code: 'not_canary_evidence' };
  const fixture_class = classifyFixtureClass(record);
  if (!fixture_class) return { status: 'skipped', reason_code: 'not_canary_evidence' };
  if (!record.suggested_mode) return { status: 'skipped', reason_code: 'no_route' };

  const envelope = {
    timestamp_ms: record.ts,
    route_id: record.suggested_mode,
    confidence_band: record.confidence_tier,
    guard_codes: Array.isArray(record.guards_fired) ? record.guards_fired : [],
    reason_code: deriveReasonCode(record),
    fixture_class,
    latency_us: Math.round((record.latency_ms || 0) * 1000),
    candidate_version: candidate_version || 'steady-state-v1',
    policy_version: POLICY_VERSION,
    verdict: 'success', // v1: telemetry outcome is null; regression detected by calibration gates
    prompt_signature: record.prompt_signature ?? null,
    // D-06 / PARITY-02 (Phase-31 bump): forward the hook's runtime tag (+epoch
    // indicator) so a runtime-tagged telemetry line survives ingest. The
    // validateEvidenceEnvelope FIELDS allowlist was bumped 11 -> 13 in lockstep
    // (evidence.mjs) so these two fields pass rather than being rejected with
    // forbidden_evidence_field.
    runtime: record.runtime ? String(record.runtime) : null,
    epoch: record.epoch !== undefined && record.epoch !== null ? String(record.epoch) : null,
  };
  return validateEvidenceEnvelope(envelope);
}

// Bulk-load a telemetry JSONL file. Calls onRecord(result) per record (accepted,
// skipped, or denied). Parse failures yield { status: 'skipped', reason_code:
// 'parse_error' }. Used by trigger surfaces to ingest telemetry off the hot path.
export function ingestTelemetryFile(path, { candidate_version = null, onRecord = () => {} } = {}) {
  const contents = readFileSync(path, 'utf8');
  const lines = contents.split('\n');
  for (const line of lines) {
    if (line.length === 0) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      onRecord({ status: 'skipped', reason_code: 'parse_error' });
      continue;
    }
    onRecord(telemetryRecordToEvidence(record, { candidate_version }));
  }
}