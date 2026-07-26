import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleRegistry } from '../src/registry/build.mjs';
import * as contractApi from '../src/registry/contract.mjs';
import { contentFingerprint, stableCapabilityId } from '../src/registry/identity.mjs';
import { reconcileCandidate } from '../src/registry/reconcile.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const { buildCapabilityContract } = contractApi;
const resolveContractOverlays = (...args) => contractApi.resolveContractOverlays(...args);
const applyContractOverlays = (...args) => contractApi.applyContractOverlays(...args);

function installed() {
  const record = buildClaudeHeavyProfile()[0];
  return { ...record, contract: buildCapabilityContract(record, contractEvidence(record)) };
}

function overlay(record, overrides = {}) {
  return {
    schema_version: 1,
    kind: 'contract-overlay-v1',
    overlay_id: 'correction:atlas-risk',
    provenance: 'correction',
    binding: {
      stable_id: stableCapabilityId(record),
      source_fingerprint: contentFingerprint(record),
      scope: record.scope,
      runtime: record.invocation.runtime,
    },
    fields: { risk: { value: 'low' } },
    ...overrides,
  };
}

test('[phase22-red:overlays] exact optional overlay enriches only an installed capability', () => {
  const record = installed();
  const resolved = resolveContractOverlays([record], [overlay(record)]);
  assert.equal(resolved.accepted.length, 1);
  assert.deepEqual(resolved.rejected, []);
  const applied = applyContractOverlays([record], resolved);
  assert.equal(applied[0].contract.fields.risk.value, 'low');
  assert.equal(applied[0].dispatchable, record.dispatchable);
  assert.deepEqual(applyContractOverlays([record], resolveContractOverlays([record], [])), [record]);

  const absent = overlay(record, {
    binding: { ...overlay(record).binding, stable_id: 'router/overlay-only' },
  });
  assert.equal(resolveContractOverlays([record], [absent]).accepted.length, 0);
  assert.equal(applyContractOverlays([record], resolveContractOverlays([record], [absent])).length, 1);
});

test('[phase22-red:overlays] malformed unsafe and authority-bearing overlays are rejected and inert', () => {
  const record = installed();
  const cases = [
    overlay(record, { schema_version: 2 }),
    overlay(record, { kind: 'other' }),
    overlay(record, { binding: { ...overlay(record).binding, source_fingerprint: 'wrong' } }),
    overlay(record, { binding: { ...overlay(record).binding, runtime: 'codex' } }),
    overlay(record, { binding: { ...overlay(record).binding, scope: { kind: 'user', identity: 'other' } } }),
    overlay(record, { dispatchable: true }),
    overlay(record, { fields: { dispatch_eligible: { value: true } } }),
    overlay(record, { fields: { unknown_field: { value: 'x' } } }),
    overlay(record, { overlay_id: '../escape' }),
    overlay(record, { overlay_id: '/Users/private/SECRET' }),
    overlay(record, { overlay_id: 'bad\u0000id' }),
    overlay(record, { raw_body: 'authored body SECRET' }),
    overlay(record, { fields: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`field-${index}`, { value: index }])) }),
  ];
  for (const candidate of cases) {
    const resolved = resolveContractOverlays([record], [candidate]);
    assert.equal(resolved.accepted.length, 0);
    assert.equal(resolved.rejected.length, 1);
    assert.deepEqual(applyContractOverlays([record], resolved), [record]);
    assert.doesNotMatch(stableStringify(resolved.rejected), /SECRET|authored body|\/Users\//);
  }
});

test('[phase22-red:overlays] overlay permutations are byte deterministic', () => {
  const record = installed();
  const overlays = [
    overlay(record),
    overlay(record, { overlay_id: 'correction:atlas-purpose', fields: { purpose: { value: 'routing' } } }),
    overlay(record, { overlay_id: 'correction:stale', binding: { ...overlay(record).binding, source_fingerprint: 'stale' } }),
  ];
  const forward = resolveContractOverlays([record], overlays);
  const reverse = resolveContractOverlays([record], overlays.toReversed());
  assert.equal(stableStringify(forward), stableStringify(reverse));
  assert.equal(
    stableStringify(applyContractOverlays([record], forward)),
    stableStringify(applyContractOverlays([record], reverse)),
  );
});

