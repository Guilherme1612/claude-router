// Fresh-account onboarding: Node inventory manifest builder.
// Verifies the builder port produces a valid manifest on an empty HOME
// (the fresh-account case where the Python builder crashed) and on a
// populated HOME, honors env-var project dirs, and is idempotent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const NODE = process.execPath;
const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));

const TOP_KEYS = [
  'skills', 'plugin_skills', 'agents_store_skills', 'project_scoped_skills',
  'agents', 'hooks', 'commands', 'mcp_servers', 'unwired_mcp_refs',
  'plugins_enabled', 'installed_plugins', 'plugin_manifests', 'marketplaces',
  'project_config', 'plugin_hooks', 'settings', 'claude_md', 'counts',
  'registry_scope', 'generated_at_runtime_note',
];

function freshHome() {
  const root = mkdtempSync(join(tmpdir(), 'router-build-manifest-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  mkdirSync(join(root, '.codex'), { recursive: true });
  return root;
}

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-cache-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

function runBuilder(root, extraEnv = {}) {
  const out = join(root, '.claude', 'router', 'claude-inventory-manifest.json');
  const report = extraEnv.ROUTER_COVERAGE_REPORT_PATH
    || join(root, '.claude', 'router', 'coverage-report.json');
  const env = {
    ROUTER_CLAUDE_HOME: join(root, '.claude'),
    ROUTER_AGENTS_SKILLS_DIR: join(root, '.agents', 'skills'),
    ROUTER_SKILL_LOCK_PATH: join(root, '.agents', '.skill-lock.json'),
    ROUTER_CLAUDE_JSON: join(root, '.claude.json'),
    ROUTER_MANIFEST_OUT: out,
    ...extraEnv,
  };
  const r = spawnSync(NODE, [BUILDER], { env, encoding: 'utf8', timeout: 30_000 });
  return { r, out, report };
}

test('build-manifest: empty HOME → exit 0, valid schema, all-zero counts', () => {
  const root = freshHome();
  try {
    const { r, out } = runBuilder(root);
    assert.equal(r.status, 0, `builder exited ${r.status}: ${r.stderr}`);
    assert.ok(existsSync(out), 'manifest must be written');
    const m = JSON.parse(readFileSync(out, 'utf8'));
    for (const k of TOP_KEYS) assert.ok(Object.hasOwn(m, k), `manifest missing top-level key ${k}`);
    for (const [k, v] of Object.entries(m.counts)) assert.equal(v, 0, `counts.${k} must be 0 on empty HOME`);
    assert.deepEqual(m.skills, []);
    assert.deepEqual(m.agents, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build-manifest: populated HOME → parsed skills/agents/commands + mcp refs', () => {
  const root = freshHome();
  try {
    mkdirSync(join(root, '.claude', 'skills', 'demo'), { recursive: true });
    writeFileSync(join(root, '.claude', 'skills', 'demo', 'SKILL.md'),
      '---\nname: demo\ndescription: demo skill\n---\n<objective>do thing</objective>\nbody');
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(root, '.claude', 'agents', 'bob.md'),
      '---\nname: bob\ndescription: bob agent\ntools: mcp__foo__bar, Bash\n---\nrole text');
    mkdirSync(join(root, '.claude', 'hooks'), { recursive: true });
    writeFileSync(join(root, '.claude', 'hooks', 'h.mjs'), "export {};\n");
    writeFileSync(join(root, '.claude', 'settings.json'),
      JSON.stringify({ hooks: {}, enabledPlugins: {} }) + '\n');
    mkdirSync(join(root, '.claude', 'plugins', 'mp', 'plug', 'commands'), { recursive: true });
    writeFileSync(join(root, '.claude', 'plugins', 'mp', 'plug', 'commands', 'c.md'),
      '---\nname: c\ndescription: a command\n---\ncmd body');

    const { r, out } = runBuilder(root);
    assert.equal(r.status, 0, `builder exited ${r.status}: ${r.stderr}`);
    const m = JSON.parse(readFileSync(out, 'utf8'));
    assert.ok(m.counts.skills >= 1, `skills count ${m.counts.skills}`);
    assert.ok(m.counts.agents >= 1, `agents count ${m.counts.agents}`);
    assert.ok(m.counts.commands >= 1, `commands count ${m.counts.commands}`);
    assert.ok(m.counts.hooks >= 1, `hooks count ${m.counts.hooks}`);
    const bob = m.agents.find(a => a.name === 'bob');
    assert.ok(bob, 'bob agent must be parsed');
    assert.deepEqual(bob.requires_mcp_not_in_manifest, ['foo'],
      `bob mcp refs: ${JSON.stringify(bob.requires_mcp_not_in_manifest)}`);
    assert.ok(m.skills.some(s => s.name === 'demo'), 'demo skill must be parsed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build-manifest: env-var project dirs honored (project_scoped_skills + project mcp + project_config)', () => {
  const root = freshHome();
  try {
    // project-scoped skill
    const proj = join(root, 'proj');
    mkdirSync(join(proj, '.claude', 'skills', 'pskill'), { recursive: true });
    writeFileSync(join(proj, '.claude', 'skills', 'pskill', 'SKILL.md'),
      '---\nname: pskill\ndescription: project skill\n---\nobj');
    // project .mcp.json
    const projMcp = join(root, 'proj.mcp.json');
    writeFileSync(projMcp, JSON.stringify({ mcpServers: { projsrv: { command: 'x' } } }) + '\n');
    // ~/.claude.json project entry
    const cjPath = join(root, '.claude.json');
    writeFileSync(cjPath, JSON.stringify({
      projects: { '/some/proj': { allowedTools: ['Read'], mcpServers: { projsrv2: {} }, enabledMcpjsonServers: ['projsrv2'] } },
    }) + '\n');

    const { r, out } = runBuilder(root, {
      ROUTER_PROJECT_SKILL_DIRS: proj,
      ROUTER_PROJECT_MCP_JSON: projMcp,
      ROUTER_PROJECT_CONFIG_PATH: '/some/proj',
    });
    assert.equal(r.status, 0, `builder exited ${r.status}: ${r.stderr}`);
    const m = JSON.parse(readFileSync(out, 'utf8'));
    assert.ok(m.project_scoped_skills.some(s => s.name === 'pskill' && s.scope === 'project'),
      `project_scoped_skills: ${JSON.stringify(m.project_scoped_skills)}`);
    assert.ok(m.mcp_servers.some(s => s.id === 'projsrv'), 'project mcp server projsrv must appear');
    assert.deepEqual(m.project_config.allowed_tools, ['Read']);
    assert.deepEqual(m.project_config.enabled_mcpjson_servers, ['projsrv2']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build-manifest: idempotent re-run produces identical bytes', () => {
  const root = freshHome();
  try {
    const { r: r1, out } = runBuilder(root);
    assert.equal(r1.status, 0, `first run exited ${r1.status}: ${r1.stderr}`);
    const bytes1 = readFileSync(out, 'utf8');
    const { r: r2 } = runBuilder(root);
    assert.equal(r2.status, 0, `second run exited ${r2.status}: ${r2.stderr}`);
    const bytes2 = readFileSync(out, 'utf8');
    assert.equal(bytes1, bytes2, 'idempotent re-run must produce identical bytes');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('COV-01 build-manifest publishes a deterministic report beside the manifest', () => {
  const root = freshHome();
  try {
    const modeMap = join(root, 'mode-map.json');
    const baseline = join(root, 'coverage-baseline.json');
    writeFileSync(modeMap, JSON.stringify({ schema_version: 2, entries: [] }));
    writeFileSync(baseline, JSON.stringify({ schema_version: 1, entries: [] }));
    const env = { ROUTER_MODE_MAP_PATH: modeMap, ROUTER_COVERAGE_BASELINE_PATH: baseline };

    const { r: first, out, report } = runBuilder(root, env);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(existsSync(out), 'manifest must be published before success');
    assert.ok(existsSync(report), 'coverage report must be published on every successful build');
    const firstBytes = readFileSync(report, 'utf8');
    const parsed = JSON.parse(firstBytes);
    assert.equal(parsed.schema_version, 1);
    assert.ok(Array.isArray(parsed.records));

    const { r: second } = runBuilder(root, env);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(report, 'utf8'), firstBytes, 'equivalent rebuild report bytes must match');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('COV-01 report and baseline overrides isolate malformed fixture inputs', () => withTempDir(root => {
  const report = join(root, 'isolated', 'coverage.json');
  const baseline = join(root, 'malformed-baseline.json');
  const modeMap = join(root, 'malformed-mode-map.json');
  writeFileSync(baseline, '{bad');
  writeFileSync(modeMap, '{bad');

  const { r } = runBuilder(root, {
    ROUTER_COVERAGE_REPORT_PATH: report,
    ROUTER_COVERAGE_BASELINE_PATH: baseline,
    ROUTER_MODE_MAP_PATH: modeMap,
  });
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(readFileSync(report, 'utf8'));
  assert.ok(parsed.baseline_diagnostics.some(item => item.code === 'baseline_malformed'));
  assert.ok(parsed.forward_diagnostics.some(item => item.code === 'mode_map_malformed'));
}));

test('strict coverage fails closed when the route validator is unavailable', () => withTempDir(root => {
  const out = join(root, 'manifest.json');
  const r = spawnSync(NODE, [BUILDER, '--strict-coverage'], {
    env: {
      ROUTER_CLAUDE_HOME: join(root, '.claude'),
      ROUTER_MANIFEST_OUT: out,
      ROUTER_HOOK_PATH: join(root, 'missing-router.mjs'),
    },
    encoding: 'utf8',
    timeout: 30_000,
  });

  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /missing-router\.mjs/);
}));

test('SAF-04 mode-map size guard accepts exactly 30000 bytes', () => withTempDir(root => {
  const modeMap = join(root, 'mode-map.json');
  writeFileSync(modeMap, 'x'.repeat(30_000));
  const { r } = runBuilder(root, { ROUTER_MODE_MAP_PATH: modeMap });
  assert.equal(r.status, 0, r.stderr);
}));

test('SAF-04 mode-map size guard rejects 30001 bytes', () => withTempDir(root => {
  const modeMap = join(root, 'mode-map.json');
  writeFileSync(modeMap, 'x'.repeat(30_001));
  const { r } = runBuilder(root, { ROUTER_MODE_MAP_PATH: modeMap });
  assert.notEqual(r.status, 0, 'builder must fail when mode-map exceeds 30KB');
  assert.match(r.stderr, /mode-map\.json exceeds 30KB: 30001 bytes/);
}));

test('SAF-04 mode-map size guard accepts a typical 15000-byte map', () => withTempDir(root => {
  const modeMap = join(root, 'mode-map.json');
  writeFileSync(modeMap, 'x'.repeat(15_000));
  const { r } = runBuilder(root, { ROUTER_MODE_MAP_PATH: modeMap });
  assert.equal(r.status, 0, r.stderr);
}));

test('SAF-04 builder reuses its sole fileStatSize helper', () => {
  const source = readFileSync(BUILDER, 'utf8');
  assert.equal(source.match(/function fileStatSize\(/g)?.length, 1);
  assert.match(source, /MODE_MAP_SIZE_CEILING/);
});
