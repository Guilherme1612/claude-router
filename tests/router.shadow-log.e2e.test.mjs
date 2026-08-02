import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(process.env.HOME, '.claude', 'hooks', 'router.mjs');

function runHook(home, payload, contextModulePath) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, HOME: home, ROUTER_RUNTIME: 'claude', ROUTER_CONTEXT_MODULE_PATH: contextModulePath },
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('installed-shaped hook sequence emits measure-only divergence evidence', () => {
  const home = mkdtempSync(join(tmpdir(), 'router-shadow-e2e-'));
  const routerDir = join(home, '.claude/router');
  mkdirSync(routerDir, { recursive: true });
  const contextModulePath = join(home, 'context-stub.mjs');
  writeFileSync(contextModulePath, 'export function routeContextPrompt() { return { additional_context: "", handled: false }; }\n');
  const now = Date.now();
  const rows = [
    { ts: now - 3_000, prompt_signature: '1'.repeat(64), suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [], runtime: 'claude', cache_hit: false, cache_status: 'miss' },
    { ts: now - 2_000, prompt_signature: '2'.repeat(64), suggested_mode: 'verify', suggested_skills: ['gsd-verify'], suggested_agents: [], runtime: 'claude', cache_hit: false, cache_status: 'miss' },
    { ts: now - 1_000, prompt_signature: '3'.repeat(64), suggested_mode: 'ship', suggested_skills: ['gsd-ship'], suggested_agents: [], runtime: 'claude', cache_hit: false, cache_status: 'miss' },
    { ts: now - 500, prompt_signature: '4'.repeat(64), suggested_mode: 'cached', suggested_skills: ['gsd-cached'], suggested_agents: [], runtime: 'claude', cache_hit: true, cache_status: 'hit' },
  ];
  writeFileSync(join(routerDir, 'telemetry.jsonl'), rows.map(JSON.stringify).join('\n') + '\n');

  const events = [
    { hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'gsd-debug' } },
    { hook_event_name: 'PostToolUseFailure', tool_name: 'Skill', tool_input: { skill: 'gsd-verify' } },
    { hook_event_name: 'Stop', stop_hook_active: false },
    { hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'gsd-cached' } },
  ];
  for (const event of events) {
    const result = runHook(home, event, contextModulePath);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }

  const shadowPath = join(routerDir, 'shadow-log.jsonl');
  const persisted = readFileSync(shadowPath, 'utf8');
  assert.equal(persisted.split('\n').filter(Boolean).length, 3);
  assert.doesNotMatch(persisted, /tool_input|tool_response|command_args|transcript_path/);
  const reportScript = `const m=await import(${JSON.stringify(HOOK)}); process.stdout.write(JSON.stringify(m.buildShadowDivergenceReport()));`;
  const reportResult = spawnSync(process.execPath, ['--input-type=module', '-e', reportScript], {
    env: { ...process.env, HOME: home, ROUTER_RUNTIME: 'claude' },
    encoding: 'utf8',
  });
  assert.equal(reportResult.status, 0, reportResult.stderr);
  const report = JSON.parse(reportResult.stdout);
  assert.deepEqual(report.by_mode, {
    debug: { accepted: 1, rejected: 0, no_signal: 0 },
    ship: { accepted: 0, rejected: 0, no_signal: 1 },
    verify: { accepted: 0, rejected: 1, no_signal: 0 },
  });
  assert.equal(report.calibration_enabled, false);
  assert.equal(existsSync(join(routerDir, 'calibration.json')), false);
});
