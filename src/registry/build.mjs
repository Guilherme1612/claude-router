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
  const claude = (options.discoverClaude || discoverClaude)(options);
  const codex = (options.discoverCodex || discoverCodex)(options);
  return assembleRegistry({ claude, codex });
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

export function buildIncrementalRegistry(previous, diff, options = {}) {
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
  return assembleRegistry(next);
}

export function assembleRegistry(acquisition) {
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
