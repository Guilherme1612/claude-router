import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { publishCompiledIndex } from '../src/prompt/publish-index.mjs';

test('prompt route consumes one bounded tuple projection without optional side reads', () => {
  let startupReads = 0;
  routeContextPrompt({
    prompt: 'hello',
    ownedRoot: '/unused',
    projectRoot: '/unused',
    loadStartupPointerFn: () => { startupReads += 1; return { available: false }; },
  });
  assert.equal(startupReads, 0, 'PHASE26_PROMPT_PATH_NOT_READ_ONLY');
});

test('published v1.3 tuple routes without mutating capsule state', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-phase26-hot-'));
  const capsule = {
    schema_version: 1, scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'phase-26', summary: 'release' },
    position: { workflow: 'gsd-execute-phase', phase: '26', plan: '02', task: '2' },
    status: 'active', artifacts: [], blockers: [],
    freshness: { captured_at: 1, generation: 'phase-26' },
    provenance: { source: 'workflow-state', version: '1' },
  };
  const registry = { schema_version: 1, records: [{
    id: 'capability-1', name: 'execute', lifecycle: 'ready', dispatchable: true,
    scope: { kind: 'global' }, invocation: { runtime: 'claude', command: 'execute', args: [] },
    dependencies: { state: 'ready', items: [] },
  }] };
  const mapping = { schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [{
    subject_id: 'gsd-execute-phase', disposition: 'mapped', target_id: 'capability-1', reason_code: 'explicit_subject',
  }] };
  try {
    saveCapsule({ ownedRoot: root, capsule });
    publishCompiledIndex({
      ownedRoot: root, registry, registryVersionId: 'v1-aaaaaaaaaaaaaaaa',
      mapping, policyFingerprint: 'b'.repeat(64), now: Date.now(),
      suggestionReference: {
        schema_version: 1, policy_version: 'steward-policy-v1',
        fingerprint: 'c'.repeat(64), available: true, cooldown_until_ms: null,
      },
    });
    const capsulePath = join(root, 'context-capsule.json');
    const before = readFileSync(capsulePath, 'utf8');
    const routed = routeContextPrompt({
      prompt: 'continue', ownedRoot: root, projectRoot: root,
    });
    assert.equal(routed.handled, true);
    assert.equal(readFileSync(capsulePath, 'utf8'), before);
    assert.equal(routed.startup_notice_emitted, true);
    assert.equal(routed.startup_notice_pointer.fingerprint, 'c'.repeat(64));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
