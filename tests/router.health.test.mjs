// Phase 07 Wave 1 RED contract: router doctor/routes/unmapped/coverage.
// These tests describe the JSON-first helper and CLI surface before the
// installed router implements it. Runtime implementation belongs to later plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const ROUTER_DIR = join(homedir(), '.claude', 'router');
const CACHE = join(ROUTER_DIR, 'cache.json');
const TELEMETRY = join(ROUTER_DIR, 'telemetry.jsonl');
const EVOLVE_TRIGGER = join(ROUTER_DIR, '.evolve-trigger');
const WEIGHTS = join(ROUTER_DIR, 'weights.json');

const mod = await import(HOOK);
const {
  mappedTargets,
  buildTargetIndexes,
  classifyInventoryEntry,
  auditInventoryCoverage,
  validateRouteTargets,
  listRoutes,
  listUnmapped,
  summarizeCoverage,
  diagnoseRouterState,
} = mod;

const RAW_PROMPT_FIXTURE = 'RAW_PHASE_07_SECRET_PROMPT_DO_NOT_PRINT';

function fixtureManifest() {
  return {
    skills: [
      { id: 'systematic-debugging', name: 'systematic-debugging', scope: 'global' },
      { id: 'unmapped-skill', name: 'unmapped-skill', scope: 'global' },
      { id: 'project-only-skill', name: 'project-only-skill', scope: 'project' },
    ],
    plugin_skills: [
      { id: 'find-skills', name: 'find-skills' },
      { id: 'plugin-gap', name: 'plugin-gap' },
    ],
    agents_store_skills: [
      { id: 'global-helper', name: 'global-helper', scope: 'global' },
      { id: 'project-helper', name: 'project-helper', scope: 'project' },
    ],
    commands: [
      { id: 'gsd-debug', name: 'gsd-debug' },
      { id: 'route-gap', name: 'route-gap' },
    ],
    agents: [
      { id: 'safe-agent', name: 'safe-agent', requires_mcp_not_in_manifest: [] },
      { id: 'blocked-agent', name: 'blocked-agent', requires_mcp_not_in_manifest: ['context7'] },
    ],
    hooks: [{ id: 'UserPromptSubmit', name: 'UserPromptSubmit' }],
    mcp_servers: [{ id: 'context7', name: 'context7' }],
    unwired_mcp_refs: [{ id: 'missing-mcp', name: 'missing-mcp' }],
  };
}

function fixtureModeMap() {
  return {
    schema_version: 2,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [
      {
        id: 'gsd-debug',
        mode: 'gsd-debug',
        invoke_kind: 'slash',
        signal_patterns: ['debug a failing router test', RAW_PROMPT_FIXTURE],
        recommended_skills: ['systematic-debugging'],
        recommended_agents: [],
        args_hint: '<bug description>',
      },
      {
        id: 'find-skills-route',
        mode: null,
        invoke_kind: 'skill',
        signal_patterns: ['find a codex skill'],
        recommended_skills: ['find-skills'],
        recommended_agents: [],
      },
      {
        id: 'safe-agent-route',
        mode: null,
        invoke_kind: 'agent',
        signal_patterns: ['dispatch safe agent'],
        recommended_skills: [],
        recommended_agents: ['safe-agent'],
      },
      {
        id: 'blocked-agent-warning',
        mode: null,
        invoke_kind: 'warn',
        signal_patterns: ['blocked agent warning'],
        recommended_skills: [],
        recommended_agents: [],
        warning: 'Agent blocked-agent needs MCP context7 which is not in manifest - wire MCP first.',
      },
    ],
  };
}

function invalidFixtureModeMap() {
  return {
    entries: [
      {
        id: 'missing-command',
        mode: 'missing-command',
        invoke_kind: 'slash',
        signal_patterns: ['missing command'],
        recommended_skills: [],
        recommended_agents: [],
      },
      {
        id: 'bad-shape',
        mode: null,
        invoke_kind: 'agent',
        signal_patterns: 'not an array',
        recommended_skills: [],
        recommended_agents: [],
      },
      {
        id: 'blocked-dispatch',
        mode: null,
        invoke_kind: 'agent',
        signal_patterns: ['dispatch blocked agent'],
        recommended_skills: [],
        recommended_agents: ['blocked-agent'],
      },
    ],
  };
}

