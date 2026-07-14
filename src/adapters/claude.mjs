import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { validateCapability } from '../registry/schema.mjs';

const CLAUDE_VERSION = 'claude-adapter/2';

function within(root, candidate) { return candidate === root || candidate.startsWith(`${root}${sep}`); }
function fingerprint(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function portable(path) { return path.replaceAll(sep, '/'); }
function diagnostic(code, runtime, logicalRoot, path, reason, severity = 'build-blocking', localPath) {
  return { code, runtime, logical_root: logicalRoot, relative_path: portable(path), reason, severity,
    ...(localPath ? { local_path: localPath } : {}) };
}
function walk(root) {
  const files = [];
  function visit(path) {
    const stat = lstatSync(path);
    if (stat.isFile() || stat.isSymbolicLink()) files.push(path);
    else if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
  }
  try { visit(root); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return files;
}
function scalar(value) {
  const text = value.trim();
  if (/^\[.*\]$/.test(text) || /^\{.*\}$/.test(text)) {
    try { return JSON.parse(text); } catch { return text; }
  }
  if (/^(true|false)$/.test(text)) return text === 'true';
  if (/^\d+$/.test(text)) return Number(text);
  return text.replace(/^['"]|['"]$/g, '');
}
function markdown(bytes) {
  const text = bytes.toString('utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('markdown frontmatter is missing or unterminated');
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) throw new Error(`unsupported frontmatter line: ${line}`);
    data[pair[1]] = scalar(pair[2]);
  }
  return data;
}
function toml(bytes) {
  const data = { mcp_servers: {} };
  let section = data;
  for (const raw of bytes.toString('utf8').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const header = line.match(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]$/);
    if (header) { section = data.mcp_servers[header[1]] = {}; continue; }
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!pair) throw new Error(`unsupported TOML line: ${raw}`);
    let value = pair[2].trim();
    if (value.startsWith('[{') && value.endsWith('}]')) {
      value = value.slice(2, -2).split(',').reduce((out, item) => {
        const p = item.trim().match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
        if (!p) throw new Error(`unsupported TOML inline table: ${item}`);
        out[p[1]] = scalar(p[2]); return out;
      }, {});
      value = [value];
    } else value = scalar(value);
    section[pair[1]] = value;
  }
  return data;
}

function claudeLayout(rel) {
  if (rel === 'settings.json') return { type: 'settings', format: 'json' };
  if (/^skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'skill', format: 'markdown' };
  if (/^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'plugin_skill', format: 'markdown' };
  if (/^agents-store\/.+\/skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'agents_store_skill', format: 'markdown' };
  if (/^agents\/[^/]+\.md$/.test(rel)) return { type: 'agent', format: 'markdown' };
  if (/^commands\/[^/]+\.md$/.test(rel)) return { type: 'command', format: 'markdown' };
  if (/^hooks\/.+\.json$/.test(rel)) return { type: 'hook', format: 'json' };
  if (/^dependencies\/.+\.json$/.test(rel)) return { type: 'dependency', format: 'json' };
  if (/^plugins\/[^/]+\/plugin\.json$/.test(rel)) return { type: 'plugin_metadata', format: 'json' };
  if (/^(skills|plugins|agents-store|agents|commands|hooks|bindings|dependencies)\/.+\.json$/.test(rel)) {
    const map = { skills: 'skill', plugins: 'plugin_skill', 'agents-store': 'agents_store_skill', agents: 'agent', commands: 'command', hooks: 'hook', bindings: 'binding', dependencies: 'dependency' };
    return { type: map[rel.split('/')[0]], format: 'json' };
  }
  return null;
}

function invocation(data, name, type) {
  if (data.invocation && typeof data.invocation === 'object') return data.invocation;
  if (type === 'hook') return { event: data.event || null, command: data.command || name, args: Array.isArray(data.args) ? data.args : [] };
  return { command: data.command || name, args: Array.isArray(data.args) ? data.args : [] };
}

export function createAdapter({ runtime, adapterVersion, layout, configExpander }) {
  function parseArtifact(path, options = {}) {
    if (!options.root) throw new TypeError('root is required');
    const root = realpathSync(resolve(options.root));
    const logicalRoot = options.logicalRoot || `${runtime}_home`;
    const requested = resolve(path);
    let actual;
    try { actual = realpathSync(requested); } catch (error) {
      return { diagnostic: diagnostic('unreadable_artifact', runtime, logicalRoot, relative(root, requested), error.message, 'build-blocking', requested) };
    }
    if (!within(root, actual)) return { diagnostic: diagnostic('path_escape', runtime, logicalRoot, relative(root, requested), 'resolved artifact leaves supplied root', 'build-blocking', requested) };
    const relativePath = portable(relative(root, actual));
    const recognized = layout(relativePath);
    if (!recognized) return { ignored: true };
    const bytes = readFileSync(actual);
    let data;
    try {
      data = recognized.format === 'markdown' ? markdown(bytes) : recognized.format === 'toml' ? toml(bytes) : JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      const name = basename(dirname(requested)) === 'skills' ? basename(requested, extname(requested)) : basename(requested, extname(requested));
      return { partial: { runtime, type: recognized.type === 'settings' ? 'binding' : recognized.type, name, scope: options.scope || { kind: 'global' }, logicalRoot, relativePath, sourceFingerprint: fingerprint(bytes) },
        diagnostic: diagnostic('malformed_artifact', runtime, logicalRoot, relativePath, `recognizable ${recognized.format} artifact is malformed: ${error.message}`, 'dispatch-blocking') };
    }
    if (data.schema_version !== undefined && data.schema_version !== 1) return { diagnostic: diagnostic('unsupported_schema', runtime, logicalRoot, relativePath, `unsupported schema version: ${String(data.schema_version)}`) };
    const base = { runtime, type: recognized.type, name: data.name || basename(dirname(requested)), data, scope: options.scope || { kind: 'global' }, logicalRoot, relativePath, sourceFingerprint: fingerprint(bytes) };
    if (recognized.type === 'plugin_metadata') return { ignored: true };
    if (recognized.type === 'settings') {
      const records = [];
      for (const event of Object.keys(data.hooks || {}).sort()) {
        const bindings = data.hooks[event];
        // The installer-owned router hook consumes the candidate registry; it is
        // lifecycle plumbing, not an inventory capability, and including it would
        // make the install's own first mutation invalidate its preflight bytes.
        const portableBindings = Array.isArray(bindings)
          ? bindings.filter((entry) => !JSON.stringify(entry).includes('router.mjs')) : bindings;
        if (Array.isArray(portableBindings) && portableBindings.length === 0) continue;
        records.push({ ...base, type: 'binding', name: `settings:${event}`, data: { schema_version: 1, command: event, args: [], native_invocation: { event, bindings: portableBindings } } });
      }
      return { records };
    }
    if (recognized.type === 'config' && configExpander) return { records: configExpander(base) };
    return base;
  }

  function normalizeArtifact(nativeRecord) {
    if (!nativeRecord?.data) throw new TypeError('normalizeArtifact requires a parsed artifact');
    const scope = nativeRecord.scope || { kind: 'global' };
    const nativeInvocation = nativeRecord.data.native_invocation || invocation(nativeRecord.data, nativeRecord.name, nativeRecord.type);
    const declared = Array.isArray(nativeRecord.data.dependencies);
    const items = declared ? nativeRecord.data.dependencies.map((entry) => ({ id: String(entry.id), available: entry.available === true })) : [];
    const command = nativeInvocation.command || nativeRecord.name;
    const dispatchable = Boolean(command) && items.every((entry) => entry.available);
    const record = { schema_version: 1, type: nativeRecord.type, name: nativeRecord.name,
      description: typeof nativeRecord.data.description === 'string' ? nativeRecord.data.description : null,
      lifecycle: dispatchable ? 'ready' : 'partial', scope, dispatchable,
      invocation: { runtime, command: String(command), args: Array.isArray(nativeInvocation.args) ? nativeInvocation.args.map(String) : [] },
      dependencies: { state: declared ? 'declared' : 'unknown', items },
      provenance: [{ runtime, scope: scope.kind, logical_root: nativeRecord.logicalRoot, relative_path: nativeRecord.relativePath, source_fingerprint: nativeRecord.sourceFingerprint, adapter: adapterVersion }],
      runtime_variants: [{ runtime, native_identity: String(nativeRecord.data.native_identity || nativeRecord.name), native_invocation: nativeInvocation }],
      conflicts: [], precedence: scope.kind === 'global' ? ['global-fallback'] : ['project-preferred', 'global-fallback'],
      ...(typeof nativeRecord.data.canonical_identity === 'string' ? { canonical_identity: nativeRecord.data.canonical_identity } : {}),
      ...(nativeRecord.data.shared_origin?.authority && nativeRecord.data.shared_origin?.identity
        ? { shared_origin: { authority: String(nativeRecord.data.shared_origin.authority), identity: String(nativeRecord.data.shared_origin.identity) } } : {}) };
    validateCapability(record); return record;
  }
  function normalizePartial(partial) {
    const record = { schema_version: 1, type: partial.type, name: partial.name, description: null, lifecycle: 'invalid', scope: partial.scope, dispatchable: false,
      invocation: { runtime, command: partial.name, args: [] }, dependencies: { state: 'unknown', items: [] },
      provenance: [{ runtime, scope: partial.scope.kind, logical_root: partial.logicalRoot, relative_path: partial.relativePath, source_fingerprint: partial.sourceFingerprint, adapter: adapterVersion }],
      runtime_variants: [{ runtime, native_identity: partial.name, native_invocation: null }], conflicts: [{ severity: 'dispatch-blocking', type: 'parse', field: 'artifact', sources: [partial.relativePath] }] };
    validateCapability(record); return record;
  }
  function discover(rootSpecs) {
    const observations = [], diagnostics = [];
    for (const spec of [...rootSpecs].sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot))) {
      let canonicalRoot; try { canonicalRoot = realpathSync(resolve(spec.root)); } catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
      for (const path of walk(canonicalRoot).sort()) {
        const rel = portable(relative(canonicalRoot, path));
        if (!layout(rel)) continue;
        const parsed = parseArtifact(path, { root: canonicalRoot, logicalRoot: spec.logicalRoot, scope: spec.scope });
        if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
        if (parsed.partial) observations.push(normalizePartial(parsed.partial));
        else for (const record of parsed.records || (parsed.data ? [parsed] : [])) observations.push(normalizeArtifact(record));
      }
    }
    const key = (v) => `${v.type || v.code}:${v.name || ''}:${v.logical_root || v.provenance?.[0]?.logical_root}:${v.relative_path || v.provenance?.[0]?.relative_path}`;
    observations.sort((a, b) => key(a).localeCompare(key(b))); diagnostics.sort((a, b) => key(a).localeCompare(key(b)));
    return { observations, diagnostics };
  }
  function compileInvocation(record) { return { runtime, command: record.invocation.command, args: [...record.invocation.args] }; }
  return { parseArtifact, normalizeArtifact, discover, compileInvocation };
}

const adapter = createAdapter({ runtime: 'claude', adapterVersion: CLAUDE_VERSION, layout: claudeLayout });
export const parseArtifact = adapter.parseArtifact;
export const normalizeArtifact = adapter.normalizeArtifact;
export const compileInvocation = adapter.compileInvocation;
export function discoverRoots(options = {}) {
  if (!options.claudeRoot) throw new TypeError('claudeRoot is required');
  const roots = [{ root: options.claudeRoot, logicalRoot: 'claude_global', scope: { kind: 'global' } }];
  if (options.projectRoot) { const id = String(options.scopeId || basename(resolve(options.projectRoot))); roots.push({ root: join(options.projectRoot, '.claude'), logicalRoot: `project:${id}:claude`, scope: { kind: 'project', repository: `repo:${id}`, worktree: `worktree:${id}` } }); }
  return adapter.discover(roots);
}
