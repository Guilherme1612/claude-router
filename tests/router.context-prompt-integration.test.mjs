import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';

const LIVE_HOOK = '/Users/guilherme/.claude/hooks/router.mjs';
const MODULE = resolve('src/context/prompt-route.mjs');
const CANARY = 'PRIVATE-CANARY-raw-prompt-secret';

function capsule(overrides = {}) {
  return {
    schema_version: 1, scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'phase-15', summary: 'Context recovery' },
    position: { workflow: 'gsd-execute-phase', phase: '15', plan: '03', task: '3' }, status: 'active',
    artifacts: [{ ref: 'docs/design.md', type: 'design', status: 'current', witness: { kind: 'version', value: '1' }, priority: 1 }],
    blockers: [], freshness: { captured_at: 1, generation: 'phase-15' }, provenance: { source: 'workflow-state', version: '1' }, ...overrides,
  };
}

function runHook(prompt, env = {}) {
  return spawnSync(process.execPath, [LIVE_HOOK], {
    input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }), encoding: 'utf8',
    env: { ...process.env, ROUTER_CONTEXT_MODULE_PATH: MODULE, ROUTER_TEST_FRESHNESS: 'fresh', ...env },
  });
}

test('prompt adapter owns all three referential outcomes and never returns prompt bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-prompt-context-'));
  try {
    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule() }).status, 'saved');
    for (const [prompt, action] of [['continue', 'continue_workflow'], ['finish it', 'finish_remaining_work'], ['use the design', 'use_linked_design']]) {
      const routed = routeContextPrompt({ prompt, ownedRoot: root, projectRoot: root });
      assert.equal(routed.handled, true);
      assert.equal(routed.resolution.action, action);
      assert.equal(routed.resolution.dispatch_eligible, true);
      assert.match(routed.additional_context, /context-recovery/);
      assert.doesNotMatch(JSON.stringify(routed), new RegExp(CANARY));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('prompt adapter refreshes uniquely, clarifies ambiguity, and rejects terminal revival', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-prompt-refresh-'));
  try {
    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule() }).status, 'saved');
    const refreshed = routeContextPrompt({
      prompt: 'continue', ownedRoot: root, projectRoot: root, forceStale: true,
      authoritative: { status: 'dispatchable', value: { workflow: 'gsd-execute-phase', phase: '15', plan: '03', task: '4', status: 'active', action: 'continue_workflow' } },
    });
    assert.equal(refreshed.resolution.outcome, 'refresh');
    assert.equal(JSON.parse(readFileSync(join(root, 'context-capsule.json'))).position.task, '4');

    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule({ status: 'completed' }) }).status, 'saved');
    const terminal = routeContextPrompt({ prompt: 'finish it', ownedRoot: root, projectRoot: root });
    assert.equal(terminal.resolution.reason_code, 'terminal_workflow');
    assert.equal(terminal.resolution.dispatch_eligible, false);
    assert.match(terminal.additional_context, /Which new action/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real UserPromptSubmit hook resolves before normal routing and failures remain fail-open', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-live-context-'));
  try {
    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule() }).status, 'saved');
    const resumed = runHook('continue', { ROUTER_CONTEXT_OWNED_ROOT: root, ROUTER_CONTEXT_PROJECT_ROOT: root });
    assert.equal(resumed.status, 0, resumed.stderr);
    const output = JSON.parse(resumed.stdout);
    assert.match(output.hookSpecificOutput.additionalContext, /context-recovery/);
    assert.equal((output.hookSpecificOutput.additionalContext.match(/router-inject/g) || []).length, 1);

    const forced = runHook('continue', { ROUTER_CONTEXT_OWNED_ROOT: root, ROUTER_CONTEXT_PROJECT_ROOT: root, ROUTER_CONTEXT_MODULE_PATH: join(root, 'missing.mjs') });
    assert.equal(forced.status, 0);
    assert.equal(forced.stdout, '');
    assert.doesNotMatch(forced.stderr, /PRIVATE|CANARY|missing\.mjs/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
