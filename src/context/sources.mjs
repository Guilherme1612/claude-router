import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stableStringify } from '../registry/schema.mjs';

export const SOURCE_LIMITS = Object.freeze({
  state_bytes: 64 * 1024,
  roadmap_bytes: 128 * 1024,
  artifact_bytes: 64 * 1024,
  design_bytes: 64 * 1024,
  execution_bytes: 16 * 1024,
  git_output_bytes: 16 * 1024,
  git_entries: 256,
  git_timeout_ms: 250,
  diagnostics: 8,
  blockers: 8,
});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const result = (status, reason_code, extra = {}) => ({ status, reason_code, ...extra });
const witness = bytes => ({ kind: 'sha256', value: sha256(bytes) });
const compact = value => typeof value === 'string' ? value.trim().slice(0, 240) : value;

function safePath(root, ref) {
  if (typeof root !== 'string' || !isAbsolute(root) || typeof ref !== 'string' || !ref || isAbsolute(ref) || ref.includes('\0')) return null;
  const path = resolve(root, ref);
  const rel = relative(resolve(root), path);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? path : null;
}

function boundedRead({ workspaceRoot, ref, limit, optional = false, fs = {} }) {
  const path = safePath(workspaceRoot, ref);
  if (!path) return result('unresolved', 'unsafe_reference');
  const stat = fs.lstatSync || lstatSync;
  const read = fs.readFileSync || readFileSync;
  let info;
  try { info = stat(path); }
  catch { return result(optional ? 'degraded' : 'unresolved', optional ? 'optional_source_missing' : 'critical_source_missing'); }
  if (info.isSymbolicLink()) return result('unresolved', 'source_symlink');
  if (!info.isFile()) return result('unresolved', 'source_not_file');
  if (info.size > limit) return result('unresolved', 'source_oversized');
  try {
    const bytes = read(path, { encoding: 'utf8', maxBytes: limit });
    return result('resolved', 'source_read', { bytes, witness: witness(bytes) });
  } catch { return result('unresolved', 'source_read_failed'); }
}

