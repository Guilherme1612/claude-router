import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { buildFullRegistry } from '../../src/registry/build.mjs';
import { contentFingerprint, stableCapabilityId } from '../../src/registry/identity.mjs';
import { createTestActivationVerifier, REQUIRED_ACTIVATION_GATES } from '../../src/registry/validate.mjs';
import { runRegistryWatcher } from '../../src/registry/watcher.mjs';

// Lightweight passing runner map: each of the 8 REQUIRED_ACTIVATION_GATES resolves to
// a stub runner that always passes. Used when test_mode opts in to the seam.
export const stubVerificationRunners = Object.fromEntries(
  REQUIRED_ACTIVATION_GATES.map(id => [id, Object.freeze({
    id, version: 'test', threshold: {},
    async run() { return { passed: true, reason_code: 'passed', measured: {}, threshold: {} }; },
  })]),
);

export function safeFixtureContractOverlays({
  claudeRoot, codexRoot, projectRoot, scopeId, artifacts,
}) {
  const buildOptions = {
    claudeRoot, codexRoot, ...(projectRoot ? { projectRoot, scopeId } : {}),
  };
  return artifacts.map(({ runtime, relativePath, bytes, rootPath }, index) => {
    const root = rootPath || (runtime === 'claude' ? claudeRoot : codexRoot);
    const rootExisted = existsSync(root);
    const path = join(root, relativePath);
    const previous = existsSync(path) ? readFileSync(path) : null;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    const record = buildFullRegistry(buildOptions).registry.records.find(candidate => (
      candidate.provenance.some(source => source.runtime === runtime && source.relative_path === relativePath)
    ));
    if (previous) writeFileSync(path, previous);
    else rmSync(path);
    if (!rootExisted) rmSync(root, { recursive: true, force: true });
    if (!record) throw new Error(`fixture overlay target not discovered: ${runtime}:${relativePath}`);
    const fingerprint = contentFingerprint(record);
    return {
      schema_version: 1,
      kind: 'contract-overlay-v1',
      overlay_id: `fixture-safe:${index}:${fingerprint.slice(0, 12)}`,
      provenance: 'correction',
      binding: {
        stable_id: stableCapabilityId(record),
        source_fingerprint: fingerprint,
        scope: record.scope,
        runtime: record.invocation.runtime || record.runtime_variants[0].runtime,
      },
      fields: {
        reversibility: { value: 'reversible' },
        risk: { value: 'low' },
      },
    };
  });
}

// In-process controller launcher for the opt-in seam. installRouter writes the controller
// config to disk WITHOUT verification_runners (functions are not JSON-serializable); this
// launcher reads the on-disk config, reattaches the stub runners, and runs the real
// runRegistryWatcher in-process so the watcher→controller→compiled-index publication seam
// drives publication exactly as a spawned child would, but with function-valued runners.
//
// The holder parameter is an object the caller supplies; the launcher stashes the pseudo-child
// on holder.child so the test can kill it directly. We MUST NOT call uninstallRouter here,
// because the in-process controller reports pid = process.pid (the test process), and
// stopController would SIGTERM the test process. Instead, child.kill() closes the controller
// via its close() handle, clearing the heartbeat/control intervals so the event loop drains.
export function inProcessControllerLauncher(runners, holder = {}) {
  return (binary, args, spawnOptions) => {
    const configIndex = args.indexOf('--config');
    const configPath = configIndex >= 0 ? args[configIndex + 1] : null;
    let killed = false;
    let pendingClose = null;
    const child = {
      exitCode: null, error: null,
      // kill() returns a promise that resolves once the controller's async close() finishes
      // (clearing heartbeat/control intervals + publish('stopped')). Callers can await it to
      // guarantee no async activity races with subsequent filesystem teardown.
      kill() {
        killed = true;
        // close() returns a promise that may reject if publish('stopped') fails (e.g., the
        // controller dir was already removed). Catch the rejection so callers that don't await
        // kill() don't surface an unhandled promise rejection (Node ≥20 can crash on those).
        const closeHandle = () => {
          try {
            return (handle ? handle.close() : Promise.resolve())
              .catch(() => { /* already closed or publish('stopped') failed */ });
          } catch { return Promise.resolve(); /* already closed */ }
        };
        if (handle) { pendingClose = closeHandle(); return pendingClose; }
        // handle not ready: poll until runRegistryWatcher resolves, then close.
        pendingClose = new Promise(resolve => {
          const poll = () => {
            if (handle) {
              try { handle.close().catch(() => {}).then(resolve, resolve); }
              catch { resolve(); }
            }
            else if (child.exitCode !== null) {
              // runRegistryWatcher rejected (e.g. ready rejection); handle will never be set.
              resolve();
            }
            else setTimeout(poll, 5);
          };
          poll();
        });
        return pendingClose;
      },
    };
    holder.child = child;
    let handle = null;
    holder.ready = (async () => {
      try {
        if (!configPath) throw new Error('controller launcher missing --config');
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        config.verification_runners = runners;
        handle = await runRegistryWatcher({ config });
        // If kill() was called while we were still awaiting runRegistryWatcher, handle was null
        // and the earlier close() was a no-op. Close now so heartbeat/control intervals clear and
        // no async activity leaks after the test ends.
        if (killed) { try { handle.close(); } catch { /* already closed */ } }
      } catch (error) {
        child.exitCode = 1;
        child.error = error;
        throw error;
      }
    })();
    return child;
  };
}
