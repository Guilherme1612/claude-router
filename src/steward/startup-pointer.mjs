import {
  closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync, readSync,
  renameSync, writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';

export const STARTUP_POINTER_MAX_BYTES = 4 * 1024;

const FINGERPRINT = /^[a-f0-9]{64}$/;
const POLICY = /^[a-z][a-z0-9-]{0,63}$/;
const FIELDS = new Set([
  'schema_version', 'policy_version', 'fingerprint', 'available', 'cooldown_until_ms',
]);
const unavailable = () => ({
  schema_version: 1,
  policy_version: 'steward-policy-v1',
  fingerprint: null,
  available: false,
  cooldown_until_ms: null,
});

function valid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== FIELDS.size
      || Object.keys(value).some(key => !FIELDS.has(key))
      || value.schema_version !== 1
      || !POLICY.test(value.policy_version || '')
      || typeof value.available !== 'boolean'
      || (value.fingerprint !== null && !FINGERPRINT.test(value.fingerprint))
      || (value.cooldown_until_ms !== null
        && (!Number.isSafeInteger(value.cooldown_until_ms) || value.cooldown_until_ms < 0))
      || (value.available && value.fingerprint === null)) return null;
  return {
    schema_version: 1,
    policy_version: value.policy_version,
    fingerprint: value.fingerprint,
    available: value.available,
    cooldown_until_ms: value.cooldown_until_ms,
  };
}

export function compileStartupPointer({ ownedRoot, pointer } = {}) {
  if (typeof ownedRoot !== 'string' || !isAbsolute(ownedRoot)) {
    throw new TypeError('ownedRoot must be absolute');
  }
  const record = valid(pointer);
  if (!record) throw new TypeError('invalid startup pointer');
  const root = resolve(ownedRoot, 'steward');
  const path = join(root, 'startup-pointer.json');
  const bytes = `${stableStringify(record)}\n`;
  if (Buffer.byteLength(bytes) > STARTUP_POINTER_MAX_BYTES) {
    throw new TypeError('startup pointer exceeds size bound');
  }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, bytes, { mode: 0o600 });
  let fd;
  try {
    fd = openSync(tmp, 'r');
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  renameSync(tmp, path);
  try {
    fd = openSync(root, 'r');
    fsyncSync(fd);
  } catch {
    // Best-effort directory durability after the atomic replacement.
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch {}
  }
  return { status: 'stored', path };
}

export function loadStartupPointer({ ownedRoot, now = Date.now(), fs = {} } = {}) {
  if (typeof ownedRoot !== 'string' || !isAbsolute(ownedRoot)
      || !Number.isSafeInteger(now) || now < 0) return unavailable();
  const path = resolve(ownedRoot, 'steward', 'startup-pointer.json');
  const io = {
    openSync: fs.openSync || openSync,
    fstatSync: fs.fstatSync || fstatSync,
    readSync: fs.readSync || readSync,
    closeSync: fs.closeSync || closeSync,
  };
  let fd;
  try {
    fd = io.openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = io.fstatSync(fd);
    if (!info.isFile() || info.size < 2 || info.size > STARTUP_POINTER_MAX_BYTES) return unavailable();
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = io.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!Number.isSafeInteger(count) || count <= 0) return unavailable();
      offset += count;
    }
    const record = valid(JSON.parse(bytes.toString('utf8')));
    if (!record || (!record.available
        && (record.cooldown_until_ms === null || record.cooldown_until_ms > now))) {
      return unavailable();
    }
    return record.cooldown_until_ms !== null && record.cooldown_until_ms <= now
      ? { ...record, available: true, cooldown_until_ms: null }
      : record;
  } catch {
    return unavailable();
  } finally {
    if (fd !== undefined) try { io.closeSync(fd); } catch {}
  }
}
