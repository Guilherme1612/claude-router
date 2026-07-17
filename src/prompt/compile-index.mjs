import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export const COMPILED_INDEX_SCHEMA_VERSION = 1;
export const COMPILED_INDEX_COMPATIBILITY = Object.freeze({
  router_contract: 'prompt-route-v1',
  policy_version: 'workflow-transitions-v1',
  capsule_schema_version: 1,
});
export const COMPILED_INDEX_LIMITS = Object.freeze({
  pointer_bytes: 4 * 1024,
  known_good_bytes: 16 * 1024,
  metadata_bytes: 8 * 1024,
  payload_bytes: 64 * 1024,
  known_good_versions: 8,
  maximum_age_ms: 30 * 24 * 60 * 60 * 1000,
});

const VERSION_ID = /^v1-[a-f0-9]{16}$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blocked = () => ({
  status: 'blocked',
  dispatch_eligible: false,
  reason_code: 'no_compatible_compiled_index',
  diagnostic: 'Rebuild and activate a verified compatible compiled routing index.',
});

function contained(root, path) {
  const rel = relative(root, path);
  return path === root || (rel && !rel.startsWith('..') && !isAbsolute(rel));
}

function boundedJson(path, limit, io) {
  if (!contained(io.root, path)) return null;
  let fd;
  try {
    fd = io.openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = io.fstatSync(fd);
    if (!info.isFile() || info.size > limit) return null;
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = io.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    if (offset !== bytes.length) return null;
    return { value: JSON.parse(bytes.toString('utf8')), bytes };
  } catch { return null; }
  finally { if (fd !== undefined) { try { io.closeSync(fd); } catch {} } }
}

const ROUTE_FIELDS = new Set(['workflow_id', 'transition_id', 'reason_code', 'dispatch_eligible', 'target_id', 'scope', 'invocation', 'dependencies']);
const ROUTE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function validRoutes(routes) {
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return false;
  const entries = Object.entries(routes);
  return entries.length > 0 && entries.length <= 1024 && entries.every(([key, route]) => (
    route && typeof route === 'object' && !Array.isArray(route)
    && Object.getPrototypeOf(route) === Object.prototype
    && Object.keys(route).length >= 4
    && Object.keys(route).every(field => ROUTE_FIELDS.has(field))
    && ROUTE_TOKEN.test(key) && route.workflow_id === key
    && ROUTE_TOKEN.test(route.workflow_id) && ROUTE_TOKEN.test(route.transition_id)
    && ROUTE_TOKEN.test(route.reason_code) && typeof route.dispatch_eligible === 'boolean'
    && (route.target_id === undefined || ROUTE_TOKEN.test(route.target_id))
  ));
}

function compatible(value) {
  return value?.router_contract === COMPILED_INDEX_COMPATIBILITY.router_contract
    && value?.policy_version === COMPILED_INDEX_COMPATIBILITY.policy_version
    && value?.capsule_schema_version === COMPILED_INDEX_COMPATIBILITY.capsule_schema_version;
}

function verifyVersion({ root, versionId, expectedHash, now, io }) {
  if (!VERSION_ID.test(versionId || '') || !/^[a-f0-9]{64}$/.test(expectedHash || '')) return null;
  const versionRoot = resolve(root, 'compiled-index', 'versions', versionId);
  const metadataRead = boundedJson(resolve(versionRoot, 'metadata.json'), COMPILED_INDEX_LIMITS.metadata_bytes, io);
  if (!metadataRead) return null;
  const metadata = metadataRead.value;
  if (metadata.schema_version !== COMPILED_INDEX_SCHEMA_VERSION
    || metadata.state !== 'verified'
    || metadata.version_id !== versionId
    || metadata.payload_sha256 !== expectedHash
    || !compatible(metadata.compatibility)
    || !Number.isFinite(metadata.created_at)
    || !Number.isFinite(metadata.expires_at)
    || metadata.created_at > now
    || metadata.expires_at < now
    || metadata.expires_at - metadata.created_at > COMPILED_INDEX_LIMITS.maximum_age_ms) return null;

  const payloadRead = boundedJson(resolve(versionRoot, 'index.json'), COMPILED_INDEX_LIMITS.payload_bytes, io);
  if (!payloadRead || sha256(payloadRead.bytes) !== expectedHash) return null;
  const index = payloadRead.value;
  if (index.schema_version !== COMPILED_INDEX_SCHEMA_VERSION
    || index.version_id !== versionId
    || index.policy_version !== COMPILED_INDEX_COMPATIBILITY.policy_version
    || index.capsule_contract_version !== COMPILED_INDEX_COMPATIBILITY.capsule_schema_version
    || !validRoutes(index.routes)) return null;
  return { index, metadata };
}