function fileSnapshot(path) {
  if (!existsSync(path)) {
    return { exists: false, size: 0, mtimeMs: 0, sha256: null };
  }
  const buf = readFileSync(path);
  const st = statSync(path);
  return {
    exists: true,
    size: st.size,
    mtimeMs: st.mtimeMs,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

function routerStateSnapshot() {
  return {
    cache: fileSnapshot(CACHE),
    telemetry: fileSnapshot(TELEMETRY),
    evolveTrigger: fileSnapshot(EVOLVE_TRIGGER),
  };
}

function assertStateUnchanged(before, after, command) {
  assert.deepEqual(after.cache, before.cache, `${command} must not mutate cache.json`);
  assert.deepEqual(after.telemetry, before.telemetry, `${command} must not mutate telemetry.jsonl`);
  assert.deepEqual(after.evolveTrigger, before.evolveTrigger, `${command} must not mutate .evolve-trigger`);
}

function runRouterCommand(args) {
  return spawnSync('node', [HOOK, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 5000,
  });
}

function runJsonCommand(args) {
  const before = routerStateSnapshot();
  const result = runRouterCommand(args);
  const after = routerStateSnapshot();
  assert.equal(result.status, 0, `command failed: ${result.stderr || result.stdout}`);
  assert.ok(result.stdout.trim(), 'command must print JSON to stdout');
  assert.equal(result.stderr, '', 'JSON commands should not write diagnostics to stderr');
  assertStateUnchanged(before, after, args.join(' '));
  const out = JSON.parse(result.stdout);
  const text = JSON.stringify(out);
  assert.ok(!text.includes(RAW_PROMPT_FIXTURE), 'health command output must not expose raw prompt fixtures');
  return out;
}

function assertExport(name, fn) {
  assert.equal(typeof fn, 'function', `router.mjs must export ${name}`);
}

function assertNextFixes(out, label) {
  assert.ok(Array.isArray(out.next_fixes), `${label} must include actionable next_fixes`);
  assert.ok(out.next_fixes.length > 0, `${label} must recommend at least one next fix`);
  for (const fix of out.next_fixes) {
    assert.equal(typeof fix.reason, 'string', `${label} next_fixes require a reason`);
    assert.equal(typeof fix.action, 'string', `${label} next_fixes require an action`);
  }
}

test('HLT-01/HLT-03/HLT-04/HLT-05: Phase 07 helper exports are importable', () => {
  assertExport('mappedTargets', mappedTargets);
  assertExport('buildTargetIndexes', buildTargetIndexes);
  assertExport('classifyInventoryEntry', classifyInventoryEntry);
  assertExport('auditInventoryCoverage', auditInventoryCoverage);
  assertExport('validateRouteTargets', validateRouteTargets);
  assertExport('listRoutes', listRoutes);
  assertExport('listUnmapped', listUnmapped);
  assertExport('summarizeCoverage', summarizeCoverage);
  assertExport('diagnoseRouterState', diagnoseRouterState);
});

test('HLT-03/HLT-04: fixture coverage classifies routeable, unmapped, blocked, diagnostics, and dependencies', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  const mapped = mappedTargets(modeMap);

  for (const target of ['gsd-debug', 'systematic-debugging', 'find-skills', 'safe-agent']) {
    assert.ok(mapped.has(target), `mapped target ${target} missing`);
  }

  assert.equal(classifyInventoryEntry('hooks', manifest.hooks[0], mapped), 'diagnostic_only');
  assert.equal(classifyInventoryEntry('mcp_servers', manifest.mcp_servers[0], mapped), 'dependency_only');
  assert.equal(classifyInventoryEntry('unwired_mcp_refs', manifest.unwired_mcp_refs[0], mapped), 'dependency_only');
  assert.equal(classifyInventoryEntry('skills', manifest.skills[0], mapped), 'routeable');
  assert.equal(classifyInventoryEntry('skills', manifest.skills[1], mapped), 'unmapped');
  assert.equal(classifyInventoryEntry('skills', manifest.skills[2], mapped), 'project_scoped');
  assert.equal(classifyInventoryEntry('agents_store_skills', manifest.agents_store_skills[1], mapped), 'excluded');
  assert.equal(classifyInventoryEntry('agents', manifest.agents[1], mapped), 'blocked_missing_mcp');

  const audit = auditInventoryCoverage(manifest, modeMap);
  assert.ok(audit.entries.some((entry) => entry.name === 'unmapped-skill' && entry.classification === 'unmapped'));
  assert.ok(audit.entries.some((entry) => entry.name === 'blocked-agent' && entry.classification === 'blocked_missing_mcp'));
  assert.ok(audit.highValueUnmapped.some((entry) => entry.name === 'route-gap'));
});

test('HLT-01: route target diagnostics return structured statuses instead of throwing', () => {
  const indexes = buildTargetIndexes(fixtureManifest());
  const okRows = validateRouteTargets(fixtureManifest(), fixtureModeMap(), indexes);
  assert.ok(Array.isArray(okRows), 'validateRouteTargets must return diagnostic rows');
  assert.ok(okRows.length >= 4, 'expected slash, skill, agent, and warn rows');
  assert.ok(okRows.every((row) => row.status === 'ok'), `expected ok rows, got ${JSON.stringify(okRows)}`);

  const badRows = validateRouteTargets(fixtureManifest(), invalidFixtureModeMap(), indexes);
  const statuses = new Set(badRows.map((row) => row.status));
  assert.ok(statuses.has('stale_target'), 'missing stale_target diagnostic');
  assert.ok(statuses.has('invalid_shape'), 'missing invalid_shape diagnostic');
  assert.ok(statuses.has('blocked_dispatch_agent'), 'missing blocked_dispatch_agent diagnostic');
});

test('HLT-02: listRoutes exposes JSON route entries with examples, invoke kind, warnings, and target health', () => {
  const routes = listRoutes(fixtureManifest(), fixtureModeMap());
  assert.equal(routes.status, 'ok');
  assert.equal(routes.total, fixtureModeMap().entries.length);
  assert.ok(routes.routes.some((route) => (
    route.id === 'blocked-agent-warning'
    && route.invoke_kind === 'warn'
    && route.warning.includes('needs MCP')
  )));
  for (const route of routes.routes) {
    assert.ok(Array.isArray(route.examples), `route ${route.id} missing examples`);
    assert.ok(route.examples.length > 0, `route ${route.id} must expose representative examples`);
    assert.ok(route.target_health && typeof route.target_health === 'object', `route ${route.id} missing target_health`);
  }
});

test('HLT-03/HLT-04/HLT-05: listUnmapped and summarizeCoverage expose useful gaps and next fixes', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  const unmapped = listUnmapped(manifest, modeMap);
  assert.equal(unmapped.status, 'ok');
  assert.equal(unmapped.rank_basis, 'commands, global skills, plugin skills, safe agents, keyword priority, name');
  assert.equal(unmapped.items[0].name, 'route-gap');
  assert.ok(unmapped.items.some((item) => item.name === 'unmapped-skill'));
  assert.ok(!unmapped.items.some((item) => item.category === 'hooks'), 'hooks are diagnostic-only, not route gaps');
  assert.ok(!unmapped.items.some((item) => item.category === 'mcp_servers'), 'MCP records are dependency-only, not route gaps');
  assert.ok(!unmapped.items.some((item) => item.name === 'blocked-agent'), 'blocked agents must not be recommended as dispatch targets');
  for (const item of unmapped.items) {
    assert.equal(typeof item.rank, 'number', `unmapped item ${item.name} missing rank`);
    assert.equal(typeof item.source, 'string', `unmapped item ${item.name} missing source`);
    assert.equal(typeof item.reason, 'string', `unmapped item ${item.name} missing reason`);
    assert.equal(item.routeability, 'candidate', `unmapped item ${item.name} should be a candidate`);
    assert.equal(typeof item.recommendation, 'string', `unmapped item ${item.name} missing recommendation`);
  }
  for (const blocked of unmapped.blocked_missing_mcp) {
    assert.equal(blocked.routeability, 'blocked');
    assert.match(blocked.recommendation, /Wire missing MCP|keep warn-only/);
  }
  assertNextFixes(unmapped, 'unmapped');

  const coverage = summarizeCoverage(manifest, modeMap);
  assert.equal(coverage.status, 'ok');
  for (const category of ['skills', 'plugin_skills', 'agents_store_skills', 'agents', 'commands', 'hooks', 'mcp_servers', 'unwired_mcp_refs']) {
    assert.ok(coverage.categories[category], `coverage missing category ${category}`);
  }
  assert.equal(coverage.categories.hooks.diagnostic_only, 1);
  assert.equal(coverage.categories.mcp_servers.dependency_only, 1);
  assert.equal(coverage.categories.agents.blocked_missing_mcp, 1);
  assertNextFixes(coverage, 'coverage');
});

