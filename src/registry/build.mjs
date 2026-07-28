import { discoverRoots as discoverClaude } from '../adapters/claude.mjs';
import { discoverRoots as discoverCodex } from '../adapters/codex.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalizeCapability, stableStringify, validateCapability } from './schema.mjs';
import { stableCapabilityId } from './identity.mjs';
import {
  applyContractOverlays,
  buildCapabilityContract,
  resolveContractOverlays,
  validateCapabilityContract,
} from './contract.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { deriveRelationships } from './relationships.mjs';

function key(value) {
  return stableStringify(value);
}
function fingerprint(value) { return createHash('sha256').update(key(value)).digest('hex'); }

function completeTuple(members) {
  const canonicalMembers = Object.fromEntries(
    Object.entries(members).sort(([left], [right]) => left.localeCompare(right)),
  );
  const member_fingerprints = Object.fromEntries(
    Object.entries(canonicalMembers).map(([name, value]) => [name, fingerprint(value)]),
  );
  return {
    schema_version: 1,
    members: canonicalMembers,
    member_fingerprints,
    tuple_id: `t1-${fingerprint(member_fingerprints).slice(0, 16)}`,
  };
}

const MATERIAL_FIELDS = [
  ['name', 'informational'],
  ['type', 'dispatch-blocking'],
  ['description', 'informational'],
  ['lifecycle', 'dispatch-blocking'],
  ['dispatchable', 'dispatch-blocking'],
  ['invocation', 'dispatch-blocking'],
  ['dependencies', 'dispatch-blocking'],
  ['scope', 'build-blocking'],
];

function sourceIdentity(record) {
  return record.provenance.map(source => `${source.runtime}:${source.logical_root}/${source.relative_path}`).sort();
}

function syntheticConflicts(records) {
  const conflicts = [];
  for (const [field, severity] of MATERIAL_FIELDS) {
    const groups = new Map();
    for (const record of records) {
      const value = record[field] ?? null;
      const valueKey = key(value);
      if (!groups.has(valueKey)) groups.set(valueKey, { value, sources: [] });
      groups.get(valueKey).sources.push(...sourceIdentity(record));
    }
    if (groups.size < 2) continue;
    const values = [...groups.values()].map(entry => ({
      fingerprint: fingerprint(entry.value),
      value: entry.value,
      sources: [...new Set(entry.sources)].sort(),
    })).sort((a, b) => key(a).localeCompare(key(b)));
    conflicts.push({
      field,
      type: 'linked-variant-disagreement',
      severity,
      sources: [...new Set(values.flatMap(entry => entry.sources))].sort(),
      values,
    });
  }
  return conflicts;
}

function mergeGroup(records) {
  const ordered = records.map(canonicalizeCapability).sort((a, b) => key(a).localeCompare(key(b)));
  const first = structuredClone(ordered[0]);
  first.conflicts.push(...syntheticConflicts(ordered));
  for (const record of ordered.slice(1)) {
    first.provenance.push(...record.provenance);
    first.runtime_variants.push(...record.runtime_variants);
    first.conflicts.push(...record.conflicts);
    first.dispatchable &&= record.dispatchable;
    if (!record.dispatchable) first.lifecycle = record.lifecycle;
  }
  return canonicalizeCapability(first);
}

function annotatePrecedence(records) {
  const byName = new Map();
  for (const record of records) {
    const k = `${record.type}:${record.name}`;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(record);
  }
  for (const group of byName.values()) {
    const projects = group.filter(r => r.scope.kind !== 'global');
    const globals = group.filter(r => r.scope.kind === 'global');
    for (const project of projects) project.precedence_status = project.dispatchable ? 'preferred' : 'preferred-unusable';
    for (const global of globals) {
      if (!projects.length) global.precedence_status = 'fallback';
      else if (projects.some(r => !r.dispatchable)) global.precedence_status = 'available-fallback';
      else global.precedence_status = 'shadowed';
    }
  }
}

