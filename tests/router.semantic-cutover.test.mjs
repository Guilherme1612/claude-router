import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { inspectDecision } from '../src/runtime/router.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

function record() {
  const base = {
    ...buildClaudeHeavyProfile()[0],
    name: 'anonymous-relationship-inspector',
    canonical_identity: 'fixture/relationship-inspector',
    semantic: {
      intents: ['inspect'], subjects: ['database', 'relationship'], operations: ['inspect'],
      outputs: ['relationships', 'report'], evidence: ['adapter'], aliases: ['data model map'],
    },
    composition: { roles: ['relationship-analysis'], requires: [], conflicts: [], exclusive: false },
    dependencies: { state: 'declared', items: [] },
    effects: ['none'], risk: { level: 'low', source: 'declared' }, authority: { ceiling: 'inspect', source: 'declared' },
    cost: { latency: 'low', context_bytes: 128, tool_calls: 1 },
  };
  const evidence = contractEvidence(base);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  evidence.authority[0].value = 'inspect';
  evidence.permissions[0].value = ['read'];
  evidence.scope[0].value = base.scope;
  evidence.cost[0].value = 'low';
  return { ...base, contract: buildCapabilityContract(base, evidence) };
}

const manifest = { manifest_fingerprint: 'semantic-fixture' };
const modeMap = { schema_version: 4, thresholds: { T_high: 0.591, T_low: 0.291, M: 0.191 }, entries: [] };

test('COMP-04: semantic projection owns the production decision when activated', () => {
  const output = inspectDecision('run the database relationship map inspection', {
    manifest, modeMap, semanticRecords: [record()], mutateCache: false, logTelemetry: false, emitInjection: false,
  });
  assert.equal(output.semantic.result.status, 'resolved');
  assert.ok(output.decision_trace.includes('semantic:single_owner'));
  assert.equal(output.selected_route.invoke_kind, 'semantic');
  assert.equal(output.pass_through_reason, null);
});

test('COMP-04: unsafe semantic framing cannot activate the semantic route', () => {
  const output = inspectDecision('do not inspect the database relationship map', {
    manifest, modeMap, semanticRecords: [record()], mutateCache: false, logTelemetry: false, emitInjection: false,
  });
  assert.equal(output.semantic.intent.dispatch_eligible, false);
  assert.equal(output.selected_route, null);
});
