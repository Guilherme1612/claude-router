import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';
import { COMPILED_INDEX_COMPATIBILITY, COMPILED_INDEX_SCHEMA_VERSION, loadCompiledIndex } from './compile-index.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => `${stableStringify(value)}\n`;

function durableWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

function replacePointer(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${randomUUID()}`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, json(value)); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  const dir = openSync(dirname(path), 'r');
  try { fsyncSync(dir); } finally { closeSync(dir); }
}

function routeFor(subject, record) {
  const targetId = record.id || record.canonical_identity || record.name;
  return {
    workflow_id: subject.subject_id,
    transition_id: record.invocation.command,
    reason_code: subject.reason_code || 'mapped_target',
    dispatch_eligible: record.dispatchable === true && record.lifecycle === 'ready',
    target_id: targetId,
    scope: record.scope,
    invocation: record.invocation,
    dependencies: record.dependencies,
  };
}

export function recoverReleaseTuple({ ownedRoot, now = Date.now() } = {}) {
  const root = resolve(ownedRoot);
  const loaded = loadCompiledIndex({ ownedRoot: root, now });
  if (loaded.dispatch_eligible && loaded.source === 'active') return { status: 'already-active', tuple_version_id: loaded.tuple_version_id };
  let pointer;
  try { pointer = JSON.parse(readFileSync(join(root, 'release-tuples', 'known-good.json'), 'utf8')); } catch { pointer = null; }
  const candidate = loadCompiledIndex({ ownedRoot: root, now, releaseTuplePointer: pointer });
  if (!candidate.dispatch_eligible || !candidate.tuple_version_id) throw new Error('no_verified_release_tuple');
  replacePointer(join(root, 'release-tuples', 'active.json'), pointer);
  const repaired = loadCompiledIndex({ ownedRoot: root, now });
  if (!repaired.dispatch_eligible || repaired.tuple_version_id !== candidate.tuple_version_id) throw new Error('tuple_recovery_failed');
  return { status: 'recovered', tuple_version_id: repaired.tuple_version_id };
}

export function publishCompiledIndex({ ownedRoot, registry, registryVersionId, mapping, policyFingerprint, now = Date.now(), crashAt } = {}) {
  const root = resolve(ownedRoot);
  if (!registry || !Array.isArray(registry.records) || !/^v1-[a-f0-9]{16}$/.test(registryVersionId || '')) throw new TypeError('verified registry version required');
  const records = new Map(registry.records.flatMap(record => [record.id, record.canonical_identity, record.name].filter(Boolean).map(key => [key, record])));
  const routes = {};
  for (const subject of mapping?.subjects || []) {
    const record = records.get(subject.target_id);
    if (subject.disposition === 'mapped' && record) routes[subject.subject_id] = routeFor(subject, record);
  }
  if (!Object.keys(routes).length) {
    for (const record of registry.records.filter(value => value.dispatchable && value.lifecycle === 'ready')) {
      routes[record.name] = routeFor({ subject_id: record.name, reason_code: 'canonical_record' }, record);
    }
  }
  if (!Object.keys(routes).length) throw new TypeError('compiled index requires at least one dispatch route');
  const registryBytes = json(registry);
  const registryHash = sha256(registryBytes);
  const mappingFingerprint = mapping?.policy_fingerprint || sha256(json(mapping || {}));
  const seed = `${registryVersionId}:${registryHash}:${mappingFingerprint}:${policyFingerprint || ''}`;
  const compiledVersionId = `v1-${sha256(seed).slice(0, 16)}`;
  const index = { schema_version: COMPILED_INDEX_SCHEMA_VERSION, version_id: compiledVersionId,
    policy_version: COMPILED_INDEX_COMPATIBILITY.policy_version,
    capsule_contract_version: COMPILED_INDEX_COMPATIBILITY.capsule_schema_version, routes };
  const compiledBytes = json(index);
  const compiledHash = sha256(compiledBytes);
  const tupleVersionId = `t1-${sha256(`${registryHash}:${compiledHash}`).slice(0, 16)}`;
  const tupleRoot = join(root, 'release-tuples', 'versions', tupleVersionId);
  if (!existsSync(tupleRoot)) {
    mkdirSync(tupleRoot, { recursive: true });
    durableWrite(join(tupleRoot, 'registry.json'), registryBytes);
    durableWrite(join(tupleRoot, 'index.json'), compiledBytes);
    const manifest = { schema_version: 1, state: 'verified', tuple_version_id: tupleVersionId,
      registry: { version_id: registryVersionId, payload_sha256: registryHash },
      compiled: { version_id: compiledVersionId, payload_sha256: compiledHash },
      policy_fingerprint: policyFingerprint || sha256('{}'), mapping_fingerprint: mappingFingerprint,
      compatibility: COMPILED_INDEX_COMPATIBILITY, verification: { disposition: 'passing', complete: true },
      created_at: now, expires_at: now + 30 * 24 * 60 * 60 * 1000 };
    durableWrite(join(tupleRoot, 'manifest.json'), json(manifest));
  }
  const pointer = { schema_version: 1, tuple_version_id: tupleVersionId };
  if (crashAt === 'before-active-pointer') throw new Error('injected crash before active pointer');
  replacePointer(join(root, 'release-tuples', 'active.json'), pointer);
  if (crashAt === 'after-active-pointer') throw new Error('injected crash after active pointer');
  const verified = loadCompiledIndex({ ownedRoot: root, now });
  if (!verified.dispatch_eligible || verified.tuple_version_id !== tupleVersionId) throw new Error('tuple_validation_failed');
  replacePointer(join(root, 'release-tuples', 'known-good.json'), pointer);
  return { publication_status: 'published', tuple_version_id: tupleVersionId, registry_version_id: registryVersionId, compiled_version_id: compiledVersionId };
}
