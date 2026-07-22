import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// D-05/D-06: only bounded, content-free routing evidence may cross persistence.
const FIELDS = new Set([
  'timestamp_ms', 'route_id', 'confidence_band', 'guard_codes', 'reason_code',
  'fixture_class', 'latency_us', 'candidate_version', 'policy_version', 'verdict',
  'prompt_signature',
]);
const CONFIDENCE_BANDS = new Set(['high', 'medium', 'low', 'trivial', 'user_explicit', 'stale', 'manifest_missing', 'reentry_skipped', 'deny_filtered']);
const FIXTURE_CLASSES = new Set(['minimal-prompt', 'explicit-override', 'stale-context', 'ambiguity', 'terminal-state', 'dependency', 'context-budget']);
const VERDICTS = new Set(['success', 'regression']);
const PRIVACY_GUARDS = new Set(['privacy_guard', 'deny_filtered', 'secret_detected', 'content_detected']);
// D-05/D-06: path-safe token — '/' is excluded so `project_id` (and every other
// bounded token consumed by `pathFor`) cannot escape the evidence root via
// `path.join` normalizing '..' segments. All consumers are flat identifiers
// (route_id, reason_code, candidate_version, policy_version, guard_codes,
// project_id) — none legitimately contain '/'.
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const HALF_LIFE_MS = 24 * 60 * 60 * 1000;
export const MAX_RETENTION_MS = 7 * HALF_LIFE_MS;
export const MINIMUM_SAMPLES = 30;

export function boundedToken(value, max = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && TOKEN.test(value);
}

function deny(reason_code) {
  return { status: 'denied', reason_code };
}

export function validateEvidenceEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return deny('invalid_evidence_envelope');
  if (Object.keys(input).some((field) => !FIELDS.has(field))) return deny('forbidden_evidence_field');
  if (!Number.isSafeInteger(input.timestamp_ms) || input.timestamp_ms < 0) return deny('invalid_timestamp');
  if (!boundedToken(input.route_id)) return deny('invalid_route_id');
  if (!CONFIDENCE_BANDS.has(input.confidence_band)) return deny('invalid_confidence_band');
  if (!Array.isArray(input.guard_codes) || input.guard_codes.length > 16 || input.guard_codes.some((code) => !boundedToken(code, 64))) return deny('invalid_guard_codes');
  if (!boundedToken(input.reason_code, 64)) return deny('invalid_reason_code');
  if (!FIXTURE_CLASSES.has(input.fixture_class)) return deny('invalid_fixture_class');
  if (!Number.isSafeInteger(input.latency_us) || input.latency_us < 0 || input.latency_us > 10_000_000) return deny('invalid_latency');
  if (!boundedToken(input.candidate_version, 128) || !boundedToken(input.policy_version, 128)) return deny('invalid_version');
  if (!VERDICTS.has(input.verdict)) return deny('invalid_verdict');

  const privacyDenied = input.confidence_band === 'deny_filtered'
    || input.guard_codes.some((code) => PRIVACY_GUARDS.has(code));
  if (privacyDenied && input.prompt_signature !== null) return deny('privacy_signature_forbidden');
  if (!privacyDenied && !/^[a-f0-9]{64}$/.test(input.prompt_signature ?? '')) return deny('invalid_prompt_signature');

  return { status: 'accepted', signal: Object.freeze({ ...input, guard_codes: Object.freeze([...input.guard_codes]) }) };
}

