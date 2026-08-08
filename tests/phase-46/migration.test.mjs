import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MIGRATION_ACTIONS,
  RELEASE_GATES,
  buildMigrationPlan,
  classifyPersistedRecord,
  lifecycleAction,
  migrateAtomic,
  recoverMigration,
  verifyDualRuntimeRelease,
} from '../../src/lifecycle/migration.mjs';

const oldTuple = { version_id: 'v1-aaaaaaaaaaaaaaaa', contents: { hooks: 'v1.5', mapping: 'legacy' } };
const newTuple = { version_id: 'v1-bbbbbbbbbbbbbbbb', contents: { hooks: 'v1.6', mapping: 'verified' } };

function releaseEvidence() {
  return Object.fromEntries(['claude', 'codex'].map(runtime => [runtime, Object.fromEntries(RELEASE_GATES.map(gate => [gate, true]))]));
}

test('MIG-01: every persisted record is classified and v1.5 history cannot become v1.6 authority', () => {
  const legacy = classifyPersistedRecord({ router_version: 'v1.5', type: 'lease', authority: 'persistent' });
  assert.equal(legacy.class, 'historical_v15');
  assert.equal(legacy.autonomy_lease, false);
  assert.equal(classifyPersistedRecord({ router_version: 'v1.6', type: 'lease' }).autonomy_lease, true);
  assert.equal(classifyPersistedRecord({ router_version: 'future' }).class, 'quarantined');
  assert.equal(buildMigrationPlan([{ router_version: 'v1.5' }, { router_version: 'v1.6' }]).status, 'planned');
  assert.equal(buildMigrationPlan([{ router_version: 'future' }]).status, 'blocked');
});

test('MIG-02: interruption before the pointer switch deterministically recovers the complete old tuple', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-migration-old-'));
  try {
    const plan = buildMigrationPlan([{ router_version: 'v1.5', id: 'old' }]);
    assert.throws(() => migrateAtomic({ root, plan, from_tuple: oldTuple, to_tuple: newTuple, fail_at: 'before-pointer' }), /injected migration crash/);
    const recovered = recoverMigration({ root });
    assert.equal(recovered.status, 'recovered-old');
    assert.equal(JSON.parse(readFileSync(join(root, 'migration', 'active.json'), 'utf8')).generation, oldTuple.version_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('MIG-02: interruption after the pointer switch deterministically recovers the complete new tuple', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-migration-new-'));
  try {
    const plan = buildMigrationPlan([{ router_version: 'v1.5', id: 'old' }]);
    assert.throws(() => migrateAtomic({ root, plan, from_tuple: oldTuple, to_tuple: newTuple, fail_at: 'after-pointer' }), /injected migration crash/);
    const recovered = recoverMigration({ root });
    assert.equal(recovered.status, 'recovered-new');
    assert.equal(JSON.parse(readFileSync(join(root, 'migration', 'active.json'), 'utf8')).generation, newTuple.version_id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('MIG-03/04: lifecycle actions are runtime-scoped and preserve unrelated state by contract', () => {
  assert.deepEqual(MIGRATION_ACTIONS, ['repair', 'rollback', 'disable', 'downgrade', 'enable', 'uninstall']);
  assert.deepEqual(lifecycleAction('downgrade', { runtimes: ['codex', 'claude', 'codex'] }), {
    status: 'planned', action: 'downgrade', runtimes: ['claude', 'codex'], preserves_unrelated_state: true, owned_state_only: true,
  });
  assert.equal(lifecycleAction('uninstall', { runtimes: ['unknown'] }).status, 'blocked');
  assert.equal(lifecycleAction('publish').reason_code, 'unknown_lifecycle_action');
});

test('MIG-05: release is blocked unless both installed runtimes prove every gate', () => {
  const passed = verifyDualRuntimeRelease(releaseEvidence());
  assert.equal(passed.status, 'passed');
  assert.equal(passed.gates, RELEASE_GATES.length * 2);
  const incomplete = releaseEvidence();
  delete incomplete.codex.migration;
  const blocked = verifyDualRuntimeRelease(incomplete);
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.missing, ['codex:migration']);
});
