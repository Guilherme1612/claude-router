import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { bindApproval, verifyApproval } from '../orchestrator/approval.mjs';
import { stableCapabilityId } from '../registry/identity.mjs';
import { stableStringify } from '../registry/schema.mjs';

export const DRAFT_PROPOSAL_VERSION = 'steward-draft-v1';

const APPROVAL_WARNING = 'Approve draft creation only; this will not install or publish anything.';
const PREVIEW_WARNING = 'Preview only — no capability or routing files were changed.';
const ELIGIBLE_KINDS = new Set(['missing_category', 'missing_dependency']);
const FINGERPRINT = /^[a-f0-9]{64}$/;
const TOKEN = /^[a-z][a-z0-9_:-]{0,127}$/;
const MAX_ITEMS = 32;

function readContractField(contract, field) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return undefined;
  if (Object.hasOwn(contract, 'fields')) {
    const fields = contract.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return undefined;
    const envelope = fields[field];
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
        || envelope.state !== 'known' || !Object.hasOwn(envelope, 'value')) {
      return undefined;
    }
    return envelope.value;
  }
  return contract[field];
}

export function deriveStewardDraft({ suggestion, registry = [], relationships = {} } = {}) {
  const current = normalizeSuggestion(suggestion);
  const records = new Map(registry.map(record => [record.stable_id || stableCapabilityId(record), record]));
  const affected = current.affected_capability_ids;
  if (current.observation_kind === 'missing_category') {
    const category = affected.length === 1 && affected[0].startsWith('semantic_type:')
      ? affected[0].slice('semantic_type:'.length)
      : null;
    const owner = [...records.entries()].find(([, record]) => (
      readContractField(record.contract, 'invocation_kind') === category
    ));
    const edge = owner && (relationships.edges || []).find(candidate => candidate?.id
      && [candidate.source_id, candidate.target_id].includes(owner[0]));
    if (!category || !owner) fail('authoritative category evidence is unavailable');
    const routeId = edge?.id || `contract:${owner[0]}`;
    return {
      semantic_changes: [`add_category:${category}:${owner[0]}`],
      dependencies: [],
      conflicts: [],
      representative_routes: [{
        before: `${routeId}:category_missing`,
        after: `${routeId}:category_declared`,
      }],
      verification: [`verify_category:${category}`, `verify_contract:${owner[0]}`],
      reversibility: 'delete_draft_file',
      rollback_implications: 'none_until_install',
    };
  }
  const missing = affected.filter(id => !records.has(id));
  const present = affected.filter(id => records.has(id));
  const dependencies = present.length === 1
    ? readContractField(records.get(present[0])?.contract, 'dependencies')
    : undefined;
  if (current.observation_kind !== 'missing_dependency'
      || missing.length !== 1 || present.length !== 1
      || !Array.isArray(dependencies)
      || dependencies.some(dependency => typeof dependency !== 'string')
      || !dependencies.includes(missing[0])) {
    fail('exact affected contract evidence is unavailable');
  }
  const edge = (relationships.edges || []).find(candidate => candidate?.id
    && [candidate.source_id, candidate.target_id].includes(present[0])
    && [candidate.source_id, candidate.target_id].includes(missing[0]));
  const routeId = edge?.id || `contract:${present[0]}`;
  return {
    semantic_changes: [`review_dependency:${present[0]}:${missing[0]}`],
    dependencies: missing,
    conflicts: [],
    representative_routes: [{
      before: `${routeId}:dependency_missing`,
      after: `${routeId}:dependency_declared`,
    }],
    verification: [`verify_contract:${present[0]}`, `verify_dependency:${missing[0]}`],
    reversibility: 'delete_draft_file',
    rollback_implications: 'none_until_install',
  };
}

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
  const allowed = new Set([
    'conflicts', 'dependencies', 'representative_routes', 'reversibility',
    'rollback_implications', 'semantic_changes', 'verification',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) fail('invalid draft fields');
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
  const approval_binding = bindApproval({
    capability: current,
    args: payload,
    targets: proposal.target_paths,
    effects: ['draft_file_only'],
    proposalVersion: DRAFT_PROPOSAL_VERSION,
  });
  return {
    current,
    payload,
    proposal,
    approval_binding,
    preview_fingerprint: hash({ proposal, semantic_payload: payload }),
  };
}

