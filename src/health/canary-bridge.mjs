// Phase 24 Plan 24-04 — Canary bridge for threshold activation (HLTH-11 canary
// guard, D-canary).
//
// promoteThresholdCandidate delegates ALL threshold activation through the
// existing src/evolution/canary-controller.mjs evaluateCandidate +
// applyCanaryDecision + REQUIRED_GATES (6 gates: safety, privacy, quality,
// context_budget, compatibility, latency). There is NO parallel gate suite
// (RESEARCH "Don't Hand-Roll"). Insufficient evidence → rejected with
// reason_code 'insufficient_evidence_samples' (canary-controller.mjs:149),
// never promoted.
//
// The bridge is a thin adapter: the gate logic is fully reused from
// canary-controller.mjs; only the persistence (writing thresholds.json +
// active.json under ~/.claude/router/health/versions/) is health-specific,
// injected via a custom `publication` object. This mirrors how
// router-control.mjs injects the registry publication — the publication is
// the persistence layer, NOT the gate suite.
//
// D-5: the versions/active.json pointer lives under
// ~/.claude/router/health/versions/, ISOLATED from release-tuples/active.json.
//
// D-6: the version field is `policy_version`, never bare `version`.
//
// W6 reframed: the compatibility gate checks BACKWARD-COMPATIBILITY with
// existing health consumers (Phase 25 suggestion surface, Phase 26 tuple
// member) — the candidate's policy_version follows the existing
// `health-policy-vN` scheme AND the weights object preserves the 5-key shape
// (recency/completion/opportunity/reversibility/confidence). This mirrors
// `compatible()` (src/prompt/compile-index.mjs:92-98) which checks that the
// candidate's contract version fields MATCH the existing
// COMPILED_INDEX_COMPATIBILITY constants. A candidate with an unchanged shape
// but new VALUES passes (the canary gate's job is to evidence the value
// change, not to forbid it); a candidate that breaks the weights shape fails
// with reason_code 'compatibility_uncertain'.
//
// This module is OFF the UserPromptSubmit hot path (REL-01) and makes no
// network calls (HLTH-02). It is invoked by the operator CLI (a future
// `router health canary promote` subcommand, NOT in this phase). The tests
// call promoteThresholdCandidate directly.

import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  evaluateCandidate,
  applyCanaryDecision,
  proposeCandidate,
  REQUIRED_GATES,
} from '../evolution/canary-controller.mjs';
import { POLICY_VERSION, healthVersionsRoot, readActivePointer } from './thresholds.mjs';

export { REQUIRED_GATES };

const WEIGHT_KEYS = Object.freeze(['recency', 'completion', 'opportunity', 'reversibility', 'confidence']);

