import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';

const FINGERPRINT = /^[a-f0-9]{64}$/;
const TOKEN = /^[a-z][a-z0-9_:-]{0,127}$/;
const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const waitArray = new Int32Array(new SharedArrayBuffer(4));

function fail(message) {
  throw new TypeError(message);
}

function validFingerprint(value) {
  if (typeof value !== 'string' || !FINGERPRINT.test(value)) fail('invalid suggestion fingerprint');
  return value;
}

function validNow(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('now must be a safe epoch');
  return value;
}

function emptyState() {
  return { schema_version: 1, dismissed: {}, snoozed_until: {}, cooldown_at: {} };
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema_version !== 1) return emptyState();
  const output = emptyState();
  for (const field of ['dismissed', 'snoozed_until', 'cooldown_at']) {
    if (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field])) continue;
    for (const [fingerprint, timestamp] of Object.entries(value[field])) {
      if (FINGERPRINT.test(fingerprint) && Number.isSafeInteger(timestamp) && timestamp >= 0) {
        output[field][fingerprint] = timestamp;
      }
    }
  }
  return output;
}

function mutationLock(root, { timeout_ms = 2_000, stale_ms = 30_000 } = {}) {
  const path = join(root, '.mutation.lock');
  const deadline = Date.now() + timeout_ms;
  const token = randomUUID();
  while (Date.now() <= deadline) {
    try {
      mkdirSync(path, { mode: 0o700 });
      writeFileSync(join(path, 'owner.json'), JSON.stringify({ token, pid: process.pid, started_at: Date.now() }), { mode: 0o600 });
      return {
        acquired: true,
        release() {
          try {
            const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
            if (owner.token === token) rmSync(path, { recursive: true, force: true });
          } catch { /* ownership changed */ }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') return { acquired: false, reason_code: 'mutation_lock_failed' };
      try {
        const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
        let alive = true;
        try { process.kill(owner.pid, 0); } catch { alive = false; }
        if (!alive && Date.now() - owner.started_at > stale_ms) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
      } catch { /* owner may still be publishing */ }
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  return { acquired: false, reason_code: 'mutation_lock_timeout' };
}

function durableWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, `${stableStringify(value)}\n`, { mode: 0o600 });
  let fd;
  try { fd = openSync(tmp, 'r'); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
  renameSync(tmp, path);
  try { fd = openSync(dirname(path), 'r'); fsyncSync(fd); } catch { /* best effort */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best effort */ } }
}

function contained(root, path) {
  const rel = relative(resolve(root), resolve(path));
  return rel !== '' && !rel.startsWith('..') && !rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

function validateCorrection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('correction must be an object');
  const keys = Object.keys(value);
  const allowed = new Set(['reason_code', 'proposed_observation_kind']);
  if (keys.length < 1 || keys.length > 2 || keys.some((key) => !allowed.has(key))) fail('invalid correction fields');
  const output = {};
  for (const key of keys.sort()) {
    if (typeof value[key] !== 'string' || !TOKEN.test(value[key])) fail(`invalid ${key}`);
    output[key] = value[key];
  }
  return output;
}

export function createStewardStore({ root, lock: lockOptions } = {}) {
  const stewardRoot = root || join(homedir(), '.claude', 'router', 'steward');
  mkdirSync(stewardRoot, { recursive: true, mode: 0o700 });
  const statePath = join(stewardRoot, 'state.json');
  const correctionsRoot = join(stewardRoot, 'corrections');

  function readState() {
    if (!existsSync(statePath)) return emptyState();
    try { return normalizeState(JSON.parse(readFileSync(statePath, 'utf8'))); } catch { return emptyState(); }
  }

  function mutate(callback) {
    const lock = mutationLock(stewardRoot, lockOptions);
    if (!lock.acquired) return { status: 'blocked', reason_code: lock.reason_code };
    try {
      const state = readState();
      const result = callback(state);
      if (!result.changed) return { status: 'unchanged', ...result.data };
      durableWrite(statePath, state);
      return { status: 'stored', ...result.data };
    } finally { lock.release(); }
  }

  return Object.freeze({
    stewardRoot,
    statePath,
    correctionsRoot,
    readState,
    dismiss(fingerprint, { now = Date.now() } = {}) {
      validFingerprint(fingerprint);
      validNow(now);
      return mutate((state) => {
        if (state.dismissed[fingerprint] !== undefined) return { changed: false };
        state.dismissed[fingerprint] = now;
        return { changed: true, data: { fingerprint } };
      });
    },
    snooze(fingerprint, until, { now = Date.now() } = {}) {
      validFingerprint(fingerprint);
      validNow(now);
      if (!Number.isSafeInteger(until) || until <= now || until > now + MAX_SNOOZE_MS) fail('snooze expiry is out of bounds');
      return mutate((state) => {
        if (state.snoozed_until[fingerprint] === until) return { changed: false, data: { fingerprint, until } };
        state.snoozed_until[fingerprint] = until;
        return { changed: true, data: { fingerprint, until } };
      });
    },
    recordCooldown(fingerprint, { now = Date.now() } = {}) {
      validFingerprint(fingerprint);
      validNow(now);
      return mutate((state) => {
        if (state.cooldown_at[fingerprint] === now) return { changed: false, data: { fingerprint } };
        state.cooldown_at[fingerprint] = now;
        return { changed: true, data: { fingerprint } };
      });
    },
    correct(fingerprint, correction, { now = Date.now() } = {}) {
      validFingerprint(fingerprint);
      validNow(now);
      const fields = validateCorrection(correction);
      const payload = {
        schema_version: 1,
        proposal_version: 'steward-correction-v1',
        suggestion_fingerprint: fingerprint,
        correction: fields,
        created_at_ms: now,
      };
      const hash = createHash('sha256').update(stableStringify(payload)).digest('hex');
      const proposal_id = `v1-${hash.slice(0, 16)}`;
      const path = join(correctionsRoot, proposal_id, 'proposal.json');
      if (!contained(stewardRoot, path)) fail('correction path escapes steward root');
      if (existsSync(path)) return { status: 'unchanged', proposal_id, path, routing_unchanged: true };
      durableWrite(path, payload);
      return { status: 'stored', proposal_id, path, routing_unchanged: true };
    },
  });
}
