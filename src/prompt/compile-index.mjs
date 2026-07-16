import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
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
  try {
    const info = io.lstatSync(path);
    if (info.isSymbolicLink() || !info.isFile() || info.size > limit) return null;
    const bytes = io.readFileSync(path);
    if (bytes.length > limit) return null;
    return { value: JSON.parse(bytes.toString('utf8')), bytes };
  } catch { return null; }
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
    || !index.routes || typeof index.routes !== 'object' || Array.isArray(index.routes)) return null;
  return { index, metadata };
}

export function loadCompiledIndex({ ownedRoot, now = Date.now(), fs = {} } = {}) {
  if (typeof ownedRoot !== 'string' || !isAbsolute(ownedRoot) || !Number.isFinite(now)) return blocked();
  const root = resolve(ownedRoot);
  const io = {
    root,
    lstatSync: fs.lstatSync || lstatSync,
    readFileSync: fs.readFileSync || readFileSync,
  };
  const compiledRoot = resolve(root, 'compiled-index');
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
