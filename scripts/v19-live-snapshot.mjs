#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE_FIELD = /prompt|session|telemetry|audit|history|body/i;
const SKIP_ROOTS = new Set(['router', 'context-mode', 'sessions']);
const SKIP_FILES = new Set(['settings.json', 'hooks.json', 'telemetry.jsonl', 'audit.jsonl', 'history.jsonl', 'session_index.jsonl', 'models_cache.json']);
const SKIP_PREFIXES = ['plugins/cache', 'plugins/data', 'plugins/marketplaces'];

function help() {
  return `Privacy-safe live Router snapshot

Usage:
  node scripts/v19-live-snapshot.mjs --claude-root <path> --codex-root <path> \\
    --source-router <path> --source-evolve <path> --output <path>

Options:
  --claude-root <path>   Claude configuration root
  --codex-root <path>    Codex configuration root
  --source-router <path> Router source to fingerprint (default: src/runtime/router.mjs)
  --source-evolve <path> Evolution sibling to fingerprint (default: src/runtime/router.evolve.mjs)
  --output <path>        Atomic JSON evidence output path
  --manifest <path>      Claude ownership manifest (default: <claude-root>/router/install-manifest.json)
  --help                 Show this help
`;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help') { values.help = true; continue; }
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
    values[name] = value;
    index += 1;
  }
  return values;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fileRecord(file) {
  if (!existsSync(file)) return { exists: false };
  if (!lstatSync(file).isFile()) throw new Error(`expected regular file: ${file}`);
  const bytes = readFileSync(file);
  return { exists: true, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function inside(file, root) {
  const rel = relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !rel.includes('\0') && !/^[\\/]/.test(rel));
}

function managedRouterPath(group, routerPath) {
  if (group?.managed_by === 'claude-router' && group?.router_path === routerPath) return routerPath;
  if (Array.isArray(group?.hooks) && group.hooks.some(hook => (
    hook?.type === 'command' && typeof hook.command === 'string' && hook.command.includes(`"${routerPath}"`)
  ))) return routerPath;
  return null;
}

function managedGroup(group, routerPath) {
  return managedRouterPath(group, routerPath) !== null;
}

function hookSummary(file, routerPath) {
  const record = fileRecord(file);
  if (!record.exists) return { ...record, fields: { events: [], user_projection_sha256: null } };
  const settings = readJson(file, 'hooks/settings');
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error(`hooks/settings must be an object: ${file}`);
  }
  const hooks = settings.hooks;
  if (hooks !== undefined && (!hooks || typeof hooks !== 'object' || Array.isArray(hooks))) {
    throw new Error(`hooks/settings.hooks must be an object: ${file}`);
  }
  const sanitizedHooks = {};
  const events = [];
  for (const event of Object.keys(hooks || {}).sort()) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) throw new Error(`hooks/settings.${event} must be an array: ${file}`);
    const userGroups = groups.filter(group => !managedGroup(group, routerPath));
    sanitizedHooks[event] = userGroups;
    events.push({
      event,
      count: groups.length,
      managed_count: groups.length - userGroups.length,
      managed_router_paths: groups.map(group => managedRouterPath(group, routerPath)).filter(Boolean),
    });
  }
  const userProjection = { ...settings, hooks: sanitizedHooks };
  return {
    ...record,
    fields: {
      events,
      user_projection_sha256: sha256(JSON.stringify(stable(userProjection))),
    },
  };
}

function jsonSummary(file, fields) {
  const record = fileRecord(file);
  if (!record.exists) return { ...record, fields: {} };
  const value = readJson(file, file);
  const selected = {};
  for (const key of fields) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)
      && !PRIVATE_FIELD.test(key)) {
      if (key === 'reconciliation') {
        const allowed = new Set([
          'activation_reason', 'activation_status', 'disposition',
          'publication_status', 'strategy', 'trigger',
        ]);
        selected[key] = Object.fromEntries(Object.entries(value[key] || {})
          .filter(([nestedKey]) => allowed.has(nestedKey)));
        if (value[key]?.verification && typeof value[key].verification === 'object') {
          const verification = value[key].verification;
          selected[key].verification = Object.fromEntries([
            'disposition', 'complete', 'gate_count', 'failed_gate_ids', 'verification_fingerprint',
          ].filter(field => Object.prototype.hasOwnProperty.call(verification, field))
            .map(field => [field, verification[field]]));
        }
      } else {
        selected[key] = value[key];
      }
    }
  }
  return { ...record, fields: selected };
}

