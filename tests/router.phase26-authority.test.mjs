import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCandidate } from '../src/registry/reconcile.mjs';

test('candidate reconciliation exposes exact approval binding before mutation', () => {
  const result = reconcileCandidate({
    active: { schema_version: 1, records: [] },
    candidate: { schema_version: 1, records: [] },
    aliases: [],
    references: { schema_version: 1, edges: [] },
  });
  assert.equal(result.approval_required, true, 'PHASE26_AUTHORITY_INCOMPLETE');
});