export function loadCompiledIndex({ ownedRoot, now = Date.now(), fs = {} } = {}) {
  if (typeof ownedRoot !== 'string' || !isAbsolute(ownedRoot) || !Number.isFinite(now)) return blocked();
  const root = resolve(ownedRoot);
  const io = {
    root,
    openSync: fs.openSync || openSync,
    fstatSync: fs.fstatSync || fstatSync,
    readSync: fs.readSync || readSync,
    closeSync: fs.closeSync || closeSync,
  };
  const compiledRoot = resolve(root, 'compiled-index');
  const tupleRoot = resolve(root, 'release-tuples');
  const verifyTuple = pointer => {
    if (pointer?.schema_version !== 1 || !/^t1-[a-f0-9]{16}$/.test(pointer.tuple_version_id || '')) return null;
    const versionRoot = resolve(tupleRoot, 'versions', pointer.tuple_version_id);
    const manifestRead = boundedJson(resolve(versionRoot, 'manifest.json'), COMPILED_INDEX_LIMITS.metadata_bytes, io);
    const registryRead = boundedJson(resolve(versionRoot, 'registry.json'), COMPILED_INDEX_LIMITS.payload_bytes, io);
    const indexRead = boundedJson(resolve(versionRoot, 'index.json'), COMPILED_INDEX_LIMITS.payload_bytes, io);
    const manifest = manifestRead?.value;
    if (!manifest || manifest.state !== 'verified' || manifest.tuple_version_id !== pointer.tuple_version_id
      || manifest.verification?.disposition !== 'passing' || manifest.verification?.complete !== true
      || !compatible(manifest.compatibility) || manifest.created_at > now || manifest.expires_at < now
      || sha256(registryRead?.bytes || '') !== manifest.registry?.payload_sha256
      || sha256(indexRead?.bytes || '') !== manifest.compiled?.payload_sha256
      || indexRead?.value?.version_id !== manifest.compiled?.version_id
      || !validRoutes(indexRead?.value?.routes)) return null;
    return { manifest, registry: registryRead.value, index: indexRead.value };
  };
  const tupleActivePath = resolve(tupleRoot, 'active.json');
  const tupleActive = boundedJson(tupleActivePath, COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
  if (tupleActive) {
    const verified = verifyTuple(tupleActive);
    if (verified) return { status: 'ready', dispatch_eligible: true, reason_code: 'release_tuple_active',
      tuple_version_id: tupleActive.tuple_version_id, version_id: verified.manifest.compiled.version_id,
      registry_version_id: verified.manifest.registry.version_id, source: 'active', registry: verified.registry, index: verified.index };
    const knownGood = boundedJson(resolve(tupleRoot, 'known-good.json'), COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
    const fallback = verifyTuple(knownGood);
    if (fallback) return { status: 'ready', dispatch_eligible: true, reason_code: 'release_tuple_known_good',
      tuple_version_id: knownGood.tuple_version_id, version_id: fallback.manifest.compiled.version_id,
      registry_version_id: fallback.manifest.registry.version_id, source: 'known_good', registry: fallback.registry, index: fallback.index };
    return blocked();
  }
  const active = boundedJson(resolve(compiledRoot, 'active.json'), COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
  if (active?.schema_version === COMPILED_INDEX_SCHEMA_VERSION) {
    const verified = verifyVersion({ root, versionId: active.version_id, expectedHash: active.payload_sha256, now, io });
    if (verified) return {
      status: 'ready', dispatch_eligible: true, reason_code: 'compiled_index_active',
      version_id: active.version_id, source: 'active', index: verified.index,
    };
  }

  const knownGood = boundedJson(resolve(compiledRoot, 'known-good.json'), COMPILED_INDEX_LIMITS.known_good_bytes, io)?.value;
  if (knownGood?.schema_version === COMPILED_INDEX_SCHEMA_VERSION
    && Array.isArray(knownGood.versions)
    && knownGood.versions.length <= COMPILED_INDEX_LIMITS.known_good_versions) {
    for (const candidate of knownGood.versions) {
      const verified = verifyVersion({ root, versionId: candidate?.version_id, expectedHash: candidate?.payload_sha256, now, io });
      if (verified) return {
        status: 'ready', dispatch_eligible: true, reason_code: 'compiled_index_known_good',
        version_id: candidate.version_id, source: 'known_good', index: verified.index,
      };
    }
  }
  return blocked();
}
