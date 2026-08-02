import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { compileStartupPointer } from '../src/steward/startup-pointer.mjs';

const SOURCE_HOOK = resolve('src/runtime/router.mjs');
const MODULE = resolve('src/context/prompt-route.mjs');
const CANARY = 'PRIVATE-CANARY-raw-prompt-secret';
const VERSION = 'v1-0123456789abcdef';

function capsule(overrides = {}) {
  return {
    schema_version: 1, scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'phase-15', summary: 'Context recovery' },
    position: { workflow: 'gsd-execute-phase', phase: '15', plan: '03', task: '3' }, status: 'active',
    artifacts: [{ ref: 'docs/design.md', type: 'design', status: 'current', witness: { kind: 'version', value: '1' }, priority: 1 }],
    blockers: [], freshness: { captured_at: 1, generation: 'phase-15' }, provenance: { source: 'workflow-state', version: '1' }, ...overrides,
  };
}

function saveCompiledCapsule(root, value) {
  const versionRoot = join(root, 'compiled-index', 'versions', VERSION);
  mkdirSync(versionRoot, { recursive: true });
  const index = {
    schema_version: 2, version_id: VERSION, policy_version: 'workflow-transitions-v1',
    capsule_contract_version: 1,
    routes: { 'gsd-execute-phase': {
      workflow_id: 'gsd-execute-phase', transition_id: 'gsd.execute',
      dispatch_eligible: true, reason_code: 'unique_valid_transition',
    } },
  };
  const bytes = stableStringify(index) + '\n';
  const payloadSha = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(versionRoot, 'index.json'), bytes);
  writeFileSync(join(versionRoot, 'metadata.json'), stableStringify({
    schema_version: 2, state: 'verified', version_id: VERSION,
    created_at: Date.now() - 1_000, expires_at: Date.now() + 60_000,
    compatibility: { router_contract: 'prompt-route-v1', policy_version: 'workflow-transitions-v1', capsule_schema_version: 1, orchestrator_contract_version: 'workflow-first-v1', context_contract_version: 'workflow-context-contract-v1' },
    payload_sha256: payloadSha,
  }) + '\n');
  writeFileSync(join(root, 'compiled-index', 'active.json'), stableStringify({
    schema_version: 2, version_id: VERSION, payload_sha256: payloadSha,
  }) + '\n');
  return saveCapsule({ ownedRoot: root, capsule: value });
}

function runHook(prompt, env = {}) {
  const runtime = mkdtempSync(join(tmpdir(), 'router-hook-source-'));
  try {
    const hook = join(runtime, 'router.mjs');
    writeFileSync(hook, readFileSync(SOURCE_HOOK));
    writeFileSync(join(runtime, 'router.evolve.mjs'), readFileSync(resolve('src/runtime/router.evolve.mjs')));
    return spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }), encoding: 'utf8',
      env: {
        ...process.env,
        ROUTER_CONTEXT_MODULE_PATH: MODULE,
        ROUTER_STARTUP_ACK_MODULE_PATH: resolve('src/steward/startup-ack.mjs'),
        ROUTER_STARTUP_POINTER_MODULE_PATH: resolve('src/steward/startup-pointer.mjs'),
        ROUTER_TEST_FRESHNESS: 'fresh',
        ROUTER_TEST_COVERAGE_FRESHNESS: 'fresh',
        ...env,
      },
    });
  } finally {
    rmSync(runtime, { recursive: true, force: true });
  }
}

