import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { runV21Benchmark } from '../src/evaluation/v21.mjs';

const NODE = process.execPath;
const SCRIPT = new URL('../scripts/v21-benchmark.mjs', import.meta.url).pathname;

function run(...args) {
  return spawnSync(NODE, [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('v2.1 benchmark CLI emits the full privacy-safe matrix', () => {
  const result = run();
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, report.status === 'passed' ? 0 : 1);
  assert.deepEqual(report.matrix.runtimes, ['claude', 'codex']);
  assert.equal(report.matrix.routing_modes.length, 4);
  assert.equal(report.case_results.length, report.matrix.case_count * 8);
  assert.match(report.evaluation_fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(result.stdout, /audit the whole repository|private raw prompt|\/Users\/|[A-Za-z]:\\\\/);
});

test('v2.1 benchmark CLI supports bounded runtime and mode selection', () => {
  const first = run('--runtime', 'codex', '--mode', 'direct');
  const second = run('--runtime', 'codex', '--mode', 'direct');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const report = JSON.parse(first.stdout);
  assert.deepEqual(report.matrix, { runtimes: ['codex'], routing_modes: ['direct'], case_count: 20 });
  assert.equal(report.case_results.length, 20);
  assert.equal(report.evaluation_fingerprint, JSON.parse(second.stdout).evaluation_fingerprint);
});

test('native inventory is explicit, bounded, and cannot change synthetic results', async () => {
  const synthetic = await runV21Benchmark({ now: 1_800_000_000_000 });
  const native = await runV21Benchmark({
    now: 1_800_000_000_000,
    nativeSubject: () => ({
      status: 'unavailable',
      reason_code: 'native_inventory_missing',
      local_path: '/Users/private/raw-path',
    }),
  });
  assert.equal(native.native.status, 'unavailable');
  assert.equal(native.native.reason_code, 'native_inventory_missing');
  assert.equal(native.evaluation_fingerprint, synthetic.evaluation_fingerprint);
  assert.doesNotMatch(JSON.stringify(native.native), /\/Users\/private\/raw-path/);
  assert.ok(['available', 'inactive', 'unavailable'].includes(native.native.status));
});

test('native CLI opt-in reports installed inventory state separately', () => {
  const result = run('--native');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(['available', 'inactive', 'unavailable'].includes(report.native.status));
  assert.ok(report.native.reason_code);
  assert.doesNotMatch(result.stdout, /\/Users\/|audit the whole repository|private raw prompt/);
});

test('invalid CLI arguments return structured errors without fixture content', () => {
  const result = run('--runtime', 'unknown');
  assert.equal(result.status, 2);
  const error = JSON.parse(result.stderr);
  assert.equal(error.status, 'error');
  assert.equal(error.reason_code, 'invalid_benchmark_arguments');
  assert.doesNotMatch(result.stderr, /audit the whole repository|private raw prompt|\/Users\//);
});
