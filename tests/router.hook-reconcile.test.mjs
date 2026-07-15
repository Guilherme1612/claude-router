import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as claude from '../src/adapters/claude.mjs';
import * as codex from '../src/adapters/codex.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

export function hookFile(overrides = {}) {
  return { runtime: 'claude', event: 'UserPromptSubmit', logical_root: 'claude_global', relative_path: 'hooks/router.mjs', native_identity: 'hook:router', ...overrides };
}

export function hookBinding(overrides = {}) {
  return { runtime: 'claude', event: 'UserPromptSubmit', command: 'hooks/router.mjs', args: [], native_identity: 'binding:router', ...overrides };
}

export function permuteHookInventory(files, bindings) {
  return [
    { files, bindings },
    { files: [...files].reverse(), bindings: [...bindings].reverse() },
  ];
}

test('portable hook fixture builders are deterministic under input permutation', () => {
  const files = [hookFile(), hookFile({ event: 'Stop', native_identity: 'hook:stop' })];
  const bindings = [hookBinding(), hookBinding({ event: 'Stop', native_identity: 'binding:stop' })];
  const normalized = permuteHookInventory(files, bindings).map(value => stableStringify({
    files: [...value.files].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    bindings: [...value.bindings].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
  }));
  assert.equal(new Set(normalized).size, 1);
  assert.doesNotMatch(normalized[0], /\/Users\/|[A-Za-z]:\\\\/);
});

function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

test('Claude and Codex adapters expose portable structured hook file and binding observations', () => {
  const root = mkdtempSync(join(tmpdir(), 'hook-native-matrix-'));
  try {
    const claudeRoot = join(root, 'claude'), codexRoot = join(root, 'codex');
    put(join(claudeRoot, 'hooks/prompt.json'), { schema_version: 1, name: 'prompt', event: 'UserPromptSubmit', command: 'node', args: ['hooks/prompt.mjs'] });
    put(join(claudeRoot, 'settings.json'), { schema_version: 1, hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node hooks/prompt.mjs' }] }] } });
    put(join(codexRoot, 'hooks/notify.json'), { schema_version: 1, name: 'notify', event: 'after_turn', command: 'node', args: ['hooks/notify.mjs'] });
    put(join(codexRoot, 'bindings/notify.json'), { schema_version: 1, name: 'notify-binding', event: 'after_turn', command: 'node', args: ['hooks/notify.mjs'] });
    const observations = [...claude.discoverRoots({ claudeRoot }).observations, ...codex.discoverRoots({ codexRoot }).observations]
      .filter(value => value.hook_observation);
    assert.equal(observations.filter(value => value.hook_observation.kind === 'file').length, 2);
    assert.equal(observations.filter(value => value.hook_observation.kind === 'binding').length, 2);
    for (const record of observations) {
      assert.ok(['claude', 'codex'].includes(record.hook_observation.runtime));
      assert.ok(record.hook_observation.event);
      assert.match(record.hook_observation.target_ref, /^hooks\//);
      assert.ok(record.hook_observation.source_fingerprint);
      assert.doesNotMatch(stableStringify(record.hook_observation), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unsupported shell binding syntax remains non-dispatchable evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'hook-unsupported-'));
  try {
    put(join(root, 'settings.json'), { schema_version: 1, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node hooks/a.mjs | sh' }] }] } });
    const result = claude.discoverRoots({ claudeRoot: root });
    const binding = result.observations.find(value => value.type === 'binding');
    assert.equal(binding.dispatchable, false);
    assert.equal(binding.hook_observation.valid, false);
    assert.equal(binding.hook_observation.reason, 'unsupported_command_form');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
