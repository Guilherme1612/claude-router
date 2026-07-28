import test from 'node:test';
import assert from 'node:assert/strict';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';

test('prompt route consumes one bounded tuple projection without optional side reads', () => {
  let startupReads = 0;
  routeContextPrompt({
    prompt: 'hello',
    ownedRoot: '/unused',
    projectRoot: '/unused',
    loadStartupPointerFn: () => { startupReads += 1; return { available: false }; },
  });
  assert.equal(startupReads, 0, 'PHASE26_PROMPT_PATH_NOT_READ_ONLY');
});
