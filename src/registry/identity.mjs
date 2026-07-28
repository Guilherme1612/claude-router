import { createHash } from 'node:crypto';
import { canonicalizeCapability, stableStringify } from './schema.mjs';

function scopeSuffix(scope) {
  if (!scope || scope.kind === 'global') return '';
  if (scope.kind === 'user') return `@user:${encodeURIComponent(scope.identity)}`;
  return `@${scope.kind}:${encodeURIComponent(scope.repository)}:${encodeURIComponent(scope.worktree)}`;
}

function sourceIdentity(record) {
  const sources = Array.isArray(record.provenance) ? record.provenance : [];
  if (!sources.length) return null;
  return sources.map(source => [
    source.runtime,
    source.scope,
    source.logical_root,
    source.relative_path,
  ].map(value => encodeURIComponent(value)).join(':')).sort().join('+');
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
  const source = sourceIdentity(record);
  if (!source || !record.type) {
    throw new TypeError('capability fallback identity requires type and portable source provenance');
  }
  return `path:${record.type}:${source}${suffix}`;
}

export function contentFingerprint(value) {
  let canonical = value;
  if (value?.schema_version === 1) {
    const normalized = canonicalizeCapability(value);
    canonical = value.content !== undefined
      ? { type: normalized.type, content: normalized.content }
      : {
          type: normalized.type,
          source_fingerprints: normalized.provenance
            .map(source => source.source_fingerprint)
            .sort(),
        };
  }
  return createHash('sha256').update(stableStringify(canonical), 'utf8').digest('hex');
}
