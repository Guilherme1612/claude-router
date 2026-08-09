import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { discoverRoots as discoverClaude } from '../src/adapters/claude.mjs';
import { discoverRoots as discoverCodex } from '../src/adapters/codex.mjs';
import { auditCoverage } from '../src/coverage/audit.mjs';
import { assembleRegistry } from '../src/registry/build.mjs';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { evaluateEligibility } from '../src/registry/eligibility.mjs';
import { canonicalizeCapability, stableStringify } from '../src/registry/schema.mjs';
import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildUnknownFutureProfile,
  contractEvidence,
  materializeRuntimeInventoryScenario,
} from './helpers/inventory-fixture.mjs';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v1.8');
const scenarios = ['empty-claude', 'minimal-codex', 'asymmetric-runtimes', 'conflicting-invalid'];
const COVERAGE_CLASSES = new Set([
  'routable', 'composable', 'direct-only', 'hook-owned', 'project-scoped',
  'unavailable', 'invalid', 'excluded',
]);

function declaredRecord(source, overrides = {}) {
  return {
    ...source,
    dependencies: { state: 'declared', items: [] },
    semantic: {
      intents: ['inspect'], subjects: ['fixture'], operations: ['read'], outputs: ['report'],
      evidence: ['adapter'], aliases: ['portable-fixture'],
    },
    inputs: [{ name: 'target', type: 'text', required: false }],
    effects: ['none'],
    risk: { level: 'low', source: 'declared' },
    authority: { ceiling: 'one-turn', source: 'declared' },
    composition: { roles: ['inspect'], requires: [], conflicts: [], exclusive: false },
    cost: { latency: 'low', context_bytes: 128, tool_calls: 1 },
    ...overrides,
  };
}

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
  await assert.rejects(
    materializeRuntimeInventoryScenario({ claude: { files: {} }, codex: { files: [] } }),
    /files must be an array/,
  );
  await assert.rejects(
    materializeRuntimeInventoryScenario({
      claude: { files: [{ path: 'skills/not-text.json', content: {} }] },
      codex: { files: [] },
    }),
    /content must be a string/,
  );

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
  assert.deepEqual(asymmetric.claude.observations.map(record => record.name).sort(), [
    'amber-orbit', 'blue-ruler', 'copper-loop', 'paper-kite', 'soft-bell',
  ]);
  assert.deepEqual(asymmetric.codex.observations.map(record => record.name).sort(), [
    'river-stone-renamed', 'silver-leaf',
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

test('CVRG-02/CVRG-03: every assembled record has portable bounded typed capability truth', () => {
  const claude = declaredRecord(buildClaudeHeavyProfile()[0]);
  const codex = declaredRecord(buildCodexHeavyProfile()[0], {
    semantic: {
      intents: ['inspect', 'inspect'], subjects: ['fixture'], operations: ['read'], outputs: ['report'],
      evidence: ['manifest'], aliases: ['portable-fixture', 'portable-fixture'],
    },
  });
  const built = assembleRegistry({
    claude: { observations: [claude], diagnostics: [] },
    codex: { observations: [codex], diagnostics: [] },
  });

  for (const record of built.registry.records) {
    assert.deepEqual(Object.keys(record.semantic), ['aliases', 'evidence', 'intents', 'operations', 'outputs', 'subjects']);
    for (const field of Object.values(record.semantic)) assert.deepEqual(field, [...new Set(field)].sort());
    assert.ok(record.inputs.every(input => (
      typeof input.name === 'string' && typeof input.type === 'string' && typeof input.required === 'boolean'
    )));
    assert.deepEqual(record.effects, ['none']);
    assert.deepEqual(record.risk, { level: 'low', source: 'declared' });
    assert.deepEqual(record.authority, { ceiling: 'one-turn', source: 'declared' });
    assert.deepEqual(record.composition, { conflicts: [], exclusive: false, requires: [], roles: ['inspect'] });
    assert.deepEqual(record.cost, { context_bytes: 128, latency: 'low', tool_calls: 1 });
    assert.match(record.source_freshness.fingerprint, /\S/);
    assert.equal(typeof record.source_freshness.observed_at, 'string');
    assert.equal(COVERAGE_CLASSES.has(record.coverage.classification), true);
    assert.ok(Array.isArray(record.coverage.reasons));
  }
  assert.equal(stableStringify(built), stableStringify(assembleRegistry({
    claude: { observations: [claude], diagnostics: [] },
    codex: { observations: [codex], diagnostics: [] },
  })));
  assert.doesNotMatch(stableStringify(built), /\/Users\/|\\\\Users\\\\|Router-build/);
});

test('CVRG-04: unknown execution-critical fields fail closed independently and remain visible', () => {
  const variants = [
    ['effects', 'unknown-effects', 'side_effects_unknown'],
    ['authority', 'unknown-authority', 'authority_unknown'],
    ['dependencies', 'unknown-dependencies', 'dependency_closure_unknown'],
    ['risk', 'unknown-risk', 'risk_unknown'],
  ];
  for (const [field, variant, reason] of variants) {
    const record = declaredRecord(buildClaudeHeavyProfile()[0]);
    const contract = buildCapabilityContract(record, contractEvidence(record, variant));
    const candidate = { ...canonicalizeCapability(record), contract };
    const eligibility = evaluateEligibility({ record: candidate, records: [candidate] });
    assert.equal(eligibility.eligible, false, field);
    assert.equal(eligibility.recommendation_only, true, field);
    assert.ok(eligibility.reason_codes.includes(reason), `${field}: ${reason}`);
  }
});

test('CVRG-03/CVRG-04: declared metadata wins and adversarial names cannot infer execution truth', () => {
  const declared = canonicalizeCapability(declaredRecord(buildClaudeHeavyProfile()[0], {
    name: 'dangerous-admin-delete',
    semantic: {
      intents: ['review'], subjects: ['record'], operations: ['inspect'], outputs: ['report'],
      evidence: ['manifest'], aliases: ['safe-review'],
    },
  }));
  assert.deepEqual(declared.effects, ['none']);
  assert.deepEqual(declared.authority, { ceiling: 'one-turn', source: 'declared' });
  assert.deepEqual(declared.semantic.operations, ['inspect']);

  const inferred = canonicalizeCapability({ ...buildClaudeHeavyProfile()[0], name: 'dangerous-admin-delete' });
  assert.deepEqual(inferred.effects, []);
  assert.deepEqual(inferred.risk, { level: 'unknown', source: 'inferred' });
  assert.deepEqual(inferred.authority, { ceiling: 'advice', source: 'inferred' });
  assert.deepEqual(inferred.composition.requires, []);
});

test('CVRG-02/CVRG-05: retained records are classified exactly once with independent runtime completeness', () => {
  const claude = [declaredRecord(buildClaudeHeavyProfile()[0]), ...buildUnknownFutureProfile()];
  const codex = [declaredRecord(buildCodexHeavyProfile()[0])];
  const built = assembleRegistry({
    claude: { observations: claude, diagnostics: [] },
    codex: { observations: codex, diagnostics: [] },
  });
  const report = auditCoverage({ registry: built.registry });
  assert.equal(report.records.length, built.registry.records.length);
  assert.equal(new Set(report.records.map(record => record.id)).size, built.registry.records.length);
  assert.deepEqual(report.unclassified, []);
  assert.ok(report.records.every(record => COVERAGE_CLASSES.has(record.classification)));
  assert.deepEqual(report.counts.by_runtime, {
    claude: { classified: 2, discovered: 2 },
    codex: { classified: 1, discovered: 1 },
  });
  const future = report.records.find(record => record.kind === 'unknown');
  assert.equal(future.classification, 'invalid');
  assert.ok(built.registry.records.find(record => record.id === future.id).eligibility.recommendation_only);
});
