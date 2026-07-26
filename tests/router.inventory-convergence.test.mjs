import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
  mutationPlayback,
  playbackMutation,
} from './helpers/inventory-fixture.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import * as validation from '../src/registry/validate.mjs';

const profiles = [
  ['claude-heavy', buildClaudeHeavyProfile],
  ['codex-heavy', buildCodexHeavyProfile],
  ['mixed-custom', buildMixedCustomProfile],
  ['unknown-future', buildUnknownFutureProfile],
];

const anomalies = [
  'missed',
  'duplicated',
  'coalesced',
  'reordered',
  'filename-less',
  'watcher-restart',
  'root-replacement',
  'fingerprint-mismatch',
];

function mutate(profile, mutation) {
  return playbackMutation(profile, mutation, (records, kind) => {
    const target = records[0];
    if (kind === 'add') records.push(structuredClone({ ...target, name: `${target.name}-added`, canonical_identity: `${target.name}/added` }));
    if (kind === 'edit') target.diagnostics = [{ code: 'fixture-edit' }];
    if (kind === 'rename') target.name = `${target.name}-renamed`;
    if (kind === 'move') target.provenance[0].relative_path = `moved/${target.name}/manifest.md`;
    if (kind === 'disable') { target.enabled = false; target.dispatchable = false; }
    if (kind === 'replace') target.provenance[0].source_fingerprint = `${target.provenance[0].source_fingerprint}-replacement`;
    if (kind === 'dependency-loss') target.dependencies = { state: 'unavailable', items: [{ id: 'fixture-dependency', available: false }] };
    if (kind === 'removal') records.shift();
    return records;
  });
}

for (const [profileName, buildProfile] of profiles) {
  test(`[phase21-red:convergence] ${profileName} mutations and watcher anomalies converge to authoritative bytes`, () => {
    for (const mutation of mutationPlayback) {
      const authoritative = mutate(buildProfile(), mutation);
      const semantic = { snapshot: authoritative, invalidated_ids: mutation === 'removal' ? ['removed'] : [] };
      for (const anomaly of anomalies) {
        const eventHint = anomaly === 'reordered'
          ? [...authoritative].reverse()
          : structuredClone(authoritative);
        const result = validation.compareSemanticConvergence({
          candidate: semantic,
          incremental: { snapshot: eventHint, invalidated_ids: semantic.invalidated_ids },
          authoritative: semantic,
        });
        assert.equal(result.passed, true, `${profileName}/${mutation}/${anomaly}`);
        assert.equal(result.semantic_bytes, stableStringify(semantic));
      }
      assert.deepEqual(
        validation.compareSemanticConvergence({ candidate: semantic, incremental: semantic, authoritative: semantic }),
        validation.compareSemanticConvergence({ candidate: semantic, incremental: semantic, authoritative: semantic }),
        `${profileName}/${mutation} must be deterministic`,
      );
    }
  });
}

test('[phase21-red:convergence] operational metadata is excluded from semantic convergence', () => {
  const semantic = { snapshot: buildClaudeHeavyProfile(), invalidated_ids: ['router/dependent'] };
  const result = validation.compareSemanticConvergence({
    candidate: { ...semantic, generated_at: 1, generation_id: 'candidate-a', trigger: 'startup' },
    incremental: { ...semantic, generated_at: 2, generation_id: 'candidate-b', trigger: 'periodic-repair' },
    authoritative: { ...semantic, generated_at: 3, generation_id: 'candidate-c', trigger: 'fingerprint-mismatch' },
  });
  assert.equal(result.passed, true);
  assert.doesNotMatch(result.semantic_bytes, /generated_at|generation_id|trigger/);
});