test('[phase22:overlays] conflicting corrections and duplicate IDs are rejected', () => {
  const record = installed();
  const high = overlay(record, { overlay_id: 'correction:a', fields: { risk: { value: 'high' } } });
  const low = overlay(record, { overlay_id: 'correction:z', fields: { risk: { value: 'low' } } });
  const conflict = resolveContractOverlays([record], [high, low]);
  assert.equal(conflict.accepted.length, 0);
  assert.deepEqual(conflict.rejected.map(value => value.reason_code), [
    'overlay_correction_conflicting',
    'overlay_correction_conflicting',
  ]);
  const applied = applyContractOverlays([record], conflict);
  assert.equal(applied[0].contract.disposition, 'recommendation-only');
  assert.equal(applied[0].contract.fields.risk.state, 'unknown');

  const duplicate = resolveContractOverlays([record], [low, low]);
  assert.equal(duplicate.accepted.length, 0);
  assert.deepEqual(duplicate.rejected.map(value => value.reason_code), [
    'overlay_id_duplicate',
    'overlay_id_duplicate',
  ]);
});

test('[phase22-red:overlays] assembler accepts explicit overlays without adding a discovery root', () => {
  const record = installed();
  const acquisition = {
    claude: { observations: [record], diagnostics: [] },
    codex: { observations: [], diagnostics: [] },
  };
  const plain = assembleRegistry(acquisition);
  const enriched = assembleRegistry(acquisition, { overlays: [overlay(record)] });
  assert.equal(enriched.registry.records.length, plain.registry.records.length);
  assert.equal(enriched.registry.records[0].contract.fields.risk.value, 'low');
  assert.equal(enriched.registry.records[0].dispatchable, plain.registry.records[0].dispatchable);
  assert.equal(enriched.overlays.accepted.length, 1);
});

test('[phase22-red:overlays] reconciliation invalidates corrections before callbacks', () => {
  const record = installed();
  const overlays = resolveContractOverlays([record], [overlay(record)]);
  const observed = [];
  const result = reconcileCandidate({
    candidate: { schema_version: 1, records: [{ ...record, dispatchable: false, dependencies: { state: 'declared', items: [{ id: 'missing', available: false }] } }] },
    overlays,
    evaluateReferences: value => observed.push(value),
  });
  assert.ok(result.invalidated_ids.includes('correction:atlas-risk'));
  assert.ok(observed.every(value => value.references.edges.length === 0));
});

test('[phase22-red:overlays] edit replacement and removal invalidate stale corrections', () => {
  const record = installed();
  const correction = overlay(record);
  const edited = {
    ...record,
    provenance: record.provenance.map(source => ({ ...source, source_fingerprint: 'edited' })),
  };
  const replacement = {
    ...edited,
    canonical_identity: 'router/replacement',
  };
  for (const records of [[edited], [replacement], []]) {
    const resolved = resolveContractOverlays(records, [correction]);
    assert.equal(resolved.accepted.length, 0);
    assert.equal(resolved.rejected.length, 1);
  }
});

test('[phase22-red:overlays] rename carryover requires explicit one-to-one exact lineage', () => {
  const record = installed();
  const old = overlay(record);
  const renamed = {
    ...record,
    name: 'atlas-renamed',
    provenance: record.provenance.map(source => ({
      ...source,
      relative_path: 'capabilities/atlas-renamed/manifest.md',
    })),
  };
  const stale = resolveContractOverlays([renamed], [old]);
  assert.equal(stale.accepted.length, 0);
  const carried = resolveContractOverlays([renamed], [old], {
    lineage: [{
      from_id: old.binding.stable_id,
      to_id: stableCapabilityId(renamed),
      from_fingerprint: old.binding.source_fingerprint,
      to_fingerprint: contentFingerprint(renamed),
      exact: true,
    }],
  });
  assert.equal(carried.accepted.length, 1);
  assert.equal(carried.accepted[0].carried_over, true);
});
