#!/usr/bin/env node
// Claude Router inventory manifest builder — Node stdlib port of build_manifest.py.
// Zero dependencies. Walks ~/.claude + ~/.agents/skills + optional project dirs,
// emits claude-inventory-manifest.json. Read-only w.r.t. user code; writes only
// the manifest (atomic tmp+rename).
//
// Env vars (all optional; project-specific ones default empty — no operator leakage):
//   ROUTER_CLAUDE_HOME           default ~/.claude
//   ROUTER_AGENTS_SKILLS_DIR     default ~/.agents/skills
//   ROUTER_SKILL_LOCK_PATH       default ~/.agents/.skill-lock.json
//   ROUTER_CLAUDE_JSON           default ~/.claude.json
//   ROUTER_PROJECT_SKILL_DIRS    ':'-separated project roots with .claude/skills
//   ROUTER_PROJECT_MCP_JSON      path to a project .mcp.json to include
//   ROUTER_PROJECT_CONFIG_PATH   project path whose ~/.claude.json entry to read
//   ROUTER_MANIFEST_OUT          default next to this script
//   ROUTER_MODE_MAP_PATH         default ~/.claude/router/mode-map.json
//   ROUTER_COVERAGE_REPORT_PATH  default beside ROUTER_MANIFEST_OUT
//   ROUTER_COVERAGE_BASELINE_PATH default beside this script
//
// Robustness: every optional path is guarded. A completely empty ~/.claude yields
// exit 0 with a valid manifest and all-zero counts.

import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { auditCoverage } from './src/coverage/audit.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();

const CLAUDE = process.env.ROUTER_CLAUDE_HOME || join(HOME, '.claude');
const AGENTS_SKILLS_DIR = process.env.ROUTER_AGENTS_SKILLS_DIR || join(HOME, '.agents', 'skills');
const SKILL_LOCK_PATH = process.env.ROUTER_SKILL_LOCK_PATH || join(HOME, '.agents', '.skill-lock.json');
const CLAUDE_JSON = process.env.ROUTER_CLAUDE_JSON || join(HOME, '.claude.json');
const PROJECT_SKILL_DIRS = (process.env.ROUTER_PROJECT_SKILL_DIRS || '')
  .split(':').map(s => s.trim()).filter(Boolean);
const PROJECT_MCP_JSON = process.env.ROUTER_PROJECT_MCP_JSON || '';
const PROJECT_CONFIG_PATH = process.env.ROUTER_PROJECT_CONFIG_PATH || '';
const OUT = process.env.ROUTER_MANIFEST_OUT || join(SCRIPT_DIR, 'claude-inventory-manifest.json');
const MODE_MAP_PATH = process.env.ROUTER_MODE_MAP_PATH || join(CLAUDE, 'router', 'mode-map.json');
const COVERAGE_REPORT_PATH = process.env.ROUTER_COVERAGE_REPORT_PATH
  || join(dirname(OUT), 'coverage-report.json');
const COVERAGE_BASELINE_PATH = process.env.ROUTER_COVERAGE_BASELINE_PATH
  || join(SCRIPT_DIR, 'coverage-baseline.json');
const STRICT_COVERAGE = process.argv.includes('--strict-coverage');
const ROUTER_HOOK_PATH = process.env.ROUTER_HOOK_PATH || join(HOME, '.claude', 'hooks', 'router.mjs');
export const MODE_MAP_SIZE_CEILING = 30_000;

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