export function previewDraft(options = {}) {
  const current = normalizeSuggestion(options.suggestion);
  if (!ELIGIBLE_KINDS.has(current.observation_kind)) {
    return { preview_status: 'ineligible', reason_code: 'draft_ineligible_suggestion' };
  }
  const { proposal, approval_binding, preview_fingerprint } = derive(options);
  return {
    ...proposal,
    approval_binding,
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

function completePreview(targetPaths, payload) {
  return {
    exact_paths: targetPaths,
    semantic_changes: payload.semantic_changes,
    dependencies: payload.dependencies,
    conflicts: payload.conflicts,
    representative_routes: payload.representative_routes,
    verification: payload.verification,
    reversibility: payload.reversibility,
    rollback_implications: payload.rollback_implications,
    warning: PREVIEW_WARNING,
  };
}

function ensurePrivateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('draft root must be a private directory');
}

function durableWrite(path, value) {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, `${stableStringify(value)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function approveDraftCreation(options = {}) {
  const { root, suggestion, draft, preview, presented } = options;
  const fresh = previewDraft({ root, suggestion, draft });
  if (fresh.preview_status !== 'ready') {
    return { status: 'blocked', reason_code: fresh.reason_code };
  }
  if (!presented?.token) return { status: 'blocked', reason_code: 'approval_required' };
  if (fresh.preview_fingerprint !== preview?.preview_fingerprint) {
    return { status: 'blocked', reason_code: 'stale_draft_preview' };
  }
  const verified = verifyApproval({
    bound: preview.approval_binding,
    presented,
    expected: fresh.approval_binding,
  });
  if (verified.status !== 'approved') {
    return { status: 'blocked', reason_code: verified.reason_code };
  }

  const { payload } = derive({ root, suggestion, draft });
  const path = fresh.target_paths[0];
  const draftsRoot = join(resolve(root), 'drafts');
  const draftRoot = resolve(path, '..');
  if (!contained(draftsRoot, draftRoot) || !contained(draftRoot, path)) fail('draft path escapes draft root');
  const draft_id = draftRoot.split(/[/\\]/).at(-1);
  const draft_preview = completePreview(fresh.target_paths, payload);
  const bundle = {
    schema_version: 1,
    proposal_version: DRAFT_PROPOSAL_VERSION,
    suggestion_fingerprint: fresh.suggestion_fingerprint,
    authority: 'draft_file_only',
    draft_preview,
  };

  ensurePrivateDirectory(resolve(root));
  ensurePrivateDirectory(draftsRoot);
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8');
    if (existing !== `${stableStringify(bundle)}\n`) fail('immutable draft bundle conflict');
    return {
      status: 'unchanged', reason_code: 'draft_preview_ready', authority: 'draft_file_only',
      draft_id, path, draft_preview,
    };
  }
  const staging = join(draftsRoot, `.stage-${randomUUID()}`);
  ensurePrivateDirectory(staging);
  try {
    durableWrite(join(staging, 'draft.json'), bundle);
    renameSync(staging, draftRoot);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    const existing = readFileSync(path, 'utf8');
    if (existing !== `${stableStringify(bundle)}\n`) fail('immutable draft bundle conflict');
    return {
      status: 'unchanged', reason_code: 'draft_preview_ready', authority: 'draft_file_only',
      draft_id, path, draft_preview,
    };
  }
  let directoryFd;
  try {
    directoryFd = openSync(draftsRoot, 'r');
    fsyncSync(directoryFd);
  } finally {
    if (directoryFd !== undefined) closeSync(directoryFd);
  }
  return {
    status: 'stored', reason_code: 'draft_preview_ready', authority: 'draft_file_only',
    draft_id, path, draft_preview,
  };
}
