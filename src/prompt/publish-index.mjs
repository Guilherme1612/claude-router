import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from '../registry/schema.mjs';
import { selectCapabilities } from '../orchestrator/select.mjs';
import { selectWorkflow, nextValidTransitions, WORKFLOW_TRANSITIONS } from '../orchestrator/transitions.mjs';
import { planContextLoad, DEFAULT_CONTEXT_CONTRACT } from '../orchestrator/budget.mjs';
import {
  CALIBRATION_CORPUS_VERSION, COOLDOWN_MS, POLICY_VERSION as HEALTH_POLICY_VERSION,
  TIER_BOUNDARIES, VERSIONED_WEIGHTS, loadThresholds, readActivePointer,
} from '../health/thresholds.mjs';
import { loadStartupPointer } from '../steward/startup-pointer.mjs';
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

export function publishCompiledIndex({
  ownedRoot, registry, registryVersionId, mapping, policyFingerprint, now = Date.now(), crashAt,
  contracts, relationships, intentPolicy, workflows, healthPolicy, suggestionReference,
} = {}) {
  const root = resolve(ownedRoot);
  if (['build', 'before-build'].includes(crashAt)) throw new Error('injected crash before tuple build');
  if (!registry || !Array.isArray(registry.records) || !/^v1-[a-f0-9]{16}$/.test(registryVersionId || '')) throw new TypeError('verified registry version required');
  const records = new Map(registry.records.flatMap(record => [record.id, record.canonical_identity, record.name].filter(Boolean).map(key => [key, record])));
  // Phase 19 D-01: workflow declarations source — static file read via relative
  // path from publishCompiledIndex. Resolves in both source and deployed modules/
  // layouts. Fail-closed if the file is missing (not silent).
  let workflowDeclarations;
  try {
    const declarationsPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'orchestrator', 'workflow-declarations.json');
    workflowDeclarations = JSON.parse(readFileSync(declarationsPath, 'utf8')).declarations;
  } catch { throw new TypeError('workflow declarations source missing'); }
  const routes = {};
  for (const subject of mapping?.subjects || []) {
    const record = records.get(subject.target_id);
    if (subject.disposition === 'mapped' && record) routes[subject.subject_id] = routeFor(subject, record);
  }
  // Phase 19 D-06: blanket workflow-less fallback deleted. Empty mapping →
  // throw at the next guard → publish fails closed → no route (ORC-01 closure).
  if (!Object.keys(routes).length) throw new TypeError('compiled index requires at least one dispatch route');
  // Phase 19 D-01: orchestrator wiring. For each mapped workflow_id, run
  // nextValidTransitions → selectWorkflow → selectCapabilities → planContextLoad
  // and bake the per-workflow entry into the three by_workflow maps. Blocked
  // results bake dispatch_eligible:false with the reason_code (D-03) — never
  // throw, so a single blocked workflow does not abort the whole publish.
  const closureByWorkflow = {};
  const budgetByWorkflow = {};
  const summaryIndexByWorkflow = {};
  for (const workflowId of Object.keys(routes)) {
    const family = workflowId.includes('-') ? workflowId.slice(0, workflowId.indexOf('-')) : workflowId;
    const evidence = {
      status: 'active', freshness: 'fresh',
      position: { family, state: 'planned' },
      gates: { plan_approved: true }, dependencies_safe: true,
    };
    const transitionResult = nextValidTransitions(evidence, WORKFLOW_TRANSITIONS);
    if (transitionResult.status !== 'candidates_available') {
      closureByWorkflow[workflowId] = {
        selected_transition: null, candidates: [], closure: [],
        invokable_capabilities: [], required_models: [], required_permissions: [],
        lifecycle_bindings: [], dispatch_eligible: false, reason_code: transitionResult.reason_code,
      };
      budgetByWorkflow[workflowId] = { report: null, dispatch_eligible: false, reason_code: transitionResult.reason_code };
      summaryIndexByWorkflow[workflowId] = null;
      continue;
    }
    const selected = selectWorkflow(transitionResult, undefined);
    // WR-01 (latent v2 bug): position.state is hardcoded to 'planned' for every
    // workflow regardless of its actual lifecycle state. The v1.2 audit recommends
    // asserting selected.selection.workflow_id === workflowId here and deriving
    // position.state from the selected transition's target state (selected.selection.to)
    // rather than hardcoding 'planned'. Changing this today would alter the evidence
    // fed to nextValidTransitions, changing the published index bytes — too risky for
    // v1 which only wires gsd-execute-phase. The hardcoded 'planned' stays until v2
    // derives position.state from the workflow declaration / selected transition.
    // TODO(v2): position.state = selected.selection.to.
    //
    // When the orchestrator selects a declared workflow that does NOT match the
    // route's workflow_id (e.g. a route for 'gsd-debug' — a real workflow not yet
    // in the 8 declared workflow-declarations — selects 'gsd-execute-phase' because
    // they share the 'gsd' family), bake the route as blocked and continue instead
    // of throwing. Throwing aborted the entire publish on a single undeclared route,
    // which blocked activation whenever the mode-map stamped any workflow_id outside
    // the declared set. Graceful degradation is consistent with the existing
    // blocked-workflow pattern below; the declared workflows still wire fully.
    if (selected.status === 'selected' && selected.selection.workflow_id !== workflowId) {
      closureByWorkflow[workflowId] = {
        selected_transition: null, candidates: transitionResult.candidates, closure: [],
        invokable_capabilities: [], required_models: [], required_permissions: [],
        lifecycle_bindings: [], dispatch_eligible: false, reason_code: 'workflow_id_mismatch',
      };
      budgetByWorkflow[workflowId] = { report: null, dispatch_eligible: false, reason_code: 'workflow_id_mismatch' };
      summaryIndexByWorkflow[workflowId] = null;
      continue;
    }
    if (selected.status !== 'selected') {
      closureByWorkflow[workflowId] = {
        selected_transition: null, candidates: transitionResult.candidates, closure: [],
        invokable_capabilities: [], required_models: [], required_permissions: [],
        lifecycle_bindings: [], dispatch_eligible: false, reason_code: selected.reason_code,
      };
      budgetByWorkflow[workflowId] = { report: null, dispatch_eligible: false, reason_code: selected.reason_code };
      summaryIndexByWorkflow[workflowId] = null;
      continue;
    }
    const closureResult = selectCapabilities({
      workflow: selected, workflowDeclarations, registry,
      requestedScope: undefined, explicitCapability: undefined,
    });
    if (closureResult.status !== 'resolved') {
      closureByWorkflow[workflowId] = {
        selected_transition: selected.selection, candidates: transitionResult.candidates,
        closure: [], invokable_capabilities: [], required_models: [], required_permissions: [],
        lifecycle_bindings: [], dispatch_eligible: false, reason_code: closureResult.reason_code,
      };
      budgetByWorkflow[workflowId] = { report: null, dispatch_eligible: false, reason_code: closureResult.reason_code };
      summaryIndexByWorkflow[workflowId] = null;
      continue;
    }
    // Phase 19 D-03: planContextLoad with sources:[] + DEFAULT_CONTEXT_CONTRACT.
    // Per-prompt source descriptors are v2; in v1, required source classes are
    // missing, so budget blocks with 'required_source_class_missing' — the
    // dispatch_eligible flag carries that result (TOK-02 closure).
    // [Rule 1 - Bug] Plan step 4e said `closure: closureResult.closure` (the
    // facts array), but planContextLoad's safeClosure expects the full closure
    // result object (with .status/.dispatch_eligible/.workflow_id/.transition_id/
    // .closure/.lifecycle_bindings). Passing the array made safeClosure return
    // false and blocked every workflow with 'dependency_closure_not_dispatch_-
    // eligible'. Fixed to pass `closureResult` (the object).
    const budgetResult = planContextLoad({
      workflow: selected, closure: closureResult,
      contract: DEFAULT_CONTEXT_CONTRACT, sources: [], summaryIndex: null, baseline: undefined,
    });
    const dispatchEligible = closureResult.dispatch_eligible && budgetResult.dispatch_eligible === true;
    const closureReasonCode = closureResult.dispatch_eligible
      ? (budgetResult.dispatch_eligible === true ? 'resolved' : budgetResult.reason_code)
      : closureResult.reason_code;
    closureByWorkflow[workflowId] = {
      selected_transition: selected.selection,
      candidates: transitionResult.candidates,
      closure: closureResult.closure,
      invokable_capabilities: closureResult.invokable_capabilities,
      required_models: closureResult.required_models,
      required_permissions: closureResult.required_permissions,
      lifecycle_bindings: closureResult.lifecycle_bindings,
      dispatch_eligible: dispatchEligible,
      reason_code: closureReasonCode,
    };
    budgetByWorkflow[workflowId] = {
      report: budgetResult.report ?? null,
      dispatch_eligible: budgetResult.dispatch_eligible === true,
      reason_code: budgetResult.reason_code,
    };
    // Phase 19 D-05: summary-index ref shape present, value null until summaries
    // are produced (v1). The sibling file is keyed by workflow_id so the route
    // path's `?.[workflowId]` projection works uniformly across all three siblings.
    summaryIndexByWorkflow[workflowId] = null;
  }
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
  const contractProjection = contracts || {
    schema_version: 1,
    by_capability: Object.fromEntries(registry.records.map(record => [record.id, record.contract || null])),
  };
  const relationshipProjection = relationships || registry.relationships || {
    schema_version: 1, policy_version: 'relationship-policy-v1', edges: [], candidates: [],
  };
  const intentProjection = intentPolicy || {
    schema_version: 1,
    policy_version: COMPILED_INDEX_COMPATIBILITY.policy_version,
    policy_fingerprint: policyFingerprint || sha256('{}'),
  };
  const workflowProjection = workflows || { schema_version: 1, routes };
  const activeHealthVersion = readActivePointer(join(root, 'health')) || HEALTH_POLICY_VERSION;
  const healthProjection = healthPolicy || loadThresholds(activeHealthVersion, { ownedRoot: join(root, 'health') }) || {
    policy_version: HEALTH_POLICY_VERSION,
    cooldown_ms: COOLDOWN_MS,
    calibration_corpus_version: CALIBRATION_CORPUS_VERSION,
    weights: VERSIONED_WEIGHTS,
    tier_boundaries: TIER_BOUNDARIES,
  };
  const suggestionProjection = suggestionReference || loadStartupPointer({ ownedRoot: root, now });
  const closureProjection = { schema_version: 1, by_workflow: closureByWorkflow };
  const budgetProjection = { schema_version: 1, by_workflow: budgetByWorkflow };
  const summaryIndexProjection = { schema_version: 1, by_workflow: summaryIndexByWorkflow };
  const tupleMembers = {
    'registry.json': registryBytes,
    'index.json': compiledBytes,
    'contracts.json': json(contractProjection),
    'relationships.json': json(relationshipProjection),
    'intent-policy.json': json(intentProjection),
    'workflows.json': json(workflowProjection),
    'health-policy.json': json({ schema_version: 1, ...healthProjection }),
    'suggestion-reference.json': json(suggestionProjection),
    'closure.json': json(closureProjection),
    'budget.json': json(budgetProjection),
    'summary-index.json': json(summaryIndexProjection),
  };
  const memberHashes = Object.fromEntries(Object.entries(tupleMembers).map(([name, bytes]) => [name, sha256(bytes)]));
  const tupleVersionId = `t1-${sha256(json(memberHashes)).slice(0, 16)}`;
  const promptProjection = {
    schema_version: 1,
    tuple_version_id: tupleVersionId,
    version_id: compiledVersionId,
    registry_version_id: registryVersionId,
    index,
    closure: closureProjection,
    budget: budgetProjection,
    summary_index: summaryIndexProjection,
    suggestion_reference: suggestionProjection,
  };
  const promptProjectionBytes = json(promptProjection);
  const tupleRoot = join(root, 'release-tuples', 'versions', tupleVersionId);
  if (['member', 'before-member-write'].includes(crashAt)) throw new Error('injected crash before tuple member write');
  if (['manifest', 'before-manifest-write'].includes(crashAt)) throw new Error('injected crash before tuple manifest write');
  if (!existsSync(tupleRoot)) {
    mkdirSync(tupleRoot, { recursive: true });
    for (const [name, bytes] of Object.entries(tupleMembers)) durableWrite(join(tupleRoot, name), bytes);
    durableWrite(join(tupleRoot, 'prompt-projection.json'), promptProjectionBytes);
    const manifest = { schema_version: 2, state: 'verified', tuple_version_id: tupleVersionId,
      members: memberHashes,
      registry: { version_id: registryVersionId, payload_sha256: registryHash },
      compiled: { version_id: compiledVersionId, payload_sha256: compiledHash },
      closure: { payload_sha256: memberHashes['closure.json'] },
      budget: { payload_sha256: memberHashes['budget.json'] },
      summary_index: { payload_sha256: memberHashes['summary-index.json'] },
      prompt_projection: { payload_sha256: sha256(promptProjectionBytes) },
      policy_fingerprint: policyFingerprint || sha256('{}'), mapping_fingerprint: mappingFingerprint,
      compatibility: COMPILED_INDEX_COMPATIBILITY, verification: { disposition: 'passing', complete: true },
      created_at: now, expires_at: now + 30 * 24 * 60 * 60 * 1000 };
    durableWrite(join(tupleRoot, 'manifest.json'), json(manifest));
  }
  // Phase 19 Decision 8: pointer schema_version bumped 1→2 alongside the tuple
  // schema bump (compile-index.mjs verifyTuple rejects schema-1 pointers).
  const pointer = {
    schema_version: 2,
    tuple_version_id: tupleVersionId,
    prompt_projection_sha256: sha256(promptProjectionBytes),
  };
  if (['verification', 'before-verification'].includes(crashAt)) throw new Error('injected crash before tuple verification');
  const candidate = loadCompiledIndex({ ownedRoot: root, now, releaseTuplePointer: pointer });
  if (!candidate.dispatch_eligible || candidate.tuple_version_id !== tupleVersionId) throw new Error('tuple_validation_failed');
  if (crashAt === 'before-active-pointer') throw new Error('injected crash before active pointer');
  replacePointer(join(root, 'release-tuples', 'active.json'), pointer);
  if (crashAt === 'after-active-pointer') throw new Error('injected crash after active pointer');
  replacePointer(join(root, 'release-tuples', 'known-good.json'), pointer);
  return {
    publication_status: 'published', tuple_version_id: tupleVersionId,
    registry_version_id: registryVersionId, compiled_version_id: compiledVersionId,
    member_fingerprints: memberHashes, manifest_fingerprint: sha256(readFileSync(join(tupleRoot, 'manifest.json'))),
  };
}
