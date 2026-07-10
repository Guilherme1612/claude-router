// Phase 05 Plan 01: off-hot-path inventory coverage audit scaffold.
// These tests parse the real manifest + mode map and report route coverage gaps
// without adding hook-side scans or changing production routing behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const {
  loadManifest,
  loadModeMap,
  buildCorpus,
  mappedTargets,
  classifyInventoryEntry,
  auditInventoryCoverage,
} = await import(HOOK);

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
    assert.equal(
      audit.counts[key].discovered,
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
