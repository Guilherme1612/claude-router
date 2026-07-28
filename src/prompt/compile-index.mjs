import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

// CONTEXT_CONTRACT_VERSION inlined to avoid pulling src/orchestrator/* into the
// hook import graph (Phase 19 D-08). Keep in sync with src/orchestrator/budget.mjs:4.
const CONTEXT_CONTRACT_VERSION = 'workflow-context-contract-v1';

export const COMPILED_INDEX_SCHEMA_VERSION = 2;
export const COMPILED_INDEX_COMPATIBILITY = Object.freeze({
  router_contract: 'prompt-route-v1',
  policy_version: 'workflow-transitions-v1',
  capsule_schema_version: 1,
  // Phase 19 D-04: schema 1->2 invalidates prior tuples; watcher re-publishes.
  orchestrator_contract_version: 'workflow-first-v1',
  context_contract_version: CONTEXT_CONTRACT_VERSION,
});
export const COMPILED_INDEX_LIMITS = Object.freeze({
  pointer_bytes: 4 * 1024,
  known_good_bytes: 16 * 1024,
  metadata_bytes: 8 * 1024,
  payload_bytes: 64 * 1024,
  // The registry sibling (registry.json) embedded in a release tuple carries the
  // full candidate registry — 257+ records, ~256KB in production. The 64KB
  // payload_bytes bound (sized for the compact compiled index.json) rejected it,
  // so verifyTuple failed at the registry hash check and publishCompiledIndex
  // threw tuple_validation_failed on every activation. A dedicated 1MB bound
  // accommodates the registry with headroom for growth without unbounding the
  // compact index.json read (which stays at payload_bytes).
  registry_bytes: 1024 * 1024,
  known_good_versions: 8,
  maximum_age_ms: 30 * 24 * 60 * 60 * 1000,
  // Phase 19 Pitfall #5: independent sibling bounds so blocked routes don't
  // pay the closure/budget/summary-index read cost.
  closure_bytes: 64 * 1024,
  budget_bytes: 32 * 1024,
  summary_index_bytes: 16 * 1024,
  contracts_bytes: 512 * 1024,
  relationships_bytes: 256 * 1024,
  intent_policy_bytes: 16 * 1024,
  workflows_bytes: 128 * 1024,
  health_policy_bytes: 16 * 1024,
  suggestion_reference_bytes: 4 * 1024,
  prompt_projection_bytes: 160 * 1024,
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

const TUPLE_MEMBERS = Object.freeze({
  'registry.json': 'registry_bytes',
  'index.json': 'payload_bytes',
  'contracts.json': 'contracts_bytes',
  'relationships.json': 'relationships_bytes',
  'intent-policy.json': 'intent_policy_bytes',
  'workflows.json': 'workflows_bytes',
  'health-policy.json': 'health_policy_bytes',
  'suggestion-reference.json': 'suggestion_reference_bytes',
  'closure.json': 'closure_bytes',
  'budget.json': 'budget_bytes',
  'summary-index.json': 'summary_index_bytes',
});

function validSuggestion(value) {
  return value?.schema_version === 1
    && typeof value.policy_version === 'string'
    && typeof value.available === 'boolean'
    && (value.fingerprint === null || /^[a-f0-9]{64}$/.test(value.fingerprint))
    && (!value.available || value.fingerprint !== null)
    && (value.cooldown_until_ms === null || Number.isSafeInteger(value.cooldown_until_ms));
}

function promptResult(pointer, projection, source, reasonCode) {
  if (projection?.schema_version !== 1
    || projection.tuple_version_id !== pointer.tuple_version_id
    || !VERSION_ID.test(projection.version_id || '')
    || !VERSION_ID.test(projection.registry_version_id || '')
    || !validRoutes(projection.index?.routes)) return null;
  return {
    status: 'ready', dispatch_eligible: true, reason_code: reasonCode,
    tuple_version_id: pointer.tuple_version_id, version_id: projection.version_id,
    registry_version_id: projection.registry_version_id, source,
    prompt_projection: true,
    index: projection.index, closure: projection.closure, budget: projection.budget,
    summaryIndex: projection.summary_index,
    suggestionReference: validSuggestion(projection.suggestion_reference)
      ? projection.suggestion_reference
      : { schema_version: 1, policy_version: 'steward-policy-v1', fingerprint: null, available: false, cooldown_until_ms: null },
  };
}

export function compatible(value) {
  return value?.router_contract === COMPILED_INDEX_COMPATIBILITY.router_contract
    && value?.policy_version === COMPILED_INDEX_COMPATIBILITY.policy_version
    && value?.capsule_schema_version === COMPILED_INDEX_COMPATIBILITY.capsule_schema_version
    && value?.orchestrator_contract_version === COMPILED_INDEX_COMPATIBILITY.orchestrator_contract_version
    && value?.context_contract_version === COMPILED_INDEX_COMPATIBILITY.context_contract_version;
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

export function loadCompiledIndex({ ownedRoot, now = Date.now(), fs = {}, releaseTuplePointer, projectionOnly = false } = {}) {
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
  const tupleActivePath = resolve(tupleRoot, 'active.json');
  const tupleActiveRead = boundedJson(tupleActivePath, COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
  const verifyProjection = (pointer, source, reasonCode) => {
    if (pointer?.schema_version !== 2
      || !/^t1-[a-f0-9]{16}$/.test(pointer.tuple_version_id || '')
      || !/^[a-f0-9]{64}$/.test(pointer.prompt_projection_sha256 || '')) return null;
    const read = boundedJson(resolve(tupleRoot, 'versions', pointer.tuple_version_id, 'prompt-projection.json'),
      COMPILED_INDEX_LIMITS.prompt_projection_bytes, io);
    if (!read || sha256(read.bytes) !== pointer.prompt_projection_sha256) return null;
    return promptResult(pointer, read.value, source, reasonCode);
  };
  const verifyTuple = pointer => {
    if (pointer?.schema_version !== 2 || !/^t1-[a-f0-9]{16}$/.test(pointer.tuple_version_id || '')) return null;
    const versionRoot = resolve(tupleRoot, 'versions', pointer.tuple_version_id);
    const manifestRead = boundedJson(resolve(versionRoot, 'manifest.json'), COMPILED_INDEX_LIMITS.metadata_bytes, io);
    const manifest = manifestRead?.value;
    if (manifest?.schema_version === 2) {
      const expectedNames = Object.keys(TUPLE_MEMBERS);
      if (manifest?.schema_version !== 2
        || Object.keys(manifest.members || {}).sort().join('\0') !== expectedNames.sort().join('\0')) return null;
      const reads = {};
      for (const [name, limitName] of Object.entries(TUPLE_MEMBERS)) {
        const read = boundedJson(resolve(versionRoot, name), COMPILED_INDEX_LIMITS[limitName], io);
        if (!read || sha256(read.bytes) !== manifest.members[name]) return null;
        reads[name] = read.value;
      }
      const identity = `t1-${sha256(`${JSON.stringify(manifest.members, Object.keys(manifest.members).sort())}\n`).slice(0, 16)}`;
      if (identity !== pointer.tuple_version_id
        || manifest.state !== 'verified' || manifest.tuple_version_id !== pointer.tuple_version_id
        || manifest.verification?.disposition !== 'passing' || manifest.verification?.complete !== true
        || !compatible(manifest.compatibility) || manifest.created_at > now || manifest.expires_at < now
        || manifest.registry?.payload_sha256 !== manifest.members['registry.json']
        || manifest.compiled?.payload_sha256 !== manifest.members['index.json']
        || manifest.closure?.payload_sha256 !== manifest.members['closure.json']
        || manifest.budget?.payload_sha256 !== manifest.members['budget.json']
        || manifest.summary_index?.payload_sha256 !== manifest.members['summary-index.json']
        || reads['index.json']?.version_id !== manifest.compiled?.version_id
        || !validRoutes(reads['index.json']?.routes)
        || reads['contracts.json']?.schema_version !== 1
        || reads['relationships.json']?.schema_version !== 1
        || reads['intent-policy.json']?.schema_version !== 1
        || reads['workflows.json']?.schema_version !== 1
        || reads['health-policy.json']?.schema_version !== 1
        || !validSuggestion(reads['suggestion-reference.json'])) return null;
      return {
        manifest, registry: reads['registry.json'], index: reads['index.json'],
        contracts: reads['contracts.json'], relationships: reads['relationships.json'],
        intentPolicy: reads['intent-policy.json'], workflows: reads['workflows.json'],
        healthPolicy: reads['health-policy.json'], suggestionReference: reads['suggestion-reference.json'],
        closure: reads['closure.json'], budget: reads['budget.json'], summaryIndex: reads['summary-index.json'],
      };
    }
    const registryRead = boundedJson(resolve(versionRoot, 'registry.json'), COMPILED_INDEX_LIMITS.registry_bytes, io);
    const indexRead = boundedJson(resolve(versionRoot, 'index.json'), COMPILED_INDEX_LIMITS.payload_bytes, io);
    const closureRead = boundedJson(resolve(versionRoot, 'closure.json'), COMPILED_INDEX_LIMITS.closure_bytes, io);
    const budgetRead = boundedJson(resolve(versionRoot, 'budget.json'), COMPILED_INDEX_LIMITS.budget_bytes, io);
    const summaryIndexRead = boundedJson(resolve(versionRoot, 'summary-index.json'), COMPILED_INDEX_LIMITS.summary_index_bytes, io);
    // T-19-01: each sibling must be present and hash-verified against the manifest
    // payload_sha256. A missing or mismatched sibling causes the tuple to be
    // rejected and loadCompiledIndex returns blocked() (Phase 17 D-02 fail-closed).
    if (!manifest || manifest.state !== 'verified' || manifest.tuple_version_id !== pointer.tuple_version_id
      || manifest.verification?.disposition !== 'passing' || manifest.verification?.complete !== true
      || !compatible(manifest.compatibility) || manifest.created_at > now || manifest.expires_at < now
      || sha256(registryRead?.bytes || '') !== manifest.registry?.payload_sha256
      || sha256(indexRead?.bytes || '') !== manifest.compiled?.payload_sha256
      || indexRead?.value?.version_id !== manifest.compiled?.version_id
      || !validRoutes(indexRead?.value?.routes)
      || !manifest.closure?.payload_sha256 || sha256(closureRead?.bytes || '') !== manifest.closure.payload_sha256
      || !manifest.budget?.payload_sha256 || sha256(budgetRead?.bytes || '') !== manifest.budget.payload_sha256
      || !manifest.summary_index?.payload_sha256 || sha256(summaryIndexRead?.bytes || '') !== manifest.summary_index.payload_sha256) return null;
    return {
      manifest, registry: registryRead.value, index: indexRead.value,
      closure: closureRead.value, budget: budgetRead.value, summaryIndex: summaryIndexRead.value,
    };
  };
  if (projectionOnly) {
    const activePointer = tupleActiveRead;
    if (activePointer?.schema_version === 2 && activePointer.prompt_projection_sha256) {
      const activeProjection = verifyProjection(activePointer, 'active', 'release_tuple_active');
      if (activeProjection) return activeProjection;
      const knownGoodPointer = boundedJson(resolve(tupleRoot, 'known-good.json'), COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
      return verifyProjection(knownGoodPointer, 'known_good', 'release_tuple_known_good') || blocked();
    }
  }
  if (releaseTuplePointer) {
    const verified = verifyTuple(releaseTuplePointer);
    if (verified) return { status: 'ready', dispatch_eligible: true, reason_code: 'release_tuple_recovery_candidate',
      tuple_version_id: releaseTuplePointer.tuple_version_id, version_id: verified.manifest.compiled.version_id,
      registry_version_id: verified.manifest.registry.version_id, source: 'recovery_candidate',
      registry: verified.registry, index: verified.index,
      closure: verified.closure, budget: verified.budget, summaryIndex: verified.summaryIndex,
      ...(verified.suggestionReference ? { suggestionReference: verified.suggestionReference } : {}) };
    return blocked();
  }
  const tupleActive = tupleActiveRead;
  if (tupleActive) {
    const verified = verifyTuple(tupleActive);
    if (verified) return { status: 'ready', dispatch_eligible: true, reason_code: 'release_tuple_active',
      tuple_version_id: tupleActive.tuple_version_id, version_id: verified.manifest.compiled.version_id,
      registry_version_id: verified.manifest.registry.version_id, source: 'active',
      registry: verified.registry, index: verified.index,
      closure: verified.closure, budget: verified.budget, summaryIndex: verified.summaryIndex,
      ...(verified.suggestionReference ? { suggestionReference: verified.suggestionReference } : {}) };
    const knownGood = boundedJson(resolve(tupleRoot, 'known-good.json'), COMPILED_INDEX_LIMITS.pointer_bytes, io)?.value;
    const fallback = verifyTuple(knownGood);
    if (fallback) return { status: 'ready', dispatch_eligible: true, reason_code: 'release_tuple_known_good',
      tuple_version_id: knownGood.tuple_version_id, version_id: fallback.manifest.compiled.version_id,
      registry_version_id: fallback.manifest.registry.version_id, source: 'known_good',
      registry: fallback.registry, index: fallback.index,
      closure: fallback.closure, budget: fallback.budget, summaryIndex: fallback.summaryIndex,
      ...(fallback.suggestionReference ? { suggestionReference: fallback.suggestionReference } : {}) };
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
