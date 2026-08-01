import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCoverage } from '../src/coverage/audit.mjs';

const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));
const { validateRouteTargets } = await import(join(homedir(), '.claude', 'hooks', 'router.mjs'));

test('repository baseline explicitly and deterministically acknowledges only stable BM25 gaps', () => {
  const baseline = JSON.parse(readFileSync(new URL('../coverage-baseline.json', import.meta.url), 'utf8'));
  const keys = baseline.entries.map(({ category, id }) => `${category}\0${id}`);
  assert.equal(baseline.schema_version, 1);
  assert.equal(baseline.entries.length, 210);
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(baseline.entries.every(({ classification, reason }) =>
    classification === 'expected_bm25_only'
    && reason === 'safe global capability remains available to BM25 routing'));
});

function runBuilder({
  modeMap = { schema_version: 2, entries: [] },
  baseline = { schema_version: 1, entries: [] },
  strict = false,
  blockedAgent = false,
  projectSkill = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-coverage-builder-'));
  const claude = join(root, '.claude');
  const manifestPath = join(root, 'manifest.json');
  const reportPath = join(root, 'coverage-report.json');
  const modeMapPath = join(root, 'mode-map.json');
  const baselinePath = join(root, 'coverage-baseline.json');
  const agentsSkills = join(root, 'agents-skills');
  const projectRoot = join(root, 'project');
  mkdirSync(claude, { recursive: true });
  if (blockedAgent) {
    mkdirSync(join(claude, 'agents'), { recursive: true });
    writeFileSync(join(claude, 'agents', 'blocked-agent.md'),
      '---\nname: blocked-agent\ndescription: blocked fixture\ntools: mcp__missing__tool\n---\n# Blocked\n');
  }
  if (projectSkill) {
    mkdirSync(join(projectRoot, '.claude', 'skills', 'project-only'), { recursive: true });
    writeFileSync(join(projectRoot, '.claude', 'skills', 'project-only', 'SKILL.md'),
      '---\nname: project-only\ndescription: project fixture\n---\n# Project\n');
  }
  mkdirSync(join(agentsSkills, 'fixture-skill'), { recursive: true });
  writeFileSync(join(agentsSkills, 'fixture-skill', 'SKILL.md'),
    '---\nname: fixture-skill\ndescription: fixture\n---\n# Fixture\n');
  writeFileSync(modeMapPath, JSON.stringify(modeMap));
  writeFileSync(baselinePath, JSON.stringify(baseline));
  const result = spawnSync(process.execPath, [BUILDER, ...(strict ? ['--strict-coverage'] : [])], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ROUTER_CLAUDE_HOME: claude,
      ROUTER_AGENTS_SKILLS_DIR: agentsSkills,
      ROUTER_PROJECT_SKILL_DIRS: projectSkill ? projectRoot : '',
      ROUTER_CLAUDE_JSON: join(root, 'claude.json'),
      ROUTER_MANIFEST_OUT: manifestPath,
      ROUTER_MODE_MAP_PATH: modeMapPath,
      ROUTER_COVERAGE_REPORT_PATH: reportPath,
      ROUTER_COVERAGE_BASELINE_PATH: baselinePath,
    },
  });
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  rmSync(root, { recursive: true, force: true });
  return { result, report };
}

function manifest() {
  return {
    commands: [{ id: 'build' }, { id: 'route-id' }],
    skills: [{ id: 'shared' }, { id: 'bm25-only' }],
    plugin_skills: [{ id: 'shared' }],
    agents: [
      { id: 'safe-agent', requires_mcp_not_in_manifest: [] },
      { id: 'blocked-agent', requires_mcp_not_in_manifest: ['context7'] },
    ],
    project_scoped_skills: [{ id: 'project-only', scope: 'project' }],
    hooks: [{ id: 'prompt-hook' }],
  };
}

function modeMap() {
  return {
    schema_version: 2,
    entries: [{
      id: 'route-id',
      invoke_kind: 'slash',
      mode: 'build',
      signal_patterns: ['build'],
      recommended_skills: ['shared'],
      recommended_agents: ['safe-agent'],
    }],
  };
}

const record = (report, category, id) =>
  report.records.find(entry => entry.category === category && entry.id === id);

