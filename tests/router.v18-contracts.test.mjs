import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { discoverRoots as discoverClaude } from '../src/adapters/claude.mjs';
import { discoverRoots as discoverCodex } from '../src/adapters/codex.mjs';
import { materializeRuntimeInventoryScenario } from './helpers/inventory-fixture.mjs';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v1.8');
const scenarios = ['empty-claude', 'minimal-codex', 'asymmetric-runtimes', 'conflicting-invalid'];

async function discover(name) {
  const materialized = await materializeRuntimeInventoryScenario(join(fixtureDir, `${name}.json`));
  const options = materialized.projectRoot
    ? { projectRoot: materialized.projectRoot, scopeId: 'portable-fixture' }
    : {};
  return {
    materialized,
    claude: discoverClaude({ claudeRoot: materialized.claudeRoot, ...options }),
    codex: discoverCodex({ codexRoot: materialized.codexRoot, ...options }),
  };
}

test('v1.8 scenario materializer rejects escaping paths and cleans one temporary parent', async () => {
  for (const path of ['/outside.json', '../outside.json', 'nested/../../outside.json', 'C:\\outside.json']) {
    await assert.rejects(
      materializeRuntimeInventoryScenario({
        claude: { files: [{ path, content: '{}' }] },
        codex: { files: [] },
      }),
      /relative normalized path/,
    );
  }

  const materialized = await materializeRuntimeInventoryScenario({
    claude: { files: [{ path: 'skills/safe.json', content: '{"schema_version":1,"name":"safe"}' }] },
    codex: { files: [] },
  });
  const parent = dirname(materialized.claudeRoot);
  assert.equal(dirname(materialized.codexRoot), parent);
  assert.equal(existsSync(parent), true);
  await materialized.cleanup();
  await materialized.cleanup();
  assert.equal(existsSync(parent), false);
});

test('v1.8 scenarios discover runtime-local inventories without outside or live-home fallthrough', async (t) => {
  const outside = await mkdtemp(join(tmpdir(), 'router-v18-outside-'));
  await mkdir(join(outside, 'skills'), { recursive: true });
  await writeFile(join(outside, 'skills', 'outside-sentinel.json'), '{"schema_version":1,"name":"outside-sentinel"}');
  t.after(() => rm(outside, { recursive: true, force: true }));

  const found = new Map();
  for (const name of scenarios) {
    const result = await discover(name);
    t.after(result.materialized.cleanup);
    found.set(name, result);

    const serialized = JSON.stringify({ claude: result.claude, codex: result.codex });
    assert.doesNotMatch(serialized, /outside-sentinel/);
    assert.equal(serialized.includes(homedir()), false);
    assert.equal(serialized.includes(process.cwd()), false);
    assert.equal(serialized.includes(dirname(result.materialized.claudeRoot)), false);

    for (const record of [...result.claude.observations, ...result.codex.observations]) {
      for (const source of record.provenance) {
        assert.equal(isAbsolute(source.logical_root), false);
        assert.equal(isAbsolute(source.relative_path), false);
        assert.equal(source.relative_path.split('/').includes('..'), false);
      }
    }
  }

  assert.equal(found.get('empty-claude').claude.observations.length, 0);
  assert.deepEqual(found.get('minimal-codex').codex.observations.map(record => record.name), ['quiet-lantern']);

  const asymmetric = found.get('asymmetric-runtimes');
  assert.deepEqual(asymmetric.claude.observations.map(record => record.name), [
    'amber-orbit', 'paper-kite', 'soft-bell', 'blue-ruler', 'copper-loop',
  ]);
  assert.deepEqual(asymmetric.codex.observations.map(record => record.name), [
    'silver-leaf', 'river-stone-renamed',
  ]);
  assert.notEqual(asymmetric.claude.observations.length, asymmetric.codex.observations.length);

  const all = [...found.values()].flatMap(result => [
    ...result.claude.observations,
    ...result.codex.observations,
  ]);
  const kinds = new Set(all.map(record => record.mapping?.fixture_kind || record.semantic_type));
  for (const kind of ['skill', 'agent', 'command', 'tool', 'hook', 'workflow']) {
    assert.equal(kinds.has(kind), true, `missing ${kind}`);
  }
  assert.ok(all.some(record => record.mapping?.fixture_cases?.includes('stale')));
  assert.ok(all.some(record => record.semantic_type === 'unknown' && record.name === 'future-surface'));
  assert.ok(all.some(record => record.scope.kind === 'project' && record.name === 'local-cloud'));
  assert.ok(all.some(record => record.lifecycle === 'invalid' && record.name === 'broken-shape'));
});
