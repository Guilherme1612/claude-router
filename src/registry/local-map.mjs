import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { stableStringify } from './schema.mjs';
import { validateCapabilityManifest, MANIFEST_STATES } from './manifest.mjs';

const MAX = 128;
const DISPATCHABLE_RUNTIMES = new Set(['claude', 'codex']);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/;

function text(value, max = 128) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function hash(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function sorted(values) {
  return [...values].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function safeRelative(value) {
  const raw = text(value, 512)?.replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return { value: null, reason: raw ? 'path_escape' : 'missing_provenance' };
  const normalized = posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../')) return { value: null, reason: 'path_escape' };
  return { value: normalized === '.' ? null : normalized, reason: null };
}

function cycleNodes(edges) {
  const graph = new Map();
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    const from = text(edge.from);
    const to = text(edge.to);
    if (!from || !to) continue;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(to);
  }
  const visiting = new Set();
  const visited = new Set();
  const cycles = new Set();
  function visit(node, path = []) {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      for (const item of path.slice(start < 0 ? 0 : start)) cycles.add(item);
      cycles.add(node);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of graph.get(node) || []) visit(next, [...path, node]);
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
  return cycles;
}

function resolveAliases(aliases) {
  const map = new Map(Object.entries(aliases && typeof aliases === 'object' ? aliases : {})
    .filter(([alias, target]) => text(alias) && text(target)).map(([alias, target]) => [text(alias), text(target)]));
  const cycle = new Set();
  const resolved = new Map();
  function resolve(alias, path = []) {
    if (!map.has(alias)) return alias;
    if (path.includes(alias)) {
      for (const item of path.slice(path.indexOf(alias))) cycle.add(item);
      cycle.add(alias);
      return null;
    }
    if (resolved.has(alias)) return resolved.get(alias);
    const target = resolve(map.get(alias), [...path, alias]);
    resolved.set(alias, target);
    return target;
  }
  for (const alias of map.keys()) resolve(alias);
  return { resolved, cycle };
}

function stateFor({ unknown, quarantined, diagnosticOnly, dispatchable, eligible, available, mapped }) {
  if (quarantined) return 'quarantined';
  if (unknown) return 'unknown';
  if (diagnosticOnly) return 'diagnostic-only';
  if (dispatchable) return 'dispatchable';
  if (eligible) return 'eligible';
  if (available) return 'available';
  if (mapped) return 'mapped';
  return 'unknown';
}

/**
 * Map already-gathered arbitrary local registry data without invoking or
 * discovering anything. Native adapters remain responsible for acquisition.
 */
export function mapLocalRegistry({
  runtime = 'unknown',
  scope = { kind: 'unknown' },
  root = null,
  scan = {},
  entries = [],
  aliases = {},
  relationships = [],
} = {}) {
  const safeRuntime = text(runtime, 32) || 'unknown';
  const safeScope = scope && typeof scope === 'object' && !Array.isArray(scope)
    ? Object.fromEntries(Object.entries(scope).filter(([key, value]) => ['kind', 'identity', 'repository', 'worktree'].includes(key) && text(value, 128)))
    : { kind: 'unknown' };
  const rootValue = safeRelative(root).value;
  const rootMissing = scan.root_exists === false || (!root && scan.root_exists !== true);
  const incomplete = scan.complete !== true;
  const aliasResult = resolveAliases(aliases);
  const relationCycles = cycleNodes(relationships);
  const ids = new Set(entries.map(entry => text(entry?.id || entry?.name)).filter(Boolean));
  const records = [];
  for (const input of Array.isArray(entries) ? entries.slice(0, MAX) : []) {
    const name = text(input?.name || input?.id);
    const id = text(input?.id || name);
    const kind = text(input?.kind || input?.type, 64) || 'unknown';
    const path = safeRelative(input?.relative_path || input?.path);
    const quarantine = [];
    if (!id || !name) quarantine.push('missing_identity');
    if (path.reason === 'path_escape') quarantine.push('path_escape');
    if (rootMissing) quarantine.push('missing_root');
    if (incomplete) quarantine.push('incomplete_scan');
    if (relationCycles.has(id) || relationCycles.has(name)) quarantine.push('relationship_cycle');
    const aliasTarget = aliasResult.resolved.get(id) || aliasResult.resolved.get(name);
    if (aliasResult.cycle.has(id) || aliasResult.cycle.has(name)) quarantine.push('alias_cycle');
    if (aliasTarget && !ids.has(aliasTarget)) quarantine.push('alias_target_missing');
    for (const relation of Array.isArray(relationships) ? relationships : []) {
      if (text(relation?.from) !== id && text(relation?.from) !== name) continue;
      if (!ids.has(text(relation?.to))) quarantine.push('relationship_target_missing');
    }
    const available = input?.available === true;
    const eligible = available && input?.eligible === true;
    const diagnosticOnly = input?.diagnostic_only === true || input?.dispatchable !== true;
    const dispatchable = !quarantine.length && DISPATCHABLE_RUNTIMES.has(safeRuntime)
      && available && eligible && input?.dispatchable === true;
    const mapped = Boolean(id && name);
    const unknown = !mapped || kind === 'unknown';
    records.push({
      schema_version: 1,
      id: id || `unknown:${hash(input).slice(0, 16)}`,
      name: name || null,
      kind,
      runtime: safeRuntime,
      scope: safeScope,
      provenance: {
        root: rootValue,
        relative_path: path.value,
        source_fingerprint: hash({ runtime: safeRuntime, scope: safeScope, id, name, kind, path: path.value }),
        freshness: text(input?.freshness, 32) || text(scan.freshness, 32) || 'unknown',
      },
      alias: aliasTarget || null,
      available,
      eligible,
      dispatchable,
      diagnostic_only: diagnosticOnly,
      unknown,
      quarantine: [...new Set(quarantine)].sort(),
      state: stateFor({ unknown, quarantined: quarantine.length > 0, diagnosticOnly, dispatchable, eligible, available, mapped }),
    });
  }
  records.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const counts = {
    mapped: records.filter(row => row.state === 'mapped').length,
    available: records.filter(row => row.available).length,
    eligible: records.filter(row => row.eligible).length,
    dispatchable: records.filter(row => row.dispatchable).length,
    diagnostic_only: records.filter(row => row.state === 'diagnostic-only').length,
    quarantined: records.filter(row => row.state === 'quarantined').length,
    unknown: records.filter(row => row.state === 'unknown').length,
  };
  const report = {
    schema_version: 1,
    runtime: safeRuntime,
    scope: safeScope,
    root: rootValue,
    scan: { complete: !incomplete, root_exists: !rootMissing, freshness: text(scan.freshness, 32) || 'unknown' },
    records,
    aliases: sorted([...aliasResult.resolved.entries()].map(([alias, target]) => ({ alias, target }))),
    relationships: sorted((Array.isArray(relationships) ? relationships : []).slice(0, MAX).map(item => ({
      from: text(item?.from), to: text(item?.to), kind: text(item?.kind, 64) || 'unknown',
    }))),
    counts,
    safe_empty: counts.dispatchable === 0,
    status: counts.dispatchable === 0 ? 'safe_empty' : 'dispatchable',
  };
  return { ...report, fingerprint: hash(report) };
}

/**
 * Apply runtime and scope truth to a neutral manifest without rediscovering its
 * source. A manifest can describe an arbitrary framework, but only the owning
 * runtime/scope may make one of its records dispatchable.
 */
export function mapCapabilityManifest({ manifest, runtime, scope } = {}) {
  validateCapabilityManifest(manifest);
  const safeRuntime = text(runtime || manifest.runtime, 32) || 'unknown';
  const requestedScope = scope || manifest.scope || { kind: 'unknown' };
  const aliases = {};
  for (const record of manifest.records) {
    for (const alias of record.relationships?.aliases || []) aliases[alias] = record.stable_id;
  }
  const aliasResult = resolveAliases(aliases);
  const records = manifest.records.map(input => {
    const quarantine = new Set(input.quarantine || []);
    if (input.runtime !== safeRuntime) quarantine.add('runtime_mismatch');
    if (stableStringify(input.scope) !== stableStringify(requestedScope)) quarantine.add('scope_mismatch');
    if (input.freshness === 'stale') quarantine.add('stale_manifest');
    if (input.provenance?.symlink && !input.provenance?.symlink_target) quarantine.add('symlink_target_missing');
    if (aliasResult.cycle.has(input.stable_id)) quarantine.add('alias_cycle');
    const dispatchable = input.dispatchable === true && quarantine.size === 0
      && DISPATCHABLE_RUNTIMES.has(safeRuntime);
    const state = quarantine.size ? 'quarantined' : (dispatchable ? 'dispatchable' : input.state);
    return {
      ...input,
      runtime: safeRuntime,
      scope: requestedScope,
      dispatchable,
      state: MANIFEST_STATES.includes(state) ? state : 'unknown',
      alias: aliasResult.resolved.get(input.stable_id) || null,
      quarantine: [...quarantine].sort(),
      reason_codes: [...new Set([...(input.reason_codes || []), ...quarantine])].sort().slice(0, MAX),
    };
  }).sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  const counts = records.reduce((result, record) => {
    result[record.state] = (result[record.state] || 0) + 1;
    return result;
  }, {});
  const report = {
    schema_version: 2,
    manifest_fingerprint: manifest.fingerprint,
    runtime: safeRuntime,
    scope: requestedScope,
    records,
    counts,
    safe_empty: (counts.dispatchable || 0) === 0,
    status: (counts.dispatchable || 0) === 0 ? 'safe_empty' : 'dispatchable',
  };
  return { ...report, fingerprint: hash(report) };
}