test('classifies mapped and manifest-derived expected capabilities with typed identities', () => {
  const report = auditCoverage({ manifest: manifest(), modeMap: modeMap(), baseline: { schema_version: 1, entries: [] } });

  assert.deepEqual(record(report, 'commands', 'build'), {
    category: 'commands', id: 'build', coverage_status: 'mapped', classification: null,
  });
  assert.deepEqual(record(report, 'agents', 'blocked-agent'), {
    category: 'agents', id: 'blocked-agent', coverage_status: 'unmapped',
    classification: 'expected_warn_mcp', reason: 'requires unavailable MCP: context7',
  });
  assert.equal(record(report, 'hooks', 'prompt-hook').classification, 'expected_hook');
  assert.equal(record(report, 'project_scoped_skills', 'project-only').classification, 'expected_scope_project');
  assert.equal(record(report, 'commands', 'route-id').classification, 'gap',
    'a route id must not cover a same-named capability');
  assert.equal(record(report, 'skills', 'shared').coverage_status, 'mapped');
  assert.equal(record(report, 'plugin_skills', 'shared').coverage_status, 'mapped');
});

test('allows only explicit present reverse-gap policy acknowledgements', () => {
  const baseline = {
    schema_version: 1,
    entries: [
      { category: 'skills', id: 'bm25-only', classification: 'expected_bm25_only', reason: 'lexical fallback is intentional' },
      { category: 'agents', id: 'safe-agent', classification: 'expected_phase_internal', reason: 'phase worker only' },
      { category: 'hooks', id: 'prompt-hook', classification: 'expected_phase_internal', reason: 'must be derived' },
      { category: 'commands', id: 'missing', classification: 'expected_bm25_only', reason: 'stale' },
      { category: 'commands', id: 'route-id', classification: 'gap', reason: 'disallowed' },
      { category: 'skills', id: 'bm25-only', classification: 'expected_bm25_only', reason: 'duplicate' },
    ],
  };
  const report = auditCoverage({ manifest: manifest(), modeMap: modeMap(), baseline });

  assert.equal(record(report, 'skills', 'bm25-only').classification, 'gap',
    'duplicate baseline identities must never acknowledge a gap');
  assert.equal(record(report, 'agents', 'safe-agent').coverage_status, 'mapped',
    'mapped capabilities cannot be pre-authorized');
  assert.equal(record(report, 'hooks', 'prompt-hook').classification, 'expected_hook',
    'manifest-derived classifications cannot be pre-authorized');
  assert.equal(record(report, 'commands', 'route-id').classification, 'gap');
  assert.deepEqual(report.baseline_diagnostics.map(item => item.code), [
    'baseline_disallowed_classification', 'baseline_duplicate',
    'baseline_stale', 'baseline_stale', 'baseline_stale',
  ]);
});

test('reports typed forward targets without allowing baseline suppression', () => {
  const report = auditCoverage({
    manifest: manifest(),
    modeMap: {
      entries: [
        { id: 'missing-command', invoke_kind: 'slash', mode: 'missing-command',
          signal_patterns: ['missing command'], recommended_skills: [], recommended_agents: [] },
        { id: 'missing-skill', invoke_kind: 'skill', signal_patterns: ['missing skill'],
          recommended_skills: ['no-skill'], recommended_agents: [] },
        { id: 'blocked', invoke_kind: 'agent', signal_patterns: ['blocked agent'],
          recommended_skills: [], recommended_agents: ['blocked-agent'] },
      ],
    },
    baseline: {
      schema_version: 1,
      entries: [{ category: 'commands', id: 'missing-command', classification: 'expected_bm25_only', reason: 'must not hide forward failures' }],
    },
  });

  assert.deepEqual(report.forward_diagnostics.map(item => item.code), [
    'blocked_agent_target', 'stale_skill_target', 'stale_target',
  ]);
});

test('matches live routeability for non-global agents-store skills', () => {
  const inventory = manifest();
  inventory.agents_store_skills = [
    { id: 'global-helper', scope: 'global' },
    { id: 'store-only', scope: 'agents-store (not globally symlinked)' },
  ];
  const route = {
    schema_version: 2,
    entries: [{
      id: 'store-route',
      invoke_kind: 'skill',
      signal_patterns: ['store helper'],
      recommended_skills: ['store-only'],
      recommended_agents: [],
    }],
  };

  const live = validateRouteTargets(inventory, route);
  const report = auditCoverage({
    manifest: inventory,
    modeMap: route,
    baseline: { schema_version: 1, entries: [] },
  });

  assert.ok(live.some(item => item.status === 'stale_target' && item.target === 'store-only'));
  assert.ok(report.forward_diagnostics.some(item =>
    item.code === 'stale_skill_target' && item.target === 'store-only'));
  assert.equal(record(report, 'agents_store_skills', 'store-only').classification, 'gap');
});

