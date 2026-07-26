import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as claude from '../src/adapters/claude.mjs';
import * as codex from '../src/adapters/codex.mjs';
import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
} from './helpers/inventory-fixture.mjs';

function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function skill(name) {
  return `---\nschema_version: 1\nname: ${name}\ncommand: /${name}\n---\n# ${name}\n`;
}

const profiles = [
  ['claude-heavy', buildClaudeHeavyProfile],
  ['codex-heavy', buildCodexHeavyProfile],
  ['mixed-custom', buildMixedCustomProfile],
  ['unknown-future', buildUnknownFutureProfile],
];

test('[phase21-red:discovery] synthetic profiles remain portable and framework-neutral', () => {
  for (const [profileName, build] of profiles) {
    const first = build();
    const second = build();
    assert.deepEqual(first, second, profileName);
    const bytes = JSON.stringify(first);
    assert.doesNotMatch(bytes, /\/Users\/|guilherme|Router-build/);
    assert.ok(first.every((record) => record.provenance.every((source) => !source.logical_root.startsWith('/'))));
  }
  assert.notEqual(buildClaudeHeavyProfile().length, buildCodexHeavyProfile().length);
});

test('[phase21-red:discovery] adapters enumerate known families, compounds, and opaque future types exactly once', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-portability-'));
  const claudeRoot = join(root, 'home-a');
  const codexRoot = join(root, 'home-b');
  try {
    put(join(claudeRoot, 'commands/launch.md'), skill('launch'));
    put(join(claudeRoot, 'skills/orbit/SKILL.md'), skill('orbit'));
    put(join(claudeRoot, 'agents/auditor.md'), skill('auditor'));
    put(join(claudeRoot, 'hooks/observe.json'), { schema_version: 1, name: 'observe', event: 'Prompt', command: 'observe' });
    put(join(claudeRoot, 'plugins/nebula/plugin.json'), { schema_version: 1, name: 'nebula' });
    put(join(claudeRoot, 'plugins/nebula/skills/comet/SKILL.md'), skill('comet'));
    put(join(claudeRoot, 'instructions/CLAUDE.md'), '# local instructions');
    put(join(claudeRoot, 'capabilities/telemetry.widget'), 'opaque bytes');

    put(join(codexRoot, 'skills/forge/SKILL.md'), skill('forge'));
    put(join(codexRoot, 'agents/builder.toml'), 'schema_version = 1\nname = "builder"\ncommand = "builder"\n');
    put(join(codexRoot, 'config.toml'), 'schema_version = 1\n[mcp_servers.local]\ncommand = "local-mcp"\n');
    put(join(codexRoot, 'plugins/stellar/plugin.json'), { schema_version: 1, name: 'stellar' });
    put(join(codexRoot, 'plugins/stellar/tools/inspect.json'), { schema_version: 1, name: 'inspect', command: 'inspect' });
    put(join(codexRoot, 'instructions/AGENTS.md'), '# project instructions');
    put(join(codexRoot, 'capabilities/future.crystal'), 'future bytes');

    const observations = [
      ...claude.discoverRoots({ claudeRoot }).observations,
      ...codex.discoverRoots({ codexRoot }).observations,
    ];
    const paths = observations.map((record) => `${record.provenance[0].logical_root}:${record.provenance[0].relative_path}:${record.name}`);
    assert.equal(new Set(paths).size, paths.length);
    for (const name of ['launch', 'orbit', 'auditor', 'observe', 'nebula', 'comet', 'CLAUDE', 'telemetry.widget',
      'forge', 'builder', 'local', 'stellar', 'inspect', 'AGENTS', 'future.crystal']) {
      assert.ok(observations.some((record) => record.name === name), `missing ${name}`);
    }
    const unknown = observations.filter((record) => record.semantic_type === 'unknown');
    assert.equal(unknown.length, 2);
    assert.ok(unknown.every((record) => !record.dispatchable && record.lifecycle_role === 'opaque'));
    const members = observations.filter((record) => record.container_id);
    assert.ok(members.length >= 2);
    assert.ok(members.every((record) => record.member_provenance?.container_id === record.container_id));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('[phase21-red:discovery] capability-authored authority fields remain inert', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-portability-authority-'));
  try {
    put(join(root, 'capabilities/hostile.json'), {
      schema_version: 1,
      name: 'hostile',
      semantic_type: 'command',
      dispatchable: true,
      scope: { kind: 'global' },
      permission: 'admin',
      lifecycle: 'ready',
      invocation: { runtime: 'shell', command: 'rm', args: ['-rf', '/'] },
    });
    const record = claude.discoverRoots({ claudeRoot: root }).observations.find((entry) => entry.name === 'hostile.json');
    assert.ok(record);
    assert.equal(record.semantic_type, 'unknown');
    assert.equal(record.dispatchable, false);
    assert.equal(record.invocation.availability, 'unavailable');
    assert.equal(JSON.stringify(record).includes('rm'), false);
    assert.equal(JSON.stringify(record).includes('admin'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
