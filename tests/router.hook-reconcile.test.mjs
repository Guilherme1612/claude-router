import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as claude from '../src/adapters/claude.mjs';
import * as codex from '../src/adapters/codex.mjs';
import { reconcileHookInventory } from '../src/registry/hook-reconcile.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

export function hookFile(overrides = {}) {
  return { schema_version: 1, kind: 'file', runtime: 'claude', scope: { kind: 'global' }, event: 'UserPromptSubmit', logical_root: 'claude_global', relative_path: 'hooks/router.json', source_fingerprint: 'sha:file', target_ref: 'hooks/router.mjs', command: 'node', args: ['hooks/router.mjs'], valid: true, ...overrides };
}

export function hookBinding(overrides = {}) {
  return { schema_version: 1, kind: 'binding', runtime: 'claude', scope: { kind: 'global' }, event: 'UserPromptSubmit', logical_root: 'claude_global', relative_path: 'settings.json', source_fingerprint: 'sha:binding', target_ref: 'hooks/router.mjs', command: 'node', args: ['hooks/router.mjs'], valid: true, ...overrides };
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

test('full outer join classifies valid pairs and both orphan directions without synthesis', () => {
  const valid = reconcileHookInventory([hookFile(), hookBinding()]);
  assert.deepEqual(valid.classifications.map(value => value.classification), ['valid_pair']);
  assert.equal(valid.classifications[0].active, false);
  assert.deepEqual(valid.verdicts, []);

  const orphanFile = reconcileHookInventory([hookFile()]);
  assert.deepEqual(orphanFile.classifications.map(value => value.classification), ['orphan_file']);
  assert.equal(orphanFile.classifications.some(value => value.binding), false);
  assert.equal(orphanFile.verdicts[0].code, 'hook_orphan_file');

  const orphanBinding = reconcileHookInventory([hookBinding()]);
  assert.deepEqual(orphanBinding.classifications.map(value => value.classification), ['orphan_binding']);
  assert.equal(orphanBinding.classifications.some(value => value.file), false);
  assert.equal(orphanBinding.verdicts[0].code, 'hook_orphan_binding');
});

test('orphan binding relaxes to advisory when target hook script exists on disk (gate 6 fix)', () => {
  const root = mkdtempSync(join(tmpdir(), 'hook-advisory-'));
  try {
    mkdirSync(join(root, 'hooks'), { recursive: true });
    writeFileSync(join(root, 'hooks', 'router.mjs'), '// hook\n');
    const result = reconcileHookInventory([hookBinding()], { runtimeRoots: { claude: root } });
    assert.deepEqual(result.classifications.map(value => value.classification), ['binding_without_descriptor']);
    assert.equal(result.verdicts[0].code, 'hook_binding_without_descriptor');
    assert.equal(result.verdicts[0].dispatchable, true);
    assert.equal(result.verdicts[0].severity, 'dispatch-advisory');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('orphan binding stays corrective when target hook script is absent (gate 6 fix safety)', () => {
  const root = mkdtempSync(join(tmpdir(), 'hook-missing-'));
  try {
    const result = reconcileHookInventory([hookBinding()], { runtimeRoots: { claude: root } });
    assert.deepEqual(result.classifications.map(value => value.classification), ['orphan_binding']);
    assert.equal(result.verdicts[0].code, 'hook_orphan_binding');
    assert.equal(result.verdicts[0].dispatchable, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('duplicates mismatch malformed escape runtime and scope isolation fail closed deterministically', () => {
  const cases = [
    { code: 'hook_ambiguous', observations: [hookFile(), hookFile({ source_fingerprint: 'sha:duplicate' }), hookBinding()] },
    { code: 'hook_invocation_mismatch', observations: [hookFile(), hookBinding({ target_ref: 'hooks/other.mjs', args: ['hooks/other.mjs'] })] },
    { code: 'hook_invalid_observation', observations: [hookFile({ valid: false, reason: 'path_escape', target_ref: null })] },
    { code: 'hook_orphan_file', observations: [hookFile(), hookBinding({ runtime: 'codex', logical_root: 'codex_home' })] },
    { code: 'hook_orphan_file', observations: [hookFile(), hookBinding({ scope: { kind: 'project', repository: 'repo:x', worktree: 'main' } })] },
  ];
  for (const row of cases) {
    const outputs = [row.observations, [...row.observations].reverse()].map(reconcileHookInventory);
    assert.equal(stableStringify(outputs[0]), stableStringify(outputs[1]), row.code);
    assert.ok(outputs[0].verdicts.some(value => value.code === row.code), row.code);
    assert.ok(outputs[0].verdicts.every(value => value.dispatchable === false && value.corrective_action));
  }
});

test('both runtime valid pairs remain separate inactive consistency evidence', () => {
  const observations = [
    hookFile(), hookBinding(),
    hookFile({ runtime: 'codex', logical_root: 'codex_home', event: 'after_turn', relative_path: 'hooks/notify.json', target_ref: 'hooks/notify.mjs' }),
    hookBinding({ runtime: 'codex', logical_root: 'codex_home', event: 'after_turn', relative_path: 'bindings/notify.json', target_ref: 'hooks/notify.mjs' }),
  ];
  const result = reconcileHookInventory(observations);
  assert.deepEqual(result.classifications.map(value => value.classification), ['valid_pair', 'valid_pair']);
  assert.ok(result.classifications.every(value => value.active === false));
  assert.equal(result.verdicts.length, 0);
});