test('project-scoped skills remain expected but cannot satisfy global routes', () => {
  const route = {
    schema_version: 2,
    entries: [{
      id: 'project-route',
      invoke_kind: 'skill',
      signal_patterns: ['project helper'],
      recommended_skills: ['project-only'],
      recommended_agents: [],
    }],
  };
  const live = validateRouteTargets(manifest(), route);
  const report = auditCoverage({
    manifest: manifest(),
    modeMap: route,
    baseline: { schema_version: 1, entries: [] },
  });

  assert.ok(live.some(item => item.status === 'stale_target' && item.target === 'project-only'));
  assert.ok(report.forward_diagnostics.some(item =>
    item.code === 'stale_skill_target' && item.target === 'project-only'));
  assert.equal(record(report, 'project_scoped_skills', 'project-only').classification,
    'expected_scope_project');

  const initial = runBuilder({ modeMap: route, projectSkill: true });
  const baseline = {
    schema_version: 1,
    entries: initial.report.unacknowledged_gaps.map(item => ({
      ...item,
      classification: 'expected_bm25_only',
      reason: 'fixture acknowledgement',
    })),
  };
  const strict = runBuilder({ modeMap: route, baseline, projectSkill: true, strict: true });
  assert.equal(strict.result.status, 1);
  assert.ok(strict.report.forward_diagnostics.some(item =>
    item.code === 'stale_skill_target' && item.target === 'project-only'));
});

test('warn routes report blocked agents without making them dispatch targets', () => {
  const route = {
    schema_version: 2,
    entries: [{
      id: 'blocked-warning',
      invoke_kind: 'warn',
      signal_patterns: ['blocked agent'],
      recommended_skills: [],
      recommended_agents: ['blocked-agent'],
      warning: 'Agent blocked-agent needs MCP missing',
    }],
  };
  const live = validateRouteTargets(manifest(), route);
  const report = auditCoverage({
    manifest: manifest(),
    modeMap: route,
    baseline: { schema_version: 1, entries: [] },
  });

  assert.ok(live.some(item =>
    item.status === 'blocked_dispatch_agent' && item.target === 'blocked-agent'));
  assert.ok(report.forward_diagnostics.some(item =>
    item.code === 'blocked_agent_target' && item.target === 'blocked-agent'));
  assert.equal(record(report, 'agents', 'blocked-agent').classification, 'expected_warn_mcp');

  const initial = runBuilder({ modeMap: route, blockedAgent: true });
  const baseline = {
    schema_version: 1,
    entries: initial.report.unacknowledged_gaps.map(item => ({
      ...item,
      classification: 'expected_bm25_only',
      reason: 'fixture acknowledgement',
    })),
  };
  const strict = runBuilder({ modeMap: route, baseline, blockedAgent: true, strict: true });
  assert.equal(strict.result.status, 1);
  assert.ok(strict.report.forward_diagnostics.some(item =>
    item.code === 'blocked_agent_target' && item.target === 'blocked-agent'));
});

test('malformed routes emit diagnostics and cannot manufacture mapped coverage', () => {
  const entries = [
    { invoke_kind: 'skill', signal_patterns: ['missing id'],
      recommended_skills: ['shared'], recommended_agents: [] },
    { id: 'bad-kind', invoke_kind: 'other', signal_patterns: ['bad kind'],
      recommended_skills: ['shared'], recommended_agents: [] },
    { id: 'missing-signals', invoke_kind: 'skill',
      recommended_skills: ['shared'], recommended_agents: [] },
    { id: 'bad-skills', invoke_kind: 'agent', signal_patterns: ['bad skills'],
      recommended_skills: 'shared', recommended_agents: ['safe-agent'] },
    { id: 'bad-agents', invoke_kind: 'skill', signal_patterns: ['bad agents'],
      recommended_skills: ['shared'], recommended_agents: 'safe-agent' },
    { id: 'empty-agent', invoke_kind: 'agent', signal_patterns: ['empty agent'],
      recommended_skills: ['shared'], recommended_agents: [] },
  ];
  const report = auditCoverage({
    manifest: manifest(),
    modeMap: { schema_version: 2, entries },
    baseline: { schema_version: 1, entries: [] },
  });

  assert.equal(report.forward_diagnostics.filter(item => item.code === 'invalid_shape').length, entries.length);
  assert.equal(record(report, 'skills', 'shared').classification, 'gap');
  assert.equal(record(report, 'plugin_skills', 'shared').classification, 'gap');
  assert.equal(record(report, 'agents', 'safe-agent').classification, 'gap');
});

