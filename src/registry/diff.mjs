import { createHash } from 'node:crypto';
import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';

const ORDER = [
  'renamed', 'moved', 'removed', 'added', 'disabled', 'scope_changed',
  'dependency_changed', 'permission_changed', 'content_changed',
];

function hash(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function source(record) {
  return record.provenance?.[0] || {};
}

function lifecycleRecord(record) {
  if (Array.isArray(record?.provenance)) return record;
  if (!record?.logical_root || !record?.relative_path || !record?.entry_type) return record;
  const project = record.logical_root.startsWith('project:');
  const runtime = record.logical_root === 'codex_home' || record.logical_root.endsWith(':codex') ? 'codex' : 'claude';
  return {
    schema_version: 1,
    type: record.entry_type,
    name: record.relative_path,
    canonical_identity: `fingerprint:${record.logical_root}:${record.relative_path}`,
    lifecycle: 'ready',
    scope: project ? { kind: 'project' } : { kind: 'global' },
    dispatchable: true,
    invocation: { runtime, command: record.relative_path, args: [] },
    dependencies: { state: 'unknown', items: [] },
    permissions: { mode: 'read-only', grants: ['read'] },
    provenance: [{
      runtime,
      scope: project ? 'project' : 'global',
      logical_root: record.logical_root,
      relative_path: record.relative_path,
      source_fingerprint: record.content_hash || record.target_hash || record.entry_type,
      adapter: 'fingerprint-tree/1',
    }],
    runtime_variants: [{ runtime, native_identity: record.relative_path, native: {} }],
    conflicts: [],
  };
}

function nativeEvidence(record) {
  const variant = record.runtime_variants?.find(item => item.runtime === record.invocation?.runtime)
    || record.runtime_variants?.[0];
  if (!variant?.runtime || !variant?.native_identity || !record.type) return null;
  return `${variant.runtime}:${record.type}:${variant.native_identity}:${stableStringify(record.scope)}`;
}

function continuity(record) {
  if (typeof record.canonical_identity === 'string' && record.canonical_identity.trim()) {
    return { authority: 'canonical_identity', key: `${record.type}:${record.canonical_identity.trim()}`, id: record.canonical_identity.trim() };
  }
  if (record.shared_origin?.authority && typeof record.shared_origin.identity === 'string' && record.shared_origin.identity.trim()) {
    const identity = record.shared_origin.identity.trim();
    return { authority: 'shared_origin', key: `${record.type}:${record.shared_origin.authority}:${identity}`, id: `origin:${identity}` };
  }
  const native = nativeEvidence(record);
  return native ? { authority: 'native_identity', key: native, id: stableCapabilityId(record) } : null;
}

function dimensionChanges(before, after) {
  const changes = [];
  const oldSource = source(before), newSource = source(after);
  if (oldSource.logical_root !== newSource.logical_root) changes.push('moved');
  else if (oldSource.relative_path !== newSource.relative_path) changes.push('renamed');
  if ((before.dispatchable && !after.dispatchable)
    || (before.lifecycle === 'ready' && after.lifecycle !== 'ready')) changes.push('disabled');
  if (stableStringify(before.scope) !== stableStringify(after.scope)) changes.push('scope_changed');
  if (stableStringify(before.dependencies) !== stableStringify(after.dependencies)) changes.push('dependency_changed');
  if (stableStringify(before.permissions ?? null) !== stableStringify(after.permissions ?? null)) changes.push('permission_changed');
  const beforeContent = before.content ?? before.provenance?.map(item => item.source_fingerprint) ?? null;
  const afterContent = after.content ?? after.provenance?.map(item => item.source_fingerprint) ?? null;
  if (stableStringify(beforeContent) !== stableStringify(afterContent)) changes.push('content_changed');
  return ORDER.filter(type => changes.includes(type));
}

function lifecycleEvent(before, after, identity) {
  const changes = dimensionChanges(before, after);
  if (changes.length === 0) return null;
  const primary = changes[0];
  return {
    canonical_id: identity.id,
    primary,
    facets: changes.slice(1),
    old_provenance: before.provenance,
    new_provenance: after.provenance,
  };
}

function addRemove(primary, record) {
  return {
    canonical_id: stableCapabilityId(record),
    primary,
    facets: [],
    old_provenance: primary === 'removed' ? record.provenance : null,
    new_provenance: primary === 'added' ? record.provenance : null,
  };
}

function weaklySimilar(before, after) {
  if (before.name === after.name) return true;
  const left = before.content ?? before.provenance?.map(item => item.source_fingerprint);
  const right = after.content ?? after.provenance?.map(item => item.source_fingerprint);
  return stableStringify(left) === stableStringify(right);
}

function sortPlain(values) {
  return values.sort((a, b) => {
    const ai = ORDER.indexOf(a.primary), bi = ORDER.indexOf(b.primary);
    return ai - bi || stableStringify(a).localeCompare(stableStringify(b));
  });
}

export function diffFingerprintTrees(previous, current) {
  const oldEntries = Array.isArray(previous?.entries) ? previous.entries.map(lifecycleRecord) : [];
  const newEntries = Array.isArray(current?.entries) ? current.entries.map(lifecycleRecord) : [];
  const diagnostics = [...(current?.diagnostics || [])];
  const uncertain = diagnostics.filter(item => ['access_denied', 'read_error', 'scan_error'].includes(item.code));
  const removalUncertain = record => record.provenance?.some(provenance => uncertain.some(item => {
    if (item.logical_root !== provenance.logical_root) return false;
    return item.relative_path === '.' || item.relative_path === provenance.relative_path
      || provenance.relative_path.startsWith(`${item.relative_path}/`);
  }));
  const oldByKey = new Map(), newByKey = new Map();
  for (const record of oldEntries) {
    const evidence = continuity(record);
    if (evidence) oldByKey.set(evidence.key, { record, evidence });
  }
  for (const record of newEntries) {
    const evidence = continuity(record);
    if (evidence) newByKey.set(evidence.key, { record, evidence });
  }
  const pairedOld = new Set(), pairedNew = new Set(), events = [];
  for (const key of [...oldByKey.keys()].filter(value => newByKey.has(value)).sort()) {
    const before = oldByKey.get(key), after = newByKey.get(key);
    pairedOld.add(before.record);
    pairedNew.add(after.record);
    const event = lifecycleEvent(before.record, after.record, before.evidence);
    if (event) events.push(event);
  }
  const removed = oldEntries.filter(record => !pairedOld.has(record));
  const added = newEntries.filter(record => !pairedNew.has(record));
  const confirmedRemoved = removed.filter(record => !removalUncertain(record));
  events.push(...confirmedRemoved.map(record => addRemove('removed', record)));
  events.push(...added.map(record => addRemove('added', record)));

  {
    for (const before of confirmedRemoved) {
      for (const after of added) {
        if (!weaklySimilar(before, after)) continue;
        diagnostics.push({
          code: 'possible_match',
          authoritative: false,
          old_provenance: before.provenance,
          new_provenance: after.provenance,
        });
      }
    }
  }
  sortPlain(events);
  diagnostics.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const canonical = { events, diagnostics };
  return { ...canonical, hash: hash(canonical) };
}
