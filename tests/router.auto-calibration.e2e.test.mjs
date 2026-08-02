import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');

function runHook(home, payload, stub) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], {
      env: { ...process.env, HOME: home, ROUTER_RUNTIME: 'claude', ROUTER_CONTEXT_MODULE_PATH: stub },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

function acceptedRow(i, now) {
  return {
    schema_version: 1, timestamp_ms: now - 10_000 - i,
    suggestion_id: `${String(i).padStart(3, '0')}${'a'.repeat(61)}`,
    prompt_signature: `${String(i).padStart(2, '0')}${'b'.repeat(62)}`,
    suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [],
    invocation_signature: 'c'.repeat(64), outcome: 'accepted', runtime: 'claude', source_event: 'PostToolUse',
  };
}

test('installed hook publishes epoch calibration after 50 accepted routes', async () => {
  const root = join(tmpdir(), `router-auto-calib-e2e-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const claude = join(root, '.claude');
  const router = join(claude, 'router');
  mkdirSync(router, { recursive: true });
  const stub = join(root, 'context-stub.mjs');
  writeFileSync(stub, "export function routeContextPrompt() { return { additional_context: '', handled: false, startup_notice_emitted: false }; }\n");
  const fingerprint = 'd'.repeat(64);
  const now = Date.now();
  const telemetry = {
    ts: now - 500, prompt_signature: 'e'.repeat(64), suggestion_id: 'f'.repeat(64),
    suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [],
    cache_hit: false, cache_status: 'miss', runtime: 'claude',
  };
  const modeMap = { schema_version: 4, thresholds: { T_high: 0.591, T_low: 0.291, M: 0.191 }, entries: [] };
  writeFileSync(join(router, 'claude-inventory-manifest.json'), JSON.stringify({ manifest_fingerprint: fingerprint }));
  writeFileSync(join(router, 'mode-map.json'), JSON.stringify(modeMap));
  writeFileSync(join(router, 'telemetry.jsonl'), JSON.stringify(telemetry) + '\n');
  writeFileSync(join(router, 'shadow-log.jsonl'), Array.from({ length: 49 }, (_, i) => JSON.stringify(acceptedRow(i, now))).join('\n') + '\n');

  try {
    const result = await runHook(root, { hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'gsd-debug' } }, stub);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    const calibration = JSON.parse(readFileSync(join(router, 'calibration.json'), 'utf8'));
    assert.equal(calibration.manifest_fingerprint, fingerprint);
    assert.equal(calibration.mode_map_version, '4');
    assert.equal(calibration.evidence.accepted, 50);
    assert.deepEqual(JSON.parse(readFileSync(join(router, 'mode-map.json'), 'utf8')), modeMap);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
