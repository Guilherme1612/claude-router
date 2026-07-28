// Phase 24 Plan 24-04 — Versioned health thresholds (HLTH-11 versioning).
//
// Every health threshold, sample floor, decay constant, cooldown, and
// calibration corpus version is versioned via a `policy_version` string and
// frozen here. The threshold VALUES are constants; mutation flows ONLY through
// the canary bridge (src/health/canary-bridge.mjs → canary-controller.mjs
// evaluateCandidate + applyCanaryDecision), never by direct edit at runtime
// (HLTH-11, D-canary).
//
// D-6: the version field is `policy_version`, never bare `version` (collision
// with release-tuple version_id vocabulary).
//
// Reuse — do NOT redefine (RESEARCH "Don't Hand-Roll"): HALF_LIFE_MS,
// MAX_RETENTION_MS, MINIMUM_SAMPLES are re-exported from
// src/evolution/evidence.mjs so the health policy shares the same decay /
// retention / sample-floor contract as the evidence store. The import-source
// test in tests/router.health.canary.test.mjs asserts these are imported, not
// redefined.
//
// This module is OFF the UserPromptSubmit hot path (REL-01) and makes no
// network calls (HLTH-02). loadThresholds / loadCalibrationCorpus return null
// or defaults on missing/corrupt — never throw (mirror store.readState).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES } from '../evolution/evidence.mjs';

// Re-export — do NOT redefine (RESEARCH "Don't Hand-Roll"). The import-source
// test asserts thresholds.mjs imports these from evidence.mjs.
export { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES };

// D-6: version field is `policy_version`, never bare `version`.
export const POLICY_VERSION = 'health-policy-v1';

// Cooldown — canary-guarded via the bridge (Task 2). Default 1h.
export const COOLDOWN_MS = 60 * 60 * 1000;

// D-calibration: multilingual calibration is plumbing only in Phase 24. The
// broader multilingual corpus is deferred per CONTEXT.md Deferred Items.
export const CALIBRATION_CORPUS_VERSION = 'health-calibration-v1';

// The 5 score weights Plan 24-02 score.mjs inlined. Frozen — value changes flow
// through the canary bridge, not by mutating this object.
export const VERSIONED_WEIGHTS = Object.freeze({
  recency: 0.30,
  completion: 0.25,
  opportunity: 0.20,
  reversibility: 0.15,
  confidence: 0.10,
});

// The 4 tier boundaries Plan 24-02 score.mjs inlined. usefulness_basis_points
// is bounded 0..10000. Frozen — value changes flow through the canary bridge.
export const TIER_BOUNDARIES = Object.freeze({
  high: 7500,
  medium: 5000,
  low: 2500,
  low_usefulness: 0,
});

// healthVersionsRoot — ~/.claude/router/health/versions/ (D-5: isolated from
// release-tuples/active.json). Caller may override via ownedRoot for tests.
export function healthVersionsRoot(ownedRoot) {
  const base = ownedRoot || join(homedir(), '.claude', 'router', 'health');
  return join(base, 'versions');
}

// readActivePointer — reads versions/active.json to find the currently active
// policy_version. Returns null on missing/corrupt (never throws).
export function readActivePointer(ownedRoot) {
  const root = healthVersionsRoot(ownedRoot);
  const pointerPath = join(root, 'active.json');
  if (!existsSync(pointerPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(pointerPath, 'utf8'));
    if (parsed && typeof parsed.policy_version === 'string') return parsed.policy_version;
    return null;
  } catch {
    return null;
  }
}

// loadThresholds(policy_version) — reads
// ~/.claude/router/health/versions/<policy_version>/thresholds.json (atomic,
// 0600). Returns the versioned bundle for that policy_version, or the defaults
// above if the file is absent. Returns null on corrupt (never throws).
//
// WR-03 (deferred consumption): the canary bridge (src/health/canary-bridge.mjs
// promoteThresholdCandidate) writes activated weights / tier_boundaries to
// versions/<policy_version>/thresholds.json and updates versions/active.json
// on promotion, but the scorer (src/health/score.mjs scoreCapability) does NOT
// yet call loadThresholds to consume them — it uses the hardcoded
// VERSIONED_WEIGHTS / TIER_BOUNDARIES constants directly. Production
// consumption of activated thresholds is intentionally deferred to a later
// phase; the bridge writes are validated for shape and atomicity now, and
// wiring the scorer to the activated bundle is a separate behavioral change.
// Until that wiring lands, loadThresholds has zero production call sites
// (only tests) — this is a known gap, NOT a bug. See score.mjs
// `DEFAULT_WEIGHTS = VERSIONED_WEIGHTS` for the symmetric half of this note.
export function loadThresholds(policy_version, { ownedRoot } = {}) {
  const root = healthVersionsRoot(ownedRoot);
  const dir = join(root, policy_version);
  const file = join(dir, 'thresholds.json');
  if (!existsSync(file)) {
    // Missing → defaults for the requested version.
    return {
      policy_version,
      cooldown_ms: COOLDOWN_MS,
      calibration_corpus_version: CALIBRATION_CORPUS_VERSION,
      weights: VERSIONED_WEIGHTS,
      tier_boundaries: TIER_BOUNDARIES,
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// loadCalibrationCorpus(policy_version) — reads
// ~/.claude/router/health/versions/<policy_version>/calibration/ (a local
// fixture directory). Returns { corpus_version, languages: ['en'] } for the v1
// English-only corpus. The broader multilingual corpus is NOT authored in this
// phase (D-calibration per Deferred Items). Returns the English-only default
// on missing/corrupt (never throws).
export function loadCalibrationCorpus(policy_version, { ownedRoot } = {}) {
  const root = healthVersionsRoot(ownedRoot);
  const dir = join(root, policy_version, 'calibration');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { corpus_version: CALIBRATION_CORPUS_VERSION, languages: ['en'] };
  }
  // The v1 fixture is English-only. If a calibration manifest is present, read
  // it; otherwise return the English-only default. We do NOT claim
  // multilingual coverage that has not been authored (T-24-20).
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { corpus_version: CALIBRATION_CORPUS_VERSION, languages: ['en'] };
  }
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.languages)) {
      return {
        corpus_version: typeof parsed.corpus_version === 'string'
          ? parsed.corpus_version
          : CALIBRATION_CORPUS_VERSION,
        languages: parsed.languages,
      };
    }
    return { corpus_version: CALIBRATION_CORPUS_VERSION, languages: ['en'] };
  } catch {
    return { corpus_version: CALIBRATION_CORPUS_VERSION, languages: ['en'] };
  }
}