// .skill-lock.json maps skill name -> {source, sourceUrl, ...}
const SKILL_LOCK = (readJson(SKILL_LOCK_PATH, {}) || {}).skills || {};

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { fm: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { fm: {}, body: text };
  const block = text.slice(3, end);
  const body = text.slice(end + 4);
  const fm = {};
  let key = null;
  for (const line of block.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (line.startsWith('  - ')) {
      if (key) {
        if (!Array.isArray(fm[key])) fm[key] = [];
        fm[key].push(line.trim().slice(2).trim().replace(/^["']+|["']+$/g, ''));
      }
      continue;
    }
    const idx = line.indexOf(':');
    if (idx !== -1) {
      key = line.slice(0, idx).trim();
      fm[key] = line.slice(idx + 1).trim().replace(/^["']+|["']+$/g, '');
    }
  }
  return { fm, body };
}

function firstBodySection(body) {
  for (const tag of ['objective', 'role', 'description']) {
    const m = body.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 'si'));
    if (m) return m[1].trim().slice(0, 300);
  }
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  return lines[0] ? lines[0].slice(0, 300) : '';
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function safeReaddir(dir) {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

function isDirFollow(full) {
  try { return statSync(full).isDirectory(); } catch { return false; }
}

// Recursive file list under root. Follows symlinked dirs (skills are often symlinks
// into ~/.agents). Skips node_modules / .git to avoid pathological walks.
function walkFiles(root, files = []) {
  for (const e of safeReaddir(root)) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = join(root, e.name);
    if (e.isDirectory()) {
      walkFiles(full, files);
    } else if (e.isSymbolicLink() && isDirFollow(full)) {
      walkFiles(full, files);
    } else if (e.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function toolsList(fm) {
  const tools = fm.tools || '';
  if (Array.isArray(tools)) return tools;
  return String(tools).split(',').map(t => t.trim()).filter(Boolean);
}

function pluginSourceFromPath(p, fallback = '?') {
  const parts = p.split('/');
  const i = parts.indexOf('plugins');
  if (i === -1) return fallback;
  return parts[i + 2] || parts[i + 1] || '?';
}

const manifest = {
  generated_at_runtime_note: 'static snapshot of ~/.claude + ~/.agents + known project .claude/skills dirs',
  registry_scope: {
    claude_home: CLAUDE,
    agents_skills_dir: AGENTS_SKILLS_DIR,
    project_skill_dirs: PROJECT_SKILL_DIRS,
    skill_lock: SKILL_LOCK_PATH,
    note: 'skills[] = ~/.claude/skills (incl. symlinks into ~/.agents); agents_store_skills[] = ~/.agents/skills NOT already surfaced globally; project_scoped_skills[] = skills only in a project .claude/skills',
  },
  skills: [],
  plugin_skills: [],
  agents_store_skills: [],
  project_scoped_skills: [],
  agents: [],
  hooks: [],
  commands: [],
  mcp_servers: [],
  unwired_mcp_refs: {},
  plugins_enabled: [],
  installed_plugins: [],
  plugin_manifests: [],
  marketplaces: [],
  project_config: {},
  plugin_hooks: [],
  settings: {},
  claude_md: null,
  counts: {},
};

// SKILLS — ~/.claude/skills (incl. symlinks into ~/.agents)
for (const e of safeReaddir(join(CLAUDE, 'skills'))) {
  const d = join(CLAUDE, 'skills', e.name);
  if (!isDirFollow(d)) continue;
  const sf = join(d, 'SKILL.md');
  if (!existsSync(sf)) continue;
  const { fm, body } = parseFrontmatter(readText(sf));
  const lock = SKILL_LOCK[e.name] || {};
  manifest.skills.push({
    id: fm.name || e.name,
    name: e.name,
    description: fm.description || '',
    argument_hint: fm['argument-hint'] || '',
    allowed_tools: fm['allowed-tools'] || [],
    path: sf,
    summary: firstBodySection(body),
    is_symlink: e.isSymbolicLink(),
    origin: lock.source || '',
    origin_url: lock.sourceUrl || '',
    scope: 'global',
  });
}

// AGENTS — ~/.claude/agents/*.md
for (const e of safeReaddir(join(CLAUDE, 'agents'))) {
  if (!e.isFile() || !e.name.endsWith('.md')) continue;
  const f = join(CLAUDE, 'agents', e.name);
  const { fm, body } = parseFrontmatter(readText(f));
  manifest.agents.push({
    id: fm.name || e.name.replace(/\.md$/, ''),
    name: e.name.replace(/\.md$/, ''),
    source: 'user',
    description: fm.description || '',
    tools: toolsList(fm),
    model: fm.model || '',
    color: fm.color || '',
    effort: fm.effort || '',
    path: f,
    summary: firstBodySection(body),
  });
}

// PLUGIN AGENTS — plugins/**/agents/*.md, dedup by stem
const seenAgentStems = new Set(manifest.agents.map(a => a.name));
for (const cf of walkFiles(join(CLAUDE, 'plugins'))) {
  if (basename(dirname(cf)) !== 'agents' || !cf.endsWith('.md')) continue;
  const stem = basename(cf, '.md');
  if (seenAgentStems.has(stem)) continue;
  seenAgentStems.add(stem);
  const { fm, body } = parseFrontmatter(readText(cf));
  manifest.agents.push({
    id: fm.name || stem,
    name: stem,
    source: pluginSourceFromPath(cf),
    description: fm.description || '',
    tools: toolsList(fm),
    model: fm.model || '',
    color: fm.color || '',
    effort: fm.effort || '',
    path: cf,
    summary: firstBodySection(body),
  });
}

// HOOKS — files in ~/.claude/hooks + hooks/lib
const hookFiles = [];
for (const e of safeReaddir(join(CLAUDE, 'hooks'))) {
  if (!e.isFile() || e.name.startsWith('.')) continue;
  const ext = extname(e.name).slice(1);
  const kind = ({ js: 'node', mjs: 'node', cjs: 'node', sh: 'shell' })[ext] || ext;
  const f = join(CLAUDE, 'hooks', e.name);
  hookFiles.push({ id: e.name.replace(/\.[^.]+$/, ''), name: e.name, type: kind, path: f, size: fileStatSize(f) });
}
const libDir = join(CLAUDE, 'hooks', 'lib');
for (const e of safeReaddir(libDir)) {
  if (!e.isFile()) continue;
  const f = join(libDir, e.name);
  hookFiles.push({ id: 'lib/' + e.name.replace(/\.[^.]+$/, ''), name: e.name, type: 'lib', path: f, size: fileStatSize(f) });
}
manifest.hooks = hookFiles;

// settings.json — hooks config + permissions + enabledPlugins
const settings = readJson(join(CLAUDE, 'settings.json'), {}) || {};
const hookBindings = [];
for (const [event, matchers] of Object.entries(settings.hooks || {})) {
  for (const matcherEntry of matchers || []) {
    const m = matcherEntry.matcher || '*';
    for (const h of matcherEntry.hooks || []) {
      hookBindings.push({ event, matcher: m, type: h.type || '', command: h.command || '' });
    }
  }
}
manifest.settings = {
  permissions: settings.permissions || {},
  hook_bindings: hookBindings,
  statusLine: settings.statusLine || {},
  enabledPlugins: settings.enabledPlugins || {},
  effortLevel: settings.effortLevel || '',
  theme: settings.theme || '',
};
manifest.plugins_enabled = Object.keys(settings.enabledPlugins || {});

// INSTALLED PLUGINS — plugins/installed_plugins.json
const ip = readJson(join(CLAUDE, 'plugins', 'installed_plugins.json'), {}) || {};
const installedPlugins = [];
for (const [key, records] of Object.entries(ip.plugins || {})) {
  const r = (records && records[0]) || {};
  installedPlugins.push({
    name: key.split('@')[0],
    marketplace: key.split('@').slice(1).join('@'),
    version: r.version || '',
    scope: r.scope || '',
    install_path: r.installPath || '',
    installed_at: r.installedAt || '',
  });
}
manifest.installed_plugins = installedPlugins;

// COMMANDS — plugins/**/commands/*.md + gsd-core/**/commands/*.md, dedup by id
const seenCmds = new Set();
for (const root of [join(CLAUDE, 'plugins'), join(CLAUDE, 'gsd-core')]) {
  for (const cf of walkFiles(root)) {
    if (basename(dirname(cf)) !== 'commands' || !cf.endsWith('.md')) continue;
    const { fm, body: _body } = parseFrontmatter(readText(cf));
    const cid = fm.name || basename(cf, '.md');
    if (seenCmds.has(cid)) continue;
    seenCmds.add(cid);
    const parts = cf.split('/');
    let src = 'gsd-core';
    const pi = parts.indexOf('plugins');
    if (pi !== -1) src = parts[pi + 2] || parts[pi + 1] || '?';
    manifest.commands.push({
      id: cid,
      name: basename(cf, '.md'),
      source: src,
      description: fm.description || '',
      argument_hint: fm['argument-hint'] || '',
      allowed_tools: fm['allowed-tools'] || [],
      path: cf,
    });
  }
}

// MCP SERVERS — plugins/**/.mcp.json + mcp.json + optional project .mcp.json
const mcpFiles = [];
for (const cf of walkFiles(join(CLAUDE, 'plugins'))) {
  const b = basename(cf);
  if (b === '.mcp.json' || b === 'mcp.json') mcpFiles.push(cf);
}
if (PROJECT_MCP_JSON && existsSync(PROJECT_MCP_JSON)) mcpFiles.push(PROJECT_MCP_JSON);
const seenServers = new Set();
for (const mf of mcpFiles) {
  const data = readJson(mf, {}) || {};
  const servers = data.mcpServers || data.servers || {};
  for (const [sname, sconf] of Object.entries(servers)) {
    if (seenServers.has(sname)) continue;
    seenServers.add(sname);
    manifest.mcp_servers.push({
      id: sname,
      name: sname,
      transport: sconf.type || sconf.transport || '',
      command: sconf.command || '',
      args: sconf.args || [],
      url: sconf.url || '',
      env_keys: Object.keys(sconf.env || {}),
      source_file: mf,
    });
  }
}

// PLUGIN-PROVIDED SKILLS — plugins/**/skills/*/SKILL.md, dedup by (source, name)
const seenPSkills = new Set();
for (const cf of walkFiles(join(CLAUDE, 'plugins'))) {
  if (basename(cf) !== 'SKILL.md' || basename(dirname(dirname(cf))) !== 'skills') continue;
  const sname = basename(dirname(cf));
  const { fm, body } = parseFrontmatter(readText(cf));
  const src = pluginSourceFromPath(cf);
  const key = `${src}\0${sname}`;
  if (seenPSkills.has(key)) continue;
  seenPSkills.add(key);
  manifest.plugin_skills.push({
    id: fm.name || sname,
    name: sname,
    source: src,
    description: fm.description || '',
    path: cf,
    summary: firstBodySection(body),
  });
}

// AGENTS-STORE SKILLS — ~/.agents/skills NOT already surfaced globally
const seenSkillNames = new Set([
  ...manifest.skills.map(s => s.name),
  ...manifest.plugin_skills.map(s => s.name),
]);
if (existsSync(AGENTS_SKILLS_DIR)) {
  for (const e of safeReaddir(AGENTS_SKILLS_DIR)) {
    const d = join(AGENTS_SKILLS_DIR, e.name);
    if (!isDirFollow(d)) continue;
    if (seenSkillNames.has(e.name)) continue;
    const sf = join(d, 'SKILL.md');
    if (!existsSync(sf)) continue;
    seenSkillNames.add(e.name);
    const { fm, body } = parseFrontmatter(readText(sf));
    const lock = SKILL_LOCK[e.name] || {};
    manifest.agents_store_skills.push({
      id: fm.name || e.name,
      name: e.name,
      description: fm.description || '',
      argument_hint: fm['argument-hint'] || '',
      allowed_tools: fm['allowed-tools'] || [],
      path: sf,
      summary: firstBodySection(body),
      origin: lock.source || '',
      origin_url: lock.sourceUrl || '',
      scope: 'agents-store (not globally symlinked)',
    });
  }
}

// PROJECT-SCOPED SKILLS — skills only in a project's .claude/skills
for (const proj of PROJECT_SKILL_DIRS) {
  const psd = join(proj, '.claude', 'skills');
  if (!existsSync(psd)) continue;
  for (const e of safeReaddir(psd)) {
    const d = join(psd, e.name);
    if (!isDirFollow(d)) continue;
    const sf = join(d, 'SKILL.md');
    if (!existsSync(sf)) continue;
    const { fm, body } = parseFrontmatter(readText(sf));
    manifest.project_scoped_skills.push({
      id: fm.name || e.name,
      name: e.name,
      description: fm.description || '',
      argument_hint: fm['argument-hint'] || '',
      allowed_tools: fm['allowed-tools'] || [],
      path: sf,
      summary: firstBodySection(body),
      project: proj,
      scope: 'project',
    });
  }
}

// PLUGIN MANIFESTS — every .claude-plugin/plugin.json
const seenPm = new Set();
for (const cf of walkFiles(join(CLAUDE, 'plugins'))) {
  if (basename(cf) !== 'plugin.json' || basename(dirname(cf)) !== '.claude-plugin') continue;
  const pm = readJson(cf, {}) || {};
  const pname = pm.name || basename(dirname(dirname(cf)));
  const pver = pm.version || '';
  const key = `${pname}\0${pver}\0${cf}`;
  if (seenPm.has(key)) continue;
  seenPm.add(key);
  const author = pm.author;
  manifest.plugin_manifests.push({
    name: pname,
    version: pver,
    description: pm.description || '',
    author: (author && typeof author === 'object') ? (author.name || '') : (author || ''),
    homepage: pm.homepage || '',
    path: cf,
    has_hooks: !!pm.hooks,
    has_mcp: !!pm.mcp,
  });
}

// MARKETPLACES — known_marketplaces.json
const km = readJson(join(CLAUDE, 'plugins', 'known_marketplaces.json'), {}) || {};
for (const [mname, mconf] of Object.entries(km)) {
  const src = mconf.source || {};
  manifest.marketplaces.push({
    name: mname,
    repo: src.repo || '',
    source_type: src.source || '',
    install_location: mconf.installLocation || '',
    last_updated: mconf.lastUpdated || '',
  });
}

// PROJECT CONFIG — ~/.claude.json projects[<path>] (per-project MCP, allowedTools, etc.)
const cj = readJson(CLAUDE_JSON, {}) || {};
const projConfig = (PROJECT_CONFIG_PATH && cj.projects && cj.projects[PROJECT_CONFIG_PATH]) || {};
manifest.project_config = {
  project_path: PROJECT_CONFIG_PATH,
  allowed_tools: projConfig.allowedTools || [],
  mcp_servers: Object.keys(projConfig.mcpServers || {}),
  enabled_mcpjson_servers: projConfig.enabledMcpjsonServers || [],
  disabled_mcpjson_servers: projConfig.disabledMcpjsonServers || [],
  mcp_context_uris: projConfig.mcpContextUris || [],
  has_trust_accepted: !!projConfig.hasTrustDialogAccepted,
};

// PLUGIN HOOKS — hooks defined in plugin.json manifests
const seenPHooks = new Set();
for (const pm of manifest.plugin_manifests) {
  const data = readJson(pm.path, {}) || {};
  for (const [event, matchers] of Object.entries(data.hooks || {})) {
    for (const m of matchers || []) {
      const matcher = m.matcher || '*';
      for (const h of m.hooks || []) {
        const cmd = h.command || '';
        const normCmd = cmd.includes('${CLAUDE_PLUGIN_ROOT}')
          ? cmd.split('${CLAUDE_PLUGIN_ROOT}').pop()
          : cmd;
        const key = `${pm.name}\0${event}\0${matcher}\0${normCmd}`;
        if (seenPHooks.has(key)) continue;
        seenPHooks.add(key);
        manifest.plugin_hooks.push({
          plugin: pm.name,
          event,
          matcher,
          type: h.type || '',
          command: cmd,
          timeout: h.timeout || '',
        });
      }
    }
  }
}

// CLAUDE.md
const cmdFile = join(CLAUDE, 'CLAUDE.md');
if (existsSync(cmdFile)) {
  manifest.claude_md = {
    path: cmdFile,
    size: fileStatSize(cmdFile),
    preview: readText(cmdFile).slice(0, 500),
  };
}

// MCP REFERENCES on agents — flag tools referencing MCP servers not in the manifest
const configuredMcps = new Set([
  ...manifest.mcp_servers.map(s => s.id),
  ...manifest.project_config.mcp_servers,
]);
const unwiredRefs = {};
const mcpRefRe = /^mcp__([a-zA-Z0-9_-]+)__/;
for (const a of manifest.agents) {
  const refs = new Set();
  for (const t of (a.tools || [])) {
    const m = mcpRefRe.exec(String(t));
    if (m) refs.add(m[1]);
  }
  a.mcp_refs = [...refs].sort();
  const missing = [...refs].filter(r => !configuredMcps.has(r)).sort();
  a.requires_mcp_not_in_manifest = missing;
  for (const r of missing) {
    (unwiredRefs[r] = unwiredRefs[r] || []).push(a.id);
  }
}
manifest.unwired_mcp_refs = unwiredRefs;

manifest.counts = {
  skills: manifest.skills.length,
  plugin_skills: manifest.plugin_skills.length,
  agents_store_skills: manifest.agents_store_skills.length,
  project_scoped_skills: manifest.project_scoped_skills.length,
  agents: manifest.agents.length,
  hooks: manifest.hooks.length,
  hook_bindings: hookBindings.length,
  commands: manifest.commands.length,
  mcp_servers: manifest.mcp_servers.length,
  unwired_mcp_refs: Object.keys(manifest.unwired_mcp_refs).length,
  plugins_enabled: manifest.plugins_enabled.length,
  installed_plugins: installedPlugins.length,
  plugin_manifests: manifest.plugin_manifests.length,
  marketplaces: manifest.marketplaces.length,
  plugin_hooks: manifest.plugin_hooks.length,
  project_mcp_servers: manifest.project_config.mcp_servers.length,
};

function fileStatSize(p) {
  try { return statSync(p).size; } catch { return 0; }
}

// Atomic write (tmp + rename).
mkdirSync(dirname(OUT), { recursive: true });
const tmp = `${OUT}.tmp.${process.pid}`;
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
renameSync(tmp, OUT);

const coverageModeMap = readJson(MODE_MAP_PATH, null);
let routeDiagnostics = [];
try {
  const { validateRouteTargets } = await import(ROUTER_HOOK_PATH);
  if (typeof validateRouteTargets !== 'function') throw new TypeError('router validator export is unavailable');
  routeDiagnostics = validateRouteTargets(manifest, coverageModeMap);
} catch (error) {
  if (STRICT_COVERAGE) throw error;
  routeDiagnostics = [{
    status: 'validator_unavailable',
    reason: error instanceof Error ? error.message : String(error),
  }];
}
const coverage = auditCoverage({
  manifest,
  modeMap: coverageModeMap,
  baseline: readJson(COVERAGE_BASELINE_PATH, null),
  routeDiagnostics,
});
mkdirSync(dirname(COVERAGE_REPORT_PATH), { recursive: true });
const coverageTmp = `${COVERAGE_REPORT_PATH}.tmp.${process.pid}`;
writeFileSync(coverageTmp, JSON.stringify(coverage, null, 2));
renameSync(coverageTmp, COVERAGE_REPORT_PATH);
if (STRICT_COVERAGE
  && (coverage.unacknowledged_gaps.length || coverage.forward_diagnostics.length)) {
  process.exitCode = 1;
}

console.log(JSON.stringify(manifest.counts, null, 2));
console.log(`manifest written: ${OUT}`);
console.log(`coverage report written: ${COVERAGE_REPORT_PATH}`);
console.log(`size: ${fileStatSize(OUT)} bytes`);

const modeMapSize = fileStatSize(MODE_MAP_PATH);
if (modeMapSize > MODE_MAP_SIZE_CEILING) {
  console.error(`mode-map.json exceeds 30KB: ${modeMapSize} bytes`);
  process.exitCode = 1;
}