test('HLT-01/HLT-05: diagnoseRouterState reports file health, coverage, safety, and actionable next fixes', () => {
  const out = diagnoseRouterState({
    manifest: fixtureManifest(),
    modeMap: fixtureModeMap(),
    paths: {
      hook: HOOK,
      cache: CACHE,
      telemetry: TELEMETRY,
      weights: WEIGHTS,
      evolveTrigger: EVOLVE_TRIGGER,
    },
  });
  assert.equal(out.status, 'ok');
  for (const field of ['manifest', 'mode_map', 'coverage', 'unmapped', 'missing_mcp', 'blocked_agents', 'stale_targets', 'hook', 'cache', 'telemetry', 'weights', 'evolution']) {
    assert.ok(field in out, `doctor output missing ${field}`);
  }
  assert.ok(Array.isArray(out.blocked_agents));
  assert.ok(out.blocked_agents.some((entry) => entry.name === 'blocked-agent'));
  assertNextFixes(out, 'doctor');
  assert.ok(!JSON.stringify(out).includes(RAW_PROMPT_FIXTURE), 'doctor must not expose raw signal/prompt text');
});

test('HLT-02: router routes --json returns route entries and target health without mutating runtime files', () => {
  const out = runJsonCommand(['routes', '--json']);
  assert.equal(out.status, 'ok');
  assert.ok(Array.isArray(out.routes), 'routes output must include routes array');
  assert.equal(typeof out.total, 'number');
  for (const route of out.routes.slice(0, 5)) {
    assert.equal(typeof route.id, 'string');
    assert.equal(typeof route.invoke_kind, 'string');
    assert.ok(Array.isArray(route.examples), 'route examples must be an array');
    assert.ok(route.target_health && typeof route.target_health === 'object');
  }
});

