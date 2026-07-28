import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { stableStringify, validateCapability } from '../registry/schema.mjs';

const CLAUDE_VERSION = 'claude-adapter/3';
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_NESTING = 24;

function within(root, candidate) { return candidate === root || candidate.startsWith(`${root}${sep}`); }
function fingerprint(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function portable(path) { return path.replaceAll(sep, '/'); }
function packageProvenance(relativePath) {
  const parts = portable(relativePath).split('/');
  const marker = parts.indexOf('.claude');
  if (parts[0] !== 'plugins' || marker < 2) return {};
  const version = marker > 2 && /^v?\d+(?:\.\d+)*(?:[-+][A-Za-z0-9.-]+)?$/.test(parts[marker - 1])
    ? parts[marker - 1] : null;
  const packageParts = parts.slice(1, version ? marker - 1 : marker);
  return { origin: packageParts[0], package: packageParts.join('/'), ...(version ? { version } : {}) };
}
function diagnostic(code, runtime, logicalRoot, path, reason, severity = 'build-blocking', localPath) {
  return { code, runtime, logical_root: logicalRoot, relative_path: portable(path), reason, severity,
    ...(localPath ? { local_path: localPath } : {}) };
}
function walk(root, runtime, logicalRoot) {
  const files = [], diagnostics = [], visited = new Set();
  // Prune dependency trees and VCS metadata: these never carry router-relevant
  // capabilities, and descending into them makes the scanner parse JSONC
  // tsconfig.json files inside plugin package caches as strict JSON, which
  // dispatch-blocks the whole registry candidate.
  const PRUNE = new Set(['node_modules', '.git', 'tests', 'fixtures']);
  function visit(path) {
    const stat = lstatSync(path);
    let actual = path;
    let effective = stat;
    if (stat.isSymbolicLink()) {
      try {
        actual = realpathSync(path);
        if (!within(root, actual)) {
          diagnostics.push(diagnostic('path_escape', runtime, logicalRoot, relative(root, path), 'resolved artifact leaves supplied root'));
          return;
        }
        effective = statSync(actual);
      } catch (error) {
        diagnostics.push(diagnostic('unsafe_link', runtime, logicalRoot, relative(root, path), error?.code || 'unreadable_link'));
        return;
      }
    }
    if (effective.isFile()) files.push(path);
    else if (effective.isDirectory()) {
      const canonical = realpathSync(actual);
      if (visited.has(canonical)) {
        diagnostics.push(diagnostic('cycle', runtime, logicalRoot, relative(root, path) || '.', 'canonical directory already visited'));
        return;
      }
      visited.add(canonical);
      for (const name of readdirSync(canonical).sort()) {
      if (PRUNE.has(name)) continue;
        visit(join(canonical, name));
      }
    }
  }
  try { visit(root); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return { files, diagnostics };
}
function splitCollection(value, delimiter = ',') {
  const parts = []; let start = 0; let quote = null; let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && (quote === "'" || value[i - 1] !== '\\')) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if ('[{'.includes(ch)) depth += 1;
    else if (']}'.includes(ch)) { depth -= 1; if (depth < 0) throw new Error('malformed inline collection'); }
    else if (ch === delimiter && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  if (quote || depth !== 0) throw new Error('unterminated inline collection');
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}
function unquote(text) {
  if (text.startsWith('"')) { try { return JSON.parse(text); } catch { throw new Error('invalid quoted scalar'); } }
  if (text.startsWith("'")) {
    if (!text.endsWith("'")) throw new Error('unterminated quoted scalar');
    return text.slice(1, -1).replaceAll("''", "'");
  }
  return text;
}
function scalar(value, depth = 0) {
  if (depth > MAX_NESTING) throw new Error('maximum nesting depth exceeded');
  const text = value.trim();
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) throw new Error('malformed inline array');
    return splitCollection(text.slice(1, -1)).map((entry) => scalar(entry, depth + 1));
  }
  if (text.startsWith('{')) {
    if (!text.endsWith('}')) throw new Error('malformed inline map');
    const result = {};
    for (const entry of splitCollection(text.slice(1, -1))) {
      const separator = entry.indexOf(':') >= 0 ? entry.indexOf(':') : entry.indexOf('=');
      if (separator < 1) throw new Error('malformed inline map entry');
      const key = unquote(entry.slice(0, separator).trim());
      if (Object.hasOwn(result, key)) throw new Error(`duplicate key: ${key}`);
      result[key] = scalar(entry.slice(separator + 1), depth + 1);
    }
    return result;
  }
  if (text.startsWith(']') || text.startsWith('}')) throw new Error('malformed inline collection');
  if (/^(true|false)$/.test(text)) return text === 'true';
  if (/^(null|~)$/i.test(text)) return null;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) return Number(text);
  return unquote(text);
}
function markdown(bytes) {
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error('artifact exceeds byte limit');
  const text = bytes.toString('utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('markdown frontmatter is missing or unterminated');
  const lines = match[1].split(/\r?\n/); const root = {}; const stack = [{ indent: -1, value: root }];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]; if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    if (/\t/.test(raw.slice(0, raw.length - raw.trimStart().length))) throw new Error('tabs are not allowed in indentation');
    const indent = raw.length - raw.trimStart().length;
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    if (indent > stack.at(-1).indent && stack.length > 1 && indent !== stack.at(-1).indent + 2) throw new Error(`invalid indentation at line ${index + 1}`);
    const parent = stack.at(-1).value; const content = raw.trim();
    if (content.startsWith('- ')) {
      if (!Array.isArray(parent)) throw new Error(`sequence without list parent at line ${index + 1}`);
      const item = content.slice(2); const pair = item.match(/^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/);
      if (pair) { const object = {}; object[pair[1]] = pair[2] === undefined ? {} : scalar(pair[2]); parent.push(object); stack.push({ indent, value: object }); }
      else parent.push(scalar(item));
      continue;
    }
    const pair = content.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!pair || Array.isArray(parent)) throw new Error(`unsupported frontmatter line: ${raw}`);
    const key = pair[1]; if (Object.hasOwn(parent, key)) throw new Error(`duplicate key: ${key}`);
    const remainder = pair[2] || '';
    if (remainder === '|' || remainder === '>') {
      const block = []; const base = indent;
      while (index + 1 < lines.length) {
        const next = lines[index + 1]; const nextIndent = next.length - next.trimStart().length;
        if (next.trim() && nextIndent <= base) break;
        index += 1; block.push(next.trim() ? next.slice(Math.min(next.length, base + 2)) : '');
      }
      parent[key] = remainder === '>' ? `${block.join(' ').replace(/\s+/g, ' ').trim()}\n` : `${block.join('\n')}\n`;
    } else if (!remainder) {
      const next = lines.slice(index + 1).find((line) => line.trim());
      const child = next?.trimStart().startsWith('- ') ? [] : {};
      parent[key] = child; stack.push({ indent, value: child });
    } else parent[key] = scalar(remainder);
  }
  return root;
}
function toml(bytes) {
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error('artifact exceeds byte limit');
  const data = {}; let section = data; const lines = bytes.toString('utf8').split(/\r?\n/);
  const assignPath = (target, keys) => keys.reduce((value, key) => {
    if (!Object.hasOwn(value, key)) value[key] = {};
    else if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) throw new Error(`duplicate key: ${keys.join('.')}`);
    return value[key];
  }, target);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]; const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    const header = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (header) { section = assignPath(data, header[1].split('.')); continue; }
    // Tolerate table headers the bounded parser does not model — quoted or
    // dotted keys (`[plugins."name@scope"]`) and array-of-tables (`[[x]]`) —
    // by diverting into a scratch section so following key=value lines neither
    // throw nor pollute the root table. expandConfig only reads top-level
    // scalars/inline collections, which sit above any such header.
    if (/^\[+.+\]$/.test(line)) { section = {}; continue; }
    const pair = line.match(/^("[^"]+"|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!pair) throw new Error(`unsupported TOML line: ${raw}`);
    let value = pair[2].trim();
    const delimiter = value.startsWith('"""') ? '"""' : value.startsWith("'''") ? "'''" : null;
    if (delimiter) {
      let content = value.slice(3); const chunks = [];
      if (content.includes(delimiter)) chunks.push(content.slice(0, content.indexOf(delimiter)));
      else {
        if (content) chunks.push(content);
        let closed = false;
        while (++index < lines.length) { const end = lines[index].indexOf(delimiter); if (end >= 0) { chunks.push(lines[index].slice(0, end)); closed = true; break; } chunks.push(lines[index]); }
        if (!closed) throw new Error('unterminated multiline string');
      }
      value = chunks.join('\n').replace(/^\n/, '');
    } else value = scalar(value);
    const rawKey = pair[1].startsWith('"') ? pair[1].slice(1, -1) : pair[1];
    const keys = rawKey.split('.'); const target = keys.length > 1 ? assignPath(section, keys.slice(0, -1)) : section; const key = keys.at(-1);
    if (Object.hasOwn(target, key)) throw new Error(`duplicate key: ${rawKey}`);
    target[key] = value;
  }
  if (!data.mcp_servers) data.mcp_servers = {};
  return data;
}

