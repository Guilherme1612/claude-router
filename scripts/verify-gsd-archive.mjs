#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function gsdTool(root) {
  const candidates = [
    process.env.GSD_TOOLS,
    join(root, 'gsd-core', 'bin', 'gsd-tools.cjs'),
    join(root, '.codex', 'gsd-core', 'bin', 'gsd-tools.cjs'),
    join(homedir(), '.codex', 'gsd-core', 'bin', 'gsd-tools.cjs'),
  ].filter(Boolean);
  return candidates.find(existsSync) || null;
}

function query(tool, root, projection) {
  const result = spawnSync(process.execPath, [tool, 'init', projection], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`init ${projection} failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

export function verifyArchiveInvariant({ root = process.cwd(), tool = gsdTool(root) } = {}) {
  if (!tool) throw new Error('gsd-tools.cjs not found');
  const manager = query(tool, root, 'manager');
  const milestone = query(tool, root, 'milestone-op');
  const state = readFileSync(join(root, '.planning', 'STATE.md'), 'utf8');
  const version = state.match(/^milestone:\s*(\S+)/m)?.[1];
  const activePhases = readdirSync(join(root, '.planning', 'phases'), { withFileTypes: true })
    .filter(entry => entry.isDirectory());
  const checks = {
    phase_count: manager.phase_count === milestone.phase_count,
    completed_count: manager.completed_count === milestone.completed_phases,
    completion_flag: manager.all_complete === milestone.all_phases_complete,
    archive_visible: milestone.archive_exists === true && milestone.archived_milestones.includes(version),
    active_phases_empty: activePhases.length === 0,
  };
  return { ok: Object.values(checks).every(Boolean), milestone: version, checks, manager, milestone_op: milestone };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const result = verifyArchiveInvariant({ root: resolve(dirname(fileURLToPath(import.meta.url)), '..') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
