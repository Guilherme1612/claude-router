import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFullRegistry, buildIncrementalRegistry } from '../src/registry/build.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { publishCompiledIndex } from '../src/prompt/publish-index.mjs';

test('full and incremental builders expose byte-identical complete tuples', () => {
  const acquisition = {
    claude: { observations: [], diagnostics: [] },
    codex: { observations: [], diagnostics: [] },
  };
  const full = buildFullRegistry({
    discoverClaude: () => acquisition.claude,
    discoverCodex: () => acquisition.codex,
  });
  const incremental = buildIncrementalRegistry(acquisition, { events: [], diagnostics: [] });
  assert.ok(full.complete_tuple && incremental.complete_tuple, 'PHASE26_EQUIVALENCE_INCOMPLETE');
  assert.equal(stableStringify(full.complete_tuple), stableStringify(incremental.complete_tuple),
    'PHASE26_EQUIVALENCE_INCOMPLETE');
  assert.match(full.complete_tuple.tuple_id, /^t1-[a-f0-9]{16}$/);
  assert.deepEqual(Object.keys(full.complete_tuple.members), [
    'contracts', 'health_policy', 'intent_policy', 'registry',
    'relationships', 'suggestion_reference', 'workflows',
  ]);
});

test('every pre-pointer failure preserves the exact active tuple pointer', () => {
  const ownedRoot = mkdtempSync(join(tmpdir(), 'router-phase26-equivalence-'));
  const registry = { schema_version: 1, records: [{
    id: 'capability-1', name: 'execute', lifecycle: 'ready', dispatchable: true,
    scope: { kind: 'global' }, invocation: { runtime: 'claude', command: 'execute', args: [] },
    dependencies: { state: 'ready', items: [] },
  }] };
  const mapping = { schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [{
    subject_id: 'gsd-execute-phase', disposition: 'mapped', target_id: 'capability-1', reason_code: 'explicit_subject',
  }] };
  try {
    publishCompiledIndex({
      ownedRoot, registry, registryVersionId: 'v1-aaaaaaaaaaaaaaaa',
      mapping, policyFingerprint: 'b'.repeat(64), now: 1,
    });
    const activePath = join(ownedRoot, 'release-tuples', 'active.json');
    const activeBytes = readFileSync(activePath, 'utf8');
    for (const crashAt of ['build', 'member', 'manifest', 'verification', 'before-active-pointer']) {
      assert.throws(() => publishCompiledIndex({
        ownedRoot, registry, registryVersionId: 'v1-bbbbbbbbbbbbbbbb',
        mapping, policyFingerprint: 'c'.repeat(64), now: 2, crashAt,
      }));
      assert.equal(readFileSync(activePath, 'utf8'), activeBytes, crashAt);
    }
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});
