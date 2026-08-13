import assert from 'node:assert/strict';
import test from 'node:test';

import { mapCandidateRegistry } from '../src/registry/map.mjs';
import { inventoryRecordProjection, semanticActivationProjection } from '../src/cli/router-control.mjs';
import { buildClaudeHeavyProfile } from './helpers/inventory-fixture.mjs';

function localRecord(runtime, name, overrides = {}) {
  const base = structuredClone(buildClaudeHeavyProfile()[0]);
  return {
    ...base,
    name,
    invocation: { ...base.invocation, runtime },
    provenance: [{ ...base.provenance[0], runtime, source_fingerprint: `${runtime}-${name}-fresh` }],
    runtime_variants: [{ runtime, native_identity: name, native: { fixture: true } }],
    mapping: { explicit_subjects: [`route:${runtime}:${name}`] },
    ...overrides,
  };
}

test('mapping evidence stays runtime-local for installed targets', () => {
  const result = mapCandidateRegistry({
    candidate: { records: [localRecord('claude', 'shared'), localRecord('codex', 'shared')] },
    reconciliation: { disposition: 'eligible' },
  });
  const claude = result.subjects.find(subject => subject.subject_id === 'route:claude:shared');
  const codex = result.subjects.find(subject => subject.subject_id === 'route:codex:shared');
  assert.equal(claude.target_evidence.find(evidence => evidence.runtime === 'claude').runtime, 'claude');
  assert.equal(codex.target_evidence.find(evidence => evidence.runtime === 'codex').runtime, 'codex');
  assert.equal(claude.target_evidence.find(evidence => evidence.runtime === 'claude').availability, 'available');
  assert.equal(claude.target_evidence.find(evidence => evidence.runtime === 'claude').eligible, true);
});

test('unavailable runtime-local targets are evidenced as quarantined and never mapped', () => {
  const result = mapCandidateRegistry({
    candidate: {
      records: [localRecord('codex', 'stale', {
        enabled: true,
        dispatchable: false,
        invocation: { runtime: 'codex', availability: 'unavailable', reason: 'stale' },
      })],
    },
    reconciliation: { disposition: 'eligible' },
  });
  const subject = result.subjects[0];
  assert.notEqual(subject.disposition, 'mapped');
  assert.equal(subject.target_evidence[0].runtime, 'codex');
  assert.equal(subject.target_evidence[0].availability, 'unavailable');
  assert.equal(subject.target_evidence[0].eligible, false);
  assert.ok(subject.target_evidence[0].quarantine.includes('target_not_dispatchable'));
});

test('control projections expose independent activation and redact unsafe paths', () => {
  const projected = inventoryRecordProjection({
    ...localRecord('codex', 'safe'),
    provenance: [{ ...localRecord('codex', 'safe').provenance[0], relative_path: '/private/raw/path' }],
  });
  assert.equal(projected.relative_path, 'unavailable');
  assert.equal(projected.runtime, 'codex');
  assert.equal(projected.availability, 'available');
  assert.equal(projected.eligible, true);

  const activation = semanticActivationProjection({
    semanticRecordsByRuntime: { claude: [{ stable_id: 'c' }], codex: [] },
  });
  assert.equal(activation.claude.status, 'active');
  assert.equal(activation.codex.status, 'safe_empty');
  assert.equal(activation.claude.record_count, 1);
  assert.equal(activation.codex.record_count, 0);
});
