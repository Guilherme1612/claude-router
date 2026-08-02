# Deferred Items

- `node scripts/resolve-tie-lint.mjs` exits 1 against the current live mode-map/manifest with stale resolve targets (including `gsd-debug`, `systematic-debugging`, `graphify`, and `writing-plans`). This is outside 32.1-01: the CLI reads inventory files directly and does not load `buildTargetIndexes` or the changed hook. Reconcile the live manifest/mode-map pair in the phase-32 release-gate work.

- The project-wide `rtk node --test tests/*.test.mjs` sweep completed with 1240/1262 passing and 22 failures, concentrated in pre-existing installed-controller lifecycle timing, test-mode seam, and canonical installed mode-map parity tests. The scoped 32.1-03 suites and builder regressions all pass; defer these unrelated live-install issues to the owning lifecycle/release work.
