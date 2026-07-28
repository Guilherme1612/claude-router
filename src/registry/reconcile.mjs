import { createHash } from 'node:crypto';
import { stableCapabilityId } from './identity.mjs';
import { canonicalizeCapability, stableStringify, validateCapability } from './schema.mjs';
import { reconcileHookInventory } from './hook-reconcile.mjs';
import { relationshipReferences } from './relationships.mjs';

function fingerprint(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value), 'utf8').digest('hex');
}

function portable(value) {
  if (Array.isArray(value)) return value.map(portable);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (['local_path', 'path', 'absolute_path'].includes(key)) continue;
    output[key] = portable(value[key]);
  }
  return output;
}

function verdict({ code, subject, evidence = {}, reason, correctiveAction, severity = 'dispatch-blocking' }) {
  return {
    schema_version: 1,
    code,
    severity,
    dispatchable: false,
    subject: portable(subject),
    evidence: portable(evidence),
    reason,
    corrective_action: correctiveAction,
  };
}

function activeState(active) {
  const registry = active?.registry ?? active ?? { schema_version: 1, records: [] };
  const bytes = typeof active?.bytes === 'string' ? active.bytes : `${stableStringify(registry)}\n`;
  return { bytes, fingerprint: active?.fingerprint || fingerprint(bytes) };
}

function canonicalCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.records)) {
    throw new TypeError('candidate.records must be an array');
  }
  const records = candidate.records.map(record => {
    validateCapability(record);
    return { id: stableCapabilityId(record), ...canonicalizeCapability(record) };
  }).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  return {
    schema_version: candidate.schema_version ?? 1,
    records,
    ...(candidate.relationships ? { relationships: candidate.relationships } : {}),
    ...(Array.isArray(candidate.rejected_overlays) ? { rejected_overlays: candidate.rejected_overlays } : {}),
  };
}

