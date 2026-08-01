// Plan 31-01 Task 1 — mirror-desync guard (T-31-04 / PROJECT.md mirror invariant).
//
// tests/router.mjs.snapshot is the byte-identical mirror of the deployable
// ~/.claude/hooks/router.mjs. Real hook code changes MUST land in BOTH files in
// lockstep — this guard fails if they ever drift. It is GREEN at creation
// (verified byte-identical) and becomes load-bearing in 31-02/31-03, where every
// hook edit must update both copies atomically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SNAPSHOT = fileURLToPath(new URL('./router.mjs.snapshot', import.meta.url));
const LIVE_HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');

test('mirror: tests/router.mjs.snapshot is byte-identical to ~/.claude/hooks/router.mjs', () => {
  const snapshot = readFileSync(SNAPSHOT, 'utf8');
  const live = readFileSync(LIVE_HOOK, 'utf8');
  assert.equal(snapshot, live, 'snapshot and live hook must stay byte-identical (lockstep mirror)');
});
