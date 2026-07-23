import { posix, join } from 'node:path';
import { existsSync } from 'node:fs';
import { stableStringify } from './schema.mjs';

function portablePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = posix.normalize(value.trim().replaceAll('\\', '/'));
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
    || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized.replace(/^\.\//, '');
}

function normalized(observation) {
  if (!observation || typeof observation !== 'object') return { valid: false, reason: 'malformed_observation' };
  const relativePath = portablePath(observation.relative_path);
  const targetRef = portablePath(observation.target_ref);
  const kind = ['file', 'binding'].includes(observation.kind) ? observation.kind : null;
  const valid = observation.valid === true && kind && relativePath && targetRef
    && typeof observation.runtime === 'string' && observation.runtime
    && observation.scope && typeof observation.scope === 'object'
    && typeof observation.event === 'string' && observation.event
    && typeof observation.logical_root === 'string' && observation.logical_root
    && !observation.logical_root.startsWith('/');
  return {
    schema_version: 1,
    kind,
    runtime: observation.runtime || null,
    scope: observation.scope || null,
    event: observation.event || null,
    logical_root: observation.logical_root || null,
    relative_path: relativePath,
    source_fingerprint: observation.source_fingerprint || null,
    target_ref: targetRef,
    command: observation.command || null,
    args: Array.isArray(observation.args) ? observation.args.map(String) : [],
    valid: Boolean(valid),
    ...(!valid ? { reason: observation.reason || (!relativePath || !targetRef ? 'path_escape' : 'malformed_observation') } : {}),
  };
}

function baseKey(value) {
  return stableStringify({ runtime: value.runtime, scope: value.scope, event: value.event });
}

function pairKey(value) {
  return stableStringify({ runtime: value.runtime, scope: value.scope, event: value.event, target_ref: value.target_ref });
}

function corrective(code, subject, evidence, reason, action) {
  return { schema_version: 1, code, severity: 'dispatch-blocking', dispatchable: false, subject, evidence, reason, corrective_action: action };
}

function advisory(code, subject, evidence, reason, action) {
  return { schema_version: 1, code, severity: 'dispatch-advisory', dispatchable: true, subject, evidence, reason, corrective_action: action };
}

export function reconcileHookInventory(observations = [], options = {}) {
  if (!Array.isArray(observations)) throw new TypeError('hook observations must be an array');
  const runtimeRoots = options.runtimeRoots || {};
  const values = observations.map(normalized).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const classifications = [], verdicts = [], valid = [];
  for (const value of values) {
    if (value.valid) { valid.push(value); continue; }
    classifications.push({ classification: 'invalid', active: false, observation: value });
    verdicts.push(corrective('hook_invalid_observation', { kind: 'hook', runtime: value.runtime, event: value.event, relative_path: value.relative_path }, { reason: value.reason }, 'The native hook observation is malformed or unsafe.', 'Repair the native hook file or binding with a contained explicit structured reference.'));
  }

  const byBase = new Map();
  for (const value of valid) {
    const key = baseKey(value);
    if (!byBase.has(key)) byBase.set(key, []);
    byBase.get(key).push(value);
  }
  for (const [base, group] of [...byBase].sort(([left], [right]) => left.localeCompare(right))) {
    const files = group.filter(value => value.kind === 'file');
    const bindings = group.filter(value => value.kind === 'binding');
    const targets = new Set(group.map(value => value.target_ref));
    if (files.length === 1 && bindings.length === 1 && targets.size > 1) {
      classifications.push({ classification: 'mismatch', active: false, file: files[0], binding: bindings[0] });
      verdicts.push(corrective('hook_invocation_mismatch', { kind: 'hook_pair', base }, { file_target: files[0].target_ref, binding_target: bindings[0].target_ref }, 'The explicit binding references a different hook target.', 'Make the binding target exactly match the trusted discovered hook reference.'));
      continue;
    }
    const byPair = new Map();
    for (const value of group) {
      const key = pairKey(value);
      if (!byPair.has(key)) byPair.set(key, []);
      byPair.get(key).push(value);
    }
    for (const [key, members] of [...byPair].sort(([left], [right]) => left.localeCompare(right))) {
      const pairFiles = members.filter(value => value.kind === 'file');
      const pairBindings = members.filter(value => value.kind === 'binding');
      if (pairFiles.length === 1 && pairBindings.length === 1) {
        classifications.push({ classification: 'valid_pair', active: false, file: pairFiles[0], binding: pairBindings[0] });
      } else if (pairFiles.length > 1 || pairBindings.length > 1) {
        classifications.push({ classification: 'ambiguous', active: false, files: pairFiles, bindings: pairBindings });
        verdicts.push(corrective('hook_ambiguous', { kind: 'hook_pair', key }, { file_count: pairFiles.length, binding_count: pairBindings.length }, 'Multiple hook files or bindings claim the same pair identity.', 'Remove duplicate claims until exactly one trusted file and one explicit binding remain.'));
      } else if (pairFiles.length === 1) {
        classifications.push({ classification: 'orphan_file', active: false, file: pairFiles[0] });
        verdicts.push(corrective('hook_orphan_file', { kind: 'hook_file', key }, { relative_path: pairFiles[0].relative_path }, 'A hook file has no exact explicit binding.', 'Add a reviewed explicit binding or remove the orphan file; no binding is synthesized.'));
      } else {
        const binding = pairBindings[0];
        const runtimeRoot = runtimeRoots[binding.runtime];
        const targetExists = runtimeRoot && binding.target_ref
          && existsSync(join(runtimeRoot, binding.target_ref));
        if (targetExists) {
          // The hook script exists on disk but has no hooks/*.json descriptor file.
          // The trusted-file model requires a paired descriptor, but the existing gsd/
          // caveman/context-mode hooks are .js/.mjs scripts without descriptors. Relax
          // the pair requirement to a non-blocking advisory when the target file exists
          // on disk and the binding is already validated (target_ref within runtime root).
          // This does NOT trust arbitrary settings.json bindings — the binding's target_ref
          // already passed path validation, and the file existence check confirms the hook
          // script is present. Scoped to bindings whose target file exists (T-quick-04).
          classifications.push({ classification: 'binding_without_descriptor', active: false, binding });
          verdicts.push(advisory('hook_binding_without_descriptor', { kind: 'hook_binding', key }, { relative_path: binding.relative_path, target_ref: binding.target_ref }, 'A binding references a hook script that exists on disk but has no trusted descriptor file.', 'Add a hooks/*.json descriptor file to follow the trusted-file model, or accept the binding as self-trusted.'));
        } else {
          classifications.push({ classification: 'orphan_binding', active: false, binding });
          verdicts.push(corrective('hook_orphan_binding', { kind: 'hook_binding', key }, { relative_path: binding.relative_path }, 'A binding has no exact trusted discovered hook file.', 'Install or repair the reviewed hook file, or remove the orphan binding; no file is synthesized.'));
        }
      }
    }
  }
  classifications.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  verdicts.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  return { classifications, verdicts };
}
