import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { stableStringify } from './schema.mjs';
import { PRODUCTION_GATE_RUNNERS, REQUIRED_ACTIVATION_GATES } from './validate.mjs';

const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : stableStringify(value)).digest('hex');
const json = value => `${stableStringify(value)}\n`;
export const DEFAULT_RETENTION_POLICY = Object.freeze({ verified_count: 8, verified_age_ms: 30 * 86400000, diagnostic_count: 20, diagnostic_age_ms: 14 * 86400000 });

function paths(ownedRoot) { const root = resolve(ownedRoot); return { root, versions: join(root, 'versions'), active: join(root, 'active.json'), audit: join(root, 'audit.jsonl') }; }
function validId(id) { return typeof id === 'string' && /^v1-[a-f0-9]{16}$/.test(id); }
function contained(root, path) { const target = resolve(path); if (target !== root && !target.startsWith(`${root}/`)) throw new TypeError('path escapes owned root'); return target; }
function readPointer(p) { try { const value = JSON.parse(readFileSync(p, 'utf8')); return validId(value.version_id) ? value : null; } catch { return null; } }
function syncDir(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function durableWrite(path, bytes, flag = 'wx') { const fd = openSync(path, flag, 0o600); try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); } }
const waitArray = new Int32Array(new SharedArrayBuffer(4));

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function mutationLock(p, options = {}) {
  const lockPath = join(p.root, '.mutation.lock');
  const deadline = Date.now() + (options.timeout_ms ?? 2_000);
  const staleMs = options.stale_ms ?? 30_000;
  const token = randomUUID();
  mkdirSync(p.root, { recursive: true });
  while (Date.now() <= deadline) {
    try {
      mkdirSync(lockPath, { mode: 0o700 });
      durableWrite(join(lockPath, 'owner.json'), json({ schema_version: 1, token, pid: process.pid, started_at: Date.now() }));
      syncDir(lockPath); syncDir(p.root);
      return {
        acquired: true,
        release() {
          try {
            const owner = JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8'));
            if (owner.token === token) { rmSync(lockPath, { recursive: true, force: true }); syncDir(p.root); }
          } catch { /* lock ownership changed or root unavailable */ }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') return { acquired: false, reason_code: 'mutation_lock_failed' };
      try {
        const owner = JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8'));
        if (Date.now() - owner.started_at > staleMs && !processAlive(owner.pid)) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch { /* owner publication may still be in progress */ }
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  return { acquired: false, reason_code: 'mutation_lock_timeout' };
}

function trusted(options, now = Date.now()) {
  const verification = options?.verification;
  if (!verification || verification.schema_version !== 1 || verification.verification_policy_version !== 'activation-verification-v1'
    || verification.trusted !== true || verification.complete !== true || verification.disposition !== 'passing' || verification.test_only !== false) return false;
  if (!Number.isFinite(verification.generated_at) || !Number.isFinite(verification.expires_at)
    || verification.generated_at > now || verification.expires_at < now || verification.expires_at - verification.generated_at > 300_000) return false;
  if (stableStringify(verification.required_gate_ids) !== stableStringify(REQUIRED_ACTIVATION_GATES)) return false;
  if (verification.candidate_fingerprint !== hash(options.candidate || null)
    || verification.reconciliation_fingerprint !== hash(options.reconciliation || null)
    || verification.mapping_fingerprint !== hash(options.mapping || null)
    || verification.policy_fingerprint !== hash(options.policy || null)) return false;
  if (!Array.isArray(verification.gates) || verification.gates.length !== REQUIRED_ACTIVATION_GATES.length) return false;
  for (const [index, id] of REQUIRED_ACTIVATION_GATES.entries()) {
    const gate = verification.gates[index];
    const runner = PRODUCTION_GATE_RUNNERS[id];
    if (!gate || gate.id !== id || gate.runner_id !== runner.id || gate.runner_version !== runner.version || gate.passed !== true) return false;
    const { evidence_fingerprint: evidenceFingerprint, ...evidence } = gate;
    if (evidenceFingerprint !== hash(evidence)) return false;
  }
  const { verification_fingerprint: verificationFingerprint, ...canonical } = verification;
  return verificationFingerprint === hash(canonical);
}

export function writeImmutableVersion({ ownedRoot, candidate, mapping, reconciliation, policy, verification, now = Date.now() }) {
  const p = paths(ownedRoot); mkdirSync(p.versions, { recursive: true });
  const payload = { 'registry.json': json(candidate), 'mappings.json': json(mapping), 'evidence.json': json({ reconciliation, policy }), 'verification.json': json(verification) };
  const bundleFingerprint = hash(stableStringify(Object.fromEntries(Object.entries(payload).sort())));
  const versionId = `v1-${bundleFingerprint.slice(0, 16)}`;
  const final = contained(p.versions, join(p.versions, versionId));
  if (existsSync(final)) {
    const verdict = verifyVersion({ ownedRoot, versionId, expectedFingerprint: bundleFingerprint });
    if (!verdict.valid) throw new Error('version_id_collision');
    return { version_id: versionId, bundle_fingerprint: bundleFingerprint, idempotent: true };
  }
  const staging = join(p.versions, `.staging-${randomUUID()}`); mkdirSync(staging, { recursive: false, mode: 0o700 });
  try {
    const files = [];
    for (const name of Object.keys(payload).sort()) { durableWrite(join(staging, name), payload[name]); files.push({ name, size: Buffer.byteLength(payload[name]), fingerprint: hash(payload[name]) }); }
    const manifest = { schema_version: 1, state: 'complete', version_id: versionId, bundle_fingerprint: bundleFingerprint, created_at: now, files };
    durableWrite(join(staging, 'manifest.json'), json(manifest)); syncDir(staging); renameSync(staging, final); syncDir(p.versions);
    return { version_id: versionId, bundle_fingerprint: bundleFingerprint, idempotent: false };
  } catch (error) { rmSync(staging, { recursive: true, force: true }); throw error; }
}

export function verifyVersion({ ownedRoot, versionId, expectedFingerprint }) {
  try {
    if (!validId(versionId)) return { valid: false, reason_code: 'invalid_version_id' };
    const p = paths(ownedRoot), dir = contained(p.versions, join(p.versions, versionId));
    if (!existsSync(dir) || lstatSync(dir).isSymbolicLink() || !statSync(dir).isDirectory()) return { valid: false, reason_code: 'missing_or_unsafe_version' };
    const manifestPath = join(dir, 'manifest.json'); if (lstatSync(manifestPath).isSymbolicLink()) return { valid: false, reason_code: 'symlink_manifest' };
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.state !== 'complete' || manifest.version_id !== versionId || !Array.isArray(manifest.files)) return { valid: false, reason_code: 'incomplete_manifest' };
    const payload = {};
    for (const file of manifest.files) { if (!/^[a-z]+\.json$/.test(file.name)) return { valid: false, reason_code: 'unsafe_file' }; const path = join(dir, file.name); if (lstatSync(path).isSymbolicLink()) return { valid: false, reason_code: 'symlink_payload' }; const bytes = readFileSync(path); if (bytes.length !== file.size || hash(bytes) !== file.fingerprint) return { valid: false, reason_code: 'file_mismatch' }; payload[file.name] = bytes.toString(); }
    const bundle = hash(stableStringify(Object.fromEntries(Object.entries(payload).sort())));
    if (bundle !== manifest.bundle_fingerprint || (expectedFingerprint && bundle !== expectedFingerprint)) return { valid: false, reason_code: 'bundle_mismatch' };
    return { valid: true, reason_code: 'verified', version_id: versionId, bundle_fingerprint: bundle, verification_fingerprint: hash(manifest) };
  } catch { return { valid: false, reason_code: 'malformed_version' }; }
}

export function replaceActivePointer({ ownedRoot, destination, reason, expectedSequence, io = {} }) {
  const p = paths(ownedRoot); mkdirSync(p.root, { recursive: true });
  const verified = verifyVersion({ ownedRoot, versionId: destination }); if (!verified.valid) return { pointer_status: 'blocked', reason_code: verified.reason_code };
  const lock = mutationLock(p, io.lock || {});
  if (!lock.acquired) return { pointer_status: 'blocked', reason_code: lock.reason_code };
  let temp;
  try {
    const current = readPointer(p.active), sequence = current?.sequence || 0;
    if (expectedSequence !== undefined && expectedSequence !== sequence) return { pointer_status: 'blocked', reason_code: 'stale_pointer_sequence' };
    const pointer = { schema_version: 1, version_id: destination, bundle_fingerprint: verified.bundle_fingerprint, previous_version_id: current?.version_id || null, reason: String(reason || 'activation').slice(0, 128), sequence: sequence + 1 };
    temp = `${p.active}.tmp.${randomUUID()}`;
    durableWrite(temp, json(pointer));
    if ((io.beforeRename || (() => {}))({ destination, pointer }) === false) throw new Error('toctou');
    const reverified = verifyVersion({ ownedRoot, versionId: destination, expectedFingerprint: verified.bundle_fingerprint }); if (!reverified.valid || reverified.verification_fingerprint !== verified.verification_fingerprint) throw new Error('verification_to_pointer_toctou');
    renameSync(temp, p.active);
    try { syncDir(p.root); } catch { return { pointer_status: 'recovery_required', reason_code: 'pointer_durability_uncertain', pointer }; }
    return { pointer_status: 'replaced', pointer };
  } catch (error) { if (temp) rmSync(temp, { force: true }); return { pointer_status: 'blocked', reason_code: error.message === 'verification_to_pointer_toctou' ? error.message : 'durability_failed' }; }
  finally { lock.release(); }
}

export function activateCandidate(options) {
  if (!trusted(options, options.now)) return { activation_status: 'blocked', reason_code: 'verification_not_trusted' };
  try {
    const version = writeImmutableVersion(options);
    if (!trusted(options, options.now)) return { activation_status: 'blocked', reason_code: 'verification_not_trusted' };
    const pointer = replaceActivePointer({ ...options, destination: version.version_id, expectedSequence: options.expectedSequence });
    if (pointer.pointer_status !== 'replaced') return { activation_status: pointer.pointer_status === 'recovery_required' ? 'recovery_required' : 'blocked', reason_code: pointer.reason_code, ...version };
    return { activation_status: 'activated', ...version, pointer: pointer.pointer };
  } catch (error) { return { activation_status: 'blocked', reason_code: error.code === 'EINVAL' ? 'durability_unsupported' : 'durability_failed' }; }
}

export function recoverActiveVersion({ ownedRoot }) {
  const p = paths(ownedRoot), current = readPointer(p.active);
  if (current && verifyVersion({ ownedRoot, versionId: current.version_id, expectedFingerprint: current.bundle_fingerprint }).valid) return { recovery_status: 'healthy', version_id: current.version_id };
  const candidates = existsSync(p.versions) ? readdirSync(p.versions).filter(validId).map(id => ({ id, verdict: verifyVersion({ ownedRoot, versionId: id }), time: statSync(join(p.versions, id)).mtimeMs })).filter(v => v.verdict.valid).sort((a, b) => b.time - a.time || a.id.localeCompare(b.id)) : [];
  if (!candidates.length) return { recovery_status: 'blocked', reason_code: 'no_valid_history' };
  const result = replaceActivePointer({ ownedRoot, destination: candidates[0].id, reason: 'recovery' });
  return result.pointer_status === 'replaced' ? { recovery_status: 'recovered', version_id: candidates[0].id } : { recovery_status: 'recovery_required', reason_code: result.reason_code };
}

export function pruneVersionHistory({ ownedRoot, policy = DEFAULT_RETENTION_POLICY, protectedVersions = [] }) {
  const p = paths(ownedRoot), active = readPointer(p.active), protectedSet = new Set([active?.version_id, active?.previous_version_id, ...protectedVersions].filter(Boolean));
  const entries = existsSync(p.versions) ? readdirSync(p.versions).filter(validId).map(id => ({ id, mtime: statSync(join(p.versions, id)).mtimeMs })).sort((a, b) => b.mtime - a.mtime || a.id.localeCompare(b.id)) : [];
  const removed = []; for (const [index, entry] of entries.entries()) if (!protectedSet.has(entry.id) && index >= policy.verified_count && Date.now() - entry.mtime > policy.verified_age_ms) { rmSync(join(p.versions, entry.id), { recursive: true }); removed.push(entry.id); }
  return { prune_status: 'complete', removed };
}

export function previewRollback({ ownedRoot, destination, now = Date.now() }) {
  const p = paths(ownedRoot), source = readPointer(p.active), verdict = verifyVersion({ ownedRoot, versionId: destination });
  if (!source || !verdict.valid) return { preview_status: 'blocked', reason_code: verdict.reason_code || 'missing_active_pointer' };
  const body = { schema_version: 1, source_version_id: source.version_id, destination_version_id: destination, source_sequence: source.sequence, destination_verification_fingerprint: verdict.verification_fingerprint, generated_at: now };
  return { ...body, preview_status: 'ready', preview_fingerprint: hash(body) };
}

export function executeRollback({ ownedRoot, preview, confirmation, now = Date.now(), reason = 'rollback', io }) {
  if (preview?.preview_status !== 'ready' || confirmation !== preview.destination_version_id) return { rollback_status: 'blocked', reason_code: 'confirmation_mismatch' };
  const fresh = previewRollback({ ownedRoot, destination: preview.destination_version_id, now: preview.generated_at });
  if (fresh.preview_fingerprint !== preview.preview_fingerprint) return { rollback_status: 'blocked', reason_code: 'stale_preview' };
  const result = replaceActivePointer({ ownedRoot, destination: preview.destination_version_id, reason, expectedSequence: preview.source_sequence, io });
  const event = { schema_version: 1, source: preview.source_version_id, destination: preview.destination_version_id, time: now, outcome: result.pointer_status, reason: String(reason).slice(0, 128) };
  if (result.pointer_status === 'replaced') { appendFileSync(paths(ownedRoot).audit, json(event), { mode: 0o600 }); return { rollback_status: 'rolled_back', event }; }
  return { rollback_status: result.pointer_status === 'recovery_required' ? 'recovery_required' : 'blocked', reason_code: result.reason_code };
}