function canonicalAliases(aliases) {
  if (!Array.isArray(aliases)) throw new TypeError('aliases must be an array');
  return aliases.map(alias => {
    if (!alias || typeof alias.id !== 'string' || !alias.id.trim()) throw new TypeError('alias.id must be a non-empty string');
    if (typeof alias.target_id !== 'string' || !alias.target_id.trim()) throw new TypeError('alias.target_id must be a non-empty string');
    return { id: alias.id.trim(), target_id: alias.target_id.trim() };
  }).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

const REFERENCE_TYPES = new Set([
  'alias', 'equivalence', 'workflow', 'correction', 'mapping', 'compiled-route', 'relationship',
  'dependency', 'adapter', 'inference-rule', 'manifest', 'negative-evidence',
]);

export const INVALIDATION_CLASSES = Object.freeze([
  'node', 'edge', 'dependency', 'adapter', 'inference-rule', 'manifest', 'correction', 'negative-evidence',
]);

function canonicalReferences(input, candidate, events) {
  if (!input || typeof input !== 'object' || input.schema_version !== 1 || !Array.isArray(input.edges)) {
    throw new TypeError('references must be a version 1 graph with an edges array');
  }
  const edges = input.edges.map(edge => {
    if (!edge || typeof edge !== 'object') throw new TypeError('reference edge must be an object');
    for (const field of ['id', 'type', 'from_id', 'to_id']) {
      if (typeof edge[field] !== 'string' || !edge[field].trim()) {
        throw new TypeError(`reference edge ${field} must be a non-empty string`);
      }
    }
    if (!REFERENCE_TYPES.has(edge.type)) throw new TypeError(`unsupported reference edge type: ${edge.type}`);
    return {
      id: edge.id.trim(),
      type: edge.type,
      from_id: edge.from_id.trim(),
      to_id: edge.to_id.trim(),
    };
  }).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  if (new Set(edges.map(edge => edge.id)).size !== edges.length) {
    throw new TypeError('reference edge ids must be unique');
  }
  const known = new Set(candidate.records.map(record => record.id));
  for (const edge of edges) known.add(edge.from_id);
  for (const event of events) {
    if (typeof event?.canonical_id === 'string') known.add(event.canonical_id);
  }
  for (const edge of edges) {
    if (!known.has(edge.to_id)) throw new TypeError(`dangling unsafe reference target: ${edge.to_id}`);
  }
  return { schema_version: 1, edges };
}

function invalidationClosure(candidate, events, references) {
  const seeds = new Set();
  for (const event of events) {
    const changeClass = event?.change_class;
    if (changeClass !== undefined && !INVALIDATION_CLASSES.includes(changeClass)) {
      throw new TypeError(`unsupported invalidation class: ${changeClass}`);
    }
    if ((['removed', 'replaced', 'disabled'].includes(event?.primary) || changeClass)
      && typeof event.canonical_id === 'string') seeds.add(event.canonical_id);
    for (const id of event?.affected_ids || []) {
      if (typeof id !== 'string' || !id.trim()) throw new TypeError('affected_ids must contain non-empty strings');
      seeds.add(id.trim());
    }
  }
  for (const record of candidate.records) {
    if (record.enabled === false || record.lifecycle !== 'ready'
      || record.dependencies.items.some(dependency => !dependency.available)) {
      seeds.add(record.id);
    }
  }
  const reverse = new Map();
  for (const edge of references.edges) {
    if (!reverse.has(edge.to_id)) reverse.set(edge.to_id, []);
    reverse.get(edge.to_id).push(edge);
  }
  for (const edges of reverse.values()) {
    edges.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  }
  const invalidated = new Set(seeds);
  const queue = [...seeds].sort();
  const evidence = [];
  for (let index = 0; index < queue.length; index += 1) {
    const target = queue[index];
    for (const edge of reverse.get(target) || []) {
      evidence.push({
        edge_id: edge.id,
        reference_type: edge.type,
        invalidated_id: edge.from_id,
        invalidated_by: target,
      });
      if (invalidated.has(edge.from_id)) continue;
      invalidated.add(edge.from_id);
      queue.push(edge.from_id);
    }
  }
  evidence.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const invalidatedIds = [...invalidated].sort();
  const liveEdges = references.edges.filter(edge => (
    !invalidated.has(edge.from_id) && !invalidated.has(edge.to_id)
  ));
  return {
    invalidated_ids: invalidatedIds,
    invalidation_evidence: evidence,
    references: { schema_version: 1, edges: liveEdges },
  };
}

function sourceCompatible(event, target) {
  const oldSources = Array.isArray(event.old_provenance) ? event.old_provenance : [];
  const newSources = Array.isArray(event.new_provenance) ? event.new_provenance : [];
  if (!oldSources.length || !newSources.length) return false;
  const targetSources = new Set((target.provenance || []).map(source => stableStringify(portable(source))));
  return oldSources.some(oldSource => newSources.some(newSource => (
    oldSource.runtime === newSource.runtime
    && oldSource.scope === newSource.scope
    && targetSources.has(stableStringify(portable(newSource)))
  )));
}

function scopeApplies(recordScope, requestedScope) {
  if (!requestedScope || recordScope.kind === 'global') return true;
  if (recordScope.kind !== requestedScope.kind) return false;
  if (recordScope.repository !== requestedScope.repository) return false;
  return recordScope.kind !== 'worktree' || recordScope.worktree === requestedScope.worktree;
}

function targetVerdict(code, record, evidence, reason, correctiveAction, severity = 'dispatch-blocking') {
  return verdict({
    code,
    subject: { kind: 'target', id: record.id },
    evidence,
    reason,
    correctiveAction,
    severity,
  });
}

function wholeCandidateVerdicts(candidate, options) {
  const findings = [];
  const recordsById = new Map(candidate.records.map(record => [record.id, record]));
  for (const record of candidate.records) {
    for (const dependency of record.dependencies.items) {
      const dependencyTarget = recordsById.get(dependency.id);
      if (dependency.available && (!dependencyTarget || (dependencyTarget.dispatchable && dependencyTarget.lifecycle === 'ready'))) continue;
      findings.push(targetVerdict(
        'dependency_unavailable', record,
        { dependency_id: dependency.id, declared_available: dependency.available, ...(dependencyTarget ? { dependency_lifecycle: dependencyTarget.lifecycle } : {}) },
        'A required dependency is absent or not dispatchable.',
        'Install, enable, or repair the exact declared dependency before dispatch.',
      ));
    }
    const permissions = record.permissions;
    if (permissions && Array.isArray(permissions.required)) {
      const grants = new Set(Array.isArray(permissions.grants) ? permissions.grants : []);
      const denied = new Set(Array.isArray(permissions.denied) ? permissions.denied : []);
      for (const permission of [...new Set(permissions.required)].sort()) {
        if (denied.has(permission)) {
          findings.push(targetVerdict('permission_denied', record, { permission }, 'A required permission is explicitly denied.', 'Remove the denial only after reviewing and explicitly granting the required permission.'));
        } else if (!grants.has(permission)) {
          findings.push(targetVerdict('permission_missing', record, { permission }, 'A required permission has not been explicitly granted.', 'Declare an explicit least-privilege grant for the required permission.'));
        }
      }
    }
    if (!scopeApplies(record.scope, options.scope)) {
      findings.push(targetVerdict(
        'scope_inapplicable', record,
        { requested_scope: options.scope, target_scope: record.scope },
        'The target scope does not apply to the requested repository or worktree.',
        'Select a canonical target in the exact requested scope; do not fall back outward or sideways.',
      ));
    }
    const blocking = record.conflicts.filter(conflict => ['dispatch-blocking', 'build-blocking'].includes(conflict.severity));
    if (blocking.length) {
      findings.push(targetVerdict(
        'blocking_collision', record, { conflicts: blocking },
        'The target contains a blocking canonical conflict.',
        'Resolve every blocking conflict at its authoritative source before dispatch.',
        'build-blocking',
      ));
    }
  }
  const identities = new Map();
  const native = new Map();
  for (const record of candidate.records) {
    if (!identities.has(record.id)) identities.set(record.id, []);
    identities.get(record.id).push(record);
    for (const variant of record.runtime_variants) {
      const key = stableStringify({ runtime: variant.runtime, type: record.type, native_identity: variant.native_identity, scope: record.scope });
      if (!native.has(key)) native.set(key, []);
      native.get(key).push(record);
    }
  }
  for (const [id, records] of identities) {
    if (records.length < 2) continue;
    for (const record of records) findings.push(targetVerdict('canonical_identity_collision', record, { canonical_id: id, claim_count: records.length }, 'Multiple records claim the same canonical identity.', 'Remove duplicate authoritative claims or explicitly link valid runtime variants.', 'build-blocking'));
  }
  for (const [identity, records] of native) {
    const ids = [...new Set(records.map(record => record.id))];
    if (ids.length < 2) continue;
    for (const record of records) findings.push(targetVerdict('native_identity_collision', record, { native_identity_key: identity, canonical_ids: ids.sort() }, 'One native identity is claimed by multiple canonical targets.', 'Resolve the native identity collision at the adapter source.', 'build-blocking'));
  }
  for (const mapping of Array.isArray(options.mappings) ? options.mappings : []) {
    const targets = [...new Set(Array.isArray(mapping?.target_ids) ? mapping.target_ids : [])].sort();
    if (targets.length < 2) continue;
    findings.push(verdict({
      code: 'mapping_ambiguous',
      subject: { kind: 'mapping', id: mapping.subject_id || 'unknown', target_ids: targets },
      evidence: { plausible_target_count: targets.length },
      reason: 'More than one plausible canonical mapping remains.',
      correctiveAction: 'Choose one explicit canonical target using authoritative evidence.',
      severity: 'build-blocking',
    }));
  }
  return findings;
}

function failureResult(active, error) {
  const failure = verdict({
    code: 'candidate_reconciliation_failed',
    subject: { kind: 'candidate' },
    evidence: { error_type: error?.name || 'Error' },
    reason: 'Candidate reconciliation could not complete atomically.',
    correctiveAction: 'Correct the malformed or incomplete candidate evidence and retry reconciliation.',
    severity: 'build-blocking',
  });
  const canonical = { disposition: 'quarantined', verdicts: [failure] };
  return { ...canonical, report_fingerprint: fingerprint(canonical), candidate_fingerprint: null, active_bytes: active.bytes, active_fingerprint: active.fingerprint };
}

export function reconcileCandidate(options = {}) {
  const active = activeState(options.active);
  try {
    const candidate = canonicalCandidate(options.candidate);
    const aliases = canonicalAliases(options.aliases || []);
    const recordsById = new Map(candidate.records.map(record => [record.id, record]));
    const lifecycle = options.lifecycle && typeof options.lifecycle === 'object' ? options.lifecycle : { events: [], diagnostics: [] };
    const events = Array.isArray(lifecycle.events) ? lifecycle.events : [];
    const diagnostics = Array.isArray(lifecycle.diagnostics) ? lifecycle.diagnostics : [];
    const relationshipEndpointIds = [
      ...candidate.records.map(record => record.id),
      ...events.map(event => event?.canonical_id).filter(value => typeof value === 'string'),
    ];
    const referenceInput = options.references ?? { schema_version: 1, edges: [] };
    const correctionEdges = (options.overlays?.accepted || []).map(overlay => ({
      id: `overlay:${overlay.overlay_id}`,
      type: 'correction',
      from_id: overlay.overlay_id,
      to_id: overlay.target_id,
    }));
    const relationshipEdges = options.relationships === undefined
      ? []
      : relationshipReferences(options.relationships, relationshipEndpointIds);
    const combinedReferences = {
      schema_version: referenceInput.schema_version,
      edges: [
        ...referenceInput.edges,
        ...relationshipEdges,
        ...correctionEdges,
      ],
    };
    const references = canonicalReferences(
      combinedReferences,
      candidate,
      events,
    );
    const invalidation = invalidationClosure(candidate, events, references);
    options.evaluateReferences?.({
      candidate: structuredClone(candidate),
      references: structuredClone(invalidation.references),
      invalidated_ids: structuredClone(invalidation.invalidated_ids),
      invalidation_evidence: structuredClone(invalidation.invalidation_evidence),
    });
    const claims = new Map();
    for (const alias of aliases) {
      if (!claims.has(alias.id)) claims.set(alias.id, new Set());
      claims.get(alias.id).add(alias.target_id);
    }
    const hookInventory = options.hookInventory || candidate.records
      .map(record => record.hook_observation)
      .filter(Boolean);
    const hookResult = reconcileHookInventory(hookInventory, { runtimeRoots: options.runtimeRoots });
    const verdicts = [...wholeCandidateVerdicts(candidate, options), ...hookResult.verdicts];
    for (const [id, targets] of [...claims].sort(([left], [right]) => left.localeCompare(right))) {
      if (targets.size < 2) continue;
      verdicts.push(verdict({
        code: 'alias_claim_ambiguous',
        subject: { kind: 'alias', id, target_ids: [...targets].sort() },
        evidence: { claim_count: targets.size },
        reason: 'The alias has multiple canonical destination claims.',
        correctiveAction: 'Retain exactly one explicit canonical target claim for this alias.',
        severity: 'build-blocking',
      }));
    }
    for (const alias of aliases) {
      options.evaluateAlias?.({ alias: structuredClone(alias), candidate: structuredClone(candidate) });
      const target = recordsById.get(alias.target_id);
      const removal = events.find(event => event?.canonical_id === alias.target_id && event.primary === 'removed');
      const continuity = events.find(event => event?.canonical_id === alias.target_id && ['renamed', 'moved'].includes(event.primary));
      const weakContinuity = diagnostics.some(item => item?.code === 'possible_match' && item.authoritative !== true);
      if (removal || (!target && weakContinuity)) {
        verdicts.push(verdict({
          code: removal ? 'alias_target_removed' : 'alias_continuity_uncertain',
          subject: { kind: 'alias', id: alias.id, target_id: alias.target_id },
          evidence: removal ? { lifecycle_primary: 'removed' } : { continuity_authoritative: false },
          reason: removal ? 'The canonical alias target was authoritatively removed.' : 'Only weak rename or move evidence is available for this alias target.',
          correctiveAction: 'Remove the alias or explicitly remap it after verifying stable identity and portable source continuity.',
        }));
        continue;
      }
      if (target && continuity && !sourceCompatible(continuity, target)) {
        verdicts.push(verdict({
          code: 'alias_continuity_uncertain',
          subject: { kind: 'alias', id: alias.id, target_id: alias.target_id },
          evidence: { lifecycle_primary: continuity.primary, continuity_authoritative: false },
          reason: 'Stable identity is not accompanied by compatible portable source evidence.',
          correctiveAction: 'Verify the source continuity or explicitly remap the alias to the intended canonical target.',
        }));
        continue;
      }
      if (!target || target.lifecycle !== 'ready' || !target.dispatchable
        || !target.invocation?.command?.trim()) {
        verdicts.push(verdict({
          code: target ? 'alias_target_not_dispatchable' : 'alias_target_missing',
          subject: { kind: 'alias', id: alias.id, target_id: alias.target_id },
          evidence: target ? { lifecycle: target.lifecycle, runtime: target.invocation?.runtime, scope: target.scope } : {},
          reason: target ? 'The canonical alias target is not invocable.' : 'The canonical alias target is absent from the candidate.',
          correctiveAction: 'Remove the alias or explicitly remap it to a verified dispatchable canonical target.',
        }));
      }
    }
    for (const record of candidate.records) {
      if (record.lifecycle === 'ready' && record.dispatchable && record.invocation.command?.trim()) continue;
      verdicts.push(verdict({
        code: 'target_not_dispatchable',
        subject: { kind: 'target', id: record.id },
        evidence: {
          lifecycle: record.lifecycle,
          invocation_availability: record.invocation.availability,
          ...(record.invocation.runtime ? { runtime: record.invocation.runtime } : {}),
          scope: record.scope,
        },
        reason: 'The canonical target is not ready and invocable.',
        correctiveAction: 'Repair or remove the target before publishing this candidate.',
      }));
    }
    verdicts.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    // Disposition is 'eligible' when no verdict blocks dispatch (dispatchable === false).
    // Advisory verdicts (dispatchable === true, e.g. hook_binding_without_descriptor) do
    // not quarantine the candidate — they surface non-blocking hygiene findings. This
    // keeps gate 6 (reconciliation_safety) passable when the only findings are advisory.
    const hasBlocking = verdicts.some(v => v.dispatchable === false);
    options.commitAliasSet?.({
      aliases: structuredClone(aliases),
      verdicts: structuredClone(verdicts),
      disposition: hasBlocking ? 'quarantined' : 'eligible',
    });
    const canonical = {
      disposition: hasBlocking ? 'quarantined' : 'eligible',
      verdicts,
      ...invalidation,
      invalidation_classes: [...INVALIDATION_CLASSES],
    };
    return {
      ...canonical,
      report_fingerprint: fingerprint(canonical),
      invalidation_fingerprint: fingerprint({
        classes: INVALIDATION_CLASSES,
        invalidated_ids: invalidation.invalidated_ids,
        evidence: invalidation.invalidation_evidence,
        references: invalidation.references,
      }),
      candidate_fingerprint: fingerprint(candidate),
      active_bytes: active.bytes,
      active_fingerprint: active.fingerprint,
    };
  } catch (error) {
    return failureResult(active, error);
  }
}