// Reads the router's mode-map.json (the workflow brain) and resolves each
// entry to the registry record that implements it, returning a map of
// record-name → Set<workflow_id>. The mapper's explicit tier consumes
// `mapping.explicit_subjects` per-record, so stamping these subject ids onto
// the matching records at build time is what seeds `mapCandidateRegistry` with
// dispatch subjects — without it, subjectIds is empty, the mapper returns zero
// subjects, and `publishCompiledIndex` throws its ORC-01 zero-route guard.
//
// Target resolution per entry.invoke_kind:
//   - 'slash' (default): entry.id names the implementing command/skill record.
//   - 'skill': the first recommended_skill names the implementing skill record.
//   - 'agent': the first recommended_agent names the implementing agent record.
//   - 'warn': not dispatchable — skipped (warnings never produce routes).
// Returns null when modeMapPath is absent or the file does not exist (ENOENT)
// so the build stays a no-op on fresh installs before mode-map.json is authored.
// A malformed mode-map (invalid JSON) is a build error — fail loud, never
// silently route to the wrong target.
function resolveModeMapTargets(modeMapPath) {
  if (!modeMapPath) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(modeMapPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const targetsByName = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) continue;
    if (entry.invoke_kind === 'warn') continue;
    let targetName = null;
    if (entry.invoke_kind === 'agent') {
      targetName = Array.isArray(entry.recommended_agents) && typeof entry.recommended_agents[0] === 'string' ? entry.recommended_agents[0] : null;
    } else if (entry.invoke_kind === 'skill') {
      targetName = Array.isArray(entry.recommended_skills) && typeof entry.recommended_skills[0] === 'string' ? entry.recommended_skills[0] : null;
    } else {
      targetName = entry.id;
    }
    if (typeof targetName !== 'string' || !targetName.trim()) continue;
    if (!targetsByName.has(targetName)) targetsByName.set(targetName, new Set());
    targetsByName.get(targetName).add(entry.id);
  }
  return targetsByName.size ? targetsByName : null;
}

// Reads the orchestrator's workflow-declarations.json and returns a map of
// record-name → Set<workflow_id> for each declared workflow whose id matches a
// record name. The orchestrator can only dispatch workflows that have a route
// in the compiled index, and the compiled index's routes come from the mapper's
// explicit-tier subjects. Without stamping the declared workflow_ids onto
// matching records, the compiled index lacks routes for orchestrator-declared
// workflows (e.g. gsd-execute-phase) — the calibration quality gate then fails
// because the calibration corpus routes through gsd-execute-phase, and the
// canary rolls back the activation. Returns null when the path is absent or the
// file is missing (ENOENT) so the build is a no-op on fresh installs.
function resolveDeclaredWorkflowTargets(declarationsPath) {
  if (!declarationsPath) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(declarationsPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const declarations = Array.isArray(parsed.declarations) ? parsed.declarations : [];
  const targetsByName = new Map();
  for (const declaration of declarations) {
    const workflowId = declaration?.workflow_id;
    if (typeof workflowId !== 'string' || !workflowId.trim()) continue;
    // Each declared workflow_id is stamped onto the record of the same name
    // (e.g. workflow_id 'gsd-execute-phase' → the 'gsd-execute-phase' skill).
    if (!targetsByName.has(workflowId)) targetsByName.set(workflowId, new Set());
    targetsByName.get(workflowId).add(workflowId);
  }
  return targetsByName.size ? targetsByName : null;
}

export function acquireRegistry(options = {}) {
  return {
    claude: (options.discoverClaude || discoverClaude)(options),
    codex: (options.discoverCodex || discoverCodex)(options),
  };
}

export function buildFullRegistry(options = {}) {
  return assembleRegistry(acquireRegistry(options), options);
}

function validateAcquisition(acquisition, label = 'acquisition') {
  if (!acquisition || typeof acquisition !== 'object') throw new TypeError(`${label} is required`);
  for (const runtime of ['claude', 'codex']) {
    const result = acquisition[runtime];
    if (!result || !Array.isArray(result.observations) || !Array.isArray(result.diagnostics)) {
      throw new TypeError(`${label}.${runtime} must contain observations and diagnostics arrays`);
    }
    for (const observation of result.observations) validateCapability(observation);
  }
}

function logicalRootOf(value) {
  return value?.logical_root || value?.provenance?.[0]?.logical_root || null;
}

function runtimeForRoot(logicalRoot) {
  if (logicalRoot === 'claude_global' || logicalRoot?.endsWith(':claude')) return 'claude';
  if (logicalRoot === 'codex_home' || logicalRoot?.endsWith(':codex')) return 'codex';
  return null;
}

function dirtyLogicalRoots(diff) {
  if (!diff || !Array.isArray(diff.events) || !Array.isArray(diff.diagnostics)) {
    throw new TypeError('diff must contain events and diagnostics arrays');
  }
  const roots = new Set();
  for (const event of diff.events) {
    if (!event || typeof event !== 'object' || typeof event.primary !== 'string'
      || !Array.isArray(event.facets) || !Array.isArray(event.old_provenance ?? [])
      || !Array.isArray(event.new_provenance ?? [])) {
      throw new TypeError('diff contains an invalid lifecycle event');
    }
  }
  if (diff.hash !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(diff.hash)
      || diff.hash !== fingerprint({ events: diff.events, diagnostics: diff.diagnostics })) {
      throw new TypeError('diff hash does not match lifecycle contents');
    }
  }
  for (const item of [...diff.events, ...diff.diagnostics]) {
    const direct = logicalRootOf(item);
    if (direct) roots.add(direct);
    for (const provenance of [...(item.old_provenance || []), ...(item.new_provenance || [])]) {
      if (provenance?.logical_root) roots.add(provenance.logical_root);
    }
  }
  for (const root of roots) {
    if (!runtimeForRoot(root)) throw new TypeError(`diff references unsupported logical root: ${root}`);
  }
  return [...roots].sort();
}

