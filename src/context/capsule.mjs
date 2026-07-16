import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';

export const CAPSULE_SCHEMA_VERSION = 1;
export const CAPSULE_LIMITS = Object.freeze({
  bytes: 32 * 1024, artifacts: 16, blockers: 8, summary_bytes: 240,
  id_bytes: 128, ref_bytes: 512, witness_bytes: 256,
});

const STATUSES = ['active', 'blocked', 'paused', 'completed', 'cancelled', 'superseded'];
const TERMINAL = new Set(['completed', 'cancelled', 'superseded']);
const WITNESSES = new Set(['mtime', 'sha256', 'version', 'generation']);
const byteLength = value => Buffer.byteLength(value, 'utf8');
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const diagnostic = (reason_code, path) => ({ valid: false, reason_code, path });

function text(value, max, path) {
  if (typeof value !== 'string' || value.length === 0 || byteLength(value) > max) throw diagnostic('invalid_field', path);
  return value;
}

function safeRef(value) {
  if (typeof value !== 'string' || !value || byteLength(value) > CAPSULE_LIMITS.ref_bytes) return false;
  const portable = value.replaceAll('\\', '/');
  if (isAbsolute(value) || portable.startsWith('/') || /^[A-Za-z]:\//.test(portable) || portable.startsWith('//')) return false;
  const parts = portable.split('/');
  return !parts.includes('..') && !parts.includes('.') && !parts.includes('') && !portable.includes('\0');
}

function witness(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !WITNESSES.has(value.kind)) throw diagnostic('invalid_freshness_witness', path);
  const raw = value.value;
  if (value.kind === 'mtime' && (!Number.isFinite(raw) || raw < 0)) throw diagnostic('invalid_freshness_witness', path);
  if (value.kind === 'sha256' && (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw))) throw diagnostic('invalid_freshness_witness', path);
  if ((value.kind === 'version' || value.kind === 'generation') && (typeof raw !== 'string' || !raw || byteLength(raw) > CAPSULE_LIMITS.witness_bytes)) throw diagnostic('invalid_freshness_witness', path);
  return { kind: value.kind, value: raw };
}

function project(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw diagnostic('capsule_not_object', '$');
  if (input.schema_version !== CAPSULE_SCHEMA_VERSION) throw diagnostic('unsupported_schema_version', '$.schema_version');
  const scope = {
    workspace_id: text(input.scope?.workspace_id, CAPSULE_LIMITS.id_bytes, '$.scope.workspace_id'),
    project_id: text(input.scope?.project_id, CAPSULE_LIMITS.id_bytes, '$.scope.project_id'),
  };
  const goal = {
    id: text(input.goal?.id, CAPSULE_LIMITS.id_bytes, '$.goal.id'),
    summary: text(input.goal?.summary, CAPSULE_LIMITS.summary_bytes, '$.goal.summary'),
  };
  const position = {
    workflow: text(input.position?.workflow, CAPSULE_LIMITS.id_bytes, '$.position.workflow'),
    phase: text(input.position?.phase, CAPSULE_LIMITS.id_bytes, '$.position.phase'),
    plan: text(input.position?.plan, CAPSULE_LIMITS.id_bytes, '$.position.plan'),
    task: text(input.position?.task, CAPSULE_LIMITS.id_bytes, '$.position.task'),
  };
  if (!STATUSES.includes(input.status)) throw diagnostic('invalid_status', '$.status');
  if (TERMINAL.has(input.status) && input.supersession && input.status !== 'superseded') throw diagnostic('invalid_transition', '$.supersession');

  const artifacts = (Array.isArray(input.artifacts) ? input.artifacts : []).map((entry, index) => {
    if (!safeRef(entry?.ref)) throw diagnostic('unsafe_artifact_ref', `$.artifacts[${index}].ref`);
    return {
      ref: entry.ref.replaceAll('\\', '/'),
      type: text(entry.type, CAPSULE_LIMITS.id_bytes, `$.artifacts[${index}].type`),
      status: text(entry.status, CAPSULE_LIMITS.id_bytes, `$.artifacts[${index}].status`),
      witness: witness(entry.witness, `$.artifacts[${index}].witness`),
      priority: Number.isSafeInteger(entry.priority) ? entry.priority : 0,
    };
  });
  const blockers = (Array.isArray(input.blockers) ? input.blockers : []).map((entry, index) => ({
    id: text(entry?.id, CAPSULE_LIMITS.id_bytes, `$.blockers[${index}].id`),
    summary: text(entry?.summary, CAPSULE_LIMITS.summary_bytes, `$.blockers[${index}].summary`),
    status: text(entry?.status, CAPSULE_LIMITS.id_bytes, `$.blockers[${index}].status`),
    updated_at: Number.isFinite(entry?.updated_at) && entry.updated_at >= 0 ? entry.updated_at : (() => { throw diagnostic('invalid_field', `$.blockers[${index}].updated_at`); })(),
  }));
  const freshness = {
    captured_at: Number.isFinite(input.freshness?.captured_at) && input.freshness.captured_at >= 0 ? input.freshness.captured_at : (() => { throw diagnostic('invalid_field', '$.freshness.captured_at'); })(),
    generation: text(input.freshness?.generation, CAPSULE_LIMITS.id_bytes, '$.freshness.generation'),
  };
  const provenance = {
    source: text(input.provenance?.source, CAPSULE_LIMITS.id_bytes, '$.provenance.source'),
    version: text(input.provenance?.version, CAPSULE_LIMITS.id_bytes, '$.provenance.version'),
  };
  const result = { schema_version: CAPSULE_SCHEMA_VERSION, scope, goal, position, status: input.status, artifacts, blockers, freshness, provenance };
  if (input.supersession) result.supersession = {
    workflow_identity: /^[a-f0-9]{64}$/.test(input.supersession.workflow_identity || '') ? input.supersession.workflow_identity : (() => { throw diagnostic('invalid_field', '$.supersession.workflow_identity'); })(),
    reason: text(input.supersession.reason, CAPSULE_LIMITS.summary_bytes, '$.supersession.reason'),
  };
  return result;
}

