import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const NODE = process.execPath;
const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));
const HOOK = join(process.env.HOME, '.claude', 'hooks', 'router.mjs');
const { buildCorpus } = await import(HOOK);

test('temporary install discovers and routes project skills by cwd and fingerprint', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-project-e2e-'));
  const claude = join(root, '.claude');
  const project = join(root, 'workspace');
  const out = join(claude, 'router', 'claude-inventory-manifest.json');
  mkdirSync(join(claude, 'skills'), { recursive: true });
  mkdirSync(join(project, '.claude', 'skills', 'local-debug'), { recursive: true });
  writeFileSync(join(project, '.claude', 'skills', 'local-debug', 'SKILL.md'), '---\nname: local-debug\ndescription: local project debugging\n---\nhelp debug locally');
  writeFileSync(join(root, '.claude.json'), JSON.stringify({ projects: { [project]: {} } }));
  const env = {
    ...process.env,
    ROUTER_CLAUDE_HOME: claude,
    ROUTER_AGENTS_SKILLS_DIR: join(root, '.agents', 'skills'),
    ROUTER_SKILL_LOCK_PATH: join(root, '.agents', '.skill-lock.json'),
    ROUTER_CLAUDE_JSON: join(root, '.claude.json'),
    ROUTER_MANIFEST_OUT: out,
    ROUTER_COVERAGE_REPORT_PATH: join(root, 'coverage-report.json'),
  };
  const run = () => spawnSync(NODE, [BUILDER], { env, encoding: 'utf8', timeout: 30_000 });
  try {
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.ok(existsSync(out));
    const manifest = JSON.parse(readFileSync(out, 'utf8'));
    const firstFingerprint = manifest.manifest_fingerprint;
    assert.ok(manifest.project_scoped_skills.some((entry) => entry.name === 'local-debug' && entry.project === project));
    assert.ok(buildCorpus(manifest, null, project).some((entry) => entry.name === 'local-debug'));
    assert.ok(!buildCorpus(manifest, null, join(root, 'workspace-sibling')).some((entry) => entry.name === 'local-debug'));

    writeFileSync(join(root, '.claude.json'), JSON.stringify({ projects: {} }));
    const second = run();
    assert.equal(second.status, 0, second.stderr);
    const afterRemoval = JSON.parse(readFileSync(out, 'utf8'));
    assert.notEqual(afterRemoval.manifest_fingerprint, firstFingerprint);
    assert.deepEqual(afterRemoval.project_scoped_skills, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