function replaceDirty(previous, refreshed, roots) {
  const dirty = new Set(roots);
  const keep = values => values.filter(value => !dirty.has(logicalRootOf(value)));
  const take = values => values.filter(value => dirty.has(logicalRootOf(value)));
  return {
    observations: [...keep(previous.observations), ...take(refreshed.observations)],
    diagnostics: [...keep(previous.diagnostics), ...take(refreshed.diagnostics)],
  };
}

export function refreshIncrementalAcquisition(previous, diff, options = {}) {
  validateAcquisition(previous, 'previous');
  const dirty = dirtyLogicalRoots(diff);
  const next = {
    claude: { observations: [...previous.claude.observations], diagnostics: [...previous.claude.diagnostics] },
    codex: { observations: [...previous.codex.observations], diagnostics: [...previous.codex.diagnostics] },
  };
  for (const runtime of ['claude', 'codex']) {
    const roots = dirty.filter(root => runtimeForRoot(root) === runtime);
    if (!roots.length) continue;
    const discover = runtime === 'claude'
      ? (options.discoverClaude || discoverClaude)
      : (options.discoverCodex || discoverCodex);
    next[runtime] = replaceDirty(previous[runtime], discover(options), roots);
  }
  return next;
}

export function buildIncrementalRegistry(previous, diff, options = {}) {
  return assembleRegistry(refreshIncrementalAcquisition(previous, diff, options), options);
}