test('HLT-03: router unmapped --json returns useful unmapped inventory without hooks or MCP false gaps', () => {
  const out = runJsonCommand(['unmapped', '--json']);
  assert.equal(out.status, 'ok');
  assert.equal(out.rank_basis, 'commands, global skills, plugin skills, safe agents, keyword priority, name');
  assert.ok(Array.isArray(out.items), 'unmapped output must include items array');
  assertNextFixes(out, 'unmapped CLI');
  for (const item of out.items) {
    assert.notEqual(item.category, 'hooks', 'hooks must not be listed as unmapped route gaps');
    assert.notEqual(item.category, 'mcp_servers', 'MCP servers must not be listed as unmapped route gaps');
    assert.notEqual(item.classification, 'blocked_missing_mcp', 'blocked missing-MCP agents must not be unmapped dispatch recommendations');
    assert.equal(item.routeability, 'candidate', 'unmapped entries must be dispatch candidates');
    assert.equal(typeof item.recommendation, 'string', 'unmapped entries need next-fix recommendation text');
  }
});

test('HLT-04/HLT-05: router coverage --json returns counts by category and next-fix recommendations', () => {
  const out = runJsonCommand(['coverage', '--json']);
  assert.equal(out.status, 'ok');
  assert.ok(out.categories && typeof out.categories === 'object', 'coverage output must include category counts');
  for (const category of ['skills', 'plugin_skills', 'agents_store_skills', 'agents', 'commands', 'hooks', 'mcp_servers']) {
    assert.ok(out.categories[category], `coverage output missing category ${category}`);
    assert.equal(typeof out.categories[category].discovered, 'number');
  }
  assertNextFixes(out, 'coverage CLI');
});

test('HLT-01: router doctor --json reports runtime health and privacy-preserving diagnostics', () => {
  const out = runJsonCommand(['doctor', '--json']);
  assert.equal(out.status, 'ok');
  for (const field of ['manifest', 'mode_map', 'coverage', 'unmapped', 'missing_mcp', 'blocked_agents', 'stale_targets', 'hook', 'cache', 'telemetry', 'weights', 'evolution']) {
    assert.ok(field in out, `doctor output missing ${field}`);
  }
  assert.ok(out.privacy && out.privacy.raw_prompt_text === false, 'doctor must explicitly report raw prompt privacy');
  assertNextFixes(out, 'doctor CLI');
});
