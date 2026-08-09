import test from 'node:test';
import assert from 'node:assert/strict';
import { FOCUSED_TESTS, verifyInstalledParity, verifyReleaseGate } from '../scripts/release-v17-gate.mjs';

test('v1.7 release gate declares the focused closure and skips no tests by construction', () => {
  assert.ok(FOCUSED_TESTS.includes('tests/router.production-integration.test.mjs'));
  assert.ok(FOCUSED_TESTS.includes('tests/router.installer-coexistence.test.mjs'));
  assert.equal(new Set(FOCUSED_TESTS).size, FOCUSED_TESTS.length);
});

test('v1.7 release gate verifies a fresh dual-runtime installed closure', async () => {
  const result = await verifyInstalledParity(process.cwd());
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.runtimes, ['claude', 'codex']);
});

test('v1.7 phase gate records structured pre-archive planning evidence', async () => {
  const result = await verifyReleaseGate({ root: process.cwd(), final: false, run_tests: false });
  assert.equal(result.focused.skipped, true);
  assert.equal(result.full.skipped, true);
  assert.equal(typeof result.planning.ok, 'boolean');
  assert.equal(result.archive.skipped, true);
});