export function deriveWorkflowIdentity(input) {
  const c = project(input);
  return digest(stableStringify({ scope: c.scope, goal_id: c.goal.id, position: c.position, status: c.status }));
}

export function canonicalizeCapsule(input) {
  const c = project(input);
  const artifacts = [...c.artifacts].sort((a, b) => {
    const next = Number(b.status === 'next') - Number(a.status === 'next');
    return next || b.priority - a.priority || stableStringify(a).localeCompare(stableStringify(b));
  });
  const blockers = [...c.blockers].sort((a, b) => {
    const unresolved = Number(b.status === 'open') - Number(a.status === 'open');
    return unresolved || b.updated_at - a.updated_at || stableStringify(a).localeCompare(stableStringify(b));
  });
  const bounded = {
    ...c,
    workflow_identity: deriveWorkflowIdentity(c),
    artifacts: artifacts.slice(0, CAPSULE_LIMITS.artifacts),
    blockers: blockers.slice(0, CAPSULE_LIMITS.blockers),
    bounds: {
      artifacts: { truncated: artifacts.length > CAPSULE_LIMITS.artifacts, omitted_count: Math.max(0, artifacts.length - CAPSULE_LIMITS.artifacts) },
      blockers: { truncated: blockers.length > CAPSULE_LIMITS.blockers, omitted_count: Math.max(0, blockers.length - CAPSULE_LIMITS.blockers) },
    },
  };
  const bytes = stableStringify(bounded);
  if (byteLength(bytes) > CAPSULE_LIMITS.bytes) throw diagnostic('capsule_too_large', '$');
  return bounded;
}

export function validateCapsule(input) {
  try { canonicalizeCapsule(input); return { valid: true, reason_code: 'valid', path: '$' }; }
  catch (error) { return error?.reason_code ? error : diagnostic('malformed_capsule', '$'); }
}

export function stableCapsuleStringify(input) { return stableStringify(canonicalizeCapsule(input)); }

function contained(root, candidate) {
  const rel = relative(root, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new TypeError('owned_root_invalid');
  return candidate;
}

export function capsulePaths(ownedRoot) {
  if (typeof ownedRoot !== 'string' || !isAbsolute(ownedRoot)) throw new TypeError('owned_root_invalid');
  const root = resolve(ownedRoot);
  return { root, active: contained(root, resolve(root, 'context-capsule.json')), lkg: contained(root, resolve(root, 'context-capsule.lkg.json')) };
}

function unsafe(path) { return existsSync(path) && lstatSync(path).isSymbolicLink(); }
function syncDir(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function durable(path, bytes) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
}
function parsePath(path) {
  if (!existsSync(path)) return { status: 'missing' };
  if (unsafe(path) || !lstatSync(path).isFile()) return { status: 'unsafe' };
  if (statSync(path).size > CAPSULE_LIMITS.bytes) return { status: 'corrupt' };
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    const valid = validateCapsule(value);
    return valid.valid ? { status: 'valid', capsule: canonicalizeCapsule(value) } : { status: 'corrupt' };
  } catch { return { status: 'corrupt' }; }
}

export function saveCapsule({ ownedRoot, capsule }) {
  const bytes = stableCapsuleStringify(capsule) + '\n';
  const p = capsulePaths(ownedRoot);
  mkdirSync(p.root, { recursive: true, mode: 0o700 });
  if (unsafe(p.active) || unsafe(p.lkg)) return { status: 'blocked', reason_code: 'unsafe_capsule_path' };
  const prior = parsePath(p.active);
  const activeTemp = contained(p.root, resolve(p.root, `.context-capsule.${randomUUID()}.tmp`));
  const lkgTemp = contained(p.root, resolve(p.root, `.context-capsule-lkg.${randomUUID()}.tmp`));
  try {
    if (prior.status === 'valid') {
      durable(lkgTemp, stableStringify(prior.capsule) + '\n');
      renameSync(lkgTemp, p.lkg);
    }
    durable(activeTemp, bytes);
    renameSync(activeTemp, p.active);
    syncDir(p.root);
    return { status: 'saved', reason_code: 'capsule_saved', workflow_identity: canonicalizeCapsule(capsule).workflow_identity };
  } catch {
    for (const temp of [activeTemp, lkgTemp]) try { if (existsSync(temp)) unlinkSync(temp); } catch { /* owned temporary cleanup */ }
    return { status: 'blocked', reason_code: 'capsule_write_failed' };
  }
}

export function loadCapsule({ ownedRoot }) {
  let p;
  try { p = capsulePaths(ownedRoot); } catch { return { status: 'blocked', reason_code: 'owned_root_invalid' }; }
  const active = parsePath(p.active);
  if (active.status === 'valid') return { status: 'active', reason_code: 'capsule_valid', capsule: active.capsule };
  if (active.status === 'unsafe') return { status: 'blocked', reason_code: 'unsafe_capsule_path' };
  if (active.status === 'missing') return { status: 'missing', reason_code: 'capsule_missing' };
  const lkg = parsePath(p.lkg);
  if (lkg.status === 'valid') return { status: 'recovered_lkg', reason_code: 'active_corrupt', capsule: lkg.capsule };
  if (lkg.status === 'unsafe') return { status: 'blocked', reason_code: 'unsafe_capsule_path' };
  return { status: 'corrupt', reason_code: 'capsule_corrupt' };
}