function controllerConfigSummary(file) {
  const record = fileRecord(file);
  if (!record.exists) return { ...record, fields: {} };
  const value = readJson(file, file);
  return {
    ...record,
    fields: {
      schema_version: value?.schema_version,
      state_path: value?.state_path,
      candidate_path: value?.candidate_path,
      report_path: value?.report_path,
      active_path: value?.active_path,
      configuration_fingerprint: sha256(JSON.stringify(stable(value))),
    },
  };
}

function treeDigest(root, runtime) {
  const parts = [];
  function visit(directory, prefix = '') {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (prefix === '' && SKIP_ROOTS.has(entry.name)) continue;
      if (SKIP_PREFIXES.some(skip => rel === skip || rel.startsWith(`${skip}/`))) continue;
      if (SKIP_FILES.has(entry.name) || entry.name.endsWith('.sqlite') || entry.name.endsWith('.sqlite-wal') || entry.name.endsWith('.sqlite-shm')) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) visit(file, rel);
      else if (entry.isFile() && !(runtime === 'claude' && rel === 'hooks/router.mjs')
        && !(runtime === 'codex' && rel === 'hooks/router.mjs')) {
        const bytes = readFileSync(file);
        parts.push(`${rel}\0${sha256(bytes)}\n`);
      }
    }
  }
  visit(root);
  return { excluded_policy: 'router-settings-and-session-noise-v1', file_count: parts.length, aggregate_sha256: sha256(parts.sort().join('')) };
}

function manifestSummary(manifestPath, claudeRoot, codexRoot) {
  const record = fileRecord(manifestPath);
  if (!record.exists) return { ...record, fields: { state: 'missing', files: [] } };
  const manifest = readJson(manifestPath, 'ownership manifest');
  if (manifest?.schema_version !== 1 || manifest.state !== 'complete'
    || !Array.isArray(manifest.files) || !Array.isArray(manifest.bindings)) {
    throw new Error('ownership manifest is incomplete');
  }
  if (manifest.roots?.claude !== claudeRoot || manifest.roots?.codex !== codexRoot) {
    throw new Error('ownership manifest roots do not match explicit roots');
  }
  const claudeOwned = join(claudeRoot, 'router');
  const codexOwned = join(codexRoot, 'router');
  const allowedExternal = new Set([
    join(claudeRoot, 'hooks', 'router.mjs'), join(claudeRoot, 'hooks', 'router.evolve.mjs'),
    join(codexRoot, 'hooks', 'router.mjs'), join(codexRoot, 'hooks', 'router.evolve.mjs'),
  ]);
  const files = manifest.files.map(entry => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.fingerprint !== 'string') {
      throw new Error('ownership manifest contains an invalid file entry');
    }
    const path = resolve(entry.path);
    if (!(inside(path, claudeOwned) || inside(path, codexOwned) || allowedExternal.has(path))) {
      throw new Error(`ownership manifest path escapes runtime roots: ${entry.path}`);
    }
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
      throw new Error(`ownership manifest path is a symbolic link: ${entry.path}`);
    }
    const runtime = inside(path, codexRoot) ? 'codex' : 'claude';
    const runtimeRoot = runtime === 'codex' ? codexRoot : claudeRoot;
    const relativePath = relative(runtimeRoot, path);
    return {
      runtime,
      relative_path: relativePath,
      mutable: entry.mutable === true || /^(?:router\/)?(?:candidate\/(?:registry|report)\.json|active\.json|audit\.jsonl|controller\/(?:status|request|scan-state)\.json)$/.test(relativePath),
      expected_sha256: entry.fingerprint,
      actual: fileRecord(path),
    };
  });
  return {
    ...record,
    fields: {
      schema_version: manifest.schema_version,
      state: manifest.state,
      binding_count: manifest.bindings.length,
      file_count: files.length,
      files,
    },
  };
}

