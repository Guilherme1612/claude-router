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
  const planningRoot = join(root, '.planning');
  const state = readFileSync(join(planningRoot, 'STATE.md'), 'utf8');
  const version = state.match(/^milestone:\s*(\S+)/m)?.[1];
  const activePhases = readdirSync(join(planningRoot, 'phases'), { withFileTypes: true })
    .filter(entry => entry.isDirectory());
  const milestonesRoot = join(planningRoot, 'milestones');
  const milestoneArchive = version ? `${version}-` : null;
  const archivedFiles = readdirSync(milestonesRoot, { withFileTypes: true });
  const archivedPhaseRoot = join(milestonesRoot, `${version}-phases`);
  const archivedPhaseDirs = existsSync(archivedPhaseRoot)
    ? readdirSync(archivedPhaseRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())
    : [];
  const archivedMilestones = archivedFiles
    .filter(entry => entry.isFile() && /^v\d+\.\d+-ROADMAP\.md$/.test(entry.name))
    .map(entry => entry.name.replace(/-ROADMAP\.md$/, ''));
  const archiveVisible = Boolean(
    milestoneArchive &&
    existsSync(join(milestonesRoot, `${version}-ROADMAP.md`)) &&
    existsSync(join(milestonesRoot, `${version}-REQUIREMENTS.md`)) &&
    existsSync(join(milestonesRoot, `${version}-MILESTONE-AUDIT.md`))
  );
  const checks = {
    phase_count: archivedPhaseDirs.length > 0,
    completed_count: archivedPhaseDirs.length > 0,
    completion_flag: archiveVisible,
    archive_visible: archiveVisible && archivedMilestones.includes(version),
    active_phases_empty: activePhases.length === 0,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    milestone: version,
    checks,
    archive: {
      root: milestonesRoot,
      phase_count: archivedPhaseDirs.length,
      archived_milestones: archivedMilestones,
    },
    manager,
    milestone_op: milestone,
  };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const result = verifyArchiveInvariant({ root: resolve(dirname(fileURLToPath(import.meta.url)), '..') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
