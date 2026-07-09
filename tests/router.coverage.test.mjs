// Phase 05 Plan 01: off-hot-path inventory coverage audit scaffold.
// These tests parse the real manifest + mode map and report route coverage gaps
// without adding hook-side scans or changing production routing behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { loadManifest, loadModeMap, buildCorpus } = await import(HOOK);

const MANIFEST_KEYS = [
  'skills',
  'plugin_skills',
  'agents_store_skills',
  'agents',
  'commands',
  'hooks',
  'mcp_servers',
  'unwired_mcp_refs',
];

function namesFrom(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry.name || entry.id || '')).filter(Boolean);
  if (value && typeof value === 'object') return Object.keys(value);
  return [];
}

function stripLeadingSlash(value) {
  return String(value || '').replace(/^\/+/, '');
}

export function mappedTargets(modeMap) {
  const targets = new Set();
  for (const entry of modeMap?.entries || []) {
    for (const value of [entry.id, entry.mode]) {
      const target = stripLeadingSlash(value);
      if (target) targets.add(target);
    }
    for (const value of entry.recommended_skills || []) {
      const target = stripLeadingSlash(value);
      if (target) targets.add(target);
    }
    for (const value of entry.recommended_agents || []) {
      const target = stripLeadingSlash(value);
      if (target) targets.add(target);
    }
  }
  return targets;
}

function isMapped(entry, mapped) {
  return mapped.has(stripLeadingSlash(entry?.name)) || mapped.has(stripLeadingSlash(entry?.id));
}

function hasMissingMcp(entry) {
  return Array.isArray(entry?.requires_mcp_not_in_manifest) && entry.requires_mcp_not_in_manifest.length > 0;
}

function isProjectScoped(entry) {
  const scope = String(entry?.scope || '');
  return scope === 'project';
}

function isExcludedAgentsStore(entry) {
  const scope = String(entry?.scope || '');
  return scope && scope !== 'global';
}

export function classifyInventoryEntry(category, entry, mapped = new Set()) {
  if (category === 'hooks') return 'diagnostic_only';
  if (category === 'mcp_servers' || category === 'unwired_mcp_refs') return 'dependency_only';
  if (category === 'project_scoped_skills') return 'project_scoped';
  if (category === 'agents' && hasMissingMcp(entry)) return 'blocked_missing_mcp';
  if (category === 'agents_store_skills' && isExcludedAgentsStore(entry)) return 'excluded';
  if (isProjectScoped(entry)) return 'project_scoped';
  if (['skills', 'plugin_skills', 'agents_store_skills', 'agents', 'commands'].includes(category)) {
    return isMapped(entry, mapped) ? 'routeable' : 'unmapped';
  }
  return 'excluded';
}

export function auditInventoryCoverage(manifest, modeMap) {
  const mapped = mappedTargets(modeMap);
  const audit = {
    mapped,
    counts: new Map(),
    entries: [],
    highValueUnmapped: [],
  };

  for (const category of MANIFEST_KEYS) {
    for (const name of namesFrom(manifest?.[category])) {
      const source = Array.isArray(manifest?.[category])
        ? manifest[category].find((entry) => String(entry.name || entry.id || '') === name)
        : { id: name, name };
      const classification = classifyInventoryEntry(category, source, mapped);
      audit.counts.set(category, (audit.counts.get(category) || 0) + 1);
      const item = { category, name, classification };
      audit.entries.push(item);
      if (classification === 'unmapped') audit.highValueUnmapped.push(item);
    }
  }

  return audit;
}

export function highValueUnmapped(manifest, modeMap) {
  return auditInventoryCoverage(manifest, modeMap).highValueUnmapped;
}

function realAudit() {
  const manifest = loadManifest();
  const modeMap = loadModeMap();
  if (!manifest || !modeMap) return null;
  return auditInventoryCoverage(manifest, modeMap);
}

test('COV-01: real audit accounts for all manifest inventory categories', () => {
  const manifest = loadManifest();
  const modeMap = loadModeMap();
  if (!manifest || !modeMap) { assert.skip('manifest or mode map not available on this machine'); return; }
  const audit = auditInventoryCoverage(manifest, modeMap);

  for (const key of MANIFEST_KEYS) {
    assert.ok(
      audit.counts.has(key),
      `coverage audit missing manifest category ${key}`
    );
    assert.equal(
      audit.counts.get(key),
      namesFrom(manifest[key]).length,
      `coverage audit count mismatch for category ${key}`
    );
  }
});

test('COV-02: mappedTargets includes id, mode, skills, and agents with leading slash stripped', () => {
  const modeMap = {
    entries: [
      {
        id: '/route-id',
        mode: '/slash-mode',
        recommended_skills: ['/skill-one'],
        recommended_agents: ['/agent-one'],
      },
    ],
  };
  const mapped = mappedTargets(modeMap);
  for (const target of ['route-id', 'slash-mode', 'skill-one', 'agent-one']) {
    assert.ok(mapped.has(target), `mapped target ${target} missing from id/mode/skill/agent computation`);
  }
});

test('COV-01: hooks and MCP servers are counted as diagnostics/dependencies, not route gaps', () => {
  const audit = realAudit();
  if (!audit) { assert.skip('manifest or mode map not available on this machine'); return; }

  const hooks = audit.entries.filter((entry) => entry.category === 'hooks');
  const mcps = audit.entries.filter((entry) => entry.category === 'mcp_servers');
  assert.ok(hooks.length > 0, 'hooks category should be present in the real manifest');
  assert.ok(mcps.length > 0, 'mcp_servers category should be present in the real manifest');

  for (const entry of [...hooks, ...mcps]) {
    assert.notEqual(
      entry.classification,
      'unmapped',
      `category ${entry.category} entry ${entry.name} must not be reported as a routeable coverage gap`
    );
    assert.notEqual(
      entry.classification,
      'routeable',
      `category ${entry.category} entry ${entry.name} must not be reported as a direct route target`
    );
  }
});

test('COV-02: routeable inventory can be compared against mode-map mapped targets', () => {
  const manifest = loadManifest();
  const modeMap = loadModeMap();
  if (!manifest || !modeMap) { assert.skip('manifest or mode map not available on this machine'); return; }
  const audit = auditInventoryCoverage(manifest, modeMap);
  const routeableCategories = new Set(['skills', 'plugin_skills', 'agents_store_skills', 'agents', 'commands']);

  const compared = audit.entries.filter((entry) => (
    routeableCategories.has(entry.category)
    && ['routeable', 'unmapped', 'blocked_missing_mcp', 'project_scoped', 'excluded'].includes(entry.classification)
  ));
  assert.ok(compared.length > 0, 'routeable inventory comparison should inspect global skills, plugin skills, agents-store skills, safe agents, and commands');

  for (const entry of compared) {
    assert.ok(
      entry.category && entry.name && entry.classification,
      `coverage comparison missing category/name/classification for ${entry.category}:${entry.name}`
    );
  }
});

test('buildCorpus remains the hot-path routeability baseline for hook exclusions', () => {
  const manifest = loadManifest();
  const modeMap = loadModeMap();
  if (!manifest || !modeMap) { assert.skip('manifest or mode map not available on this machine'); return; }
  const corpusNames = new Set(buildCorpus(manifest, modeMap).map((entry) => entry.name));

  for (const name of namesFrom(manifest.hooks)) {
    assert.ok(
      !corpusNames.has(name),
      `category hooks entry ${name} should stay out of buildCorpus routeable hot-path targets`
    );
  }
});
