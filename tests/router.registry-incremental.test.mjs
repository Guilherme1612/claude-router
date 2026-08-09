import assert from 'node:assert/strict';
import { renameSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  acquireRegistry,
  buildFullRegistry,
  buildIncrementalRegistry,
} from '../src/registry/build.mjs';
import { diffFingerprintTrees } from '../src/registry/diff.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { materializeRuntimeInventoryScenario } from './helpers/inventory-fixture.mjs';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v1.8');

function snapshot(acquisition) {
  return {
    schema_version: 1,
    roots: ['claude_global', 'codex_global'],
    entries: [...acquisition.claude.observations, ...acquisition.codex.observations],
    diagnostics: [...acquisition.claude.diagnostics, ...acquisition.codex.diagnostics],
  };
}

test('anonymous dual-runtime mutations converge exactly between full and incremental builds', async (t) => {
  const inventory = await materializeRuntimeInventoryScenario(join(fixtureDir, 'asymmetric-runtimes.json'));
  t.after(() => inventory.cleanup());
  const options = {
    claudeRoot: inventory.claudeRoot,
    codexRoot: inventory.codexRoot,
    scopeId: 'phase-60-fixture',
  };
  let previous = acquireRegistry(options);

  const assertConverged = (label) => {
    const current = acquireRegistry(options);
    const diff = diffFingerprintTrees(snapshot(previous), snapshot(current));
    const incremental = buildIncrementalRegistry(previous, diff, options);
    const full = buildFullRegistry(options);
    assert.equal(stableStringify(incremental), stableStringify(full), label);
    assert.deepEqual(
      incremental.registry.records.map(record => record.id),
      full.registry.records.map(record => record.id),
      `${label}: canonical record ids`,
    );
    previous = current;
  };

  assertConverged('baseline');
  writeFileSync(join(inventory.claudeRoot, 'commands', 'paper-kite.md'),
    '---\nschema_version: 1\nname: paper-kite\ndescription: edited fixture\ncommand: paper-kite\n---\n');
  assertConverged('edit');
  renameSync(
    join(inventory.codexRoot, 'skills', 'river-stone', 'SKILL.md'),
    join(inventory.codexRoot, 'skills', 'river-stone-moved.md'),
  );
  assertConverged('move');
  writeFileSync(join(inventory.claudeRoot, 'agents', 'amber-orbit.md'),
    '---\nschema_version: 1\nname: amber-orbit\ndescription: unavailable fixture\ncommand: amber-orbit\navailability: unavailable\n---\n');
  assertConverged('disable');
});
