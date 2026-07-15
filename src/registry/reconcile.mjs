import { createHash } from 'node:crypto';
import { stableCapabilityId } from './identity.mjs';
import { canonicalizeCapability, stableStringify, validateCapability } from './schema.mjs';

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
  return { schema_version: candidate.schema_version ?? 1, records };
}

function canonicalAliases(aliases) {
  if (!Array.isArray(aliases)) throw new TypeError('aliases must be an array');
  return aliases.map(alias => {
    if (!alias || typeof alias.id !== 'string' || !alias.id.trim()) throw new TypeError('alias.id must be a non-empty string');
    if (typeof alias.target_id !== 'string' || !alias.target_id.trim()) throw new TypeError('alias.target_id must be a non-empty string');
    return { id: alias.id.trim(), target_id: alias.target_id.trim() };
  }).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
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
    const claims = new Map();
    for (const alias of aliases) {
      if (!claims.has(alias.id)) claims.set(alias.id, new Set());
      claims.get(alias.id).add(alias.target_id);
    }
    const verdicts = wholeCandidateVerdicts(candidate, options);
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
      if (record.lifecycle === 'ready' && record.dispatchable && record.invocation.command.trim()) continue;
      verdicts.push(verdict({
        code: 'target_not_dispatchable',
        subject: { kind: 'target', id: record.id },
        evidence: { lifecycle: record.lifecycle, runtime: record.invocation.runtime, scope: record.scope },
        reason: 'The canonical target is not ready and invocable.',
        correctiveAction: 'Repair or remove the target before publishing this candidate.',
      }));
    }
    verdicts.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    options.commitAliasSet?.({
      aliases: structuredClone(aliases),
      verdicts: structuredClone(verdicts),
      disposition: verdicts.length ? 'quarantined' : 'eligible',
    });
    const canonical = { disposition: verdicts.length ? 'quarantined' : 'eligible', verdicts };
    return {
      ...canonical,
      report_fingerprint: fingerprint(canonical),
      candidate_fingerprint: fingerprint(candidate),
      active_bytes: active.bytes,
      active_fingerprint: active.fingerprint,
    };
  } catch (error) {
    return failureResult(active, error);
  }
}