function claudeLayout(rel) {
  // Marketplace metadata subtrees hold registry indexes and test fixtures, not
  // installed capabilities. Installed plugin skills live under
  // `plugins/cache/<id>/<ver>/...` (still scanned) or `plugins/<id>/...`; the
  // recognized plugin metadata path is `plugins/<id>/plugin.json`.
  if (rel.startsWith('plugins/marketplaces/')) return null;
  if (rel === 'settings.json') return { type: 'settings', format: 'json' };
  if (/^(CLAUDE|AGENTS)\.md$/.test(rel) || /^instructions\/[^/]+\.md$/.test(rel)) {
    return { type: 'instruction', semanticType: 'instruction', lifecycleRole: 'instruction', format: 'text' };
  }
  if (/^skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'skill', format: 'markdown' };
  if (/^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(rel)
    || /^plugins\/.+\/\.claude\/skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'plugin_skill', format: 'markdown' };
  if (/^agents-store\/.+\/skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'agents_store_skill', format: 'markdown' };
  if (/^agents\/[^/]+\.md$/.test(rel)) return { type: 'agent', format: 'markdown' };
  if (/^commands\/[^/]+\.md$/.test(rel)) return { type: 'command', format: 'markdown' };
  if (/^hooks\/.+\.json$/.test(rel)) return { type: 'hook', format: 'json' };
  if (/^dependencies\/.+\.json$/.test(rel)) return { type: 'dependency', format: 'json' };
  if (/^plugins\/[^/]+\/plugin\.json$/.test(rel)) {
    return { type: 'plugin', semanticType: 'container', lifecycleRole: 'container', format: 'json' };
  }
  if (/^plugins\/[^/]+\/(tools|commands|agents|hooks|resources)\/.+\.(json|md|toml)$/.test(rel)) {
    const family = rel.split('/')[2];
    const types = { tools: 'tool', commands: 'command', agents: 'agent', hooks: 'hook', resources: 'resource' };
    return {
      type: types[family],
      format: rel.endsWith('.md') ? 'markdown' : rel.endsWith('.toml') ? 'toml' : 'json',
    };
  }
  if (/^capabilities\/[^/]+$/.test(rel)) {
    return { type: 'opaque', semanticType: 'unknown', lifecycleRole: 'opaque', format: 'opaque' };
  }
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

function portableTarget(value, rootPath) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replaceAll('\\', '/');
  // Absolute path: Claude Code settings.json hooks reference scripts by
  // absolute path. Accept it only when it resolves within the runtime root,
  // expressing it as a portable relative ref; anything else is an escape.
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    if (!rootPath) return null;
    const root = rootPath.replaceAll('\\', '/').replace(/\/$/, '');
    if (normalized === root) return '';
    if (normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1);
    return null;
  }
  const parts = normalized.split('/');
  if (parts.includes('..')) return null;
  return normalized.replace(/^\.\//, '');
}

