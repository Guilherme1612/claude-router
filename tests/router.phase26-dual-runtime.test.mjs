import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { inProcessControllerLauncher, stubVerificationRunners } from './helpers/test-mode-seam.mjs';

const PROFILES = ['claude', 'codex', 'combined'];
const KINDS = ['command', 'skill', 'agent', 'workflow', 'mcp', 'tool'];
const CAPABILITY_KINDS = KINDS.filter(kind => kind !== 'workflow');

function fixture(profile) {
  const root = mkdtempSync(join(tmpdir(), `router-phase26-${profile}-`));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'router.mjs');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  writeFileSync(join(claudeRoot, 'settings.json'), '{"hooks":{},"user":"claude"}\n');
  writeFileSync(join(codexRoot, 'hooks.json'), '{"hooks":{},"user":"codex"}\n');
  writeFileSync(sourceRouter, 'export const installed = true;\n');
  return { root, claudeRoot, codexRoot, sourceRouter };
}

async function stop(f, holder) {
  await holder.child?.kill?.();
  rmSync(join(f.claudeRoot, 'router', 'controller', 'status.json'), { force: true });
}

test('fresh installs declare and deploy the complete dual-runtime recommendation closure', async () => {
  for (const profile of PROFILES) {
    const f = fixture(profile);
    const holder = {};
    try {
      const result = await installRouter({
        ...f,
        testMode: true,
        verificationRunners: stubVerificationRunners,
        launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
        debounceMs: 10,
        repairMs: 60_000,
      });
      const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
      assert.deepEqual(manifest.runtime_profiles, PROFILES);
      assert.deepEqual(manifest.recommendation_kinds, KINDS);
      for (const runtimeRoot of [join(f.claudeRoot, 'router'), join(f.codexRoot, 'router')]) {
        for (const dependency of [
          'modules/context/prompt-route.mjs',
          'modules/orchestrator/select.mjs',
          'modules/prompt/compile-index.mjs',
          'modules/registry/contract.mjs',
          'modules/registry/relationships.mjs',
        ]) assert.equal(existsSync(join(runtimeRoot, dependency)), true, `${profile}: ${dependency}`);
      }
    } finally {
      await stop(f, holder);
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test('six recommendation kinds route through every installed runtime profile', async () => {
  for (const profile of PROFILES) {
    const f = fixture(profile);
    const holder = {};
    try {
      const result = await installRouter({
        ...f,
        testMode: true,
        verificationRunners: stubVerificationRunners,
        launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
        debounceMs: 10,
        repairMs: 60_000,
      });
      const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
      assert.deepEqual(manifest.route_matrix, PROFILES.flatMap(runtimeProfile => (
        KINDS.map(kind => `${runtimeProfile}:${kind}`)
      )));
      const roots = profile === 'claude'
        ? [join(f.claudeRoot, 'router')]
        : profile === 'codex'
          ? [join(f.codexRoot, 'router')]
          : [join(f.claudeRoot, 'router'), join(f.codexRoot, 'router')];
      for (const runtimeRoot of roots) {
        const { selectCapabilities } = await import(`${pathToFileURL(join(runtimeRoot, 'modules/orchestrator/select.mjs')).href}?${profile}`);
        for (const kind of CAPABILITY_KINDS) {
          const id = `router/${kind}`;
          const selected = selectCapabilities({
            workflow: {
              status: 'selected',
              dispatch_eligible: true,
              selection: {
                transition_id: 'continue',
                workflow_id: 'phase26',
                family: 'release',
                from: 'published',
                to: 'active',
              },
            },
            workflowDeclarations: [{
              workflow_id: 'phase26',
              owners: [],
              requirements: [],
              compatible: [id],
            }],
            explicitCapability: id,
            registry: {
              records: [{
                id,
                type: kind,
                available: true,
                safe: true,
                lifecycle: 'ready',
                dispatchable: true,
                scope: { kind: 'global' },
                permissions: { required: [], grants: [], denied: [] },
                conflicts: [],
                provenance: [{ runtime: profile }],
              }],
            },
          });
          assert.equal(selected.dispatch_eligible, true, `${profile}:${kind}`);
          assert.equal(selected.workflow_id, 'phase26', `${profile}:workflow`);
          assert.deepEqual(selected.invokable_capabilities.map(value => value.kind), [kind]);
        }
      }
    } finally {
      await stop(f, holder);
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
