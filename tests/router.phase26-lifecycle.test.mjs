import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverReleaseTuple } from '../src/prompt/publish-index.mjs';

test('recovery reports complete-tuple last-known-good restoration', () => {
  let result;
  try {
    result = recoverReleaseTuple({ ownedRoot: '/definitely-missing-phase26-root' });
  } catch (error) {
    result = { reason_code: error.message };
  }
  assert.equal(result.tuple_scope, 'complete', 'PHASE26_LIFECYCLE_INCOMPLETE');
});
