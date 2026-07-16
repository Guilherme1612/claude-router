import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_MAPPING_POLICY, mapCandidateRegistry } from '../src/registry/map.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { capability, candidate, permutations } from './router.registry-reconcile.test.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function target(name, mapping = {}, overrides = {}) {
  return capability({
    name,
    canonical_identity: `router/${name}`,
    mapping,
    ...overrides,
  });
}

function eligible(records) {
  const registry = candidate(records);
  const probe = mapCandidateRegistry({
    candidate: registry,
    reconciliation: { disposition: 'eligible' },
  });
  return {
    candidate: registry,
    reconciliation: {
      disposition: 'eligible',
      candidate_fingerprint: probe.candidate_fingerprint,
      verdicts: [],
    },
  };
}

function mapped(result, subjectId) {
  return result.subjects.find(subject => subject.subject_id === subjectId);
}

function assertPermutationStableAtCollectionBounds(label, makeOptions) {
  for (const size of [127, 128, 129]) {
    const forward = makeOptions(size);
    const reverse = makeOptions(size);
    forward.reconciliation = { disposition: 'eligible' };
    for (const [key, value] of Object.entries(reverse)) {
      if (Array.isArray(value)) reverse[key] = [...value].reverse();
      else if (key === 'lifecycle') reverse.lifecycle = { ...value, events: [...value.events].reverse() };
      else if (key === 'candidate') {
        reverse.candidate = {
          ...value,
          records: value.records.map(record => ({
            ...record,
            mapping: Object.fromEntries(Object.entries(record.mapping || {}).map(([field, entries]) => [field, [...entries].reverse()])),
          })),
        };
      }
    }
    reverse.reconciliation = { disposition: 'eligible' };
    assert.equal(
      stableStringify(mapCandidateRegistry(forward)),
      stableStringify(mapCandidateRegistry(reverse)),
      `${label} must be permutation-stable at ${size} entries`,
    );
  }
}

