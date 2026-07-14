import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { validateCapability } from '../registry/schema.mjs';

const ADAPTER_VERSION = 'claude-adapter/1';
const CLAUDE_TYPES = new Map([
  ['skills', 'skill'], ['plugins', 'plugin_skill'], ['agents-store', 'agents_store_skill'],
  ['agents', 'agent'], ['commands', 'command'], ['hooks', 'hook'], ['bindings', 'binding'],
  ['dependencies', 'dependency'],
]);

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function fingerprint(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inferredType(path, root, types) {
  const first = relative(root, path).split(sep)[0];
  return types.get(first) || null;
}

function walk(root) {
  const files = [];
  function visit(path) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.isFile()) files.push(path);
    else if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
  }
  try { visit(root); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return files;
}

function diagnostic(code, runtime, logicalRoot, relativePath, reason, severity = 'build-blocking', localPath) {
  return { code, runtime, logical_root: logicalRoot, relative_path: relativePath.replaceAll(sep, '/'), reason, severity,
    ...(localPath ? { local_path: localPath } : {}) };
}

export function createAdapter({ runtime, adapterVersion, types }) {
  function parseArtifact(path, options = {}) {
    if (!options.root) throw new TypeError('root is required');
    const root = realpathSync(resolve(options.root));
    const logicalRoot = options.logicalRoot || `${runtime}_home`;
    const requested = resolve(path);
    let actual;
    try { actual = realpathSync(requested); } catch (error) {
      return { diagnostic: diagnostic('unreadable_artifact', runtime, logicalRoot, relative(root, requested), error.message, 'build-blocking', requested) };
    }
    if (!within(root, actual)) {
      return { diagnostic: diagnostic('path_escape', runtime, logicalRoot, relative(root, requested), 'resolved artifact leaves supplied root', 'build-blocking', requested) };
    }
    const relativePath = relative(root, actual).replaceAll(sep, '/');
    const type = inferredType(actual, root, types);
    if (!type || extname(requested) !== '.json') {
      return { diagnostic: diagnostic('unsupported_format', runtime, logicalRoot, relativePath, 'artifact does not match a supported category or format') };
    }
    const bytes = readFileSync(actual);
    let data;
    try { data = JSON.parse(bytes.toString('utf8')); } catch (error) {
      return {
        partial: { runtime, type, name: basename(requested, '.json'), scope: options.scope || { kind: 'global' },
          logicalRoot, relativePath, sourceFingerprint: fingerprint(bytes), diagnostics: [error.message] },
        diagnostic: diagnostic('malformed_artifact', runtime, logicalRoot, relativePath, 'recognizable artifact contains malformed JSON', 'dispatch-blocking'),
      };
    }
    if (data.schema_version !== 1) {
      return { diagnostic: diagnostic('unsupported_schema', runtime, logicalRoot, relativePath,
        `unsupported schema version: ${String(data.schema_version ?? 'unknown')}`) };
    }
    return { runtime, type: data.type || type, name: data.name || basename(requested, '.json'), data,
      scope: options.scope || { kind: 'global' }, logicalRoot, relativePath, sourceFingerprint: fingerprint(bytes) };
  }

  function normalizeArtifact(nativeRecord) {
    if (nativeRecord?.diagnostic || !nativeRecord?.data) {
      throw new TypeError('normalizeArtifact requires a parsed artifact');
    }
    const scope = nativeRecord.scope || { kind: 'global' };
    const invocation = nativeRecord.data?.invocation || { command: nativeRecord.name, args: [] };
    const declared = Array.isArray(nativeRecord.data?.dependencies);
    const items = declared ? nativeRecord.data.dependencies.map((entry) => ({ id: String(entry.id), available: entry.available === true })) : [];
    const dispatchable = Boolean(invocation.command) && items.every((entry) => entry.available);
    const record = {
      schema_version: 1,
      type: nativeRecord.type,
      name: nativeRecord.name,
      description: typeof nativeRecord.data?.description === 'string' ? nativeRecord.data.description : null,
      lifecycle: dispatchable ? 'ready' : 'partial',
      scope,
      dispatchable,
      invocation: { runtime, command: String(invocation.command || nativeRecord.name), args: Array.isArray(invocation.args) ? invocation.args.map(String) : [] },
      dependencies: { state: declared ? 'declared' : 'unknown', items },
      provenance: [{ runtime, scope: scope.kind, logical_root: nativeRecord.logicalRoot,
        relative_path: nativeRecord.relativePath, source_fingerprint: nativeRecord.sourceFingerprint, adapter: adapterVersion }],
      runtime_variants: [{ runtime, native_identity: String(nativeRecord.data?.native_identity || nativeRecord.name),
        native_invocation: invocation }],
      conflicts: [],
      precedence: scope.kind === 'global' ? ['global-fallback'] : ['project-preferred', 'global-fallback'],
      ...(typeof nativeRecord.data?.canonical_identity === 'string' ? { canonical_identity: nativeRecord.data.canonical_identity } : {}),
      ...(nativeRecord.data?.shared_origin?.authority && nativeRecord.data?.shared_origin?.identity
        ? { shared_origin: { authority: String(nativeRecord.data.shared_origin.authority), identity: String(nativeRecord.data.shared_origin.identity) } } : {}),
    };
    validateCapability(record);
    return record;
  }

  function normalizePartial(partial) {
    const record = {
      schema_version: 1, type: partial.type, name: partial.name, description: null, lifecycle: 'invalid',
      scope: partial.scope, dispatchable: false,
      invocation: { runtime, command: partial.name, args: [] }, dependencies: { state: 'unknown', items: [] },
      provenance: [{ runtime, scope: partial.scope.kind, logical_root: partial.logicalRoot,
        relative_path: partial.relativePath, source_fingerprint: partial.sourceFingerprint, adapter: adapterVersion }],
      runtime_variants: [{ runtime, native_identity: partial.name, native_invocation: null }],
      conflicts: [{ severity: 'dispatch-blocking', type: 'parse', field: 'artifact', sources: [partial.relativePath] }],
    };
    validateCapability(record);
    return record;
  }

  function discover(rootSpecs) {
    const observations = [];
    const diagnostics = [];
    for (const spec of rootSpecs.sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot))) {
      let canonicalRoot;
      try { canonicalRoot = realpathSync(resolve(spec.root)); } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      for (const path of walk(canonicalRoot)) {
        const parsed = parseArtifact(path, { root: canonicalRoot, logicalRoot: spec.logicalRoot, scope: spec.scope });
        if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
        if (parsed.partial) observations.push(normalizePartial(parsed.partial));
        else if (!parsed.diagnostic) observations.push(normalizeArtifact(parsed));
      }
    }
    const key = (value) => `${value.type || value.code}:${value.name || ''}:${value.logical_root || value.provenance?.[0]?.logical_root}:${value.relative_path || value.provenance?.[0]?.relative_path}`;
    observations.sort((a, b) => key(a).localeCompare(key(b)));
    diagnostics.sort((a, b) => key(a).localeCompare(key(b)));
    return { observations, diagnostics };
  }

  function compileInvocation(record) {
    return { runtime, command: record.invocation.command, args: [...record.invocation.args] };
  }
  return { parseArtifact, normalizeArtifact, discover, compileInvocation };
}

const adapter = createAdapter({ runtime: 'claude', adapterVersion: ADAPTER_VERSION, types: CLAUDE_TYPES });
export const parseArtifact = adapter.parseArtifact;
export const normalizeArtifact = adapter.normalizeArtifact;
export const compileInvocation = adapter.compileInvocation;
export function discoverRoots(options = {}) {
  if (!options.claudeRoot) throw new TypeError('claudeRoot is required');
  const roots = [{ root: options.claudeRoot, logicalRoot: 'claude_global', scope: { kind: 'global' } }];
  if (options.projectRoot) {
    const scopeId = String(options.scopeId || basename(resolve(options.projectRoot)));
    roots.push({ root: join(options.projectRoot, '.claude'), logicalRoot: `project:${scopeId}:claude`,
      scope: { kind: 'project', repository: `repo:${scopeId}`, worktree: `worktree:${scopeId}` } });
  }
  return adapter.discover(roots);
}
