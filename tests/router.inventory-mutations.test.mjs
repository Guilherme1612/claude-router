import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
  mutationPlayback,
  playbackMutation,
} from './helpers/inventory-fixture.mjs';
import { diffFingerprintTrees } from '../src/registry/diff.mjs';
import { reconcileCandidate } from '../src/registry/reconcile.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';

const profiles = [
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
];

function tree(entries) {
  return { schema_version: 1, roots: [], entries, diagnostics: [] };
}

function mutate(profile, mutation) {
  return playbackMutation(profile, mutation, records => {
    const next = structuredClone(records);
    const first = next[0];
    if (mutation === 'add') next.push({ ...first, name: `${first.name}-added`, provenance: first.provenance.map(p => ({ ...p, relative_path: `capabilities/${first.name}-added/manifest.md` })), runtime_variants: first.runtime_variants.map(v => ({ ...v, native_identity: `${v.native_identity}-added` })) });
    if (mutation === 'edit') first.content = { body: 'edited semantic bytes' };
    if (mutation === 'rename') { first.name += '-renamed'; first.provenance[0].relative_path = `capabilities/${first.name}/manifest.md`; }
    if (mutation === 'move') first.provenance[0].logical_root = 'fixture_project';
    if (mutation === 'disable') { first.enabled = false; first.dispatchable = false; first.invocation = { availability: 'unavailable', reason: 'disabled' }; }
    if (mutation === 'replace') { first.name += '-replacement'; first.provenance[0].relative_path = `capabilities/${first.name}/manifest.md`; first.provenance[0].source_fingerprint += '-replacement'; first.runtime_variants[0].native_identity += '-replacement'; }
    if (mutation === 'dependency-loss') { first.dependencies = { state: 'declared', items: [{ id: 'fixture:missing', available: false }] }; first.dispatchable = false; }
    if (mutation === 'removal') next.shift();
    return next;
  });
}

test('[phase21-red:mutation] D-19 mutation matrix has deterministic identity lifecycle and retained evidence', () => {
  for (const buildProfile of profiles) {
    const base = buildProfile();
    for (const mutation of mutationPlayback) {
      const current = mutate(base, mutation);
      const first = diffFingerprintTrees(tree(base), tree(current));
      const second = diffFingerprintTrees(tree([...base].reverse()), tree([...current].reverse()));
      assert.deepEqual(first, second, `${buildProfile.name}:${mutation}`);
      const alreadyInertDisable = mutation === 'disable' && base[0].dispatchable === false;
      assert.equal(first.events.length > 0, !alreadyInertDisable, `${buildProfile.name}:${mutation}`);
      assert.ok(first.events.every(event => event.old_provenance || event.new_provenance));
      assert.equal(new Set(current.map(stableCapabilityId)).size, current.length);
    }
  }
});

test('[phase21-red:mutation] disabled records remain inspectable while all dispatch references invalidate', () => {
  const disabled = mutate(buildClaudeHeavyProfile(), 'disable');
  const targetId = stableCapabilityId(disabled[0]);
  const result = reconcileCandidate({
    candidate: { schema_version: 1, records: disabled },
    references: { schema_version: 1, edges: [
      { id: 'alias', type: 'alias', from_id: 'alias:disabled', to_id: targetId },
      { id: 'compiled', type: 'compiled-route', from_id: 'route:disabled', to_id: 'alias:disabled' },
    ] },
  });
  assert.ok(disabled.some(record => record.enabled === false));
  assert.deepEqual(result.invalidated_ids, [targetId, 'alias:disabled', 'route:disabled'].sort());
  assert.deepEqual(result.references.edges, []);
});

test('[phase21-red:mutation] replacements get new identity and cannot inherit correction ownership', () => {
  const base = buildCodexHeavyProfile();
  const replacement = mutate(base, 'replace');
  const oldId = stableCapabilityId(base[0]);
  const newId = stableCapabilityId(replacement[0]);
  assert.notEqual(oldId, newId);
  const result = reconcileCandidate({
    candidate: { schema_version: 1, records: replacement },
    lifecycle: { events: [{ canonical_id: oldId, primary: 'replaced' }], diagnostics: [] },
    references: { schema_version: 1, edges: [
      { id: 'correction', type: 'correction', from_id: 'correction:old', to_id: oldId },
    ] },
  });
  assert.ok(result.invalidated_ids.includes('correction:old'));
  assert.equal(result.invalidated_ids.includes(newId), false);
});
