import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROUTING_MODES,
  resolveRoutingMode,
} from '../src/orchestrator/preferences.mjs';
import { inspectDecision } from '../src/runtime/router.mjs';

test('routing modes normalize canonical values and observation aliases', () => {
  assert.deepEqual(ROUTING_MODES, ['direct', 'adaptive', 'semantic', 'pass_through']);
  assert.equal(resolveRoutingMode({ mode: 'direct' }).mode, 'direct');
  assert.equal(resolveRoutingMode({ mode: 'adaptive' }).mode, 'adaptive');
  assert.equal(resolveRoutingMode({ mode: 'semantic' }).mode, 'semantic');
  assert.equal(resolveRoutingMode({ mode: 'observation' }).mode, 'pass_through');
  assert.equal(resolveRoutingMode({ mode: 'observation/pass-through' }).mode, 'pass_through');
});

test('per-call mode wins over workflow, project, runtime, and global preferences', () => {
  const preferences = [
    { preference_id: 'global', scope: 'global-user', routing_mode: 'direct' },
    { preference_id: 'runtime', scope: 'runtime', runtime: 'claude', routing_mode: 'semantic' },
    { preference_id: 'project', scope: 'project', project_id: 'router', routing_mode: 'pass_through' },
    { preference_id: 'workflow', scope: 'workflow', workflow_id: 'inspect', routing_mode: 'adaptive' },
  ];
  const scope = { runtime: 'claude', project_id: 'router', workflow_id: 'inspect' };

  assert.equal(resolveRoutingMode({ preferences, scope }).mode, 'adaptive');
  assert.equal(resolveRoutingMode({ mode: 'direct', preferences, scope }).mode, 'direct');
  assert.equal(resolveRoutingMode({ preferences, scope }).source, 'workflow');
});

test('invalid routing mode returns a stable reason and adaptive-safe fallback', () => {
  const result = resolveRoutingMode({ mode: 'invented-mode' });
  assert.equal(result.mode, 'adaptive');
  assert.equal(result.reason_code, 'invalid_routing_mode');
  assert.equal(result.source, 'fallback');
});

test('direct mode is an inspectable short circuit', () => {
  const output = inspectDecision('route this complex task', {
    routingMode: 'direct',
    manifest: { manifest_fingerprint: 'direct-fixture' },
    modeMap: { entries: [] },
    semanticRecords: [{ stable_id: 'should-not-run' }],
  });
  assert.equal(output.routing_mode, 'direct');
  assert.equal(output.semantic, null);
  assert.equal(output.selected_route, null);
  assert.equal(output.pass_through_reason, 'routing_mode_direct');
  assert.ok(output.decision_trace.includes('mode:direct'));
});

test('semantic mode reports inactive instead of falling back when records are absent', () => {
  const output = inspectDecision('route this complex task', {
    routingMode: 'semantic',
    manifest: { manifest_fingerprint: 'inactive-fixture' },
    modeMap: { entries: [] },
  });
  assert.equal(output.routing_mode, 'semantic');
  assert.equal(output.semantic_activation.status, 'inactive');
  assert.equal(output.pass_through_reason, 'semantic_inactive');
  assert.equal(output.selected_route, null);
});