test('malformed optional inputs stay visible and acknowledge nothing', () => {
  const report = auditCoverage({ manifest: manifest(), modeMap: { entries: 'bad' }, baseline: { schema_version: 2, entries: {} } });
  assert.ok(report.forward_diagnostics.some(item => item.code === 'mode_map_malformed'));
  assert.ok(report.baseline_diagnostics.some(item => item.code === 'baseline_malformed'));
  assert.ok(report.unacknowledged_gaps.length > 0);
});

test('canonical pattern diagnostics pass through coverage audit unchanged', () => {
  const route = {
    schema_version: 3,
    entries: [
      { id: 'too-many', invoke_kind: 'skill', signal_patterns: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        recommended_skills: ['shared'], recommended_agents: [] },
      { id: 'bad-kind', invoke_kind: 'skill', signal_patterns: [{ kind: 'regex', value: 'build' }],
        recommended_skills: ['shared'], recommended_agents: [] },
      { id: 'collision-a', invoke_kind: 'skill', signal_patterns: ['same signal'],
        recommended_skills: ['shared'], recommended_agents: [] },
      { id: 'collision-b', invoke_kind: 'skill', signal_patterns: [{ kind: 'contains', value: 'same signal' }],
        recommended_skills: ['shared'], recommended_agents: [] },
    ],
  };
  const routeDiagnostics = validateRouteTargets(manifest(), route);
  const report = auditCoverage({
    manifest: manifest(),
    modeMap: route,
    baseline: { schema_version: 1, entries: [] },
    routeDiagnostics,
  });

  assert.deepEqual(
    report.forward_diagnostics
      .filter(({ code }) => code.startsWith('invalid_pattern') || code === 'pattern_collision')
      .map(({ code, route, target, reason }) => ({ code, route, target, reason })),
    routeDiagnostics
      .filter(({ status }) => status.startsWith('invalid_pattern') || status === 'pattern_collision')
      .map(({ status, id, target, reason }) => ({ code: status, route: id, target, reason }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.route.localeCompare(b.route)),
  );
});

test('equivalent inputs produce byte-identical sorted JSON-ready reports without private fields', () => {
  const first = auditCoverage({ manifest: manifest(), modeMap: modeMap(), baseline: { schema_version: 1, entries: [] } });
  const shuffled = manifest();
  shuffled.skills.reverse();
  shuffled.agents.reverse();
  const second = auditCoverage({ manifest: shuffled, modeMap: modeMap(), baseline: { entries: [], schema_version: 1 } });

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.records, [...first.records].sort((a, b) =>
    a.category.localeCompare(b.category) || a.id.localeCompare(b.id)));
  for (const entry of first.records) {
    assert.deepEqual(
      Object.keys(entry).sort(),
      entry.coverage_status === 'mapped'
        ? ['category', 'classification', 'coverage_status', 'id']
        : ['category', 'classification', 'coverage_status', 'id', 'reason'],
    );
  }
});

test('strict builder fails only after publishing unacknowledged reverse gaps', () => {
  const normal = runBuilder();
  assert.equal(normal.result.status, 0);
  assert.ok(normal.report.unacknowledged_gaps.length > 0);

  const strict = runBuilder({ strict: true });
  assert.equal(strict.result.status, 1);
  assert.ok(strict.report.unacknowledged_gaps.length > 0,
    'the complete report must be readable after strict failure');

  const acknowledged = runBuilder({
    strict: true,
    baseline: {
      schema_version: 1,
      entries: strict.report.unacknowledged_gaps
        .map(item => ({
          category: item.category,
          id: item.id,
          classification: 'expected_bm25_only',
          reason: 'fixture acknowledgement',
        })),
    },
  });
  assert.equal(acknowledged.result.status, 0);
});