test('D-01 policy is schema-versioned, integer-scored, fingerprinted, and fully explained', () => {
  assert.equal(DEFAULT_MAPPING_POLICY.schema_version, 1);
  assert.match(DEFAULT_MAPPING_POLICY.policy_fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(DEFAULT_MAPPING_POLICY.precedence, ['explicit', 'identity', 'inheritance', 'lexical', 'advisory']);
  for (const value of Object.values(DEFAULT_MAPPING_POLICY.minimum_scores)) assert.equal(Number.isInteger(value), true);

  const input = eligible([target('planner', { explicit_subjects: ['route:plan'] })]);
  const result = mapCandidateRegistry(input);
  const subject = mapped(result, 'route:plan');
  assert.equal(subject.disposition, 'mapped');
  assert.equal(subject.target_id, 'router/planner');
  assert.equal(subject.winning_rule, 'explicit_subject');
  assert.equal(subject.confidence.score, 1);
  assert.equal(subject.confidence.basis_points, 10000);
  assert.equal(subject.confidence.band, 'high');
  assert.equal(subject.runner_up_score, 0);
  assert.equal(subject.margin, 1);
  assert.ok(subject.evidence.length > 0);
  assert.ok(Array.isArray(subject.alternatives));
  assert.equal(subject.policy_version, DEFAULT_MAPPING_POLICY.policy_version);
  assert.equal(subject.policy_fingerprint, DEFAULT_MAPPING_POLICY.policy_fingerprint);
  assert.match(result.report_fingerprint, /^[a-f0-9]{64}$/);
});

test('D-02 authority tiers are non-overriding and D-03 strong conflicts stay ambiguous', () => {
  const records = [
    target('explicit', { explicit_subjects: ['route:work'] }),
    target('identity', { identity_subjects: ['route:work'], triggers: ['work'] }),
    target('lexical', { triggers: ['route', 'work'] }),
  ];
  const result = mapCandidateRegistry(eligible(records));
  assert.equal(mapped(result, 'route:work').target_id, 'router/explicit');
  assert.equal(mapped(result, 'route:work').winning_rule, 'explicit_subject');

  const conflict = mapCandidateRegistry(eligible([
    target('one', { explicit_subjects: ['route:conflict'], triggers: ['conflict'] }),
    target('two', { explicit_subjects: ['route:conflict'], triggers: ['conflict', 'route'] }),
  ]));
  const ambiguous = mapped(conflict, 'route:conflict');
  assert.equal(ambiguous.disposition, 'ambiguous');
  assert.equal(ambiguous.target_id, undefined);
  assert.deepEqual(ambiguous.alternatives.map(value => value.target_id), ['router/one', 'router/two']);
  assert.equal(ambiguous.winning_rule, 'explicit_conflict');
});

test('D-04/D-05 insufficient score and near ties remain active-but-unmapped with bounded resolver requests', () => {
  const low = target('low-signal', { subjects: ['route:unrelated'], triggers: ['different'] });
  const lowResult = mapCandidateRegistry(eligible([low]));
  const unresolved = mapped(lowResult, 'route:unrelated');
  assert.equal(unresolved.disposition, 'unmapped');
  assert.equal(unresolved.active_registry_member, true);
  assert.equal(lowResult.advisory_requests.length, 1);
  assert.equal(lowResult.advisory_requests[0].subject_id, 'route:unrelated');

  const policy = {
    ...DEFAULT_MAPPING_POLICY,
    minimum_scores: { ...DEFAULT_MAPPING_POLICY.minimum_scores, lexical: 1000 },
    minimum_margins: { ...DEFAULT_MAPPING_POLICY.minimum_margins, lexical: 3000 },
  };
  const tie = mapCandidateRegistry({
    ...eligible([
      target('build-one', { subjects: ['route:build'], triggers: ['build', 'one'] }),
      target('build-two', { subjects: ['route:build'], triggers: ['build', 'two'] }),
    ]),
    policy,
  });
  assert.equal(mapped(tie, 'route:build').disposition, 'unmapped');
  assert.equal(mapped(tie, 'route:build').reason_code, 'winner_margin_below_threshold');
});

test('D-06 exact-candidate target safety rejects every unsafe or absent target condition', () => {
  const unsafe = [
    ['absent', null, { target_id: 'router/missing' }],
    ['non-ready', { lifecycle: 'partial', dispatchable: false }],
    ['non-dispatchable', { dispatchable: false }],
    ['non-invocable', { invocation: { runtime: 'claude', command: '   ', args: [] } }],
    ['out-of-scope', { scope: { kind: 'project', repository: 'repo:other', worktree: 'main' } }],
    ['permission-denied', { permissions: { required: ['network'], grants: [], denied: ['network'] } }],
    ['dependency-incomplete', { dispatchable: false, dependencies: { state: 'declared', items: [{ id: 'router/dependency', available: false }] } }],
    ['collision-blocked', { conflicts: [{ severity: 'dispatch-blocking', code: 'collision' }] }],
  ];
  for (const [name, overrides, advisory] of unsafe) {
    const records = overrides === null
      ? [target('safe', { subjects: [`route:${name}`] })]
      : [target(name, { explicit_subjects: [`route:${name}`] }, overrides)];
    const result = mapCandidateRegistry({
      ...eligible(records),
      requestedScope: { kind: 'project', repository: 'repo:router', worktree: 'main' },
      advisoryEvidence: advisory ? [{ subject_id: `route:${name}`, ...advisory, score_basis_points: 10000, resolver: 'fixture', model_version: '1' }] : [],
    });
    const subject = mapped(result, `route:${name}`);
    assert.notEqual(subject?.disposition, 'mapped', name);
    assert.notEqual(subject?.target_id, `router/${name}`, name);
  }
});

test('D-07 inheritance requires authoritative continuity or same stable identity', () => {
  const record = target('renamed', { route_families: ['planning'], subjects: ['route:plan'] });
  const weak = mapCandidateRegistry({
    ...eligible([record]),
    existingMappings: [{ subject_id: 'route:plan', target_id: 'router/renamed', route_family: 'planning', stable_identity: 'router/old' }],
  });
  assert.notEqual(mapped(weak, 'route:plan').winning_rule, 'authoritative_inheritance');

  const strong = mapCandidateRegistry({
    ...eligible([record]),
    lifecycle: { events: [{ canonical_id: 'router/renamed', primary: 'renamed', authoritative: true, route_family: 'planning' }] },
    existingMappings: [{ subject_id: 'route:plan', target_id: 'router/renamed', route_family: 'planning', stable_identity: 'router/renamed' }],
  });
  assert.equal(mapped(strong, 'route:plan').winning_rule, 'authoritative_inheritance');
});

test('D-08 every contributing collection is permutation-stable and inputs stay unchanged', () => {
  const records = [
    target('one', { subjects: ['route:one'], triggers: ['one', 'route'], aliases: ['first'] }),
    target('two', { subjects: ['route:two'], triggers: ['two', 'route'], aliases: ['second'] }),
  ];
  const lifecycle = { events: [
    { canonical_id: 'router/one', primary: 'renamed', authoritative: true, route_family: 'one' },
    { canonical_id: 'router/two', primary: 'moved', authoritative: true, route_family: 'two' },
  ] };
  const existingMappings = [
    { subject_id: 'route:one', target_id: 'router/one', route_family: 'one', stable_identity: 'router/one' },
    { subject_id: 'route:two', target_id: 'router/two', route_family: 'two', stable_identity: 'router/two' },
  ];
  const advisoryEvidence = [
    { subject_id: 'route:one', target_id: 'router/one', score_basis_points: 7000, resolver: 'fixture', model_version: '1' },
    { subject_id: 'route:two', target_id: 'router/two', score_basis_points: 7000, resolver: 'fixture', model_version: '1' },
  ];
  const original = structuredClone({ records, lifecycle, existingMappings, advisoryEvidence });
  const outputs = permutations(records).flatMap(candidateRecords => permutations(lifecycle.events).flatMap(events =>
    permutations(existingMappings).flatMap(mappings => permutations(advisoryEvidence).map(advisory => mapCandidateRegistry({
      ...eligible(candidateRecords), lifecycle: { events }, existingMappings: mappings, advisoryEvidence: advisory,
    })))));
  assert.equal(new Set(outputs.map(stableStringify)).size, 1);
  assert.deepEqual({ records, lifecycle, existingMappings, advisoryEvidence }, original);
});

test('D-08 advisory evidence stays canonical across the 127/128/129 boundary', () => {
  assertPermutationStableAtCollectionBounds('advisory evidence', size => ({
    ...eligible([target('advised')]),
    advisoryEvidence: Array.from({ length: size }, (_, index) => ({
      subject_id: `route:advisory-${String(index).padStart(3, '0')}`,
      target_id: 'router/advised',
      score_basis_points: 7000,
      resolver: 'fixture',
      model_version: '1',
    })),
  }));
});

test('D-08 existing mappings stay canonical across the 127/128/129 boundary', () => {
  assertPermutationStableAtCollectionBounds('existing mappings', size => ({
    ...eligible([target('inherited')]),
    existingMappings: Array.from({ length: size }, (_, index) => ({
      subject_id: `route:existing-${String(index).padStart(3, '0')}`,
      target_id: 'router/inherited',
      stable_identity: 'router/inherited',
    })),
  }));
});

test('D-08 lifecycle events stay canonical across the 127/128/129 boundary', () => {
  assertPermutationStableAtCollectionBounds('lifecycle events', size => ({
    ...eligible([target('continuity', { route_families: ['planning'] })]),
    existingMappings: [{
      subject_id: 'route:continuity',
      target_id: 'router/continuity',
      stable_identity: 'router/old',
      route_family: 'planning',
    }],
    lifecycle: { events: [
      { canonical_id: 'router/continuity', primary: 'renamed', authoritative: true, route_family: 'planning' },
      ...Array.from({ length: size - 1 }, (_, index) => ({
        canonical_id: `router/filler-${String(index).padStart(3, '0')}`,
        primary: 'unchanged',
        authoritative: false,
      })),
    ] },
  }));
});

test('D-08 record-owned mapping arrays stay canonical across the 127/128/129 boundary', () => {
  assertPermutationStableAtCollectionBounds('record-owned mapping arrays', size => ({
    ...eligible([target('owned', {
      explicit_subjects: Array.from({ length: size }, (_, index) => `route:owned-${String(index).padStart(3, '0')}`),
    })]),
  }));
});

test('D-09 advisory evidence is portable, subordinate, bounded, and never mutates active state', () => {
  const active = { mappings: [{ subject_id: 'route:plan', target_id: 'router/old' }], opaque: 'unchanged' };
  const records = [
    target('explicit', { explicit_subjects: ['route:plan'] }),
    target('advised', { subjects: ['route:plan'] }),
  ];
  const result = mapCandidateRegistry({
    ...eligible(records),
    existingMappings: active.mappings,
    advisoryEvidence: [{
      subject_id: 'route:plan', target_id: 'router/advised', score_basis_points: 10000,
      resolver: 'bounded-resolver', model_version: 'model-v1', policy_version: 'resolver-policy-v1',
      raw_prompt: 'secret', path: '/Users/private/secret',
    }],
  });
  assert.equal(mapped(result, 'route:plan').target_id, 'router/explicit');
  assert.deepEqual(active, { mappings: [{ subject_id: 'route:plan', target_id: 'router/old' }], opaque: 'unchanged' });
  const bytes = stableStringify(result);
  assert.match(bytes, /bounded-resolver/);
  assert.match(bytes, /model-v1/);
  assert.doesNotMatch(bytes, /raw_prompt|\/Users\/|secret/);
});

test('Phase 14 calibration fixtures are append-only and reference candidate canonical IDs', () => {
  const tasks = JSON.parse(readFileSync(join(repoRoot, 'calibration-tasks.json'), 'utf8'));
  assert.deepEqual(tasks.slice(0, 30).map(task => task.id), Array.from({ length: 30 }, (_, index) => index + 1));
  const phase14 = tasks.filter(task => task.phase14_mapping === true);
  assert.ok(phase14.length >= 2);
  for (const fixture of phase14) {
    const ids = fixture.mapping_fixture.registry.records.map(record => record.canonical_identity);
    assert.ok(ids.includes(fixture.mapping_fixture.expected_target));
  }
});
