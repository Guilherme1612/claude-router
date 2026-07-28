import { join } from 'node:path';
import { COOLDOWN_MS } from '../health/thresholds.mjs';
import { createStewardStore } from './state.mjs';
import { compileStartupPointer } from './startup-pointer.mjs';

export function acknowledgeStartupNotice({ ownedRoot, pointer, now = Date.now() } = {}) {
  if (!pointer?.available || typeof pointer.fingerprint !== 'string') return { status: 'unchanged' };
  const stored = createStewardStore({ root: join(ownedRoot, 'steward') })
    .recordCooldown(pointer.fingerprint, { now });
  if (stored.status !== 'stored' && stored.status !== 'unchanged') return stored;
  compileStartupPointer({
    ownedRoot,
    pointer: {
      ...pointer,
      available: false,
      cooldown_until_ms: now + COOLDOWN_MS,
    },
  });
  return stored;
}