export function defaultHash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// Shared exponential-half-life-v1 decay math. Used by both the in-memory
// createEvidenceStore window and createPersistentEvidenceStore window so the
// two stores cannot silently diverge if the decay policy changes. `observations`
// is an array of records each carrying `signal.timestamp_ms` (ms epoch).
export function computeWeightedSamples(observations, { now, halfLifeMs = HALF_LIFE_MS } = {}) {
  if (!Number.isSafeInteger(now)) throw new TypeError('now must be an integer ms epoch');
  return observations.reduce((sum, record) => {
    const age = now - record.signal.timestamp_ms;
    return sum + (2 ** (-age / halfLifeMs));
  }, 0);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function evidenceWindowFingerprint(window) {
  const content = {
    schema_version: window.schema_version,
    scope: window.scope,
    observation_fingerprints: window.observations.map(record => record.fingerprint),
    sample_count: window.sample_count,
    weighted_samples: window.weighted_samples,
    minimum_samples: window.minimum_samples,
    sufficient: window.sufficient,
    weighting_policy: window.weighting_policy,
  };
  return defaultHash(JSON.stringify(content));
}

export function createEvidenceJournal({ write = () => {}, hash = defaultHash } = {}) {
  if (typeof write !== 'function' || typeof hash !== 'function') throw new TypeError('write and hash must be functions');
  return Object.freeze({
    append(input, { project_id } = {}) {
      const validated = validateEvidenceEnvelope(input);
      if (validated.status !== 'accepted') return validated;
      if (!boundedToken(project_id, 128)) return deny('invalid_project_scope');
      const serialized = JSON.stringify(validated.signal);
      const record = Object.freeze({
        scope: Object.freeze({ kind: 'project', project_id }),
        fingerprint: hash(serialized),
        signal: validated.signal,
      });
      write(record);
      return { status: 'stored', fingerprint: record.fingerprint };
    },
  });
}

export function createEvidenceStore({ now = Date.now, minimum_samples = MINIMUM_SAMPLES } = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  if (!Number.isSafeInteger(minimum_samples) || minimum_samples < 1) throw new TypeError('minimum_samples must be a positive integer');
  const records = [];

  function scopeFor(options) {
    if (options.scope === 'aggregate') {
      if (options.aggregate_eligible !== true) return deny('aggregate_eligibility_required');
      return { kind: 'aggregate' };
    }
    if (!boundedToken(options.project_id, 128)) return deny('invalid_project_scope');
    return { kind: 'project', project_id: options.project_id };
  }

  function matchesScope(record, options) {
    if (options.scope === 'aggregate') return record.scope.kind === 'aggregate';
    return record.scope.kind === 'project' && record.scope.project_id === options.project_id;
  }

  return Object.freeze({
    append(input, options = {}) {
      const validated = validateEvidenceEnvelope(input);
      if (validated.status !== 'accepted') return validated;
      const scope = scopeFor(options);
      if (scope.status === 'denied') return scope;
      const current = now();
      if (!Number.isSafeInteger(current) || validated.signal.timestamp_ms > current) return deny('invalid_evidence_time');
      const fingerprint = defaultHash(JSON.stringify(validated.signal));
      records.push(Object.freeze({ scope: Object.freeze(scope), signal: validated.signal, fingerprint }));
      return { status: 'stored', fingerprint };
    },

    window(options = {}) {
      const requestedScope = scopeFor(options);
      if (requestedScope.status === 'denied') return requestedScope;
      const current = now();
      const observations = records.filter((record) => {
        const age = current - record.signal.timestamp_ms;
        return age >= 0 && age <= MAX_RETENTION_MS && matchesScope(record, options);
      });
      const weighted_samples = computeWeightedSamples(observations, { now: current, halfLifeMs: HALF_LIFE_MS });
      const sufficient = observations.length >= minimum_samples;
      const envelope = {
        schema_version: 1,
        status: 'validated',
        scope: requestedScope,
        observations: [...observations],
        sample_count: observations.length,
        weighted_samples,
        minimum_samples,
        sufficient,
        weighting_policy: 'exponential-half-life-v1',
        reason_code: sufficient ? 'evidence_sufficient' : 'insufficient_evidence_samples',
      };
      const fingerprint = evidenceWindowFingerprint(envelope);
      return deepFreeze({ ...envelope, fingerprint, source_evidence_fingerprint: fingerprint });
    },
  });
}

// Disk-backed variant of createEvidenceStore. Appends validated envelopes to
// scoped JSONL files under `root` (~/.claude/router/evidence/), enforces
// project+aggregate isolation on disk, and reads windows with the SAME
// 7d retention / 24h decay / 30-sample floor contract as the in-memory store
// (Phase 17 D-07/D-08). validateEvidenceEnvelope is the FIRST call in append —
// forbidden fields are rejected BEFORE any disk write (T-20-02).
export function createPersistentEvidenceStore({ root, now = Date.now, minimum_samples = MINIMUM_SAMPLES } = {}) {
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  if (!Number.isSafeInteger(minimum_samples) || minimum_samples < 1) throw new TypeError('minimum_samples must be a positive integer');
  mkdirSync(root, { recursive: true, mode: 0o700 });

  function pathFor(scope) {
    return scope.kind === 'aggregate'
      ? join(root, 'aggregate.jsonl')
      : join(root, `project-${scope.project_id}.jsonl`);
  }

  function scopeFor(options) {
    if (options.scope === 'aggregate') {
      if (options.aggregate_eligible !== true) return deny('aggregate_eligibility_required');
      return { kind: 'aggregate' };
    }
    if (!boundedToken(options.project_id, 128)) return deny('invalid_project_scope');
    return { kind: 'project', project_id: options.project_id };
  }

  function matchesScope(record, options) {
    if (options.scope === 'aggregate') return record.scope.kind === 'aggregate';
    return record.scope.kind === 'project' && record.scope.project_id === options.project_id;
  }

  return Object.freeze({
    append(input, options = {}) {
      const validated = validateEvidenceEnvelope(input);
      if (validated.status !== 'accepted') return validated;
      const scope = scopeFor(options);
      if (scope.status === 'denied') return scope;
      const current = now();
      if (!Number.isSafeInteger(current) || validated.signal.timestamp_ms > current) return deny('invalid_evidence_time');
      const fingerprint = defaultHash(JSON.stringify(validated.signal));
      const record = Object.freeze({
        scope: Object.freeze(scope),
        signal: validated.signal,
        fingerprint,
      });
      appendFileSync(pathFor(scope), `${JSON.stringify(record)}\n`, { flag: 'a', mode: 0o600 });
      return { status: 'stored', fingerprint };
    },

    window(options = {}) {
      const requestedScope = scopeFor(options);
      if (requestedScope.status === 'denied') return requestedScope;
      const current = now();
      const path = pathFor(requestedScope);
      let records = [];
      if (existsSync(path)) {
        const lines = readFileSync(path, 'utf8').split('\n');
        for (const line of lines) {
          if (line.length === 0) continue;
          let record;
          try { record = JSON.parse(line); } catch { continue; }
          if (!record || !record.signal || !record.scope) continue;
          records.push(record);
        }
      }
      const observations = records.filter((record) => {
        const age = current - record.signal.timestamp_ms;
        return age >= 0 && age <= MAX_RETENTION_MS && matchesScope(record, options);
      });
      const weighted_samples = computeWeightedSamples(observations, { now: current, halfLifeMs: HALF_LIFE_MS });
      const sufficient = observations.length >= minimum_samples;
      const envelope = {
        schema_version: 1,
        status: 'validated',
        scope: requestedScope,
        observations: [...observations],
        sample_count: observations.length,
        weighted_samples,
        minimum_samples,
        sufficient,
        weighting_policy: 'exponential-half-life-v1',
        reason_code: sufficient ? 'evidence_sufficient' : 'insufficient_evidence_samples',
      };
      const fingerprint = evidenceWindowFingerprint(envelope);
      return deepFreeze({ ...envelope, fingerprint, source_evidence_fingerprint: fingerprint });
    },
  });
}
