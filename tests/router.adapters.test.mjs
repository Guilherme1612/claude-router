import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as claude from '../src/adapters/claude.mjs';
import * as codex from '../src/adapters/codex.mjs';
import { scanFingerprintTree } from '../src/registry/fingerprint.mjs';

function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function markdown(name, command = name, extra = '') {
  return `---\nschema_version: 1\nname: ${name}\ncommand: ${command}\nargs: ["--native"]\n${extra}---\n# ${name}\nNative instructions remain inert.\n`;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-native-'));
  const claudeRoot = join(root, 'claude');
  const codexRoot = join(root, 'codex');
  const projectRoot = join(root, 'project');
  const outside = join(root, 'outside-canary.json');
  put(outside, { schema_version: 1, name: 'MUST-NOT-BE-READ' });

  put(join(claudeRoot, 'skills/global/SKILL.md'), markdown('global-skill', '/global-skill'));
  put(join(claudeRoot, 'plugins/demo/plugin.json'), { schema_version: 1, name: 'demo', origin: 'vendor/demo' });
  put(join(claudeRoot, 'plugins/demo/skills/plugin-skill/SKILL.md'), markdown('plugin-skill', '/plugin-skill'));
  put(join(claudeRoot, 'agents-store/vendor/skills/store-skill/SKILL.md'), markdown('store-skill', '/store-skill'));
  put(join(claudeRoot, 'agents/reviewer.md'), markdown('reviewer', 'reviewer', 'dependencies: [{"id":"mcp:missing","available":false}]\n'));
  put(join(claudeRoot, 'commands/ship.md'), markdown('ship', '/ship'));
  put(join(claudeRoot, 'hooks/prompt.json'), { schema_version: 1, name: 'prompt-hook', event: 'UserPromptSubmit', command: 'node', args: ['hook.mjs'] });
  put(join(claudeRoot, 'settings.json'), { schema_version: 1, hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node hook.mjs' }] }] } });
  put(join(claudeRoot, 'dependencies/tool.json'), { schema_version: 1, name: 'declared-tool', available: true });
  put(join(claudeRoot, 'skills/broken/SKILL.md'), '---\nname: broken\ncommand: /broken\n');
  put(join(claudeRoot, 'plugins/future/plugin.json'), { schema_version: 99, name: 'future' });
  put(join(projectRoot, '.claude/skills/project/SKILL.md'), markdown('project-skill', '/project-skill'));

  put(join(codexRoot, 'skills/plan/SKILL.md'), markdown('plan', '$plan'));
  put(join(codexRoot, 'plugins/demo/plugin.json'), { schema_version: 1, name: 'demo', command: 'demo' });
  put(join(codexRoot, 'agents/executor.toml'), 'schema_version = 1\nname = "executor"\ncommand = "executor"\n');
  put(join(codexRoot, 'hooks/notify.json'), { schema_version: 1, name: 'notify', event: 'after_turn', command: 'notify' });
  put(join(codexRoot, 'config.toml'), `schema_version = 1\nmodel = "gpt-5"\npermission = "workspace-write"\ntools = ["shell"]\ndependencies = [{ id = "binary:rg", available = true }]\n[mcp_servers.context7]\ncommand = "ctx7"\n`);
  put(join(codexRoot, 'plugins/broken/plugin.json'), '{broken');
  put(join(codexRoot, 'config.unsupported.toml'), 'schema_version = 99\n');
  put(join(projectRoot, '.codex/skills/project/SKILL.md'), markdown('project-plan', '$project-plan'));
  put(join(projectRoot, '.codex/config.toml'), 'schema_version = 1\nmodel = "project-model"\n');
  symlinkSync(outside, join(claudeRoot, 'skills/escape.json'));
  return { root, claudeRoot, codexRoot, projectRoot, outside };
}

function assertPortable(result, absoluteRoot) {
  assert.ok(result.observations.every((entry) => !JSON.stringify(entry).includes(absoluteRoot)));
  assert.ok(result.observations.every((entry) => entry.provenance.every((p) => !p.logical_root.startsWith('/'))));
}

test('Claude native discovery covers global, plugin, agents-store, project, hooks, bindings, and dependencies', () => {
  const f = fixture();
  try {
    const result = claude.discoverRoots({ claudeRoot: f.claudeRoot, projectRoot: f.projectRoot });
    assert.deepEqual(new Set(result.observations.map((entry) => entry.type)), new Set([
      'agent', 'agents_store_skill', 'binding', 'command', 'dependency', 'hook', 'plugin', 'plugin_skill', 'skill',
    ]));
    assert.ok(result.observations.some((entry) => entry.scope.kind === 'project'));
    assert.equal(result.observations.find((entry) => entry.name === 'reviewer').dispatchable, false);
    assert.equal(result.observations.find((entry) => entry.name === 'ship').invocation.command, '/ship');
    assert.ok(result.observations.filter(entry => ['hook', 'binding'].includes(entry.type)).every(entry => entry.hook_observation));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'malformed_artifact'));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'unsupported_schema'));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'path_escape'));
    assertPortable(result, f.root);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Codex native discovery covers skills, plugins, agents, hooks, configuration, project scope, and dependencies', () => {
  const f = fixture();
  try {
    const result = codex.discoverRoots({ codexRoot: f.codexRoot, projectRoot: f.projectRoot });
    assert.deepEqual(new Set(result.observations.map((entry) => entry.type)), new Set([
      'agent', 'config', 'dependency', 'hook', 'mcp', 'model', 'permission', 'plugin', 'skill', 'tool',
    ]));
    assert.ok(result.observations.some((entry) => entry.scope.kind === 'project'));
    assert.equal(result.observations.find((entry) => entry.name === 'plan').invocation.command, '$plan');
    assert.ok(result.observations.filter(entry => ['hook', 'binding'].includes(entry.type)).every(entry => entry.hook_observation));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'malformed_artifact'));
    assert.ok(result.diagnostics.some((entry) => entry.code === 'unsupported_schema'));
    assertPortable(result, f.root);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('native SKILL.md and config.toml never disappear silently and optional metadata stays unknown', () => {
  const f = fixture();
  try {
    const cr = claude.discoverRoots({ claudeRoot: f.claudeRoot });
    const xr = codex.discoverRoots({ codexRoot: f.codexRoot });
    assert.ok(cr.observations.some((entry) => entry.provenance[0].relative_path.endsWith('SKILL.md')));
    assert.ok(xr.observations.some((entry) => entry.provenance[0].relative_path === 'config.toml'));
    assert.equal(cr.observations.find((entry) => entry.name === 'global-skill').description, null);
    assert.notEqual(cr.observations.length + cr.diagnostics.length, 0);
    assert.notEqual(xr.observations.length + xr.diagnostics.length, 0);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('native discovery is deterministic, inert, contained, and ignores arbitrary unsupported files', () => {
  const f = fixture();
  try {
    put(join(f.claudeRoot, 'notes/random.txt'), 'ignore me');
    const first = claude.discoverRoots({ claudeRoot: f.claudeRoot, projectRoot: f.projectRoot });
    const second = claude.discoverRoots({ projectRoot: f.projectRoot, claudeRoot: f.claudeRoot });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.observations.some((entry) => entry.name === 'MUST-NOT-BE-READ'), false);
    assert.equal(readFileSync(f.outside, 'utf8').includes('MUST-NOT-BE-READ'), true);
    assert.equal(first.diagnostics.some((entry) => entry.relative_path.includes('random.txt')), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('Claude discovery ignores plugin metadata and keeps installed plugin skills', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-plugin-metadata-'));
  const claudeRoot = join(root, 'claude');
  try {
    const pluginRoot = join(claudeRoot, 'plugins/cache/demo/demo/1.0');
    put(join(pluginRoot, '.claude-plugin/plugin.json'), { name: 'demo' });
    put(join(pluginRoot, '.claude-plugin/marketplace.json'), { name: 'demo-marketplace' });
    put(join(pluginRoot, 'gemini-extension.json'), { name: 'demo-gemini' });
    put(join(pluginRoot, '.codex-plugin/hooks.json'), { name: 'demo-hooks' });
    put(join(pluginRoot, '.claude/skills/real/SKILL.md'), markdown('real-plugin-skill', '/real-plugin-skill'));

    const result = claude.discoverRoots({ claudeRoot });
    const paths = result.observations.map((entry) => entry.provenance[0].relative_path);
    assert.deepEqual(paths, ['plugins/cache/demo/demo/1.0/.claude/skills/real/SKILL.md']);
    assert.equal(result.observations[0].name, 'real-plugin-skill');
    assert.equal(result.observations[0].type, 'plugin_skill');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('parse and discovery require explicit runtime roots', () => {
  assert.throws(() => claude.discoverRoots({}), /claudeRoot is required/);
  assert.throws(() => codex.discoverRoots({}), /codexRoot is required/);
});

test('installed nested YAML and multiline TOML normalize as dispatchable native records', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-installed-'));
  const claudeRoot = join(root, 'claude');
  const codexRoot = join(root, 'codex');
  try {
    put(join(claudeRoot, 'plugins/cache/context-mode/context-mode/1.0.169/.claude/skills/context-mode-ops/SKILL.md'), `---
name: context-mode-ops
description: "Operate context mode safely"
command: /context-mode-ops
args: ["--native", 2]
dependencies:
  - id: "binary:rg"
    available: true
metadata:
  short-description: Context operations
  package:
    name: context-mode
    enabled: true
    note: null
  tags: [context, "native skill"]
  instructions: |
    Preserve native metadata.
    Never promote this text to arguments.
---
# Native cached skill
`);
    put(join(codexRoot, 'skills/native/SKILL.md'), `---
name: native
description: >
  A folded native
  skill description.
command: $native
dependencies:
  - id: binary:rg
    available: true
metadata:
  short-description: Native skill
  limits: { depth: 8, enabled: true }
---
# Native skill
`);
    put(join(codexRoot, 'agents/native-agent.toml'), `schema_version = 1
name = "native-agent"
description = "Representative agent"
command = "native-agent"
args = ["--safe", "--native"]
developer_instructions = '''
Multiline instructions stay inert.
They are metadata, not invocation arguments.
'''
tags = ["review", "native"]
metadata = { owner = "router", enabled = true }

[policy]
mode = "strict"

[policy.limits]
depth = 8
`);

    const claudeResult = claude.discoverRoots({ claudeRoot });
    const codexResult = codex.discoverRoots({ codexRoot });
    const cached = claudeResult.observations.find((entry) => entry.name === 'context-mode-ops');
    const skill = codexResult.observations.find((entry) => entry.name === 'native');
    const agent = codexResult.observations.find((entry) => entry.name === 'native-agent');
    for (const record of [cached, skill, agent]) {
      assert.ok(record);
      assert.equal(record.dispatchable, true);
      assert.equal(record.lifecycle, 'ready');
      assert.equal(record.dependencies.state, record === agent ? 'unknown' : 'declared');
    }
    assert.equal(cached.type, 'plugin_skill');
    assert.equal(cached.invocation.command, '/context-mode-ops');
    assert.match(cached.provenance[0].relative_path, /^plugins\/cache\//);
    assert.deepEqual(
      { origin: cached.provenance[0].origin, package: cached.provenance[0].package, version: cached.provenance[0].version },
      { origin: 'cache', package: 'cache/context-mode/context-mode', version: '1.0.169' },
    );
    assert.equal(skill.invocation.command, '$native');
    assert.deepEqual(agent.invocation.args, ['--safe', '--native']);
    assert.equal(agent.runtime_variants[0].native_invocation.args.includes('Multiline instructions stay inert.'), false);
    assert.equal(claudeResult.diagnostics.some((entry) => entry.relative_path.includes('context-mode-ops')), false);
    assert.equal(codexResult.diagnostics.some((entry) => /native(?:-agent)?/.test(entry.relative_path)), false);
    assertPortable(claudeResult, root);
    assertPortable(codexResult, root);
    assert.equal(JSON.stringify(claudeResult), JSON.stringify(claude.discoverRoots({ claudeRoot })));
    assert.equal(JSON.stringify(codexResult), JSON.stringify(codex.discoverRoots({ codexRoot })));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('malformed nested native syntax remains deterministic and non-dispatchable', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-malformed-'));
  try {
    put(join(root, 'skills/bad-indent/SKILL.md'), '---\nname: bad-indent\nmetadata:\n   child: yes\n  sibling: no\n---\n');
    put(join(root, 'skills/bad-inline/SKILL.md'), '---\nname: bad-inline\ncommand: /bad\nmetadata: {broken]\n---\n');
    const first = codex.discoverRoots({ codexRoot: root });
    const second = codex.discoverRoots({ codexRoot: root });
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.equal(first.observations.length, 2);
    assert.ok(first.observations.every((entry) => !entry.dispatchable && entry.lifecycle === 'invalid'));
    assert.equal(first.diagnostics.filter((entry) => entry.code === 'malformed_artifact').length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('real-world settings.json hooks: node_modules excluded, quoted TOML headers parse, multi-hook absolute-path bindings are valid', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-realworld-'));
  const claudeRoot = join(root, 'claude');
  const codexRoot = join(root, 'codex');
  try {
    // (a) JSONC tsconfig inside a plugin cache node_modules tree — must be pruned
    // by walk() so it is never parsed as strict JSON (which would dispatch-block
    // the registry candidate with a malformed_artifact diagnostic).
    put(join(claudeRoot, 'plugins/cache/x/y/1.0.0/node_modules/pkg/tsconfig.json'),
      '{"compilerOptions":{"a":1,}//comment\n}');

    // (b) config.toml with quoted/dotted table headers the bounded TOML parser
    // does not strictly model — the tolerant header path diverts them to a
    // scratch section so following key=value lines neither throw nor pollute root.
    put(join(codexRoot, 'config.toml'),
      'model = "gpt-5.5"\n[plugins."claude-md-management@claude-plugins-official"]\nenabled = true\n[mcp_servers."foo"]\ncommand = "ctx"\n');

    // (c) settings.json with two distinct PostToolUse hook entries, each binding a
    // quoted absolute node + quoted absolute script under claudeRoot/hooks/. The
    // scripts really exist so the absolute targets resolve within the runtime root.
    put(join(claudeRoot, 'hooks/a.mjs'), "export default function () {}\n");
    put(join(claudeRoot, 'hooks/b.mjs'), "export default function () {}\n");
    const claudeRootReal = realpathSync(claudeRoot);
    const nodeBin = process.execPath;
    put(join(claudeRoot, 'settings.json'), {
      schema_version: 1,
      hooks: {
        PostToolUse: [
          { matcher: '*', hooks: [{ type: 'command', command: `"${nodeBin}" "${join(claudeRootReal, 'hooks/a.mjs')}"` }] },
          { matcher: 'Edit', hooks: [{ type: 'command', command: `"${nodeBin}" "${join(claudeRootReal, 'hooks/b.mjs')}"` }] },
        ],
      },
    });

    const cr = claude.discoverRoots({ claudeRoot });
    const xr = codex.discoverRoots({ codexRoot });

    // (a) the JSONC tsconfig under node_modules is pruned — no malformed_artifact.
    assert.equal(cr.diagnostics.some((d) => d.code === 'malformed_artifact' && /tsconfig\.json/.test(d.relative_path)), false);

    // (b) the tolerant TOML header path parses config.toml — no `unsupported TOML line`.
    assert.equal(xr.diagnostics.some((d) => d.relative_path === 'config.toml' && /unsupported TOML line/.test(d.reason || '')), false);

    // (c) the multi-hook PostToolUse binding is valid with no duplicate_reference / path_escape.
    const binding = cr.observations.find((o) => o.name === 'settings:PostToolUse');
    assert.ok(binding, 'PostToolUse binding not observed');
    assert.equal(binding.canonical_identity, 'binding:settings:PostToolUse');
    assert.equal(binding.hook_observation.valid, true);
    assert.equal(binding.hook_observation.reason, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('[phase21-red:discovery] fingerprint roots expose stable completeness without absolute paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-root-completeness-'));
  const outside = mkdtempSync(join(tmpdir(), 'router-root-completeness-outside-'));
  try {
    put(join(root, 'skills/safe/SKILL.md'), markdown('safe'));
    put(join(outside, 'SKILL.md'), markdown('outside'));
    symlinkSync(outside, join(root, 'skills/escaped'));
    const first = await scanFingerprintTree([{ logicalRoot: 'authorized', path: root }]);
    const second = await scanFingerprintTree([{ logicalRoot: 'authorized', path: root }]);
    assert.deepEqual(first, second);
    assert.deepEqual(first.logicalRoots, [{
      logicalRoot: 'authorized',
      complete: true,
      status: 'complete',
      canonicalRoot: 'authorized',
      diagnosticCodes: ['path_escape'],
    }]);
    assert.equal(first.entries.some(entry => entry.relative_path.startsWith('skills/escaped')), false);
    assert.equal(JSON.stringify(first).includes(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