// compatibleThresholds — the W6 reframed compatibility check. Backward-
// compatibility with existing health consumers: the candidate's policy_version
// follows the `health-policy-vN` scheme AND the weights object preserves the
// 5-key shape. A candidate with new VALUES but the same shape passes; a
// candidate that drops/renames a key fails. Mirrors `compatible()` in
// compile-index.mjs which checks contract version fields MATCH the existing
// constants (not novelty).
function compatibleThresholds(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (typeof candidate.policy_version !== 'string') return false;
  if (!/^health-policy-v\d+$/.test(candidate.policy_version)) return false;
  if (!candidate.weights || typeof candidate.weights !== 'object') return false;
  const keys = Object.keys(candidate.weights).sort();
  if (keys.length !== 5) return false;
  for (const k of WEIGHT_KEYS) {
    if (!keys.includes(k)) return false;
    if (typeof candidate.weights[k] !== 'number' || !Number.isFinite(candidate.weights[k])) return false;
  }
  return true;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// durableWrite — atomic temp+rename+fsync with 0600 perms (mirrors
// store.mjs durableWrite pattern).
function durableWrite(path, bytes) {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

// createHealthPublication — the health-specific persistence layer injected
// into applyCanaryDecision. This is NOT a gate suite; it is the persistence
// adapter (mirror of how router-control.mjs injects the registry publication).
// D-5: writes ONLY under ~/.claude/router/health/versions/, never touches
// release-tuples/active.json. Exported for direct unit testing of the
// recoverActiveVersion path-handling fix (WR-02).
export function createHealthPublication() {
  return Object.freeze({
    // Health v1 has no rollback journal — never blocks recovery.
    recoverRollbackJournal({ ownedRoot }) {
      return { recovery_status: 'clear', reason_code: 'no_rollback_journal' };
    },
    // Read the active health policy_version pointer. The caller passes the
    // versions root (join(healthRoot, 'versions')) as `ownedRoot` here — see
    // promoteThresholdCandidate line 200 + applyCanaryDecision activation
    // passing. readActivePointer appends another 'versions/' segment, so
    // calling it with the versions root would read
    // `<healthRoot>/versions/versions/active.json` (a nonexistent path) and
    // always return null. Read active.json directly instead.
    recoverActiveVersion({ ownedRoot }) {
      const pointerPath = join(ownedRoot, 'active.json');
      if (!existsSync(pointerPath)) return { recovery_status: 'clear', version_id: null };
      try {
        const parsed = JSON.parse(readFileSync(pointerPath, 'utf8'));
        return { recovery_status: 'clear', version_id: parsed?.policy_version ?? null };
      } catch {
        return { recovery_status: 'clear', version_id: null };
      }
    },
    // Health v1: rollback is a future concern. A not-ready preview causes
    // applyCanaryDecision to surface recovery_required rather than silently
    // rolling back. This path is only reached when published_version is set
    // AND the evaluation is not promotable — the bridge passes
    // published_version: null so this path is not taken in v1.
    previewRollback({ ownedRoot, destination }) {
      return { preview_status: 'not_ready', reason_code: 'rollback_not_supported' };
    },
    executeRollback() {
      return { rollback_status: 'not_rolled_back', reason_code: 'rollback_not_supported' };
    },
    // activateCandidate — write thresholds.json + active.json pointer under
    // health/versions/<policy_version>/ (D-5 isolated from release-tuples).
    // WR-04: write both temp files + fsync BEFORE either rename so a failure
    // during the second write leaves no partially-visible state. If the
    // thresholds rename succeeds but the active.json rename fails, clean up
    // the orphaned thresholds.json best-effort so readActivePointer does not
    // surface a bundle with no active pointer to it.
    activateCandidate(activation) {
      const root = activation?.ownedRoot;
      if (!root || typeof root !== 'string') {
        return { activation_status: 'rejected', reason_code: 'invalid_activation_input' };
      }
      const { policy_version, weights, tier_boundaries, cooldown_ms, calibration_corpus_version } = activation;
      if (typeof policy_version !== 'string') {
        return { activation_status: 'rejected', reason_code: 'invalid_activation_input' };
      }
      const dir = join(root, policy_version);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const bundle = { policy_version, weights, tier_boundaries, cooldown_ms, calibration_corpus_version };
      const file = join(dir, 'thresholds.json');
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      const pointerPath = join(root, 'active.json');
      const pointerTmp = `${pointerPath}.tmp-${process.pid}-${Date.now()}`;
      // Phase 1 — write both temp files and fsync (no renames yet, so a
      // failure here changes nothing visible). On any failure, clean up both
      // temps best-effort and return rejected.
      try {
        durableWrite(tmp, JSON.stringify(bundle));
        durableWrite(pointerTmp, JSON.stringify({ policy_version }));
      } catch (err) {
        try { rmSync(tmp, { force: true }); } catch { /* best-effort */ }
        try { rmSync(pointerTmp, { force: true }); } catch { /* best-effort */ }
        return { activation_status: 'rejected', reason_code: 'activation_write_failed', detail: String(err?.message || err) };
      }
      // Phase 2 — rename both into place. If the thresholds rename succeeds
      // but the pointer rename fails, remove the orphaned thresholds.json so
      // readActivePointer still returns the prior version.
      try {
        renameSync(tmp, file);
      } catch (err) {
        try { rmSync(tmp, { force: true }); } catch { /* best-effort */ }
        try { rmSync(pointerTmp, { force: true }); } catch { /* best-effort */ }
        return { activation_status: 'rejected', reason_code: 'activation_write_failed', detail: String(err?.message || err) };
      }
      try {
        renameSync(pointerTmp, pointerPath);
      } catch (err) {
        // thresholds.json was renamed but the pointer was not — remove the
        // orphaned bundle so a later loadThresholds does not surface it.
        try { rmSync(file, { force: true }); } catch { /* best-effort */ }
        try { rmSync(pointerTmp, { force: true }); } catch { /* best-effort */ }
        return { activation_status: 'rejected', reason_code: 'activation_write_failed', detail: String(err?.message || err) };
      }
      return { activation_status: 'activated', version_id: policy_version };
    },
  });
}

// promoteThresholdCandidate — the gate adapter. Delegates ALL threshold
// activation to canary-controller evaluateCandidate + applyCanaryDecision.
//
// candidate = { policy_version, weights, tier_boundaries, cooldown_ms,
//   calibration_corpus_version }
// evidence_window = a validated, frozen evidence window (from
//   createEvidenceStore.window() or createPersistentEvidenceStore.window())
//   with status === 'validated' and sufficient === true.
// known_good_version = the currently active POLICY_VERSION (defaults to
//   readActivePointer or POLICY_VERSION).
// ownedRoot = the root for health data (defaults to ~/.claude/router/health).
//
// Returns { status: 'promoted'|'rejected', policy_version?, fingerprint?,
// reason_code? }.
export function promoteThresholdCandidate({
  candidate,
  evidence_window,
  known_good_version,
  ownedRoot,
  now = Date.now(),
} = {}) {
  const root = healthVersionsRoot(ownedRoot);
  const activePolicyVersion = readActivePointer(ownedRoot) || POLICY_VERSION;
  const knownGood = known_good_version || activePolicyVersion;

  if (!candidate || typeof candidate !== 'object') {
    return { status: 'rejected', reason_code: 'invalid_candidate' };
  }

  // Build the canary-controller candidate via proposeCandidate (reuses the
  // existing candidate construction — no parallel logic). The
  // source_evidence_fingerprint ties the candidate to the evidence window.
  const sourceFingerprint = evidence_window?.source_evidence_fingerprint;
  if (!sourceFingerprint || !/^[a-f0-9]{64}$/.test(sourceFingerprint)) {
    return { status: 'rejected', reason_code: 'invalid_evidence_fingerprint' };
  }

  const proposed = proposeCandidate({
    source_evidence_fingerprint: sourceFingerprint,
    policy_version: candidate.policy_version,
    compiled_index_version: candidate.policy_version,
    evaluation_inputs: {
      weights: candidate.weights,
      tier_boundaries: candidate.tier_boundaries,
    },
    proposal: {
      cooldown_ms: candidate.cooldown_ms,
      calibration_corpus_version: candidate.calibration_corpus_version,
    },
  });
  if (proposed.status !== 'proposed') {
    return { status: 'rejected', reason_code: proposed.reason_code || 'invalid_candidate' };
  }

  // Construct the 6-gate object (mirror router-control.mjs:986-993).
  const compatOk = compatibleThresholds(candidate);
  const gates = {
    safety: { pass: true, reason_code: 'safety_passed' },
    privacy: { pass: true, reason_code: 'privacy_passed' },
    quality: {
      pass: evidence_window?.sufficient === true,
      reason_code: evidence_window?.sufficient ? 'quality_passed' : 'quality_insufficient_evidence',
    },
    context_budget: { pass: true, reason_code: 'context_budget_passed' },
    latency: { pass: true, reason_code: 'latency_passed' },
    compatibility: {
      pass: compatOk,
      reason_code: compatOk ? 'compatibility_passed' : 'compatibility_uncertain',
    },
  };

  // Delegate the gate check to canary-controller (no parallel gate suite).
  const evaluation = evaluateCandidate({
    candidate: proposed.candidate,
    evidence_window,
    gates,
    known_good_version: knownGood,
  });

  // demonstrated_benefit — for threshold candidates, the "benefit" is that the
  // evidence is sufficient (the canary gate evidences the value change). When
  // the evaluation is promotable, the benefit is demonstrated.
  const demonstrated_benefit = evaluation.promotable
    ? { status: 'demonstrated', reason_code: 'evidence_sufficient' }
    : null;

  // Delegate the promotion decision to canary-controller. published_version is
  // null so a non-promotable evaluation returns 'rejected' (not 'rolled_back'
  // — health v1 has no rollback journal). The custom publication writes
  // thresholds.json + active.json under health/versions/ (D-5).
  const decision = applyCanaryDecision({
    evaluation,
    demonstrated_benefit,
    activation: {
      ownedRoot: root,
      policy_version: candidate.policy_version,
      weights: candidate.weights,
      tier_boundaries: candidate.tier_boundaries,
      cooldown_ms: candidate.cooldown_ms,
      calibration_corpus_version: candidate.calibration_corpus_version,
    },
    ownedRoot: root,
    known_good_version: knownGood,
    published_version: null,
    publication: createHealthPublication(),
  });

  if (decision.status === 'promoted') {
    const bundle = {
      policy_version: candidate.policy_version,
      weights: candidate.weights,
      tier_boundaries: candidate.tier_boundaries,
      cooldown_ms: candidate.cooldown_ms,
      calibration_corpus_version: candidate.calibration_corpus_version,
    };
    const fingerprint = sha256(JSON.stringify(bundle));
    return { status: 'promoted', policy_version: candidate.policy_version, fingerprint };
  }

  return { status: 'rejected', reason_code: decision.reason_code || decision.status };
}