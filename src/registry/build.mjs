import { discoverRoots as discoverClaude } from '../adapters/claude.mjs';
import { discoverRoots as discoverCodex } from '../adapters/codex.mjs';
import { createHash } from 'node:crypto';
import { canonicalizeCapability, stableStringify, validateCapability } from './schema.mjs';
import { stableCapabilityId } from './identity.mjs';

function key(value) {
  return stableStringify(value);
}
function fingerprint(value) { return createHash('sha256').update(key(value)).digest('hex'); }

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

export function buildFullRegistry(options = {}) {
  const claude = discoverClaude(options);
  const codex = discoverCodex(options);
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
  records.sort((a, b) => `${a.id}:${key(a.provenance)}`.localeCompare(`${b.id}:${key(b.provenance)}`));
  const diagnostics = [...claude.diagnostics, ...codex.diagnostics].map(({ local_path: _local, ...portable }) => portable)
    .sort((a, b) => key(a).localeCompare(key(b)));
  const registry = { schema_version: 1, records };
  const summary = {
    schema_version: 1, activated: false, record_count: records.length, diagnostic_count: diagnostics.length,
    dispatchable_count: records.filter(r => r.dispatchable).length,
    runtimes: { claude: claude.observations.length, codex: codex.observations.length },
    registry_fingerprint: fingerprint(registry), diagnostics_fingerprint: fingerprint(diagnostics),
  };
  return { registry, diagnostics, summary };
}
