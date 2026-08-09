#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installRouter, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { verifyArchiveInvariant } from './verify-gsd-archive.mjs';

export const FOCUSED_TESTS = Object.freeze([
  'tests/router.production-integration.test.mjs',
  'tests/router.dispatch-safety.test.mjs',
  'tests/router.storage-safety.test.mjs',
  'tests/router.installer-coexistence.test.mjs',
  'tests/router.safety-release.test.mjs',
  'tests/router.semantic-substitution.test.mjs',
]);

function allTestFiles(root) {
  const result = [];
  const walk = directory => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (entry === 'node_modules' || entry === '.git' || entry === '.planning' || entry === 'coverage') continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.test.mjs')) result.push(path.slice(root.length + 1));
    }
  };
  walk(join(root, 'tests'));
  return result.sort();
}

function runTests(root, files) {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, encoding: 'utf8', timeout: 12 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const tests = Number(output.match(/# tests (\d+)/)?.[1] || 0);
  const passed = Number(output.match(/# pass (\d+)/)?.[1] || 0);
  const failed = Number(output.match(/# fail (\d+)/)?.[1] || 0);
  return { ok: result.status === 0 && failed === 0, exit: result.status, tests, passed, failed };
}

export async function verifyInstalledParity(root) {
  const temp = mkdtempSync(join(root, '.tmp-v17-gate-'));
  const claudeRoot = join(temp, '.claude');
  const codexRoot = join(temp, '.codex');
  const sourceRouter = join(temp, 'router.mjs');
  const previousHome = process.env.HOME;
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  writeFileSync(join(claudeRoot, 'settings.json'), '{"hooks":{}}\n');
  writeFileSync(join(codexRoot, 'hooks.json'), '{"hooks":{}}\n');
  writeFileSync(sourceRouter, 'export const installed = true;\n');
  try {
    process.env.HOME = temp;
    await installRouter({ claudeRoot, codexRoot, sourceRouter, testMode: true, skipController: true });
    const names = ['orchestrator/strategy.mjs', 'evolution/local-learning.mjs', 'lifecycle/migration.mjs', 'adapters/dispatch/claude.mjs', 'adapters/dispatch/codex.mjs'];
    const roots = [join(claudeRoot, 'router'), join(codexRoot, 'router')];
    for (const runtimeRoot of roots) for (const name of names) {
      const file = join(runtimeRoot, 'modules', name);
      if (!existsSync(file)) throw new Error(`installed module missing: ${name}`);
      await import(`${pathToFileURL(file).href}?v17-gate`);
    }
    return { ok: true, runtimes: ['claude', 'codex'], modules: names };
  } catch (error) {
    return { ok: false, reason: error.message };
  } finally {
    try { await uninstallRouter({ claudeRoot, codexRoot, sourceRouter, testMode: true, skipController: true }); } catch {}
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(temp, { recursive: true, force: true });
  }
}

function planningProjection(root, final) {
  const tool = [process.env.GSD_TOOLS, join(homedir(), '.codex', 'gsd-core', 'bin', 'gsd-tools.cjs')].filter(Boolean).find(existsSync);
  if (!tool) return { ok: false, reason: 'gsd-tools-missing' };
  const result = spawnSync(process.execPath, [tool, 'query', 'init.manager'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return { ok: false, reason: 'manager-query-failed' };
  const manager = JSON.parse(result.stdout);
  const phases = manager.phases || [];
  const ok = phases.filter(phase => ['47', '48', '49'].includes(String(phase.number))).every(phase => final ? phase.phase_complete === true : phase.number !== '49' || phase.plan_count > 0);
  return { ok, milestone: manager.milestone_version, completed_count: manager.completed_count, phases: phases.map(phase => ({ number: phase.number, complete: phase.phase_complete })) };
}

export async function verifyReleaseGate({ root = resolve(dirname(new URL(import.meta.url).pathname), '..'), final = false, run_tests = true } = {}) {
  const focused = run_tests ? runTests(root, FOCUSED_TESTS) : { ok: true, skipped: true };
  const full = run_tests ? runTests(root, allTestFiles(root)) : { ok: true, skipped: true };
  const installed = await verifyInstalledParity(root);
  const planning = planningProjection(root, final);
  const archive = final ? verifyArchiveInvariant({ root }) : { ok: true, skipped: true };
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const tag = spawnSync('git', ['rev-parse', 'v1.7'], { cwd: root, encoding: 'utf8' });
  const tagCommit = tag.status === 0 ? tag.stdout.trim() : null;
  const tagCheck = { ok: !final || tagCommit === head, head, tag: tagCommit };
  const result = { status: [focused, full, installed, planning, archive, tagCheck].every(item => item.ok) ? 'passed' : 'blocked', focused, full, installed, planning, archive, tag: tagCheck };
  mkdirSync(join(root, '.planning', 'evidence', 'v1.7'), { recursive: true });
  writeFileSync(join(root, '.planning', 'evidence', 'v1.7', 'RELEASE-GATE.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const final = process.argv.includes('--final');
  const run_tests = !process.argv.includes('--no-tests');
  const result = await verifyReleaseGate({ root: resolve(dirname(new URL(import.meta.url).pathname), '..'), final, run_tests });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'passed') process.exitCode = 1;
}
