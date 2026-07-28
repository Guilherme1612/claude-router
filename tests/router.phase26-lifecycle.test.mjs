import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { publishCompiledIndex, recoverReleaseTuple } from '../src/prompt/publish-index.mjs';
import { fingerprint, restartController } from '../src/lifecycle/router-lifecycle.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

const NOW = 1_800_000_000_000;
const registry = suffix => ({
  schema_version: 1,
  records: [{
    id: `cap-${suffix}`,
    name: `execute-${suffix}`,
    lifecycle: 'ready',
    dispatchable: true,
    scope: { kind: 'global' },
    invocation: { runtime: 'claude', command: `execute-${suffix}`, args: [] },
    dependencies: { state: 'ready', items: [] },
  }],
});
const mapping = suffix => ({
  schema_version: 1,
  policy_fingerprint: 'a'.repeat(64),
  subjects: [{
    subject_id: 'gsd-execute-phase',
    disposition: 'mapped',
    target_id: `cap-${suffix}`,
    reason_code: 'explicit_subject',
  }],
});
const publish = (root, suffix, options = {}) => publishCompiledIndex({
  ownedRoot: root,
  registry: registry(suffix),
  registryVersionId: `v1-${suffix === 'old' ? 'a' : 'b'}`.padEnd(19, suffix === 'old' ? 'a' : 'b'),
  mapping: mapping(suffix),
  now: NOW + (suffix === 'old' ? 0 : 1),
  ...options,
});

function snapshot(root) {
  const pointer = readFileSync(join(root, 'release-tuples', 'active.json'));
  const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW + 1 });
  return { pointer, tuple: loaded.tuple_version_id, projection: loaded.prompt_projection };
}

test('complete tuple publication preserves active routing at every pre-pointer failure', () => {
  const failures = [
    'build',
    'before-member:registry.json',
    'after-member:index.json',
    'before-manifest-write',
    'after-manifest-write',
    'before-verification',
    'after-verification',
    'before-active-pointer',
  ];
  for (const crashAt of failures) {
    const root = mkdtempSync(join(tmpdir(), 'router-phase26-gates-'));
    try {
      publish(root, 'old');
      const before = snapshot(root);
      assert.throws(() => publish(root, 'new', { crashAt }), /injected crash/);
      assert.deepEqual(snapshot(root), before, crashAt);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('post-activation reload failure restores the complete known-good tuple', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-phase26-reload-'));
  try {
    publish(root, 'old');
    const before = snapshot(root);
    assert.throws(() => publish(root, 'new', { crashAt: 'reload' }), /injected reload failure/);
    assert.deepEqual(snapshot(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recovery reports complete-tuple last-known-good restoration', () => {
  let result;
  try {
    result = recoverReleaseTuple({ ownedRoot: '/definitely-missing-phase26-root' });
  } catch (error) {
    result = { reason_code: error.message, tuple_scope: error.tuple_scope };
  }
  assert.equal(result.tuple_scope, 'complete', 'PHASE26_LIFECYCLE_INCOMPLETE');
});

test('restart recovery restores the verified complete tuple after an interrupted pointer transition', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-phase26-restart-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const ownedRoot = join(claudeRoot, 'router');
  const config = { schema_version: 1, activation_root: ownedRoot };
  try {
    const old = publish(ownedRoot, 'old');
    assert.throws(() => publish(ownedRoot, 'new', { crashAt: 'after-active-pointer' }), /injected crash/);
    assert.notEqual(loadCompiledIndex({ ownedRoot, now: NOW + 1 }).tuple_version_id, old.tuple_version_id);
    mkdirSync(join(ownedRoot, 'controller'), { recursive: true });
    writeFileSync(join(ownedRoot, 'controller', 'config.json'), `${stableStringify(config)}\n`);
    await restartController({
      claudeRoot,
      codexRoot,
      ownedRoot,
      sourceRouter: join(root, 'router.mjs'),
      readinessTimeoutMs: 100,
      launchController: () => {
        writeFileSync(join(ownedRoot, 'controller', 'status.json'), `${JSON.stringify({
          state: 'ready',
          configuration_fingerprint: fingerprint(stableStringify(config)),
          heartbeat: Date.now(),
          pid: process.pid,
          instance_id: 'phase26-restart',
        })}\n`);
        return { exitCode: null, unref() {} };
      },
    });
    const recovered = loadCompiledIndex({ ownedRoot, now: NOW + 1 });
    assert.equal(recovered.tuple_version_id, old.tuple_version_id);
    assert.equal(recovered.source, 'active');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