function field(text, name) {
  const match = text.match(new RegExp('^(?:\\*\\*)?' + name + '(?:\\*\\*)?\\s*:\\s*(.+)$', 'im'));
  return match ? compact(match[1].replace(/^['"]|['"]$/g, '')) : undefined;
}

function frontmatter(text) {
  const block = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!block) return {};
  return Object.fromEntries(block[1].split('\n').map(line => line.match(/^([a-z_]+):\s*(.+)$/i)).filter(Boolean).map(match => [match[1], compact(match[2].replace(/^['"]|['"]$/g, ''))]));
}

function resolved(parsed, value) {
  if (parsed.status !== 'resolved') return parsed;
  return result('resolved', 'source_resolved', { value, witness: parsed.witness });
}

export function readStateSource({ workspaceRoot, fs }) {
  const parsed = boundedRead({ workspaceRoot, ref: '.planning/STATE.md', limit: SOURCE_LIMITS.state_bytes, fs });
  if (parsed.status !== 'resolved') return parsed;
  const meta = frontmatter(parsed.bytes);
  const phase = field(parsed.bytes, 'Phase') || meta.current_phase;
  const plan = field(parsed.bytes, 'Plan');
  const status = (field(parsed.bytes, 'Status') || meta.status)?.toLowerCase();
  if (!phase || !status) return result('unresolved', 'source_malformed');
  const blockers = (parsed.bytes.match(/## Blockers\/Concerns\n([\s\S]*?)(?=\n## |$)/i)?.[1] || '').split('\n').filter(line => /^[-*]\s+/.test(line)).slice(0, SOURCE_LIMITS.blockers).map(line => compact(line.replace(/^[-*]\s+/, '')));
  return resolved(parsed, { position: { phase: String(phase).split(/\s+[—-]\s+/)[0], ...(plan && !/^not started$/i.test(plan) ? { plan: String(plan) } : {}), status }, blockers });
}

export function readRoadmapSource({ workspaceRoot, phase, fs }) {
  const parsed = boundedRead({ workspaceRoot, ref: '.planning/ROADMAP.md', limit: SOURCE_LIMITS.roadmap_bytes, fs });
  if (parsed.status !== 'resolved') return parsed;
  const escaped = String(phase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = parsed.bytes.match(new RegExp(`^### Phase ${escaped}:[^\\n]*\\n([\\s\\S]*?)(?=^### Phase |$)`, 'm'));
  if (!section) return result('unresolved', 'phase_not_found');
  return resolved(parsed, { phase: String(phase), goal: field(section[1], 'Goal'), requirements: field(section[1], 'Requirements'), plans: field(section[1], 'Plans') });
}

export function readArtifactSource({ workspaceRoot, ref, fs }) {
  const parsed = boundedRead({ workspaceRoot, ref, limit: SOURCE_LIMITS.artifact_bytes, fs });
  if (parsed.status !== 'resolved') return parsed;
  const meta = frontmatter(parsed.bytes);
  if (!meta.phase) return result('unresolved', 'source_malformed');
  const objective = parsed.bytes.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/i)?.[1]?.split('\n')[0];
  return resolved(parsed, { phase: meta.phase, plan: meta.plan, status: meta.status, objective: compact(objective) });
}

export function readDesignSource({ workspaceRoot, ref, fs }) {
  const parsed = boundedRead({ workspaceRoot, ref, limit: SOURCE_LIMITS.design_bytes, optional: true, fs });
  if (parsed.status !== 'resolved') return parsed;
  const title = parsed.bytes.match(/^#\s+(.+)$/m)?.[1];
  const summary = parsed.bytes.match(/^## Summary\s*\n([^\n]+)/m)?.[1];
  if (!title) return result('degraded', 'source_malformed');
  return resolved(parsed, { ref, title: compact(title), summary: compact(summary) });
}

export function readExecutionSource({ workspaceRoot, ref, fs }) {
  const parsed = boundedRead({ workspaceRoot, ref, limit: SOURCE_LIMITS.execution_bytes, fs });
  if (parsed.status !== 'resolved') return parsed;
  try {
    const value = JSON.parse(parsed.bytes);
    if (!value || typeof value !== 'object' || !value.phase || !value.status) return result('unresolved', 'source_malformed');
    const approved = {};
    for (const key of ['schema_version', 'workflow', 'phase', 'plan', 'task', 'status', 'next_action', 'artifact_ref']) if (value[key] !== undefined && ['string', 'number'].includes(typeof value[key])) approved[key] = value[key];
    return resolved(parsed, approved);
  } catch { return result('unresolved', 'source_malformed'); }
}

function defaultRunCommand({ cwd, args, timeout_ms, max_output_bytes }) {
  const output = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: timeout_ms, maxBuffer: max_output_bytes });
  if (output.error?.code === 'ETIMEDOUT') return { status: 'timeout' };
  if (output.error?.code === 'ENOBUFS') return { status: 'oversized' };
  if (output.status !== 0) {
    if (/not a git repository/i.test(output.stderr || '')) return { status: 'not_repository' };
    if (args[0] === 'symbolic-ref' && output.status === 1) return { status: 'detached' };
    return { status: 'failed' };
  }
  return { status: 'ok', stdout: output.stdout || '' };
}

function gitFailure(status) {
  const map = { detached: 'git_detached_head', timeout: 'git_timeout', oversized: 'git_output_oversized', not_repository: 'git_not_repository', failed: 'git_command_failed' };
  return result('unresolved', map[status] || 'git_command_failed');
}

export function readGitSource({ workspaceRoot, runCommand = defaultRunCommand }) {
  const invoke = args => runCommand({ cwd: workspaceRoot, args, timeout_ms: SOURCE_LIMITS.git_timeout_ms, max_output_bytes: SOURCE_LIMITS.git_output_bytes });
  const branch = invoke(['symbolic-ref', '--short', '-q', 'HEAD']);
  if (branch.status !== 'ok') return gitFailure(branch.status);
  if (Buffer.byteLength(branch.stdout || '') > SOURCE_LIMITS.git_output_bytes) return gitFailure('oversized');
  const dirty = invoke(['status', '--porcelain=v1', '-uno']);
  if (dirty.status !== 'ok') return gitFailure(dirty.status);
  if (Buffer.byteLength(dirty.stdout || '') > SOURCE_LIMITS.git_output_bytes) return gitFailure('oversized');
  const lines = (dirty.stdout || '').split('\n').filter(Boolean);
  const categories = { added: 0, modified: 0, deleted: 0, renamed: 0, untracked: 0, other: 0 };
  for (const line of lines.slice(0, SOURCE_LIMITS.git_entries)) {
    const code = line.slice(0, 2);
    if (code === '??') categories.untracked++;
    else if (code.includes('R')) categories.renamed++;
    else if (code.includes('D')) categories.deleted++;
    else if (code.includes('A')) categories.added++;
    else if (code.includes('M')) categories.modified++;
    else categories.other++;
  }
  const value = { branch: compact(branch.stdout), dirty: { count: Math.min(lines.length, SOURCE_LIMITS.git_entries), categories, truncated: lines.length > SOURCE_LIMITS.git_entries } };
  return result('resolved', 'git_resolved', { value, witness: { kind: 'sha256', value: sha256(stableStringify(value)) } });
}

export function collectAuthoritativeSnapshot(options) {
  const sources = {
    state: readStateSource(options), roadmap: readRoadmapSource(options),
    artifact: readArtifactSource({ ...options, ref: options.artifactRef }),
    execution: readExecutionSource({ ...options, ref: options.executionRef }),
    design: readDesignSource({ ...options, ref: options.designRef }),
    git: readGitSource(options),
  };
  const critical = ['state', 'roadmap', 'artifact', 'execution', 'git'];
  const blocked = critical.find(name => sources[name].status !== 'resolved');
  return result(blocked ? 'unresolved' : 'resolved', blocked ? sources[blocked].reason_code : 'authoritative_snapshot_resolved', { sources });
}

function validWitness(value) {
  return value && typeof value === 'object' && ((value.kind === 'sha256' && /^[a-f0-9]{64}$/.test(value.value)) || (value.kind === 'mtime' && Number.isFinite(value.value)) || (['version', 'generation'].includes(value.kind) && typeof value.value === 'string' && value.value));
}

export function compareWitnesses(capsuleWitness, authoritativeWitness) {
  if (!validWitness(capsuleWitness) || !validWitness(authoritativeWitness) || capsuleWitness.kind !== authoritativeWitness.kind) return result('corrupt', 'witness_invalid');
  return capsuleWitness.value === authoritativeWitness.value ? result('fresh', 'witness_match') : result('stale', 'witness_changed');
}

const IDENTITY = ['workflow', 'phase', 'plan'];
const FIELDS = ['action', 'workflow', 'phase', 'plan', 'task', 'status', 'artifact_ref', 'blockers'];
export function assembleRefreshEvidence({ capsule = {}, authoritative = {}, live = {}, explicit = {}, diagnostics = [] } = {}) {
  const boundedDiagnostics = diagnostics.slice(0, SOURCE_LIMITS.diagnostics).map(entry => ({ status: entry.status, reason_code: entry.reason_code }));
  const critical = diagnostics.find(entry => entry?.status === 'unresolved');
  if (critical) return result('unresolved', critical.reason_code || 'identity_conflict', { ...(critical.field ? { conflict_field: critical.field } : {}), diagnostics: boundedDiagnostics });
  for (const key of IDENTITY) if (live[key] !== undefined && authoritative[key] !== undefined && live[key] !== authoritative[key]) return result('unresolved', 'identity_conflict', { conflict_field: key });
  const value = {};
  for (const key of FIELDS) {
    const selected = explicit[key] ?? live[key] ?? authoritative[key] ?? capsule[key];
    if (selected !== undefined) value[key] = selected;
  }
  if (!value.phase && !value.workflow) return result('unresolved', 'identity_missing');
  return result('dispatchable', 'refresh_evidence_ready', { value, diagnostics: boundedDiagnostics });
}
