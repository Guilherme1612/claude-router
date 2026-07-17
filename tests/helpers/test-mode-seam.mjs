import { readFileSync } from 'node:fs';
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
        const closeHandle = () => {
          try { return handle ? handle.close() : Promise.resolve(); }
          catch { return Promise.resolve(); /* already closed */ }
        };
        if (handle) { pendingClose = closeHandle(); return pendingClose; }
        // handle not ready: poll until runRegistryWatcher resolves, then close.
        pendingClose = new Promise(resolve => {
          const poll = () => {
            if (handle) { try { handle.close().then(resolve, resolve); } catch { resolve(); } }
            else setTimeout(poll, 5);
          };
          poll();
        });
        return pendingClose;
      },
    };
    holder.child = child;
    let handle = null;
    (async () => {
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
      }
    })();
    return child;
  };
}