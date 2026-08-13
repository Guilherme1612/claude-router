// Phase 24 — Off-hot-path outcome observer.
//
// Plan 24-01 (Wave 1) shipped `deriveSelectedOutcome` — the tracer minimal that
// derives outcome_kind='selected' from a single telemetry record carrying a
// route_id. Plan 24-02 (Wave 2) extends this file additively with
// `ingestTelemetryEvidence` — the full HLTH-03 surface that reads telemetry.jsonl
// incrementally (cursor-based, rotation-safe) and derives all 9 outcome_kind
// values by correlating each telemetry record with:
//   (a) the workflow-state.json diff (prior cursor snapshot vs current), and
//   (b) the downstream_invocations field of later telemetry records.
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
//
// T-24-09 (cursor tampering): cursor writes are best-effort with 0600 perms;
// rotation (size shrank) resets and re-ingests from line 0.
// T-24-10 (info disclosure): only the sha256 prompt_signature + capability_id
// cross the correlation; no raw prompt or transcript is read.
// T-24-11 (DoS on malformed workflow-state): a missing/corrupt workflow-state
// yields 'selected' for all records (fail-open, never throw).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';
import { validateOutcomeEnvelope } from './outcome-schema.mjs';
import { HALF_LIFE_MS, MAX_RETENTION_MS } from '../evolution/evidence.mjs';
import { stableCapabilityId } from '../registry/identity.mjs';
import { refreshSuggestionPointer } from '../steward/refresh.mjs';

export { HALF_LIFE_MS, MAX_RETENTION_MS };

export const HEALTH_POLICY_VERSION = 'health-policy-v2';

// Default evidence window for the 'abandoned' derivation — 24h (HALF_LIFE_MS),
// capped at MAX_RETENTION_MS (7d) per the plan.
const DEFAULT_EVIDENCE_WINDOW_MS = HALF_LIFE_MS;

// deriveSelectedOutcome takes a telemetry record (shape from router.mjs
// telemetry entry: ts, prompt_signature, suggested_mode, suggested_skills,
// suggested_agents, confidence_tier, guards_fired, route_id) and returns an
// accepted outcome record (outcome_kind='selected') or a denied result. The
// matched capability is the first suggested_skill or suggested_agent.
//
// For the tracer, the telemetry record is passed a route_id directly. The
// full observer (ingestTelemetryEvidence) maps the real telemetry `route`
// object onto route_id before calling this function.
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
    // WR-01: forward the runtime tag (written by telemetryEntryFromState) so a
    // runtime-tagged telemetry line survives ingest into the correlated-outcome
    // store that feeds evolution weights. epoch is forward-compat scaffolding —
    // forwarded if present, else null. Additive; does not change the existing
    // outcome shape.
    runtime: telemetryRecord.runtime ?? null,
    epoch: telemetryRecord.epoch ?? null,
  };
  const fingerprint = createHash('sha256').update(stableStringify(canonicalRecord), 'utf8').digest('hex');
  const fullRecord = { ...canonicalRecord, fingerprint };

  return validateOutcomeEnvelope(fullRecord);
}

