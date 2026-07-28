import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createTestRegistryReconciler } from '../src/registry/watcher.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { publishCompiledIndex } from '../src/prompt/publish-index.mjs';

const NOW = 1_800_000_000_000;

function capability() {
  return {
    schema_version: 1,
    id: 'router/execute',
    canonical_identity: 'router/execute',
    name: 'execute',
    type: 'skill',
    lifecycle: 'ready',
    dispatchable: true,
    scope: { kind: 'global' },
    invocation: { runtime: 'claude', command: 'execute', args: [] },
    dependencies: { state: 'ready', items: [] },
  };
}

function mapping() {
  return {
    schema_version: 1,
    subjects: [{
      subject_id: 'gsd-execute-phase',
      disposition: 'mapped',
      target_id: 'router/execute',
      reason_code: 'explicit_subject',
    }],
    summary: { disposition: 'complete', ambiguous: 0 },
  };
}

function snapshot(root) {
  if (!existsSync(root)) return {};
  const result = {};
  const visit = path => {
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) visit(child);
      else result[relative(root, child)] = readFileSync(child).toString('hex');
    }
  };
  visit(root);
  return result;
}

function reconciler(root, verification, calls) {
  const registry = { schema_version: 1, records: [capability()] };
  return createTestRegistryReconciler({
    candidate_path: join(root, '..', 'candidate.json'),
    report_path: join(root, '..', 'report.json'),
    activation_root: root,
  }, {
    acquireRegistry: () => ({}),
    refreshIncrementalAcquisition: value => value,
    assembleRegistry: () => ({ registry, diagnostics: [], summary: {} }),
    readActive: async () => ({
      registry: { schema_version: 1, records: [] },
      bytes: '{}\n',
      fingerprint: 'active',
      authority_status: 'empty',
    }),
    reconcileCandidate: () => ({
      disposition: 'eligible',
      candidate_fingerprint: 'candidate',
      report_fingerprint: 'report',
      verdicts: [],
      active_bytes: '{}\n',
      active_fingerprint: 'active',
    }),
    writeJson: async () => {},
    mapCandidateRegistry: async () => { calls.push('safety'); return mapping(); },
    produceActivationVerification: async () => { calls.push('approval'); return verification; },
    activateCandidate: async () => {
      calls.push('activate');
      return { activation_status: 'activated', version_id: 'v1-aaaaaaaaaaaaaaaa' };
    },
    publishCompiledIndex: async () => {
      calls.push('publish');
      return { publication_status: 'published', tuple_version_id: 't1-aaaaaaaaaaaaaaaa' };
    },
  });
}

for (const reason_code of ['approval_missing', 'approval_stale', 'approval_mismatch']) {
  test(`${reason_code} blocks activation and publication with byte-identical owned state`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'router-phase26-authority-'));
    const calls = [];
    try {
      writeFileSync(join(root, 'sentinel'), 'unchanged');
      const before = snapshot(root);
      const reconcile = reconciler(root, {
        disposition: 'blocked',
        complete: false,
        reason_code,
      }, calls);
      await reconcile({ diff: { events: [], diagnostics: [] } });
      assert.deepEqual(calls, ['safety', 'approval']);
      assert.deepEqual(snapshot(root), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('exact fresh approval retains safety, verifier, activation, and publication order', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-phase26-approved-'));
  const calls = [];
  try {
    const reconcile = reconciler(root, {
      disposition: 'passing',
      complete: true,
      policy_fingerprint: 'a'.repeat(64),
      generated_at: NOW,
      reason_code: 'approval_bound',
    }, calls);
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.deepEqual(calls, ['safety', 'approval', 'activate', 'publish']);
    assert.equal(reconcile.lastReconciliation.activation_status, 'activated');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function publish(root, suffix, suggestionReference) {
  return publishCompiledIndex({
    ownedRoot: root,
    registry: { schema_version: 1, records: [capability()] },
    registryVersionId: `v1-${suffix.repeat(16)}`,
    mapping: mapping(),
    policyFingerprint: suffix.repeat(64),
    now: NOW,
    suggestionReference,
  });
}

function capsule() {
  return {
    schema_version: 1,
    scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'phase-26', summary: 'release' },
    position: { workflow: 'gsd-execute-phase', phase: '26', plan: '06', task: '2' },
    status: 'active',
    artifacts: [],
    blockers: [],
    freshness: { captured_at: NOW, generation: 'phase-26' },
    provenance: { source: 'workflow-state', version: '1' },
  };
}

test('invalid recommendation data suppresses advice without changing verified routing or state', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-phase26-suggestion-'));
  try {
    saveCapsule({ ownedRoot: root, capsule: capsule() });
    const publication = publish(root, 'a', {
      schema_version: 1,
      policy_version: 'steward-policy-v1',
      fingerprint: 'b'.repeat(64),
      available: true,
      cooldown_until_ms: null,
    });
    const pointerPath = join(root, 'release-tuples', 'active.json');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
    const projectionPath = join(
      root, 'release-tuples', 'versions', publication.tuple_version_id, 'prompt-projection.json',
    );
    const projection = JSON.parse(readFileSync(projectionPath, 'utf8'));
    projection.suggestion_reference = { available: true, fingerprint: 'not-a-fingerprint' };
    const bytes = `${JSON.stringify(projection)}\n`;
    writeFileSync(projectionPath, bytes);
    pointer.prompt_projection_sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(pointerPath, `${JSON.stringify(pointer)}\n`);
    const before = snapshot(root);
    const routed = routeContextPrompt({
      prompt: 'continue',
      ownedRoot: root,
      projectRoot: root,
      now: NOW + 1,
    });
    assert.equal(routed.handled, true);
    assert.equal(routed.resolution.dispatch_eligible, true);
    assert.equal(routed.compiled.source, 'active');
    assert.equal(routed.startup_notice_emitted, undefined);
    assert.deepEqual(snapshot(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('corrupt active prompt projection falls back only to verified known-good routing', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-phase26-known-good-'));
  try {
    saveCapsule({ ownedRoot: root, capsule: capsule() });
    const oldPublication = publish(root, 'a', {
      schema_version: 1,
      policy_version: 'steward-policy-v1',
      fingerprint: null,
      available: false,
      cooldown_until_ms: null,
    });
    const knownGoodPath = join(root, 'release-tuples', 'known-good.json');
    const oldKnownGood = readFileSync(knownGoodPath);
    const active = publish(root, 'b', {
      schema_version: 1,
      policy_version: 'steward-policy-v1',
      fingerprint: 'c'.repeat(64),
      available: true,
      cooldown_until_ms: null,
    });
    writeFileSync(knownGoodPath, oldKnownGood);
    const projectionPath = join(
      root, 'release-tuples', 'versions', active.tuple_version_id, 'prompt-projection.json',
    );
    writeFileSync(projectionPath, '{');
    const before = snapshot(root);
    const routed = routeContextPrompt({
      prompt: 'continue',
      ownedRoot: root,
      projectRoot: root,
      now: NOW + 1,
    });
    assert.equal(routed.handled, true);
    assert.equal(routed.resolution.dispatch_eligible, true);
    assert.equal(routed.compiled.source, 'known_good');
    assert.equal(routed.compiled.tuple_version_id, oldPublication.tuple_version_id);
    assert.equal(routed.startup_notice_emitted, undefined);
    assert.deepEqual(snapshot(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