function runtimeSnapshot({ root, runtime, manifestPath, codexRoot }) {
  const ownedRoot = join(root, 'router');
  const routerPath = join(root, 'hooks', 'router.mjs');
  const hooksPath = runtime === 'claude' ? join(root, 'settings.json') : join(root, 'hooks.json');
  const activeTuplePath = join(ownedRoot, 'release-tuples', 'active.json');
  return {
    root_exists: existsSync(root),
    hooks: hookSummary(hooksPath, routerPath),
    ownership: runtime === 'claude' ? manifestSummary(manifestPath, root, codexRoot) : undefined,
    ownership_marker: runtime === 'codex' ? jsonSummary(join(ownedRoot, 'installed.json'), ['schema_version', 'managed_by']) : undefined,
    controller: runtime === 'claude' ? {
      config: controllerConfigSummary(join(ownedRoot, 'controller', 'config.json')),
      status: jsonSummary(join(ownedRoot, 'controller', 'status.json'), [
        'state', 'heartbeat', 'pid', 'instance_id', 'configuration_fingerprint',
        'reconciliation',
      ]),
      request: jsonSummary(join(ownedRoot, 'controller', 'request.json'), ['schema_version', 'action', 'instance_id']),
      scan_state: jsonSummary(join(ownedRoot, 'controller', 'scan-state.json'), ['schema_version', 'state', 'generation']),
    } : undefined,
    active_tuple: jsonSummary(activeTuplePath, ['schema_version', 'tuple_version_id', 'version_id', 'sequence']),
    active_pointer: jsonSummary(join(ownedRoot, 'active.json'), ['schema_version', 'tuple_version_id', 'version_id', 'sequence']),
    candidate: {
      registry: jsonSummary(join(ownedRoot, 'candidate', 'registry.json'), ['schema_version', 'state', 'generation', 'registry_version_id']),
      report: jsonSummary(join(ownedRoot, 'candidate', 'report.json'), [
        'schema_version', 'state', 'status', 'disposition', 'activation_status',
        'activated', 'generation', 'registry_version_id',
      ]),
    },
    lifecycle: {
      active_generation: jsonSummary(join(ownedRoot, 'install-state', 'active.json'), ['schema_version', 'generation_id']),
      known_good_generation: jsonSummary(join(ownedRoot, 'install-state', 'known-good.json'), ['schema_version', 'generation_id']),
      state: jsonSummary(join(ownedRoot, 'install-state', 'lifecycle.json'), ['schema_version', 'enabled', 'generation_id']),
    },
    external_state: treeDigest(root, runtime),
  };
}

function cleanUndefined(value) {
  if (Array.isArray(value)) return value.map(cleanUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, cleanUndefined(entry)]));
}

function snapshot(options) {
  const claudeRoot = resolve(options['claude-root']);
  const codexRoot = resolve(options['codex-root']);
  const sourceRouter = resolve(options['source-router'] || join(REPO_ROOT, 'src/runtime/router.mjs'));
  const sourceEvolve = resolve(options['source-evolve'] || join(REPO_ROOT, 'src/runtime/router.evolve.mjs'));
  const output = resolve(options.output);
  const manifestPath = resolve(options.manifest || join(claudeRoot, 'router', 'install-manifest.json'));
  if (!existsSync(claudeRoot) || !statSync(claudeRoot).isDirectory()) throw new Error(`Claude root missing: ${claudeRoot}`);
  if (!existsSync(codexRoot) || !statSync(codexRoot).isDirectory()) throw new Error(`Codex root missing: ${codexRoot}`);
  if (!existsSync(sourceRouter) || !statSync(sourceRouter).isFile()) throw new Error(`router source missing: ${sourceRouter}`);
  if (!existsSync(sourceEvolve) || !statSync(sourceEvolve).isFile()) throw new Error(`evolve source missing: ${sourceEvolve}`);
  if (!existsSync(dirname(output)) || !statSync(dirname(output)).isDirectory()) throw new Error(`output parent missing: ${dirname(output)}`);
  const result = cleanUndefined({
    schema_version: 1,
    policy: 'v19-live-snapshot-v1',
    captured_at: new Date().toISOString(),
    source: {
      router: fileRecord(sourceRouter),
      evolve: fileRecord(sourceEvolve),
    },
    runtimes: {
      claude: runtimeSnapshot({ root: claudeRoot, runtime: 'claude', manifestPath, codexRoot }),
      codex: runtimeSnapshot({ root: codexRoot, runtime: 'codex', manifestPath, codexRoot }),
    },
  });
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  const temporary = `${output}.tmp.${process.pid}`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, output);
  } catch (error) {
    try { if (existsSync(temporary)) rmSync(temporary, { force: true }); } catch { /* best effort cleanup */ }
    throw error;
  }
  return result;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(help());
} else {
  try {
    if (!options['claude-root'] || !options['codex-root'] || !options.output) {
      throw new Error('--claude-root, --codex-root, and --output are required');
    }
    const result = snapshot(options);
    process.stdout.write(`SNAPSHOT OK — ${result.policy}\n`);
  } catch (error) {
    process.stderr.write(`SNAPSHOT FAILED: ${error.message}\n`);
    process.exitCode = 1;
  }
}
