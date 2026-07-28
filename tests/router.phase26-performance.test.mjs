import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { buildFullRegistry } from '../src/registry/build.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { canonicalizeCapability } from '../src/registry/schema.mjs';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { buildLargeMixedProfile } from './helpers/inventory-fixture.mjs';
import { inProcessControllerLauncher, stubVerificationRunners } from './helpers/test-mode-seam.mjs';

const KINDS = ['command', 'skill', 'agent', 'workflow', 'mcp', 'tool'];
const NOW = 1_800_000_000_000;
let shared;

function relationshipCandidates(records) {
  return KINDS.map((kind, index) => ({
    id: `relationship:composition:${kind}`,
    type: 'composition',
    source_id: stableCapabilityId(records[index]),
    target_id: stableCapabilityId(records[index + KINDS.length]),
    confidence_basis_points: 10000,
    freshness: 'fresh',
    evidence: [{
      kind: 'composition-declaration',
      provenance: 'fixture',
      confidence_basis_points: 10000,
      freshness: 'fresh',
      rule_version: 'phase26-performance-v1',
    }],
  }));
}

function capsule() {
  return {
    schema_version: 1,
    scope: { workspace_id: 'router-build', project_id: 'phase26-performance' },
    goal: { id: 'phase-26', summary: 'Release performance evidence' },
    position: { workflow: 'gsd-execute-phase', phase: '26', plan: '07', task: '2' },
    status: 'active',
    artifacts: [],
    blockers: [],
    freshness: { captured_at: NOW, generation: 'phase-26-performance' },
    provenance: { source: 'phase26-performance', version: '1' },
  };
}

