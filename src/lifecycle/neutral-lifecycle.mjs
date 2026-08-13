import {
  existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NEUTRAL_MANIFEST_SCHEMA_VERSION = 1;
const OWNER = 'portable-neutral-router';
const EVENTS = Object.freeze({ claude: ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact'], codex: ['UserPromptSubmit'] });

function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}

function atomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}`;
  writeFileSync(temporary, value, { mode: 0o600 });
  renameSync(temporary, file);
}

function absolute(value, label) {
  if (typeof value !== 'string' || !value.trim() || !isAbsolute(value)) throw new TypeError(`${label} must be an absolute path`);
  return resolve(value);
}

function optionalAbsolute(value, label) {
  return value === undefined || value === null ? null : absolute(value, label);
}

function contains(parent, child) {
  return child === parent || child.startsWith(`${parent}/`);
}

function jsonObject(file, fallback, label) {
  if (!existsSync(file)) return structuredClone(fallback);
  let value;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`${label} is invalid JSON: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function hookCommand(runtime, stateRoot, nodeBinary, hookPath) {
  return `ROUTER_RUNTIME=${shellQuote(runtime)} ROUTER_STATE_ROOT=${shellQuote(stateRoot)} ${shellQuote(nodeBinary)} ${shellQuote(hookPath)}`;
}

function managedEntry(group, path) {
  if (group?.managed_by === OWNER && group?.router_path === path) return true;
  return Array.isArray(group?.hooks) && group.hooks.some(hook => hook?.type === 'command' && hook.command === group?.router_command);
}

function removeBinding(settings, event, path) {
  const groups = Array.isArray(settings.hooks?.[event]) ? settings.hooks[event] : [];
  const kept = groups.filter(group => !(group?.managed_by === OWNER && group?.router_path === path));
  if (kept.length) settings.hooks[event] = kept;
  else delete settings.hooks[event];
}

function binding(runtime, event, stateRoot, nodeBinary, hookPath) {
  const command = hookCommand(runtime, stateRoot, nodeBinary, hookPath);
  return {
    managed_by: OWNER,
    router_path: hookPath,
    router_command: command,
    hooks: [{ type: 'command', command, timeout: 5 }],
  };
}

function paths(options = {}) {
  const stateRoot = optionalAbsolute(options.stateRoot, 'explicit neutral state root');
  if (!stateRoot) throw new TypeError('explicit neutral state root is required');
  if (stateRoot.split('/').includes('.router')) throw new TypeError('the neutral state root cannot be .router');
  const claudeRoot = optionalAbsolute(options.claudeRoot, 'claudeRoot');
  const codexRoot = optionalAbsolute(options.codexRoot, 'codexRoot');
  if (!claudeRoot && !codexRoot) throw new TypeError('at least one explicit runtime root is required');
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (contains(repositoryRoot, stateRoot) || contains(stateRoot, repositoryRoot)
    || [claudeRoot, codexRoot].some(root => root && (contains(root, stateRoot) || contains(stateRoot, root)))) {
    throw new TypeError('neutral state root must be outside the repository and runtime roots');
  }
  const nodeBinary = absolute(options.nodeBinary || process.execPath, 'nodeBinary');
  const sourceRouter = absolute(fileURLToPath(new URL('../runtime/neutral-router.mjs', import.meta.url)), 'sourceRouter');
  return {
    stateRoot,
    manifestPath: absolute(options.manifestPath || join(stateRoot, 'install-manifest.json'), 'manifestPath'),
    statusPath: join(stateRoot, 'status.json'),
    sourceRouter,
    nodeBinary,
    claudeRoot,
    codexRoot,
    claudeSettingsPath: claudeRoot && absolute(options.claudeSettingsPath || join(claudeRoot, 'settings.json'), 'claudeSettingsPath'),
    codexHooksPath: codexRoot && absolute(options.codexHooksPath || join(codexRoot, 'hooks.json'), 'codexHooksPath'),
    claudeHookPath: claudeRoot && absolute(options.claudeHookPath || join(claudeRoot, 'hooks', 'router-neutral.mjs'), 'claudeHookPath'),
    codexHookPath: codexRoot && absolute(options.codexHookPath || join(codexRoot, 'hooks', 'router-neutral.mjs'), 'codexHookPath'),
  };
}

function readSettings(path) {
  const settings = jsonObject(path, { hooks: {} }, 'runtime settings');
  if (!settings.hooks) settings.hooks = {};
  if (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) throw new Error('runtime settings hooks must be an object');
  return settings;
}

function files(p) {
  return [p.claudeHookPath, p.codexHookPath, p.statusPath].filter(Boolean);
}

function snapshot(filePaths) {
  return filePaths.map(file => ({ file, exists: existsSync(file), bytes: existsSync(file) ? readFileSync(file) : null }));
}

function restore(entries) {
  for (const entry of entries.reverse()) {
    if (entry.exists) atomicWrite(entry.file, entry.bytes);
    else rmSync(entry.file, { force: true });
  }
}

function installBindings(p, settings, runtime, hookPath) {
  for (const event of EVENTS[runtime]) {
    const existing = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    const filtered = existing.filter(group => !managedEntry(group, hookPath));
    filtered.push(binding(runtime, event, p.stateRoot, p.nodeBinary, hookPath));
    settings.hooks[event] = filtered;
  }
  return settings;
}

function statusValue() {
  return {
    schema_version: 1,
    done: 'neutral runtime bridge installed',
    current: 'safe pass-through mode active',
    blocked: 'no explicit neutral capability manifest registered',
    next: 'register capabilities.json if adaptive selection is needed',
    route: 'pass_through',
    owner_action: 'register_capabilities_if_needed',
  };
}

export function neutralPaths(options = {}) {
  return paths(options);
}

export async function installNeutralRouter(options = {}) {
  const p = paths(options);
  if (!existsSync(p.sourceRouter)) throw new Error(`neutral router source missing: ${p.sourceRouter}`);
  const sourceBytes = readFileSync(p.sourceRouter);
  const sourceFingerprint = fingerprint(sourceBytes);
  const settings = p.claudeSettingsPath ? readSettings(p.claudeSettingsPath) : null;
  const codexSettings = p.codexHooksPath ? readSettings(p.codexHooksPath) : null;
  for (const hookPath of [p.claudeHookPath, p.codexHookPath].filter(Boolean)) {
    if (existsSync(hookPath) && fingerprint(readFileSync(hookPath)) !== sourceFingerprint) {
      const manifest = jsonObject(p.manifestPath, null, 'neutral ownership manifest');
      const owned = manifest?.files?.some(file => file.path === hookPath);
      if (!owned) throw new Error(`existing hook is not owned by the neutral installer: ${hookPath}`);
    }
  }
  const manifest = {
    schema_version: NEUTRAL_MANIFEST_SCHEMA_VERSION,
    state: 'complete',
    managed_by: OWNER,
    state_root: p.stateRoot,
    files: files(p).map(file => ({ path: file, fingerprint: file === p.statusPath ? fingerprint(JSON.stringify(statusValue())) : sourceFingerprint })),
    bindings: [
      ...(p.claudeHookPath ? EVENTS.claude.map(event => ({ settings_path: p.claudeSettingsPath, event, router_path: p.claudeHookPath })) : []),
      ...(p.codexHookPath ? EVENTS.codex.map(event => ({ settings_path: p.codexHooksPath, event, router_path: p.codexHookPath })) : []),
    ],
  };
  const changes = [
    ...[p.claudeHookPath, p.codexHookPath].filter(Boolean).filter(path => !existsSync(path) || fingerprint(readFileSync(path)) !== sourceFingerprint),
    ...[p.claudeSettingsPath, p.codexHooksPath].filter(Boolean),
    p.statusPath, p.manifestPath,
  ];
  if (options.dryRun) return { status: 'dry-run', changes: [...new Set(changes)], ...p };

  const before = snapshot([...new Set([
    p.claudeHookPath, p.codexHookPath, p.claudeSettingsPath, p.codexHooksPath, p.statusPath, p.manifestPath,
  ].filter(Boolean))]);
  try {
    for (const hookPath of [p.claudeHookPath, p.codexHookPath].filter(Boolean)) atomicWrite(hookPath, sourceBytes);
    if (settings) atomicWrite(p.claudeSettingsPath, JSON.stringify(installBindings(p, settings, 'claude', p.claudeHookPath), null, 2) + '\n');
    if (codexSettings) atomicWrite(p.codexHooksPath, JSON.stringify(installBindings(p, codexSettings, 'codex', p.codexHookPath), null, 2) + '\n');
    const status = JSON.stringify(statusValue(), null, 2) + '\n';
    atomicWrite(p.statusPath, status);
    atomicWrite(p.manifestPath, JSON.stringify({ ...manifest, files: manifest.files.map(file => ({ ...file, fingerprint: file.path === p.statusPath ? fingerprint(status) : file.fingerprint })) }, null, 2) + '\n');
  } catch (error) {
    restore(before);
    throw error;
  }
  return {
    status: 'installed',
    manifestPath: p.manifestPath,
    stateRoot: p.stateRoot,
    claudeHookPath: p.claudeHookPath,
    codexHookPath: p.codexHookPath,
    changes: [...new Set(changes)],
  };
}

function removeOwnedFile(path, expected) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) return false;
  if (expected && fingerprint(readFileSync(path)) !== expected) return false;
  rmSync(path, { force: true });
  return true;
}

export async function uninstallNeutralRouter(options = {}) {
  const p = paths(options);
  if (!existsSync(p.manifestPath)) return { status: 'already-uninstalled', removed: [], retained: [] };
  const manifest = jsonObject(p.manifestPath, null, 'neutral ownership manifest');
  if (manifest?.managed_by !== OWNER || manifest.schema_version !== NEUTRAL_MANIFEST_SCHEMA_VERSION) throw new Error('neutral ownership manifest is invalid; no files were removed');
  const removed = [];
  for (const entry of manifest.bindings || []) {
    if (!existsSync(entry.settings_path)) continue;
    const settings = readSettings(entry.settings_path);
    removeBinding(settings, entry.event, entry.router_path);
    atomicWrite(entry.settings_path, JSON.stringify(settings, null, 2) + '\n');
  }
  for (const entry of manifest.files || []) {
    if (entry.path === join(p.stateRoot, 'events.jsonl')) continue;
    if (removeOwnedFile(entry.path, entry.fingerprint)) removed.push(entry.path);
  }
  if (removeOwnedFile(p.manifestPath)) removed.push(p.manifestPath);
  return { status: 'uninstalled', removed, retained: existsSync(p.statusPath) ? [p.statusPath] : [] };
}
