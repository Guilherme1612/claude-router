import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as control from '../src/cli/router-control.mjs';
import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
} from './helpers/inventory-fixture.mjs';

const records = [
  ...buildClaudeHeavyProfile(),
  ...buildCodexHeavyProfile(),
  ...buildMixedCustomProfile(),
];

test('[phase21-red:inspection] availability groups by semantic category before runtime and scope', () => {
  assert.equal(typeof control.inventoryAvailabilityProjection, 'function');
  const projection = control.inventoryAvailabilityProjection({ records });
  assert.deepEqual(
    projection.availability.map(group => group.semantic_type),
    ['agent', 'configuration', 'container', 'instruction', 'skill', 'tool'],
  );
  for (const group of projection.availability) {
    assert.ok(group.entries.every(entry => entry.semantic_type === group.semantic_type));
    assert.deepEqual(group.entries, [...group.entries].sort((left, right) => (
      left.runtime.localeCompare(right.runtime)
      || left.scope.localeCompare(right.scope)
      || left.stable_id.localeCompare(right.stable_id)
    )));
  }
});

test('[phase21-red:inspection] runtime labels are permutation-neutral and never designate a default', () => {
  assert.equal(typeof control.inventoryAvailabilityProjection, 'function');
  const first = control.inventoryAvailabilityProjection({ records }).availability;
  const renamed = records.map(record => ({
    ...record,
    invocation: record.invocation.availability === 'available'
      ? { ...record.invocation, runtime: record.invocation.runtime === 'claude' ? 'zeta' : 'alpha' }
      : record.invocation,
    provenance: record.provenance.map(source => ({
      ...source,
      runtime: source.runtime === 'claude' ? 'zeta' : 'alpha',
    })),
    runtime_variants: record.runtime_variants.map(variant => ({
      ...variant,
      runtime: variant.runtime === 'claude' ? 'zeta' : 'alpha',
    })),
  }));
  const second = control.inventoryAvailabilityProjection({ records: renamed }).availability;
  assert.deepEqual(
    first.map(group => group.semantic_type),
    second.map(group => group.semantic_type),
  );
  assert.doesNotMatch(JSON.stringify(second), /\b(default|preferred|primary|baseline)\b/i);
});

test('[phase21-red:inspection] availability filters preserve category-first grouping', () => {
  assert.equal(typeof control.inventoryAvailabilityProjection, 'function');
  const projection = control.inventoryAvailabilityProjection({
    records,
    semanticType: 'skill',
    runtime: 'codex',
    scope: 'global',
  });
  assert.deepEqual(projection.availability.map(group => group.semantic_type), ['skill']);
  assert.ok(projection.availability[0].entries.every(entry => (
    entry.runtime === 'codex' && entry.scope === 'global'
  )));
});