async function buildInstalledEnvironment() {
  const root = mkdtempSync(join(tmpdir(), 'router-phase26-performance-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'router.mjs');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  writeFileSync(join(claudeRoot, 'settings.json'), '{"hooks":{}}\n');
  writeFileSync(join(codexRoot, 'hooks.json'), '{"hooks":{}}\n');
  writeFileSync(sourceRouter, 'export const installed = true;\n');

  const records = buildLargeMixedProfile();
  const built = buildFullRegistry({
    discoverClaude: () => ({
      observations: records.filter(record => record.invocation.runtime === 'claude'),
      diagnostics: [],
    }),
    discoverCodex: () => ({
      observations: records.filter(record => record.invocation.runtime === 'codex'),
      diagnostics: [],
    }),
    relationshipCandidates: relationshipCandidates(records),
  });
  const stableToPublished = new Map();
  const publishedRecords = records.map((record, index) => {
    const id = `phase26-${record.native_type.split(':').at(-1)}-${index.toString(36)}`;
    stableToPublished.set(stableCapabilityId(record), id);
    return {
      id,
      ...canonicalizeCapability(record),
      available: true,
      safe: true,
      permissions: { required: [], grants: [], denied: [] },
    };
  });
  const publishedRelationships = {
    ...built.relationships,
    edges: built.relationships.edges.map(edge => ({
      ...edge,
      source_id: stableToPublished.get(edge.source_id),
      target_id: stableToPublished.get(edge.target_id),
    })),
  };
  const publishedRegistry = {
    schema_version: 1,
    records: publishedRecords,
    relationships: publishedRelationships,
  };
  const publishedContracts = {
    schema_version: 1,
    by_capability: Object.fromEntries(publishedRegistry.records.map(record => [
      record.id,
      { schema_version: 1, disposition: 'dispatch-candidate' },
    ])),
  };
  const holder = {};
  await installRouter({
    root,
    claudeRoot,
    codexRoot,
    sourceRouter,
    buildRegistry: () => built,
    testMode: true,
    verificationRunners: stubVerificationRunners,
    launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
    debounceMs: 10,
    repairMs: 60_000,
  });
  await holder.child?.kill?.();
  rmSync(join(claudeRoot, 'router', 'controller', 'status.json'), { force: true });

  const runtimes = [];
  for (const [runtime, ownedRoot] of [
    ['claude', join(claudeRoot, 'router')],
    ['codex', join(codexRoot, 'router')],
  ]) {
    const imported = async path => import(`${pathToFileURL(join(ownedRoot, 'modules', path)).href}?phase26-${runtime}`);
    const { publishCompiledIndex } = await imported('prompt/publish-index.mjs');
    const { loadCompiledIndex } = await imported('prompt/compile-index.mjs');
    const { routeContextPrompt } = await imported('context/prompt-route.mjs');
    const { saveCapsule } = await imported('context/capsule.mjs');
    const { selectCapabilities } = await imported('orchestrator/select.mjs');
    const command = publishedRegistry.records.find(record => record.native_type.endsWith(':command'));
    const publication = publishCompiledIndex({
      ownedRoot,
      registry: publishedRegistry,
      registryVersionId: `v1-${createHash('sha256').update(runtime).digest('hex').slice(0, 16)}`,
      mapping: {
        schema_version: 1,
        subjects: [{
          subject_id: 'gsd-execute-phase',
          disposition: 'mapped',
          target_id: command.id,
          reason_code: 'explicit_subject',
        }],
      },
      policyFingerprint: createHash('sha256').update(`policy:${runtime}`).digest('hex'),
      now: NOW,
      contracts: publishedContracts,
      relationships: publishedRelationships,
      intentPolicy: built.intent_policy,
      workflows: {
        ...built.workflows,
        routes: built.workflows.routes.map(route => ({
          ...route,
          capability_id: stableToPublished.get(route.capability_id),
        })),
      },
      healthPolicy: built.health_policy,
      suggestionReference: built.suggestion_reference,
    });
    saveCapsule({ ownedRoot, capsule: capsule() });
    runtimes.push({
      runtime,
      ownedRoot,
      publication,
      loaded: loadCompiledIndex({ ownedRoot, now: NOW + 1 }),
      routeContextPrompt,
      selectCapabilities,
    });
  }
  return { root, records, built, publishedRegistry, runtimes };
}

async function environment() {
  shared ||= buildInstalledEnvironment();
  return shared;
}

after(async () => {
  if (!shared) return;
  const value = await shared;
  rmSync(value.root, { recursive: true, force: true });
});

test('registry fixture is deterministic, normalized, and covers every installed kind', () => {
  const left = buildLargeMixedProfile();
  const right = buildLargeMixedProfile();
  assert.deepEqual(left, right);
  assert.ok(left.length >= 300);
  assert.equal(new Set(left.map(record => record.name)).size, left.length);
  assert.deepEqual(
    [...new Set(left.map(record => record.native_type.split(':').at(-1)))].sort(),
    [...KINDS].sort(),
  );
});

test('installed Claude and Codex modules publish, load, and route every recommendation kind', async () => {
  const { built, publishedRegistry, runtimes } = await environment();
  assert.equal(built.registry.records.length, 312);
  assert.equal(Object.keys(built.contracts.by_capability).length, 312);
  assert.equal(built.relationships.edges.length, KINDS.length);
  assert.deepEqual(
    built.workflows.routes.map(route => route.workflow_id).sort(),
    KINDS.map(kind => `phase26-${kind}`).sort(),
  );
  assert.deepEqual(Object.keys(built.complete_tuple.members), [
    'contracts', 'health_policy', 'intent_policy', 'registry',
    'relationships', 'suggestion_reference', 'workflows',
  ]);

  for (const installed of runtimes) {
    assert.equal(installed.loaded.status, 'ready', installed.runtime);
    assert.equal(installed.loaded.tuple_version_id, installed.publication.tuple_version_id);
    const workflow = {
      status: 'selected',
      dispatch_eligible: true,
      selection: {
        transition_id: 'continue',
        workflow_id: 'phase26',
        family: 'release',
        from: 'published',
        to: 'active',
      },
    };
    for (const kind of KINDS.filter(value => value !== 'workflow')) {
      const source = publishedRegistry.records.find(record => record.native_type.endsWith(`:${kind}`));
      const record = {
        ...source,
        type: kind,
        available: true,
        safe: true,
        dispatchable: true,
        permissions: { required: [], grants: [], denied: [] },
      };
      const selected = installed.selectCapabilities({
        workflow,
        workflowDeclarations: [{
          workflow_id: 'phase26',
          owners: [],
          requirements: [],
          compatible: [record.id],
        }],
        explicitCapability: record.id,
        registry: { schema_version: 1, records: [record] },
      });
      assert.equal(selected.dispatch_eligible, true, `${installed.runtime}:${kind}`);
      assert.deepEqual(selected.invokable_capabilities.map(value => value.kind), [kind]);
    }
    assert.equal(workflow.selection.workflow_id, 'phase26', `${installed.runtime}:workflow`);
    const routed = installed.routeContextPrompt({
      prompt: 'continue',
      ownedRoot: installed.ownedRoot,
      projectRoot: installed.ownedRoot,
      now: NOW + 1,
    });
    assert.equal(routed.handled, true, installed.runtime);
    assert.equal(routed.resolution.reason_code, 'dependency_missing', installed.runtime);
    assert.equal(typeof routed.additional_context, 'string');
  }
});
