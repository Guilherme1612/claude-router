import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planProductionDispatch } from '../src/orchestrator/strategy.mjs';
import { createClaudeDispatchAdapter } from '../src/adapters/dispatch/claude.mjs';
import { collectLearningEvidence } from '../src/evolution/local-learning.mjs';
import {
  RELEASE_GATES,
  migrateAtomic,
  recoverMigration,
  verifyDualRuntimeRelease,
} from '../src/lifecycle/migration.mjs';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { inProcessControllerLauncher, stubVerificationRunners } from './helpers/test-mode-seam.mjs';

const oldTuple = { version_id: 'v1-aaaaaaaaaaaaaaaa', contents: { hooks: 'old' } };
const newTuple = { version_id: 'v1-bbbbbbbbbbbbbbbb', contents: { hooks: 'new' } };

function completedReceipt(id) {
  return {
    receipt_id: id,
    invocation_identity: { runtime: 'claude', identity: {
      project_id: 'project-1', capability_fingerprint: 'cap-1', mapping_generation: 'map-1',
    } },
    completion_evidence: {
      state: 'completed',
      learning: { actual_route_id: 'route-1', observed_at_ms: 100, quality: 1, latency_ms: 1, negative_control: true, negative_control_pass: true },
    },
    invocation_evidence: { receipt_id: id },
    postcondition_evidence: { receipt_id: id, verified: true },
  };
}

function installedEvidence(now = 1000) {
  return Object.fromEntries(['claude', 'codex'].map(runtime => [runtime, {
    runtime,
    source: 'installed-runtime',
    version: `${runtime}-v1.7`,
    version_bound: true,
    generated_at_ms: now,
    checks: Object.fromEntries(RELEASE_GATES.map(gate => [gate, true])),
  }]));
}

test('production dispatch selects a proportional strategy before native invocation', () => {
  const action = planProductionDispatch({ lease_id: 'lease-production', intent: 'native work' });
  assert.equal(action.status, 'planned');
  assert.equal(action.strategy_plan.dispatch_eligible, true);
  assert.equal(action.strategy_plan.strategy.kind, 'direct');
  assert.equal(action.strategy_plan.strategy.reason_code, 'direct_proportional_baseline');
});

test('native adapter preserves the validated production strategy through terminal receipt', async () => {
  const home = mkdtempSync(join(tmpdir(), 'router-production-dispatch-'));
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const planned = planProductionDispatch({ lease_id: 'lease-production-receipt', idempotency_key: 'production-receipt-1' });
    const adapter = createClaudeDispatchAdapter();
    const invoked = adapter.invoke(planned);
    assert.equal(invoked.completion_evidence.state, 'invoked');
    let terminal = null;
    for (let attempt = 0; attempt < 100 && !terminal; attempt += 1) {
      terminal = adapter.observe(invoked.receipt_id);
      if (terminal?.completion_evidence?.state !== 'completed') {
        terminal = null;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    assert.equal(terminal?.completion_evidence?.state, 'completed');
    assert.equal(terminal.strategy_plan.strategy.kind, 'direct');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
});

test('duplicate receipt identities are rejected before learning partitioning', () => {
  const result = collectLearningEvidence({ receipts: [completedReceipt('receipt-1'), completedReceipt('receipt-1')] });
  assert.deepEqual(result, { status: 'denied', reason_code: 'duplicate_receipt_identity', duplicates: ['receipt-1'] });
});

test('migration recovery remains stable when repeated after an interrupted old-generation recovery', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-production-migration-'));
  try {
    const plan = { status: 'planned' };
    assert.throws(() => migrateAtomic({ root, plan, from_tuple: oldTuple, to_tuple: newTuple, fail_at: 'before-pointer' }));
    const first = recoverMigration({ root });
    const second = recoverMigration({ root });
    assert.deepEqual(second, first);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('release eligibility requires fresh version-bound installed evidence', () => {
  const evidence = installedEvidence();
  assert.equal(verifyDualRuntimeRelease(evidence, { expected_versions: { claude: 'claude-v1.7', codex: 'codex-v1.7' }, now: 1000 }).status, 'passed');
  assert.equal(verifyDualRuntimeRelease({ claude: { ...evidence.claude, version: 'caller-claim' }, codex: evidence.codex }, { expected_versions: { claude: 'claude-v1.7', codex: 'codex-v1.7' }, now: 1000 }).status, 'blocked');
  assert.equal(verifyDualRuntimeRelease({ claude: { ...evidence.claude, generated_at_ms: 0 }, codex: evidence.codex }, { expected_versions: { claude: 'claude-v1.7', codex: 'codex-v1.7' }, now: 1000, max_age_ms: 100 }).status, 'blocked');
});

test('fresh installs deploy production integration dependencies to both runtime roots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-production-install-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'router.mjs');
  const holder = {};
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  writeFileSync(join(claudeRoot, 'settings.json'), '{"hooks":{}}\n');
  writeFileSync(join(codexRoot, 'hooks.json'), '{"hooks":{}}\n');
  writeFileSync(sourceRouter, 'export const installed = true;\n');
  try {
    await installRouter({
      root, claudeRoot, codexRoot, sourceRouter, testMode: true,
      verificationRunners: stubVerificationRunners,
      launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
      debounceMs: 10, repairMs: 60_000,
    });
    for (const runtimeRoot of [join(claudeRoot, 'router'), join(codexRoot, 'router')]) {
      for (const name of ['orchestrator/strategy.mjs', 'evolution/local-learning.mjs', 'lifecycle/migration.mjs', 'adapters/dispatch/claude.mjs', 'adapters/dispatch/codex.mjs']) {
        assert.equal(existsSync(join(runtimeRoot, 'modules', name)), true, name);
      }
    }
  } finally {
    await holder.child?.kill?.();
    await new Promise(resolve => setTimeout(resolve, 5));
    rmSync(root, { recursive: true, force: true });
  }
});