export function assembleRegistry(acquisition, options = {}) {
  validateAcquisition(acquisition);
  const { claude, codex } = acquisition;
  const observations = [...claude.observations, ...codex.observations];
  const groups = new Map();
  for (const record of observations) {
    validateCapability(record);
    const id = stableCapabilityId(record);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(record);
  }
  const records = [...groups.entries()].map(([id, variants]) => ({ id, ...mergeGroup(variants) }));
  annotatePrecedence(records);
  // Stamp record-owned mapping metadata from the router's mode-map.json brain.
  // The mapper derives dispatch subjects from per-record `mapping.explicit_subjects`;
  // mode-map.json is the source-of-truth for workflow→target routing but is not
  // present on the discovered artifacts. Stamping here (opt-in via options.modeMapPath)
  // seeds the mapper's explicit tier so publishCompiledIndex gets ≥1 dispatch route.
  // Merges with any mapping already on the record (artifact-provided mapping wins
  // by union, never overwritten).
  //
  // When the same skill is deployed to both claude and codex runtimes (two records
  // with the same name but different stableCapabilityId, because the artifacts lack
  // a shared canonical_identity), stamping BOTH would give the mapper two explicit
  // claims for one workflow subject → explicit_authority_conflict → ambiguous →
  // no activation. Stamp only the claude-runtime record per name (the router's
  // primary hook runtime); the codex mirror stays un-stamped and is unreachable at
  // the explicit tier, so the explicit claim is unique → mapped.
  const modeMapTargets = resolveModeMapTargets(options.modeMapPath);
  const declaredTargets = resolveDeclaredWorkflowTargets(options.workflowDeclarationsPath);
  if (modeMapTargets || declaredTargets) {
    const byName = new Map();
    for (const record of records) {
      const existing = byName.get(record.name);
      if (!existing) { byName.set(record.name, record); continue; }
      if (existing.invocation?.runtime !== 'claude' && record.invocation?.runtime === 'claude') {
        byName.set(record.name, record);
      }
    }
    for (const record of byName.values()) {
      const subjects = new Set();
      for (const id of (modeMapTargets?.get(record.name) || [])) subjects.add(id);
      for (const id of (declaredTargets?.get(record.name) || [])) subjects.add(id);
      if (!subjects.size) continue;
      const existing = record.mapping && typeof record.mapping === 'object' ? record.mapping : {};
      const existingExplicit = Array.isArray(existing.explicit_subjects) ? existing.explicit_subjects : [];
      const merged = [...new Set([...existingExplicit, ...subjects])].sort();
      record.mapping = { ...existing, explicit_subjects: merged };
    }
  }
  for (const record of records) {
    record.contract = buildCapabilityContract(record);
    validateCapabilityContract(record.contract);
  }
  const overlayResolution = options.overlays === undefined
    ? null
    : resolveContractOverlays(records, options.overlays, { lineage: options.overlayLineage });
  const overlaidRecords = overlayResolution ? applyContractOverlays(records, overlayResolution) : records;
  const relationships = options.relationships || deriveRelationships({
    records: overlaidRecords,
    candidates: options.relationshipCandidates,
  });
  const enrichedRecords = overlaidRecords.map(record => {
    const {
      eligibility: _authoredEligibility,
      dispatch_eligible: _authoredDispatchEligible,
      ...authoritative
    } = record;
    const eligibility = evaluateEligibility({
      record: authoritative,
      records: overlaidRecords,
      relationships,
    });
    return { ...authoritative, dispatchable: eligibility.eligible, eligibility };
  });
  enrichedRecords.sort((a, b) => `${a.id}:${key(a.provenance)}`.localeCompare(`${b.id}:${key(b.provenance)}`));
  const diagnostics = [...claude.diagnostics, ...codex.diagnostics].map(({ local_path: _local, ...portable }) => portable)
    .sort((a, b) => key(a).localeCompare(key(b)));
  const registry = {
    schema_version: 1,
    records: enrichedRecords,
    ...((relationships.edges.length || relationships.candidates.length) ? { relationships } : {}),
    ...(overlayResolution?.rejected.length ? { rejected_overlays: overlayResolution.rejected } : {}),
  };
  const summary = {
    schema_version: 1, activated: false, record_count: enrichedRecords.length, diagnostic_count: diagnostics.length,
    dispatchable_count: enrichedRecords.filter(r => r.dispatchable).length,
    runtimes: { claude: claude.observations.length, codex: codex.observations.length },
    registry_fingerprint: fingerprint(registry), diagnostics_fingerprint: fingerprint(diagnostics),
  };
  const contracts = {
    schema_version: 1,
    by_capability: Object.fromEntries(enrichedRecords.map(record => [record.id, record.contract])),
  };
  const intentPolicy = {
    schema_version: 1,
    policy_version: 'workflow-transitions-v1',
  };
  const workflows = {
    schema_version: 1,
    routes: enrichedRecords.flatMap(record => (
      record.mapping?.explicit_subjects || []
    ).map(workflow_id => ({ workflow_id, capability_id: record.id })))
      .sort((a, b) => key(a).localeCompare(key(b))),
  };
  const healthPolicy = {
    schema_version: 1,
    policy_version: 'health-policy-v1',
  };
  const suggestionReference = {
    schema_version: 1,
    policy_version: 'steward-policy-v1',
    fingerprint: null,
    available: false,
    cooldown_until_ms: null,
  };
  const complete_tuple = completeTuple({
    registry,
    contracts,
    relationships,
    intent_policy: intentPolicy,
    workflows,
    health_policy: healthPolicy,
    suggestion_reference: suggestionReference,
  });
  return {
    registry,
    contracts,
    diagnostics,
    summary,
    relationships,
    intent_policy: intentPolicy,
    workflows,
    health_policy: healthPolicy,
    suggestion_reference: suggestionReference,
    complete_tuple,
    ...(overlayResolution ? { overlays: overlayResolution } : {}),
  };
}