// Tokenize a shell-style command string, respecting single/double quotes and
// stripping them from each token, so quoted absolute paths in settings.json
// hook commands are accepted instead of failing the command-form check.
function splitShellTokens(text) {
  const tokens = []; let current = ''; let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; else current += ch; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (/\s/.test(ch)) { if (current) { tokens.push(current); current = ''; } }
    else current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function commandReference(command, rootPath) {
  if (typeof command !== 'string' || !command.trim()) return { valid: false, reason: 'unsupported_command_form' };
  const tokens = splitShellTokens(command.trim());
  if (!tokens.length || tokens.some((token) => !/^[A-Za-z0-9_./:$@+\-]*$/.test(token))) {
    return { valid: false, reason: 'unsupported_command_form' };
  }
  const target = portableTarget(tokens.at(-1), rootPath);
  return target ? { valid: true, target_ref: target, command: tokens[0], args: tokens.slice(1) }
    : { valid: false, reason: 'path_escape' };
}

function nestedBindingCommands(value, output = []) {
  if (Array.isArray(value)) for (const entry of value) nestedBindingCommands(entry, output);
  else if (value && typeof value === 'object') {
    if (value.type === 'command' && Object.hasOwn(value, 'command')) output.push(value.command);
    for (const [key, entry] of Object.entries(value)) if (!['type', 'command'].includes(key)) nestedBindingCommands(entry, output);
  }
  return output;
}

function hookObservation(nativeRecord, nativeInvocation, scope, rootPath) {
  if (!['hook', 'binding'].includes(nativeRecord.type)) return null;
  let references;
  if (nativeRecord.type === 'binding' && nativeInvocation?.bindings !== undefined) {
    references = nestedBindingCommands(nativeInvocation.bindings).map((command) => commandReference(command, rootPath));
  } else {
    const args = Array.isArray(nativeInvocation?.args) ? nativeInvocation.args.map(String) : [];
    const target = portableTarget(nativeRecord.data.target_ref || args.at(-1) || nativeInvocation?.command, rootPath);
    references = target
      ? [{ valid: true, target_ref: target, command: String(nativeInvocation?.command || ''), args }]
      : [{ valid: false, reason: 'path_escape' }];
  }
  if (!references.length) references = [{ valid: false, reason: 'malformed_binding' }];
  // A Claude Code settings event legitimately fans out to several hook entries
  // (distinct matchers/scripts). A binding with multiple DISTINCT references is
  // valid; only a true duplicate — the same command+args referenced twice — is
  // 'duplicate_reference'. The single-reference model would quarantine every
  // normal multi-hook event.
  const allValid = references.length > 0 && references.every((item) => item.valid);
  const refKeys = references.map((item) => (item.valid ? `${item.command}\0${JSON.stringify(item.args)}` : null));
  const present = refKeys.filter((value) => value !== null);
  const hasDuplicate = new Set(present).size !== present.length;
  const valid = allValid && !hasDuplicate;
  const invalidReason = references.find((item) => !item.valid)?.reason;
  return {
    schema_version: 1,
    kind: nativeRecord.type === 'hook' ? 'file' : 'binding',
    runtime: nativeRecord.runtime,
    scope,
    logical_root: nativeRecord.logicalRoot,
    relative_path: nativeRecord.relativePath,
    source_fingerprint: nativeRecord.sourceFingerprint,
    event: String(nativeInvocation?.event || nativeRecord.data.event || ''),
    target_ref: valid ? references[0].target_ref : null,
    command: valid ? references[0].command : null,
    args: valid ? references[0].args : [],
    valid,
    ...(valid ? {} : { reason: hasDuplicate ? 'duplicate_reference' : (invalidReason || 'malformed_binding') }),
    ...(references.length > 1 ? { references } : {}),
  };
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
      data = recognized.format === 'markdown' ? markdown(bytes)
        : recognized.format === 'toml' ? toml(bytes)
          : recognized.format === 'json' ? JSON.parse(bytes.toString('utf8'))
            : { schema_version: 1 };
    } catch (error) {
      const name = basename(dirname(requested)) === 'skills' ? basename(requested, extname(requested)) : basename(requested, extname(requested));
      return { partial: { runtime, type: recognized.type === 'settings' ? 'binding' : recognized.type, name, scope: options.scope || { kind: 'global' }, logicalRoot, relativePath, sourceFingerprint: fingerprint(bytes) },
        diagnostic: diagnostic('malformed_artifact', runtime, logicalRoot, relativePath, `recognizable ${recognized.format} artifact is malformed: ${error.message}`, 'dispatch-blocking') };
    }
    if (data.schema_version !== undefined && data.schema_version !== 1) return { diagnostic: diagnostic('unsupported_schema', runtime, logicalRoot, relativePath, `unsupported schema version: ${String(data.schema_version)}`) };
    const fallbackName = recognized.format === 'opaque'
      ? basename(requested)
      : basename(requested, extname(requested));
    const base = {
      runtime,
      type: recognized.type,
      semanticType: recognized.semanticType,
      lifecycleRole: recognized.lifecycleRole,
      name: data.name || fallbackName,
      data,
      scope: options.scope || { kind: 'global' },
      logicalRoot,
      relativePath,
      sourceFingerprint: fingerprint(bytes),
    };
    if (recognized.type === 'settings') {
      const records = [];
      // The installer-owned router hook consumes the candidate registry; it is
      // lifecycle plumbing, not an inventory capability, and including it would
      // make the install's own first mutation invalidate its preflight bytes.
      // Filter router.mjs bindings from every event so install/upgrade/disable/enable/uninstall
      // mutations (which only add/remove the router-owned UserPromptSubmit binding) do not
      // change the binding observation's source_fingerprint or candidate_fingerprint. The
      // source_fingerprint for each binding record is computed from the FILTERED settings
      // content (router bindings stripped from all events), so the same logical settings state
      // produces the same fingerprint before and after an install mutation.
      const filteredHooks = {};
      for (const event of Object.keys(data.hooks || {}).sort()) {
        const bindings = data.hooks[event];
        const portableBindings = Array.isArray(bindings)
          ? bindings.filter((entry) => !JSON.stringify(entry).includes('router.mjs')) : bindings;
        if (Array.isArray(portableBindings) && portableBindings.length === 0) continue;
        filteredHooks[event] = portableBindings;
        records.push({ ...base, type: 'binding', name: `settings:${event}`, data: { schema_version: 1, command: event, args: [], native_invocation: { event, bindings: portableBindings } } });
      }
      const filteredSettingsFingerprint = fingerprint(Buffer.from(stableStringify({ ...data, hooks: filteredHooks }), 'utf8'));
      for (const record of records) record.sourceFingerprint = filteredSettingsFingerprint;
      return { records };
    }
    if (recognized.type === 'config' && configExpander) return { records: configExpander(base) };
    return base;
  }

  function normalizeArtifact(nativeRecord, rootPath) {
    if (!nativeRecord?.data) throw new TypeError('normalizeArtifact requires a parsed artifact');
    const scope = nativeRecord.scope || { kind: 'global' };
    const nativeInvocation = nativeRecord.data.native_invocation || invocation(nativeRecord.data, nativeRecord.name, nativeRecord.type);
    const normalizedHook = hookObservation(nativeRecord, nativeInvocation, scope, rootPath);
    const declared = Array.isArray(nativeRecord.data.dependencies);
    const items = declared ? nativeRecord.data.dependencies.map((entry) => ({ id: String(entry.id), available: entry.available === true })) : [];
    const semanticType = nativeRecord.semanticType || ({
      binding: 'hook',
      mcp: 'container',
      plugin: 'container',
      settings: 'configuration',
    }[nativeRecord.type] || (['command', 'skill', 'agent', 'hook', 'tool', 'resource'].includes(nativeRecord.type)
      ? nativeRecord.type : 'tool'));
    const lifecycleRole = nativeRecord.lifecycleRole || ({
      hook: 'event-bound',
      container: 'container',
      configuration: 'configuration',
      instruction: 'instruction',
      unknown: 'opaque',
      resource: 'resource',
    }[semanticType] || 'invocable');
    const inert = ['container', 'configuration', 'instruction', 'unknown'].includes(semanticType);
    const command = inert ? null : (nativeInvocation.command || nativeRecord.name);
    const dispatchable = !inert && Boolean(command) && items.every((entry) => entry.available) && (!normalizedHook || normalizedHook.valid);
    const pluginMatch = nativeRecord.relativePath.match(/^plugins\/([^/]+)\/(.+)$/);
    const containerId = pluginMatch ? `${runtime}:plugin:${pluginMatch[1]}` : null;
    const record = { schema_version: 1, type: nativeRecord.type, name: nativeRecord.name,
      native_type: `${runtime}:${nativeRecord.type}`, semantic_type: semanticType, lifecycle_role: lifecycleRole,
      description: typeof nativeRecord.data.description === 'string' ? nativeRecord.data.description : null,
      lifecycle: dispatchable ? 'ready' : 'partial', scope, dispatchable,
      invocation: dispatchable
        ? { availability: 'available', runtime, command: String(command), args: Array.isArray(nativeInvocation.args) ? nativeInvocation.args.map(String) : [] }
        : { availability: 'unavailable', reason: inert ? 'inert-artifact' : 'requirements-unavailable' },
      dependencies: { state: declared ? 'declared' : 'unknown', items },
      provenance: [{ runtime, scope: scope.kind, logical_root: nativeRecord.logicalRoot, relative_path: nativeRecord.relativePath, source_fingerprint: nativeRecord.sourceFingerprint, adapter: adapterVersion, parser: `${nativeRecord.type}@1`, ...packageProvenance(nativeRecord.relativePath) }],
      adapter_evidence: [{ namespace: runtime, native_type: `${runtime}:${nativeRecord.type}`, adapter: adapterVersion, parser: `${nativeRecord.type}@1` }],
      runtime_variants: [{ runtime, native_identity: String(nativeRecord.data.native_identity || nativeRecord.name), native_invocation: nativeInvocation }],
      ...(containerId ? {
        container_id: containerId,
        member_provenance: { container_id: containerId, relative_path: pluginMatch[2] },
      } : {}),
      ...(normalizedHook ? { hook_observation: normalizedHook } : {}),
      conflicts: [], precedence: scope.kind === 'global' ? ['global-fallback'] : ['project-preferred', 'global-fallback'],
      ...(typeof nativeRecord.data.canonical_identity === 'string' ? { canonical_identity: nativeRecord.data.canonical_identity } : {}),
      ...(nativeRecord.data.mapping && typeof nativeRecord.data.mapping === 'object' ? { mapping: nativeRecord.data.mapping } : {}),
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
      const walked = walk(canonicalRoot, runtime, spec.logicalRoot);
      diagnostics.push(...walked.diagnostics);
      for (const path of walked.files.sort()) {
        const rel = portable(relative(canonicalRoot, path));
        if (!layout(rel)) continue;
        const parsed = parseArtifact(path, { root: canonicalRoot, logicalRoot: spec.logicalRoot, scope: spec.scope });
        if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
        if (parsed.partial) observations.push(normalizePartial(parsed.partial));
        else for (const record of parsed.records || (parsed.data ? [parsed] : [])) observations.push(normalizeArtifact(record, canonicalRoot));
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
