import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const MIGRATION_SCHEMA_VERSION = 1;
export const MIGRATION_ACTIONS = Object.freeze(['repair', 'rollback', 'disable', 'downgrade', 'enable', 'uninstall']);
export const RELEASE_GATES = Object.freeze([
  'native_dispatch', 'pause', 'observation', 'startup', 'restart', 'migration', 'rollback', 'uninstall',
  'adversarial_trust', 'privacy', 'token_budget', 'lifecycle_isolation', 'latency',
]);

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function stable(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('migration input must be finite JSON');
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map(item => stable(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key], seen)]));
  seen.delete(value);
  return result;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function migrationPaths(root) {
  const ownedRoot = resolve(root);
  const dir = join(ownedRoot, 'migration');
  return { ownedRoot, dir, journal: join(dir, 'journal.json'), pointer: join(dir, 'active.json') };
}

function atomicJson(path, value) {
  const temp = `${path}.tmp.${process.pid}`;
  mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 });
  const fd = openSync(temp, 'w', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function validTuple(tuple) {
  return Boolean(tuple && typeof tuple === 'object' && TOKEN.test(tuple.version_id || '') && tuple.contents && typeof tuple.contents === 'object');
}

export function classifyPersistedRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { class: 'quarantined', reason_code: 'invalid_record', eligible: false };
  const version = record.router_version || record.version || record.schema_version;
  if (version === 'v1.6' || version === 1.6) {
    return { class: 'compatible_v16', eligible: record.authority !== 'legacy_historical', autonomy_lease: record.type === 'lease' };
  }
  if (version === 'v1.5' || version === 1.5 || version === 1) {
    return { class: 'historical_v15', eligible: false, autonomy_lease: false, reason_code: 'legacy_historical_only' };
  }
  return { class: 'quarantined', eligible: false, reason_code: 'unclassified_record' };
}

export function buildMigrationPlan(records = []) {
  if (!Array.isArray(records)) return { status: 'blocked', reason_code: 'invalid_records' };
  const classifications = records.map(record => ({ record, classification: classifyPersistedRecord(record) }));
  const quarantined = classifications.filter(item => item.classification.class === 'quarantined');
  return Object.freeze({
    status: quarantined.length ? 'blocked' : 'planned',
    reason_code: quarantined.length ? 'unclassified_persisted_record' : 'all_records_classified',
    classifications,
    historical_count: classifications.filter(item => item.classification.class === 'historical_v15').length,
    compatible_count: classifications.filter(item => item.classification.class === 'compatible_v16').length,
    quarantined_count: quarantined.length,
  });
}

export function lifecycleAction(action, { runtimes = ['claude', 'codex'] } = {}) {
  if (!MIGRATION_ACTIONS.includes(action)) return { status: 'blocked', reason_code: 'unknown_lifecycle_action' };
  const selected = [...new Set(runtimes)].filter(runtime => runtime === 'claude' || runtime === 'codex').sort();
  if (selected.length !== new Set(runtimes).size || selected.length === 0) return { status: 'blocked', reason_code: 'invalid_runtime_scope' };
  return Object.freeze({ status: 'planned', action, runtimes: selected, preserves_unrelated_state: true, owned_state_only: true });
}

export function migrateAtomic({ root, plan, from_tuple, to_tuple, fail_at = null } = {}) {
  if (plan?.status !== 'planned') return { status: 'blocked', reason_code: plan?.reason_code || 'migration_plan_required' };
  if (!validTuple(from_tuple) || !validTuple(to_tuple)) return { status: 'blocked', reason_code: 'invalid_migration_tuple' };
  const paths = migrationPaths(root);
  const journal = {
    schema_version: MIGRATION_SCHEMA_VERSION,
    state: 'prepared',
    old_generation: from_tuple.version_id,
    new_generation: to_tuple.version_id,
    old_fingerprint: hash(from_tuple),
    new_fingerprint: hash(to_tuple),
    old_tuple: stable(from_tuple),
    new_tuple: stable(to_tuple),
  };
  atomicJson(paths.journal, journal);
  if (fail_at === 'before-pointer') throw new Error('injected migration crash before pointer');
  atomicJson(paths.pointer, { schema_version: MIGRATION_SCHEMA_VERSION, generation: to_tuple.version_id, fingerprint: journal.new_fingerprint });
  if (fail_at === 'after-pointer') throw new Error('injected migration crash after pointer');
  atomicJson(paths.journal, { ...journal, state: 'committed' });
  return { status: 'migrated', generation: to_tuple.version_id, fingerprint: journal.new_fingerprint };
}

export function recoverMigration({ root } = {}) {
  const paths = migrationPaths(root);
  const journal = readJson(paths.journal);
  if (!journal || journal.schema_version !== MIGRATION_SCHEMA_VERSION || !['prepared', 'committed', 'recovered-old', 'recovered-new'].includes(journal.state)) {
    return { status: 'blocked', reason_code: 'migration_journal_missing_or_invalid' };
  }
  if (journal.state === 'committed') return { status: 'recovered-new', generation: journal.new_generation, fingerprint: journal.new_fingerprint };
  if (journal.state === 'recovered-old') return { status: 'recovered-old', generation: journal.old_generation, fingerprint: journal.old_fingerprint };
  if (journal.state === 'recovered-new') return { status: 'recovered-new', generation: journal.new_generation, fingerprint: journal.new_fingerprint };
  const pointer = readJson(paths.pointer);
  if (pointer?.generation === journal.new_generation && pointer.fingerprint === journal.new_fingerprint) {
    atomicJson(paths.journal, { ...journal, state: 'committed' });
    return { status: 'recovered-new', generation: journal.new_generation, fingerprint: journal.new_fingerprint };
  }
  atomicJson(paths.pointer, { schema_version: MIGRATION_SCHEMA_VERSION, generation: journal.old_generation, fingerprint: journal.old_fingerprint });
  atomicJson(paths.journal, { ...journal, state: 'recovered-old' });
  return { status: 'recovered-old', generation: journal.old_generation, fingerprint: journal.old_fingerprint };
}

export function verifyDualRuntimeRelease(evidence, { expected_versions = {}, now = Date.now(), max_age_ms = 5 * 60 * 1000 } = {}) {
  const missing = [];
  for (const runtime of ['claude', 'codex']) {
    const runtimeEvidence = evidence?.[runtime];
    if (runtimeEvidence?.runtime !== runtime) missing.push(`${runtime}:runtime`);
    if (runtimeEvidence?.source !== 'installed-runtime') missing.push(`${runtime}:source`);
    if (runtimeEvidence?.version_bound !== true || typeof expected_versions[runtime] !== 'string' || runtimeEvidence?.version !== expected_versions[runtime]) missing.push(`${runtime}:version`);
    const age = now - runtimeEvidence?.generated_at_ms;
    if (!Number.isSafeInteger(runtimeEvidence?.generated_at_ms) || age < 0 || age > max_age_ms) missing.push(`${runtime}:freshness`);
    for (const gate of RELEASE_GATES) if (runtimeEvidence?.checks?.[gate] !== true) missing.push(`${runtime}:${gate}`);
  }
  return missing.length
    ? { status: 'blocked', reason_code: 'release_gate_missing', missing }
    : { status: 'passed', gates: RELEASE_GATES.length * 2, runtimes: ['claude', 'codex'] };
}
