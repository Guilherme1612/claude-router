import { basename, join, resolve } from 'node:path';
import { createAdapter } from './claude.mjs';

const CODEX_TYPES = new Map([
  ['skills', 'skill'], ['plugins', 'plugin'], ['agents', 'agent'], ['hooks', 'hook'],
  ['config', 'config'], ['mcp', 'mcp'], ['tools', 'tool'], ['models', 'model'],
  ['permissions', 'permission'], ['dependencies', 'dependency'],
]);

const adapter = createAdapter({ runtime: 'codex', adapterVersion: 'codex-adapter/1', types: CODEX_TYPES });

export const parseArtifact = adapter.parseArtifact;
export const normalizeArtifact = adapter.normalizeArtifact;
export const compileInvocation = adapter.compileInvocation;

export function discoverRoots(options = {}) {
  if (!options.codexRoot) throw new TypeError('codexRoot is required');
  const roots = [{ root: options.codexRoot, logicalRoot: 'codex_home', scope: { kind: 'global' } }];
  if (options.projectRoot) {
    const scopeId = String(options.scopeId || basename(resolve(options.projectRoot)));
    roots.push({ root: join(options.projectRoot, '.codex'), logicalRoot: `project:${scopeId}:codex`,
      scope: { kind: 'project', repository: `repo:${scopeId}`, worktree: `worktree:${scopeId}` } });
  }
  return adapter.discover(roots);
}
