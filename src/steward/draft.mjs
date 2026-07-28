import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';

export const DRAFT_PROPOSAL_VERSION = 'steward-draft-v1';

const APPROVAL_WARNING = 'Approve draft creation only; this will not install or publish anything.';
const ELIGIBLE_KINDS = new Set(['missing_category', 'missing_dependency']);
const FINGERPRINT = /^[a-f0-9]{64}$/;
const TOKEN = /^[a-z][a-z0-9_:-]{0,127}$/;
const MAX_ITEMS = 32;

function fail(message) {
  throw new TypeError(message);
}

function hash(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function token(value, name) {
  if (typeof value !== 'string' || !TOKEN.test(value)) fail(`invalid ${name}`);
  return value;
}

function tokenList(value, name, { empty = false } = {}) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || (!empty && value.length === 0)) {
    fail(`${name} must be a bounded array`);
  }
  return [...new Set(value.map((item) => token(item, name)))].sort();
}

function contained(root, path) {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function normalizeSuggestion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('suggestion must be an object');
  if (typeof value.fingerprint !== 'string' || !FINGERPRINT.test(value.fingerprint)) fail('invalid suggestion fingerprint');
  const affected = tokenList(value.affected_capability_ids, 'affected_capability_ids');
  return {
    fingerprint: value.fingerprint,
    observation_kind: token(value.observation_kind, 'observation_kind'),
    reason_code: token(value.reason_code, 'reason_code'),
    affected_capability_ids: affected,
  };
}

function normalizeRoutes(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) {
    fail('representative_routes must be a bounded array');
  }
  return value.map((route) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) fail('invalid representative route');
    return {
      before: token(route.before, 'route before'),
      after: token(route.after, 'route after'),
    };
  }).sort((a, b) => a.before.localeCompare(b.before) || a.after.localeCompare(b.after));
}

function normalizeDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('draft must be an object');
  return {
    semantic_changes: tokenList(value.semantic_changes, 'semantic_changes'),
    dependencies: tokenList(value.dependencies, 'dependencies', { empty: true }),
    conflicts: tokenList(value.conflicts, 'conflicts', { empty: true }),
    representative_routes: normalizeRoutes(value.representative_routes),
    verification: tokenList(value.verification, 'verification'),
    reversibility: token(value.reversibility, 'reversibility'),
    rollback_implications: token(value.rollback_implications, 'rollback_implications'),
  };
}

function derive({ root, suggestion, draft }) {
  if (typeof root !== 'string' || !isAbsolute(root)) fail('root must be an absolute path');
  const current = normalizeSuggestion(suggestion);
  const payload = normalizeDraft(draft);
  const bundleId = `v1-${hash({ current, payload }).slice(0, 16)}`;
  const targetPath = join(resolve(root), 'drafts', bundleId, 'draft.json');
  if (!contained(root, targetPath)) fail('draft path escapes steward root');
  const proposal = {
    schema_version: 1,
    proposal_version: DRAFT_PROPOSAL_VERSION,
    suggestion_fingerprint: current.fingerprint,
    target_paths: [targetPath],
    semantic_effects: payload.semantic_changes,
    effect: 'draft_file_only',
    warning: APPROVAL_WARNING,
  };
  return {
    current,
    payload,
    proposal,
    preview_fingerprint: hash({ proposal, semantic_payload: payload }),
  };
}

export function previewDraft(options = {}) {
  const current = normalizeSuggestion(options.suggestion);
  if (!ELIGIBLE_KINDS.has(current.observation_kind)) {
    return { preview_status: 'ineligible', reason_code: 'draft_ineligible_suggestion' };
  }
  const { proposal, preview_fingerprint } = derive(options);
  return {
    ...proposal,
    preview_status: 'ready',
    reason_code: 'draft_approval_required',
    preview_fingerprint,
  };
}

export function verifyDraftPreview(preview, current = null) {
  try {
    if (!preview || preview.preview_status !== 'ready'
        || preview.effect !== 'draft_file_only'
        || preview.warning !== APPROVAL_WARNING
        || preview.proposal_version !== DRAFT_PROPOSAL_VERSION
        || !FINGERPRINT.test(preview.preview_fingerprint)
        || !FINGERPRINT.test(preview.suggestion_fingerprint)
        || preview.target_paths?.length !== 1
        || !isAbsolute(preview.target_paths[0])
        || preview.semantic_effects?.length > MAX_ITEMS) {
      return { valid: false, reason_code: 'invalid_draft_preview' };
    }
    if (current) {
      const fresh = previewDraft(current);
      if (fresh.preview_fingerprint !== preview.preview_fingerprint
          || stableStringify(fresh.target_paths) !== stableStringify(preview.target_paths)) {
        return { valid: false, reason_code: 'stale_draft_preview' };
      }
    }
    return { valid: true, reason_code: 'draft_preview_valid' };
  } catch {
    return { valid: false, reason_code: 'invalid_draft_preview' };
  }
}
