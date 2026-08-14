import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MANIFEST_STATES,
  createCapabilityManifest,
  normalizeCapabilityDescriptor,
  validateCapabilityManifest,
} from '../src/registry/manifest.mjs';

const complete = {
  id: 'custom:review',
  name: 'review',
  kind: 'future-review-kind',
  roles: ['review', 'verify'],
  runtime: 'claude',
  scope: { kind: 'project', repository: 'router', worktree: 'main' },
  owner: 'owner:project',
  provenance: { source: 'manifest', logical_root: 'project', relative_path: 'capabilities/review.json' },
  invocation: { method: 'command', target: 'review', input_shape: ['text'], output_shape: ['report'] },
  dependencies: ['tool:git'],
  permissions: { required: ['read:workspace'], grants: ['read:workspace'] },
  authority: { ceiling: 'inspect', evidence: 'explicit' },
  risk: { level: 'low', evidence: 'explicit' },
  reversibility: 'reversible',
  freshness: 'fresh',
  evidence: { class: 'installed', verified: true },
  availability: { available: true },
  eligibility: { eligible: true },
  dispatchable: true,
  cost: { estimated_tokens: 120, context_bytes: 480, latency_ms: 8, tool_calls: 1, retries: 0 },
  relationships: { aliases: ['inspect-review'], equivalents: ['custom:lint'], complements: ['custom:verify'] },
};

test('CAP-01..04: complete future-kind descriptor preserves neutral contract fields', () => {
  const record = normalizeCapabilityDescriptor(complete);
  assert.equal(record.type, 'future-review-kind');
  assert.equal(record.state, 'dispatchable');
  assert.equal(record.dispatchable, true);
  assert.deepEqual(record.relationships.aliases, ['inspect-review']);
  assert.equal(record.privacy.raw_content, false);
  assert.equal(record.provenance.relative_path, 'capabilities/review.json');
  assert.equal(record.cost.estimated_tokens, 120);
  assert.ok(MANIFEST_STATES.includes(record.state));
});

test('CAP-01/03: command, agent, and skill invocation methods remain dispatchable', () => {
  for (const method of ['command', 'agent', 'skill']) {
    const record = normalizeCapabilityDescriptor({
      ...complete,
      id: `custom:${method}`,
      name: method,
      kind: method,
      invocation: { method, target: method },
    });
    assert.equal(record.invocation.method, method);
    assert.equal(record.state, 'dispatchable');
    assert.equal(record.dispatchable, true);
  }
});

test('CAP-03: missing invocation or authority evidence is recommendation-only, never dispatchable', () => {
  const record = normalizeCapabilityDescriptor({
    id: 'custom:unknown', name: 'unknown', kind: 'future-kind', runtime: 'codex',
    scope: { kind: 'global' }, owner: 'owner:global',
    provenance: { source: 'manifest', logical_root: 'global', relative_path: 'unknown.json' },
    available: true, eligible: true, dispatchable: true,
  });
  assert.equal(record.state, 'recommendation-only');
  assert.equal(record.dispatchable, false);
  assert.ok(record.reason_codes.includes('invocation_missing'));
  assert.ok(record.reason_codes.includes('authority_unknown'));
});

test('CAP-02/03: unsafe provenance is quarantined and output contains no private path', () => {
  const record = normalizeCapabilityDescriptor({
    ...complete,
    id: 'custom:unsafe',
    provenance: { source: 'manifest', logical_root: 'project', relative_path: '../private/secret.json' },
  });
  assert.equal(record.state, 'quarantined');
  assert.ok(record.quarantine.includes('path_escape'));
  assert.doesNotMatch(JSON.stringify(record), /\/Users\/|secret\.json/);
});

test('CAP-01..04: manifest ordering, counts, fingerprint, and safe-empty state are deterministic', () => {
  const first = createCapabilityManifest({
    runtime: 'claude', scope: { kind: 'global' }, framework: 'custom', owner: 'owner:global', epoch: 'epoch:1',
    records: [complete, { ...complete, id: 'custom:other', name: 'other', dispatchable: false, available: false }],
  });
  const second = createCapabilityManifest({
    runtime: 'claude', scope: { kind: 'global' }, framework: 'custom', owner: 'owner:global', epoch: 'epoch:1',
    records: [{ ...complete, id: 'custom:other', name: 'other', dispatchable: false, available: false }, complete],
  });
  assert.deepEqual(first.records.map(record => record.stable_id), ['custom:other', 'custom:review']);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.safe_empty, false);
  assert.equal(validateCapabilityManifest(first), true);

  const empty = createCapabilityManifest({ runtime: 'codex', scope: { kind: 'global' }, records: [] });
  assert.equal(empty.safe_empty, true);
  assert.equal(empty.status, 'unknown');
  assert.equal(validateCapabilityManifest(empty), true);
});

test('CAP-03: validator rejects a dispatchability/state mismatch', () => {
  const manifest = createCapabilityManifest({ records: [complete], runtime: 'claude', scope: { kind: 'global' } });
  assert.throws(() => validateCapabilityManifest({
    ...manifest,
    records: manifest.records.map(record => ({ ...record, state: 'eligible' })),
  }), /dispatchability state mismatch/);
});
