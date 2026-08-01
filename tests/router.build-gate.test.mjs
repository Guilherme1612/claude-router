import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE = process.execPath;
const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));
const LIVE_HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');

function fixtureEntries(resolve) {
  return [
    {
      id: 'debug-route',
      invoke_kind: 'slash',
      mode: 'gsd-debug',
      resolve,
      signal_patterns: ['debug'],
      recommended_skills: [],
      recommended_agents: [],
    },
    {
      id: 'systematic-debugging-route',
      invoke_kind: 'slash',
      mode: 'systematic-debugging',
      signal_patterns: ['systematic debug'],
      recommended_skills: [],
      recommended_agents: [],
    },
  ];
}

function runBuilder(modeMap, strict = true) {
  const root = mkdtempSync(join(tmpdir(), 'router-build-gate-'));
  try {
    const claude = join(root, '.claude');
    const commands = join(claude, 'plugins', 'gsp', 'commands');
    const agentsSkills = join(root, 'agents-skills');
    const modeMapPath = join(root, 'mode-map.json');
    const baselinePath = join(root, 'coverage-baseline.json');
    const weightsPath = join(root, 'weights.json');
    const manifestPath = join(root, 'manifest.json');
    const reportPath = join(root, 'coverage-report.json');
    const claudeJsonPath = join(root, 'claude.json');

    mkdirSync(commands, { recursive: true });
    mkdirSync(agentsSkills, { recursive: true });
    for (const name of ['gsd-debug', 'systematic-debugging']) {
      writeFileSync(join(commands, `${name}.md`),
        `---\nname: ${name}\ndescription: fixture command\n---\nfixture\n`);
    }
    writeFileSync(modeMapPath, JSON.stringify(modeMap));
    writeFileSync(baselinePath, JSON.stringify({ schema_version: 1, entries: [] }));
    writeFileSync(weightsPath, JSON.stringify({}));
    writeFileSync(claudeJsonPath, JSON.stringify({}));

    const result = spawnSync(NODE, [BUILDER, ...(strict ? ['--strict-coverage'] : [])], {
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        ROUTER_CLAUDE_HOME: claude,
        ROUTER_AGENTS_SKILLS_DIR: agentsSkills,
        ROUTER_CLAUDE_JSON: claudeJsonPath,
        ROUTER_MANIFEST_OUT: manifestPath,
        ROUTER_MODE_MAP_PATH: modeMapPath,
        ROUTER_WEIGHTS_PATH: weightsPath,
        ROUTER_COVERAGE_BASELINE_PATH: baselinePath,
        ROUTER_COVERAGE_REPORT_PATH: reportPath,
        ROUTER_HOOK_PATH: LIVE_HOOK,
      },
    });
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    return { result, report };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('strict coverage fails on a near-tie even when route coverage itself is clean', () => {
  const { result, report } = runBuilder({
    schema_version: 4,
    entries: fixtureEntries([
      { name: 'gsd-debug', weight: 1.0 },
      { name: 'systematic-debugging', weight: 0.98 },
    ]),
  });

  assert.equal(report.forward_diagnostics.length, 0,
    'the crafted route must pass coverage validation so tie-lint is the only failure');
  assert.equal(result.status, 1, `strict gate must fail: ${result.stderr}`);
  assert.match(result.stderr, /near_tie/);
});

test('strict coverage accepts a clean wide-gap mode-map', () => {
  const { result, report } = runBuilder({
    schema_version: 4,
    entries: fixtureEntries([
      { name: 'gsd-debug', weight: 1.0 },
      { name: 'systematic-debugging', weight: 0.9 },
    ]),
  });

  assert.equal(result.status, 0, `clean strict build must pass: ${result.stderr}`);
  assert.equal(report.forward_diagnostics.length, 0);
  assert.equal(report.quarantined_diagnostics.length, 0);
});

test('strict coverage blocks a stale route with no resolvable primary or member', () => {
  const { result, report } = runBuilder({
    schema_version: 4,
    entries: [
      ...fixtureEntries([{ name: 'gsd-debug', weight: 1.0 }]),
      {
        id: 'stale-route',
        invoke_kind: 'slash',
        mode: 'ghost-mode',
        resolve: [{ name: 'ghost-capability', weight: 1.0 }],
        signal_patterns: ['stale'],
        recommended_skills: [],
        recommended_agents: [],
      },
    ],
  });

  assert.equal(result.status, 1, `stale route must fail: ${result.stderr}`);
  assert.match(result.stderr, /stale_target/);
  assert.ok(report.forward_diagnostics.some(item =>
    item.code === 'stale_target' && item.target === 'ghost-capability'));
});

test('strict coverage allows a resolvable route with an absent optional fallback', () => {
  const { result, report } = runBuilder({
    schema_version: 4,
    entries: [
      ...fixtureEntries([
        { name: 'gsd-debug', weight: 1.0 },
        { name: 'ghost-capability', weight: 0.9 },
      ]),
    ],
  });

  assert.equal(result.status, 0, `resolvable fallback must not fail: ${result.stderr}`);
  assert.match(result.stderr, /stale_target/);
  assert.ok(report.quarantined_diagnostics.some(item =>
    item.code === 'quarantined_fallback' && item.target === 'ghost-capability'));
  assert.ok(!report.forward_diagnostics.some(item => item.target === 'ghost-capability'));
});

test('non-strict builds report tie-lint violations without failing', () => {
  const { result } = runBuilder({
    schema_version: 4,
    entries: fixtureEntries([
      { name: 'gsd-debug', weight: 1.0 },
      { name: 'systematic-debugging', weight: 0.98 },
    ]),
  }, false);

  assert.equal(result.status, 0, `non-strict build must remain fail-open: ${result.stderr}`);
  assert.match(result.stderr, /near_tie/);
});
