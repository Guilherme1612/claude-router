import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const lifecycleUrl = new URL('../src/lifecycle/router-lifecycle.mjs', import.meta.url);
const lifecycleSrc = readFileSync(lifecycleUrl, 'utf8');
const sourceRoot = resolve(dirname(fileURLToPath(lifecycleUrl)), '..');

const EXPECTED_EVOLUTION_MODULES = [
  'evolution/canary-controller.mjs',
  'evolution/candidate-calibration-route.mjs',
  'evolution/evidence.mjs',
  'evolution/perf-measure.mjs',
  'evolution/telemetry-bridge.mjs',
];

test('Task3.1 moduleNames array includes all four evolution/* modules', () => {
  // moduleNames is a local const inside installRouter; assert each entry
  // appears as a string literal in the source.
  for (const name of EXPECTED_EVOLUTION_MODULES) {
    assert.ok(
      lifecycleSrc.includes(`'${name}'`),
      `moduleNames missing entry: ${name}`,
    );
  }
  // No existing entries were removed (sanity: a known pre-existing entry survives).
  assert.ok(lifecycleSrc.includes("'registry/activate.mjs'"), 'pre-existing registry/activate.mjs entry must not be removed');
});

test('Task3.2 source files exist on disk at expected relative path', () => {
  for (const name of EXPECTED_EVOLUTION_MODULES) {
    const path = resolve(sourceRoot, name);
    assert.doesNotThrow(() => readFileSync(path), `missing source file: ${name}`);
  }
});

test('Task3.3 dynamic import of telemetry-bridge.mjs succeeds and exposes the transform', async () => {
  const bridgeUrl = new URL('../src/evolution/telemetry-bridge.mjs', import.meta.url);
  const mod = await import(bridgeUrl);
  assert.equal(typeof mod.telemetryRecordToEvidence, 'function');
});