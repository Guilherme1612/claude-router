import assert from 'node:assert/strict';
import test from 'node:test';

import declarations from '../src/orchestrator/workflow-declarations.json' with { type: 'json' };
import { SEMANTIC_WORKFLOWS } from '../src/registry/semantic.mjs';

const REQUIRED = [
  'quality-audit',
  'feature-build',
  'bug-diagnosis-fix',
  'refactor-optimization',
  'design-review',
  'browser-interaction-verification',
  'coordinator-workflow',
];

test('generic family declarations and in-process mirror remain in parity', () => {
  const json = new Map(declarations.semantic_workflows.map(item => [item.workflow_id, item]));
  const mirror = new Map(SEMANTIC_WORKFLOWS.map(item => [item.workflow_id, item]));
  for (const workflowId of REQUIRED) {
    assert.ok(json.has(workflowId), `JSON declaration missing ${workflowId}`);
    assert.ok(mirror.has(workflowId), `mirror declaration missing ${workflowId}`);
    for (const field of ['goal', 'subjects', 'operations', 'roles', 'aliases', 'evidence_needs', 'max_capabilities']) {
      assert.deepEqual(mirror.get(workflowId)[field], json.get(workflowId)[field], `${workflowId}.${field}`);
    }
  }
});

test('generic declarations stay bounded and framework-neutral', () => {
  for (const workflow of declarations.semantic_workflows.filter(item => REQUIRED.includes(item.workflow_id))) {
    assert.ok(Number.isInteger(workflow.max_capabilities) && workflow.max_capabilities > 0 && workflow.max_capabilities <= 8);
    assert.ok(workflow.roles.length > 0);
    assert.ok(workflow.evidence_needs.length > 0);
    assert.doesNotMatch(JSON.stringify(workflow), /Claude|Codex|GSD|skill|agent|command/i);
  }
});