// readJsonBestEffort — read a JSON file, returning null on missing/corrupt.
// Mirrors the readState pattern in store.mjs (T-24-11 fail-open).
function readJsonBestEffort(path) {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// extractCapabilityId — pull the matched capability from a telemetry record and
// run it through stableCapabilityId. Returns null if no match or the id fn
// throws (defensive — a malformed record is skipped, not thrown on).
function extractCapabilityId(telemetryRecord, stableCapabilityIdFn) {
  const matched = (Array.isArray(telemetryRecord.suggested_skills) && telemetryRecord.suggested_skills[0])
    || (Array.isArray(telemetryRecord.suggested_agents) && telemetryRecord.suggested_agents[0]);
  if (!matched) return null;
  try { return stableCapabilityIdFn(matched); } catch { return null; }
}

// deriveOutcomeKind — the HLTH-03 per-record derivation. Priority order (most
// specific concrete signal first):
//   1. 'overridden'  — next record's confidence_tier === 'user_explicit'
//   2. 'actually_used' — next record's downstream_invocations contains this cap
//   3. 'helpful_reuse' — a LATER record (after the next) has downstream_invocations
//                       containing this cap with a different route_id
//   4. 'replaced'    — next record's downstream_invocations is non-empty and
//                       does NOT contain this cap
//   5. 'completed'   — workflow-state advanced (new state not in prior history)
//   6. 'corrected'   — workflow-state regressed (state revisited from prior history)
//   7. 'retried'     — same-state re-dispatch (same transition id, no advancement)
//   8. 'abandoned'   — no advancement within evidence_window_ms
//   9. 'selected'    — default (dispatch recorded, no completion signal yet)
function deriveOutcomeKind({
  record, nextRecord, laterRecords, capabilityId,
  priorWorkflowState, currentWorkflowState, now, evidenceWindowMs,
}) {
  // 1. overridden — user explicitly chose a different route on the next prompt.
  if (nextRecord && nextRecord.confidence_tier === 'user_explicit') {
    return { outcome_kind: 'overridden', reason_code: 'user_explicit_override' };
  }

  // 2. actually_used — the next telemetry record's downstream_invocations
  //    shows this capability was the one invoked.
  if (nextRecord && Array.isArray(nextRecord.downstream_invocations) && nextRecord.downstream_invocations.includes(capabilityId)) {
    return { outcome_kind: 'actually_used', reason_code: 'downstream_invoked' };
  }

  // 3. helpful_reuse — a later record (after the next) reuses this capability
  //    on a different route_id (reused across intents). Checked before the
  //    'replaced' fall-through so that, when both signals are present (the
  //    next record invoked a different capability AND a later record reused
  //    this one on a different intent), helpful_reuse wins per the documented
  //    priority order (3 > 4).
  if (Array.isArray(laterRecords)) {
    for (const later of laterRecords) {
      if (!later || !Array.isArray(later.downstream_invocations)) continue;
      if (later.downstream_invocations.includes(capabilityId) && later.route_id !== record.route_id) {
        return { outcome_kind: 'helpful_reuse', reason_code: 'later_reuse_different_intent' };
      }
    }
  }

  // 4. replaced — a different capability was invoked instead.
  if (nextRecord && Array.isArray(nextRecord.downstream_invocations) && nextRecord.downstream_invocations.length > 0) {
    return { outcome_kind: 'replaced', reason_code: 'downstream_replaced' };
  }

  // 5-8. workflow-state diff (current vs prior cursor snapshot). When either
  // state is missing/corrupt, the entire advancement-based derivation is
  // skipped (T-24-11 fail-open → 'selected'); without a baseline we cannot
  // determine advancement, regression, re-dispatch, OR abandonment.
  if (priorWorkflowState && currentWorkflowState
      && priorWorkflowState.position && currentWorkflowState.position
      && typeof priorWorkflowState.position.state === 'string'
      && typeof currentWorkflowState.position.state === 'string') {
    const priorState = priorWorkflowState.position.state;
    const currentState = currentWorkflowState.position.state;
    if (priorState === currentState) {
      // No advancement. If the evidence window has expired, this is 'abandoned';
      // otherwise a same-state re-dispatch with the same transition id is
      // 'retried'; anything else falls through to 'selected'.
      if (Number.isSafeInteger(now) && Number.isSafeInteger(record.ts)
          && (now - record.ts) > Math.min(evidenceWindowMs, MAX_RETENTION_MS)) {
        return { outcome_kind: 'abandoned', reason_code: 'no_advancement_within_window' };
      }
      const priorT = priorWorkflowState.last_transition_id;
      const currentT = currentWorkflowState.last_transition_id;
      if (typeof priorT === 'string' && typeof currentT === 'string' && priorT === currentT) {
        return { outcome_kind: 'retried', reason_code: 'same_state_redispatch' };
      }
    } else {
      // State changed — advancement vs regression. A state in the prior
      // history that we're now back in is a regression; a brand-new state is
      // an advancement.
      const priorHistoryStates = new Set(
        Array.isArray(priorWorkflowState.history)
          ? priorWorkflowState.history.map((h) => h && h.state).filter((s) => typeof s === 'string')
          : [],
      );
      if (priorHistoryStates.has(currentState)) {
        return { outcome_kind: 'corrected', reason_code: 'workflow_regression' };
      }
      return { outcome_kind: 'completed', reason_code: 'workflow_advanced' };
    }
  }

  // 9. default — dispatch recorded, no completion signal yet.
  return { outcome_kind: 'selected', reason_code: 'route_selected' };
}

// buildOutcomeRecord — assemble the canonical outcome envelope from a telemetry
// record + derived kind, then validate. Returns { status: 'accepted', signal }
// or { status: 'denied', reason_code }.
function buildOutcomeRecord({ telemetryRecord, capabilityId, outcome_kind, reason_code, evidenceWindowMs }) {
  const guard_codes = Array.isArray(telemetryRecord.guards_fired) ? [...telemetryRecord.guards_fired] : [];
  const prompt_signature = telemetryRecord.prompt_signature === undefined ? null : telemetryRecord.prompt_signature;
  // WR-01: align evidence_window_ms with the tracer path for 'selected'
  // outcomes. 'selected' means "no completion signal observed yet", so the
  // evidence window is genuinely 0 — there is no window over which to look
  // for a completion signal. The tracer minimal (deriveSelectedOutcome) already
  // hardcodes 0; the full observer previously used the configured window
  // (defaulting to 24h), making the same outcome_kind persist with two
  // different contracts depending on which path produced it.
  const effectiveWindowMs = outcome_kind === 'selected' ? 0 : Math.min(evidenceWindowMs, MAX_RETENTION_MS);
  const canonicalRecord = {
    timestamp_ms: telemetryRecord.ts,
    capability_id: capabilityId,
    outcome_kind,
    prompt_signature,
    route_id: telemetryRecord.route_id,
    confidence_band: telemetryRecord.confidence_tier,
    guard_codes,
    reason_code,
    evidence_window_ms: effectiveWindowMs,
    sample_size: 1,
    opportunity_count: 1,
    freshness: 'fresh',
    policy_version: HEALTH_POLICY_VERSION,
    // WR-01: forward the runtime tag (see deriveSelectedOutcome) so the runtime
    // attribution survives into the outcome store via the full-observer path too.
    runtime: telemetryRecord.runtime ?? null,
    epoch: telemetryRecord.epoch ?? null,
  };
  const fingerprint = createHash('sha256').update(stableStringify(canonicalRecord), 'utf8').digest('hex');
  return validateOutcomeEnvelope({ ...canonicalRecord, fingerprint });
}

// ingestTelemetryEvidence — HLTH-03 full observation capture. Reads telemetry
// incrementally from a size/mtime/lineCount cursor (analog: src/registry/
// watcher.mjs ingestTelemetryEvidence), reads workflow-state.json (the
// persisted state that synthesizeNextPrompt consumes), and derives the
// outcome_kind for each new telemetry record by correlating it with the
// workflow-state diff + downstream_invocations of later records.
//
// Cursor shape: { size, mtimeMs, recordCount, workflowStateMtimeMs,
//   priorWorkflowState, pendingSelections }. The priorWorkflowState field is the workflow-state
//   snapshot at the last successful ingest — it is the diff baseline. (The
//   plan's listed cursor fields were size/mtimeMs/lineCount/workflowStateMtimeMs;
//   priorWorkflowState is added so the diff in step 5-7 of deriveOutcomeKind
//   has a baseline to compare against — Rule 2: missing critical functionality
//   for the diff to work.)
//
// Returns { ingested, skipped, denied, kind_counts } where kind_counts is a
// map of outcome_kind → count. Cursor persistence is best-effort with 0600
// perms (T-24-09); a failed cursor write never throws.
export function ingestTelemetryEvidence({
  store, telemetryPath, workflowStatePath, cursorPath,
  now = Date.now(), stableCapabilityIdFn = stableCapabilityId,
  evidenceWindowMs = DEFAULT_EVIDENCE_WINDOW_MS,
  ownedRoot, refreshSuggestionPointerFn = refreshSuggestionPointer,
} = {}) {
  if (!store || typeof store !== 'object') throw new TypeError('store is required');
  if (typeof telemetryPath !== 'string') throw new TypeError('telemetryPath is required');
  if (typeof workflowStatePath !== 'string') throw new TypeError('workflowStatePath is required');
  if (typeof cursorPath !== 'string') throw new TypeError('cursorPath is required');

  let stat;
  try { stat = statSync(telemetryPath); } catch {
    return { ingested: 0, skipped: 'no_telemetry_file', denied: 0, kind_counts: {} };
  }

  let cursor = null;
  try { cursor = JSON.parse(readFileSync(cursorPath, 'utf8')); } catch { cursor = null; }

  const size = stat.size;
  const mtimeMs = stat.mtimeMs;
  const workflowState = readJsonBestEffort(workflowStatePath);
  let workflowStateMtimeMs = null;
  try { workflowStateMtimeMs = statSync(workflowStatePath).mtimeMs; } catch { workflowStateMtimeMs = null; }

  // Unchanged short-circuit — both the telemetry file AND the workflow-state
  // file must be unchanged. (A workflow-state change alone could flip prior
  // records' outcomes, but the cursor-based incremental model only derives
  // outcomes for NEW telemetry records, so a workflow-state-only change with
  // no new telemetry is a no-op.)
  if (cursor && cursor.size === size && cursor.mtimeMs === mtimeMs
      && cursor.workflowStateMtimeMs === workflowStateMtimeMs) {
    return { ingested: 0, skipped: 'unchanged', denied: 0, kind_counts: {} };
  }

  const lines = readFileSync(telemetryPath, 'utf8').split('\n');

  // Parse all records once — we need access to next + later records for the
  // downstream_invocations correlation. allRecords excludes empty (trailing)
  // lines, so the cursor must store a record count, not a raw line count
  // (CR-01: an off-by-one between lines.length and allRecords.length silently
  // dropped every newly-appended record after the first ingest).
  const allRecords = [];
  let malformed = 0;
  for (const line of lines) {
    if (line.length === 0) continue;
    try { allRecords.push(JSON.parse(line)); } catch { malformed += 1; allRecords.push(null); }
  }

  let startLine = 0;
  // Rotation reset — if the file shrank or the cursor's recordCount exceeds the
  // current record count, re-ingest from record 0 (file was rotated/truncated).
  // Legacy cursors wrote `lineCount` (raw lines incl. trailing empty); a cursor
  // with no `recordCount` triggers a safe full re-ingest (bounded by retention).
  // WR-03: require strict growth (cursor.size < size) for the incremental path.
  // A same-size rewrite with a different mtime would otherwise take the
  // incremental path with a stale cursor.recordCount, silently skipping
  // records overwritten at the start of the file. When size is equal but
  // mtime differs, fall through to a full re-ingest (startLine stays 0).
  if (cursor && cursor.size < size && typeof cursor.recordCount === 'number'
      && cursor.recordCount <= allRecords.length) {
    startLine = cursor.recordCount;
  } else if (cursor && cursor.size === size && cursor.mtimeMs === mtimeMs
      && typeof cursor.recordCount === 'number' && cursor.recordCount <= allRecords.length) {
    startLine = cursor.recordCount;
  }

  const priorWorkflowState = (cursor && cursor.priorWorkflowState) || null;
  const priorPending = Array.isArray(cursor?.pendingSelections) ? cursor.pendingSelections : [];
  const pendingSelections = [];
  const kind_counts = {};
  let ingested = 0;
  let denied = 0;
  const diagnostics = { duplicate: 0, late: 0, malformed, old_schema: 0, privacy_denied: 0 };

  function appendDerived(telemetryRecord, capabilityId, outcome_kind, reason_code) {
    const built = buildOutcomeRecord({
      telemetryRecord, capabilityId, outcome_kind, reason_code, evidenceWindowMs,
    });
    if (built.status !== 'accepted') {
      denied += 1;
      if (built.reason_code === 'privacy_signature_forbidden') diagnostics.privacy_denied += 1;
      return false;
    }
    const appended = store.append(built.signal);
    if (appended.status === 'duplicate') { diagnostics.duplicate += 1; return false; }
    if (appended.status !== 'stored') { denied += 1; return false; }
    if (typeof ownedRoot === 'string' && typeof refreshSuggestionPointerFn === 'function') {
      try { refreshSuggestionPointerFn({ ownedRoot, now }); } catch { /* durable evidence remains authoritative */ }
    }
    ingested += 1;
    kind_counts[outcome_kind] = (kind_counts[outcome_kind] || 0) + 1;
    return true;
  }

  // Reconcile selections saved by the prior ingest. A workflow transition is
  // associated only with the most recent pending route; downstream telemetry
  // remains correlated by record position.
  for (let i = 0; i < priorPending.length; i += 1) {
    const pending = priorPending[i];
    if (!pending?.record || typeof pending.capabilityId !== 'string'
        || !Number.isSafeInteger(pending.recordIndex)) continue;
    const nextRecord = pending.recordIndex + 1 < allRecords.length
      ? allRecords[pending.recordIndex + 1] : null;
    const laterRecords = pending.recordIndex + 2 < allRecords.length
      ? allRecords.slice(pending.recordIndex + 2) : [];
    const workflowChanged = cursor?.workflowStateMtimeMs !== workflowStateMtimeMs;
    const useWorkflow = workflowChanged && i === priorPending.length - 1;
    const derived = deriveOutcomeKind({
      record: pending.record, nextRecord, laterRecords,
      capabilityId: pending.capabilityId,
      priorWorkflowState: useWorkflow ? priorWorkflowState : null,
      currentWorkflowState: useWorkflow ? workflowState : null,
      now, evidenceWindowMs,
    });
    if (derived.outcome_kind === 'selected') {
      pendingSelections.push(pending);
    } else {
      appendDerived(pending.record, pending.capabilityId, derived.outcome_kind, derived.reason_code);
    }
  }

  for (let i = startLine; i < allRecords.length; i += 1) {
    const record = allRecords[i];
    if (!record || typeof record !== 'object') { denied += 1; continue; }
    if (record.schema_version !== undefined && record.schema_version !== 1) {
      diagnostics.old_schema += 1;
      denied += 1;
      continue;
    }
    if (Number.isSafeInteger(cursor?.lastTimestamp) && Number.isSafeInteger(record.ts)
        && record.ts < cursor.lastTimestamp) diagnostics.late += 1;
    // Only records carrying a route_id are outcome-eligible.
    if (typeof record.route_id !== 'string' || record.route_id.length === 0) continue;

    const capabilityId = extractCapabilityId(record, stableCapabilityIdFn);
    if (!capabilityId) { denied += 1; continue; }

    const nextRecord = i + 1 < allRecords.length ? allRecords[i + 1] : null;
    const laterRecords = i + 2 < allRecords.length ? allRecords.slice(i + 2) : [];

    const useWorkflow = priorPending.length === 0 && i === allRecords.length - 1;
    const { outcome_kind, reason_code } = deriveOutcomeKind({
      record, nextRecord, laterRecords, capabilityId,
      priorWorkflowState: useWorkflow ? priorWorkflowState : null,
      currentWorkflowState: useWorkflow ? workflowState : null,
      now, evidenceWindowMs,
    });

    if (appendDerived(record, capabilityId, outcome_kind, reason_code)
        && outcome_kind === 'selected') {
      pendingSelections.push({
        record: {
          ts: record.ts,
          prompt_signature: record.prompt_signature,
          route_id: record.route_id,
          confidence_tier: record.confidence_tier,
          guards_fired: Array.isArray(record.guards_fired) ? record.guards_fired : [],
          runtime: record.runtime ?? null,
          epoch: record.epoch ?? null,
        },
        capabilityId,
        recordIndex: i,
      });
    }
  }

  // Cursor persistence — best-effort, 0600 perms, 0700 cursor dir (T-24-09).
  try {
    mkdirSync(dirname(cursorPath), { recursive: true, mode: 0o700 });
    writeFileSync(cursorPath, JSON.stringify({
      size, mtimeMs, recordCount: allRecords.length,
      workflowStateMtimeMs,
      lastTimestamp: allRecords.reduce((max, row) => Number.isSafeInteger(row?.ts) ? Math.max(max, row.ts) : max, Number.isSafeInteger(cursor?.lastTimestamp) ? cursor.lastTimestamp : 0),
      priorWorkflowState: workflowState,
      pendingSelections,
    }), { mode: 0o600 });
  } catch {
    // Cursor persistence is best-effort — a failed write only risks re-ingesting
    // duplicates next call (bounded by the 7d retention window filter).
  }

  return {
    ingested, skipped: startLine > 0 ? 'incremental' : 'full', denied, kind_counts, diagnostics,
  };
}