test('prompt adapter owns all three referential outcomes and never returns prompt bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-prompt-context-'));
  try {
    assert.equal(saveCompiledCapsule(root, capsule()).status, 'saved');
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
    assert.equal(saveCompiledCapsule(root, capsule()).status, 'saved');
    const refreshed = routeContextPrompt({
      prompt: 'continue', ownedRoot: root, projectRoot: root, forceStale: true,
      authoritative: { status: 'dispatchable', value: { workflow: 'gsd-execute-phase', phase: '15', plan: '03', task: '4', status: 'active', action: 'continue_workflow' } },
    });
    assert.equal(refreshed.resolution.outcome, 'refresh');
    assert.equal(JSON.parse(readFileSync(join(root, 'context-capsule.json'))).position.task, '4');

    assert.equal(saveCompiledCapsule(root, capsule({ status: 'completed' })).status, 'saved');
    const terminal = routeContextPrompt({ prompt: 'finish it', ownedRoot: root, projectRoot: root });
    assert.equal(terminal.resolution.reason_code, 'terminal_workflow');
    assert.equal(terminal.resolution.dispatch_eligible, false);
    assert.match(terminal.additional_context, /Which new action/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real UserPromptSubmit hook resolves before normal routing and failures remain fail-open', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-live-context-'));
  try {
    assert.equal(saveCompiledCapsule(root, capsule()).status, 'saved');
    const resumed = runHook('continue', { ROUTER_CONTEXT_OWNED_ROOT: root, ROUTER_CONTEXT_PROJECT_ROOT: root });
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.notEqual(resumed.stdout, '', resumed.stderr);
    const output = JSON.parse(resumed.stdout);
    assert.match(output.hookSpecificOutput.additionalContext, /context-recovery/);
    assert.equal((output.hookSpecificOutput.additionalContext.match(/<!-- router-inject\b/g) || []).length, 1);

    const forced = runHook('continue', { ROUTER_CONTEXT_OWNED_ROOT: root, ROUTER_CONTEXT_PROJECT_ROOT: root, ROUTER_CONTEXT_MODULE_PATH: join(root, 'missing.mjs') });
    assert.equal(forced.status, 0);
    assert.equal(forced.stdout, '');
    assert.doesNotMatch(forced.stderr, /PRIVATE|CANARY|missing\.mjs/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('UserPromptSubmit emits the startup pointer once then acknowledges cooldown', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-hook-startup-'));
  try {
    compileStartupPointer({
      ownedRoot: root,
      pointer: {
        schema_version: 1,
        policy_version: 'steward-policy-v1',
        fingerprint: 'a'.repeat(64),
        available: true,
        cooldown_until_ms: null,
      },
    });
    const env = { ROUTER_CONTEXT_OWNED_ROOT: root, ROUTER_CONTEXT_PROJECT_ROOT: root };
    const first = runHook('debug this failing test', env);
    assert.match(first.stdout, /Router suggestion available/);
    assert.match(first.stdout, /router-inject/);
    const second = runHook('debug this failing test', env);
    assert.doesNotMatch(second.stdout, /Router suggestion available/);
    assert.match(second.stdout, /router-inject/);
    const state = JSON.parse(readFileSync(join(root, 'steward', 'state.json'), 'utf8'));
    assert.ok(Number.isSafeInteger(state.cooldown_at['a'.repeat(64)]));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('UserPromptSubmit does not acknowledge a startup notice omitted by the byte cap', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-hook-cap-'));
  const modulePath = join(root, 'near-cap-route.mjs');
  try {
    compileStartupPointer({
      ownedRoot: root,
      pointer: {
        schema_version: 1, policy_version: 'steward-policy-v1',
        fingerprint: 'b'.repeat(64), available: true, cooldown_until_ms: null,
      },
    });
    writeFileSync(modulePath, `export function routeContextPrompt() {
      return { handled: false, additional_context: ${JSON.stringify('x'.repeat(2048))}, startup_notice_emitted: false };
    }\n`);
    const result = runHook('debug this failing test', {
      ROUTER_CONTEXT_OWNED_ROOT: root,
      ROUTER_CONTEXT_PROJECT_ROOT: root,
      ROUTER_CONTEXT_MODULE_PATH: modulePath,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, 'steward', 'state.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit-looking prompts pass through when there is no active capsule', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-no-context-'));
  try {
    const routed = routeContextPrompt({ prompt: 'review phase 15 security', ownedRoot: root, projectRoot: root });
    assert.equal(routed.handled, false);
    assert.equal(routed.reason_code, 'capsule_missing');
  } finally { await rm(root, { recursive: true, force: true }); }
});
