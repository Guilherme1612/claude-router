import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIREMENT_IDS } from '../src/release/run-release.mjs';

test('release runner owns fresh evidence for REL-01 through REL-09', () => {
  const required = Array.from({ length: 9 }, (_, index) => `REL-0${index + 1}`);
  assert.deepEqual(REQUIREMENT_IDS.filter(id => id.startsWith('REL-')), required,
    'PHASE26_RELEASE_EVIDENCE_MISSING');
});
