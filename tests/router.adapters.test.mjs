import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as claude from '../src/adapters/claude.mjs';
import * as codex from '../src/adapters/codex.mjs';

function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function artifact(type, name, extra = {}) {
  return { schema_version: 1, type, name, invocation: { command: name, args: ['--native'] }, ...extra };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-'));
  const claudeRoot = join(root, 'claude');
  const codexRoot = join(root, 'codex');
  const projectRoot = join(root, 'project');
  const outside = join(root, 'outside-canary.json');
  put(outside, artifact('skill', 'MUST-NOT-BE-READ'));
  for (const [path, value] of [
    ['skills/global.json', artifact('skill', 'global-skill')],
    ['plugins/p/skills/plugin.json', artifact('plugin_skill', 'plugin-skill')],
    ['agents-store/store.json', artifact('agents_store_skill', 'store-skill')],
    ['agents/reviewer.json', artifact('agent', 'reviewer', { dependencies: [{ id: 'mcp:missing', available: false }] })],
    ['commands/ship.json', artifact('command', 'ship')],
    ['hooks/prompt.json', artifact('hook', 'prompt-hook', { invocation: { event: 'UserPromptSubmit', command: 'node', args: ['hook.mjs'] } })],
    ['bindings/router.json', artifact('binding', 'router-binding')],
    ['dependencies/tool.json', artifact('dependency', 'declared-tool')],
  ]) put(join(claudeRoot, path), value);
  put(join(claudeRoot, 'skills', 'broken.json'), '{broken');
  put(join(claudeRoot, 'skills', 'future.json'), { schema_version: 99, type: 'skill', name: 'future' });
  for (const [path, value] of [
    ['skills/plan.json', artifact('skill', 'plan')],
    ['plugins/p/plugin.json', artifact('plugin', 'plugin')],
    ['agents/executor.json', artifact('agent', 'executor')],
    ['hooks/notify.json', artifact('hook', 'notify')],
    ['config/metadata.json', artifact('config', 'metadata')],
    ['mcp/server.json', artifact('mcp', 'server')],
    ['tools/search.json', artifact('tool', 'search')],
    ['models/fast.json', artifact('model', 'fast')],
    ['permissions/default.json', artifact('permission', 'default')],
    ['dependencies/runtime.json', artifact('dependency', 'runtime')],
  ]) put(join(codexRoot, path), value);
  put(join(projectRoot, '.claude', 'skills', 'same.json'), artifact('skill', 'global-skill'));
  put(join(projectRoot, '.codex', 'skills', 'same.json'), artifact('skill', 'plan'));
  symlinkSync(outside, join(claudeRoot, 'skills', 'escape.json'));
  return { root, claudeRoot, codexRoot, projectRoot, outside };
}

function assertContract(adapter) {
  for (const name of ['discoverRoots', 'parseArtifact', 'normalizeArtifact', 'compileInvocation']) {
    assert.equal(typeof adapter[name], 'function', `${name} export`);
  }
}

test('Claude discovers the complete explicit-root matrix with portable provenance', () => {
  const f = fixture();
  try {
    assertContract(claude);
    const result = claude.discoverRoots({ claudeRoot: f.claudeRoot, projectRoot: f.projectRoot });
    assert.deepEqual(new Set(result.observations.map((entry) => entry.type)), new Set([
      'agent', 'agents_store_skill', 'binding', 'command', 'dependency', 'hook', 'plugin_skill', 'skill',
    ]));
    assert.ok(result.observations.some((entry) => entry.scope.kind === 'project'));
    assert.ok(result.observations.every((entry) => entry.provenance.every((p) => !p.logical_root.startsWith('/'))));
    assert.ok(result.observations.every((entry) => !JSON.stringify(entry).includes(f.root)));
    const blocked = result.observations.find((entry) => entry.name === 'reviewer');
    assert.equal(blocked.dispatchable, false);
    assert.equal(blocked.dependencies.state, 'declared');
    assert.ok(result.diagnostics.some((entry) => entry.code === 'malformed_artifact'));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'unsupported_schema'));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'path_escape'));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Codex discovers skills, plugins, agents, hooks, config, MCP, tools, models, permissions, and dependencies', () => {
  const f = fixture();
  try {
    assertContract(codex);
    const result = codex.discoverRoots({ codexRoot: f.codexRoot, projectRoot: f.projectRoot });
    assert.deepEqual(new Set(result.observations.map((entry) => entry.type)), new Set([
      'agent', 'config', 'dependency', 'hook', 'mcp', 'model', 'permission', 'plugin', 'skill', 'tool',
    ]));
    assert.ok(result.observations.some((entry) => entry.scope.kind === 'project'));
    const skill = result.observations.find((entry) => entry.name === 'plan' && entry.scope.kind === 'global');
    assert.deepEqual(codex.compileInvocation(skill), { runtime: 'codex', command: 'plan', args: ['--native'] });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('parse and normalize preserve runtime-native invocation while optional metadata stays unknown', () => {
  const f = fixture();
  try {
    const native = claude.parseArtifact(join(f.claudeRoot, 'commands', 'ship.json'), {
      root: f.claudeRoot, logicalRoot: 'claude_global', scope: { kind: 'global' },
    });
    const normalized = claude.normalizeArtifact(native);
    assert.equal(normalized.description, null);
    assert.deepEqual(normalized.runtime_variants[0].native_invocation, { command: 'ship', args: ['--native'] });
    assert.deepEqual(claude.compileInvocation(normalized), { runtime: 'claude', command: 'ship', args: ['--native'] });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('discovery is deterministic across root and traversal permutations and never consumes the outside canary', () => {
  const f = fixture();
  try {
    const first = claude.discoverRoots({ claudeRoot: f.claudeRoot, projectRoot: f.projectRoot });
    const second = claude.discoverRoots({ projectRoot: f.projectRoot, claudeRoot: f.claudeRoot });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(readFileSync(f.outside, 'utf8').includes('MUST-NOT-BE-READ'), true);
    assert.equal(first.observations.some((entry) => entry.name === 'MUST-NOT-BE-READ'), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('core discovery requires explicit runtime roots', () => {
  assert.throws(() => claude.discoverRoots({}), /claudeRoot is required/);
  assert.throws(() => codex.discoverRoots({}), /codexRoot is required/);
});
