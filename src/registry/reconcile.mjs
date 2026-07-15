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
    const verdicts = [];
    for (const alias of aliases) {
      options.evaluateAlias?.({ alias: structuredClone(alias), candidate: structuredClone(candidate) });
      const target = recordsById.get(alias.target_id);
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
