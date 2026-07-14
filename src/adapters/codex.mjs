import { basename, join, resolve } from 'node:path';
import { createAdapter } from './claude.mjs';

function layout(rel) {
  if (rel === 'config.toml' || rel === 'config.unsupported.toml') return { type: 'config', format: 'toml' };
  if (/^skills\/[^/]+\/SKILL\.md$/.test(rel) || /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(rel)) return { type: 'skill', format: 'markdown' };
  if (/^plugins\/[^/]+\/plugin\.json$/.test(rel)) return { type: 'plugin', format: 'json' };
  if (/^agents\/[^/]+\.(toml|json)$/.test(rel)) return { type: 'agent', format: rel.endsWith('.toml') ? 'toml' : 'json' };
  if (/^hooks\/[^/]+\.json$/.test(rel)) return { type: 'hook', format: 'json' };
  if (/^skills\/.+\.json$/.test(rel)) return { type: 'skill', format: 'json' };
  if (/^(config|mcp|tools|models|permissions|dependencies)\/.+\.json$/.test(rel)) {
    const map = { config: 'config', mcp: 'mcp', tools: 'tool', models: 'model', permissions: 'permission', dependencies: 'dependency' };
    return { type: map[rel.split('/')[0]], format: 'json' };
  }
  return null;
}

function expandConfig(base) {
  const records = [{ ...base, name: 'config', data: { ...base.data, command: 'config' } }];
  if (base.data.model) records.push({ ...base, type: 'model', name: String(base.data.model), data: { schema_version: 1, command: String(base.data.model) } });
  if (base.data.permission) records.push({ ...base, type: 'permission', name: String(base.data.permission), data: { schema_version: 1, command: String(base.data.permission) } });
  for (const tool of Array.isArray(base.data.tools) ? base.data.tools : []) records.push({ ...base, type: 'tool', name: String(tool), data: { schema_version: 1, command: String(tool) } });
  for (const [name, config] of Object.entries(base.data.mcp_servers || {})) records.push({ ...base, type: 'mcp', name, data: { schema_version: 1, command: config.command || name } });
  for (const dependency of Array.isArray(base.data.dependencies) ? base.data.dependencies : []) records.push({ ...base, type: 'dependency', name: String(dependency.id), data: { schema_version: 1, command: String(dependency.id), dependencies: [dependency] } });
  return records;
}

const adapter = createAdapter({ runtime: 'codex', adapterVersion: 'codex-adapter/2', layout, configExpander: expandConfig });
export const parseArtifact = adapter.parseArtifact;
export const normalizeArtifact = adapter.normalizeArtifact;
export const compileInvocation = adapter.compileInvocation;
export function discoverRoots(options = {}) {
  if (!options.codexRoot) throw new TypeError('codexRoot is required');
  const roots = [{ root: options.codexRoot, logicalRoot: 'codex_home', scope: { kind: 'global' } }];
  if (options.projectRoot) { const id = String(options.scopeId || basename(resolve(options.projectRoot))); roots.push({ root: join(options.projectRoot, '.codex'), logicalRoot: `project:${id}:codex`, scope: { kind: 'project', repository: `repo:${id}`, worktree: `worktree:${id}` } }); }
  return adapter.discover(roots);
}
