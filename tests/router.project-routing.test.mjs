import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { buildCorpus } = await import(HOOK);

const manifest = {
  project_scoped_skills: [{ name: 'local-debug', project: '/workspace/app', description: 'local project debugging skill' }],
  skills: [], plugin_skills: [], agents_store_skills: [], agents: [], commands: [],
};

test('project-scoped skills are included only for the owning cwd prefix', () => {
  assert.ok(buildCorpus(manifest, null, '/workspace/app').some((entry) => entry.name === 'local-debug'));
  assert.ok(buildCorpus(manifest, null, '/workspace/app/packages/tool').some((entry) => entry.name === 'local-debug'));
  assert.ok(!buildCorpus(manifest, null, '/workspace/application').some((entry) => entry.name === 'local-debug'));
  assert.ok(!buildCorpus(manifest, null, '/workspace/other').some((entry) => entry.name === 'local-debug'));
});