test('strict builder rejects duplicate baseline acknowledgements', () => {
  const strict = runBuilder({ strict: true });
  const entries = strict.report.unacknowledged_gaps.map(item => ({
    category: item.category,
    id: item.id,
    classification: 'expected_bm25_only',
    reason: 'fixture acknowledgement',
  }));
  entries.push({ ...entries[0], reason: 'duplicate fixture acknowledgement' });

  const duplicated = runBuilder({
    strict: true,
    baseline: { schema_version: 1, entries },
  });

  assert.equal(duplicated.result.status, 1);
  assert.ok(duplicated.report.baseline_diagnostics.some(item => item.code === 'baseline_duplicate'));
  assert.ok(duplicated.report.unacknowledged_gaps.some(item =>
    item.category === entries[0].category && item.id === entries[0].id));
});

test('strict builder fails on forward diagnostics while stale acknowledgements remain warnings', () => {
  const { result, report } = runBuilder({
    strict: true,
    modeMap: {
      schema_version: 2,
      entries: [{ id: 'missing', invoke_kind: 'skill', signal_patterns: ['missing'],
        recommended_skills: ['missing'], recommended_agents: [] }],
    },
    baseline: {
      schema_version: 1,
      entries: [{ category: 'skills', id: 'gone', classification: 'expected_bm25_only', reason: 'stale fixture' }],
    },
  });

  assert.equal(result.status, 1);
  assert.ok(report.forward_diagnostics.length > 0);
  assert.ok(report.baseline_diagnostics.some(item => item.code === 'baseline_stale'));
});

// --- Phase 32 Plan 32-01 Task 2 — schema_version-SET resolve-member guard (ROUTE-05) --

// The schema_version guard hole lives in THREE sites (router.mjs:721/806 AND audit.mjs:142).
// audit.mjs:142's `schemaRoute = mode && mode === route && Boolean(modeMap.schema_version)`
// treats id===mode entries under a SET schema_version as mapped/valid even when their
// resolve-list members are absent from the manifest. This RED test locks that closure:
// the audit guard must report an ABSENT resolve member as a forward-orphan / stale diagnostic.

test('schema_version-SET resolve member absent from manifest is reported strictly as forward-orphan/stale', () => {
  const resolveManifest = {
    ...manifest(),
    commands: ['build', 'route-id', 'resolve-mode'], // 'resolve-mode' mode IS present;
  };                                                  // 'absent-capability' resolve member is NOT
  const route = {
    schema_version: 4, // SET, per the roadmap note the hole is only exercised when set
    entries: [{
      id: 'resolve-route',
      invoke_kind: 'slash',
      mode: 'resolve-mode',
      resolve: [
        { name: 'resolve-mode', weight: 1.0 },     // present
        { name: 'absent-capability', weight: 0.5 }, // ABSENT from the manifest
      ],
      signal_patterns: ['resolve'],
      recommended_skills: [],
      recommended_agents: [],
    }],
  };

  const live = validateRouteTargets(resolveManifest, route);
  const report = auditCoverage({
    manifest: resolveManifest,
    modeMap: route,
    baseline: { schema_version: 1, entries: [] },
    routeDiagnostics: live,
  });

  // Today neither the live validator nor the audit guard inspects entry.resolve at all —
  // the absent member sails through because its (present) mode satisfies the schemaRoute
  // branch. Both assertions below must FAIL (RED) until 32-03 closes the resolve-list guard.
  assert.ok(
    live.some(item => item.status === 'stale_target' && item.target === 'absent-capability'),
    'live validator must flag the absent resolve member as stale_target',
  );
  assert.ok(
    report.forward_diagnostics.some(item => item.code === 'stale_target' && item.target === 'absent-capability'),
    'audit guard must report the absent resolve member as a forward-orphan/stale diagnostic',
  );
});

test('schema_version-SET builder report also surfaces the absent resolve member as stale', () => {
  const modeMap = {
    schema_version: 4, // SET — the guard hole is only exercised when schema_version is set
    entries: [{
      id: 'resolve-route',
      invoke_kind: 'slash',
      mode: 'resolve-mode',
      resolve: [
        { name: 'resolve-mode', weight: 1.0 },
        { name: 'absent-capability', weight: 0.5 }, // absent from the builder manifest
      ],
      signal_patterns: ['resolve'],
      recommended_skills: [],
      recommended_agents: [],
    }],
  };
  const { result, report } = runBuilder({ modeMap });
  assert.equal(result.status, 0, 'non-strict builder exits 0 even while surfacing diagnostics');
  assert.ok(
    report.forward_diagnostics.some(item => item.code === 'stale_target' && item.target === 'absent-capability'),
    `audit-guard report must flag the absent resolve member (got ${JSON.stringify(report.forward_diagnostics.map(i => i.target))})`,
  );
});
