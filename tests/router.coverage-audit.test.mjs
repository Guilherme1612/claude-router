import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditCoverage } from '../src/coverage/audit.mjs';

const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));

function runBuilder({ modeMap = { schema_version: 2, entries: [] }, baseline = { schema_version: 1, entries: [] }, strict = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-coverage-builder-'));
  const claude = join(root, '.claude');
  const manifestPath = join(root, 'manifest.json');
  const reportPath = join(root, 'coverage-report.json');
  const modeMapPath = join(root, 'mode-map.json');
  const baselinePath = join(root, 'coverage-baseline.json');
  const agentsSkills = join(root, 'agents-skills');
  mkdirSync(claude, { recursive: true });
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
      { category: 'commands', id: 'missing', classification: 'expected_bm25_only', reason: 'stale' },
      { category: 'commands', id: 'route-id', classification: 'gap', reason: 'disallowed' },
      { category: 'skills', id: 'bm25-only', classification: 'expected_bm25_only', reason: 'duplicate' },
    ],
  };
  const report = auditCoverage({ manifest: manifest(), modeMap: modeMap(), baseline });

  assert.equal(record(report, 'skills', 'bm25-only').classification, 'gap',
    'duplicate baseline identities must never acknowledge a gap');
  assert.equal(record(report, 'agents', 'safe-agent').coverage_status, 'mapped',
    'mapping takes precedence over a baseline acknowledgement');
  assert.equal(record(report, 'commands', 'route-id').classification, 'gap');
  assert.deepEqual(report.baseline_diagnostics.map(item => item.code), [
    'baseline_disallowed_classification', 'baseline_duplicate', 'baseline_stale',
  ]);
});

test('reports typed forward targets without allowing baseline suppression', () => {
  const report = auditCoverage({
    manifest: manifest(),
    modeMap: {
      entries: [
        { id: 'missing-command', invoke_kind: 'slash', mode: 'missing-command' },
        { id: 'missing-skill', invoke_kind: 'skill', recommended_skills: ['no-skill'] },
        { id: 'blocked', invoke_kind: 'agent', recommended_agents: ['blocked-agent'] },
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

test('malformed optional inputs stay visible and acknowledge nothing', () => {
  const report = auditCoverage({ manifest: manifest(), modeMap: { entries: 'bad' }, baseline: { schema_version: 2, entries: {} } });
  assert.ok(report.forward_diagnostics.some(item => item.code === 'mode_map_malformed'));
  assert.ok(report.baseline_diagnostics.some(item => item.code === 'baseline_malformed'));
  assert.ok(report.unacknowledged_gaps.length > 0);
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
      entries: [{ id: 'missing', invoke_kind: 'skill', recommended_skills: ['missing'] }],
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
