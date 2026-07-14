import { createHash } from 'node:crypto';
import { canonicalizeCapability, stableStringify } from './schema.mjs';

function scopeSuffix(scope) {
  if (!scope || scope.kind === 'global') return '';
  return `@${scope.kind}:${encodeURIComponent(scope.repository)}:${encodeURIComponent(scope.worktree)}`;
}

export function stableCapabilityId(record) {
  const suffix = scopeSuffix(record.scope);
  if (typeof record.canonical_identity === 'string' && record.canonical_identity.trim()) {
    return `${record.canonical_identity.trim()}${suffix}`;
  }
  if (record.shared_origin?.authority && typeof record.shared_origin.identity === 'string'
    && record.shared_origin.identity.trim()) {
    return `origin:${record.shared_origin.identity.trim()}${suffix}`;
  }
  const variant = record.runtime_variants?.find((entry) => entry.runtime === record.invocation?.runtime)
    || record.runtime_variants?.[0];
  const runtime = record.invocation?.runtime || variant?.runtime;
  const nativeIdentity = variant?.native_identity;
  if (!runtime || !record.type || !nativeIdentity) {
    throw new TypeError('capability identity requires runtime, type, and native identity');
  }
  return `${runtime}:${record.type}:${nativeIdentity}${suffix}`;
}

export function contentFingerprint(value) {
  const canonical = value?.schema_version === 1 ? canonicalizeCapability(value) : value;
  return createHash('sha256').update(stableStringify(canonical), 'utf8').digest('hex');
}
