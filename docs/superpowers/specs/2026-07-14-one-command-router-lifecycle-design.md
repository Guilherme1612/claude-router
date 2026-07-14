# One-Command Router Lifecycle Design

**Date:** 2026-07-14
**Status:** Approved for implementation planning

## Goal

Make the router immediately usable through one zero-dependency lifecycle script:

```bash
node install-router.mjs
node install-router.mjs --uninstall
```

Installation automatically discovers supported Claude and Codex locations, deploys router-owned artifacts, wires supported integrations, builds initial local state when its builder is present, and verifies readiness. Uninstallation removes only artifacts proven to be router-owned and preserves all unrelated or ambiguous user state.

## Constraints

- Use Node.js and its standard library only.
- Require no global package installation, containers, databases, external services, or network access.
- Keep the prompt-time router deterministic and read-only.
- Preserve unrelated Claude and Codex configuration.
- Make install, repair, and uninstall idempotent.
- Never delete a file based only on its name or location.
- Run all automated lifecycle tests against temporary home directories.

## Public Interface

### Install

```bash
node install-router.mjs
```

Optional path flags remain available for tests and advanced use. The default path requires no manual configuration.

### Uninstall

```bash
node install-router.mjs --uninstall
```

Uninstall uses recorded ownership evidence. There is no implicit whole-settings backup restoration because that could erase changes made after installation.

### Help

```bash
node install-router.mjs --help
```

Help prints the two primary commands first, followed by advanced path overrides.

## Architecture

The existing `install-router.mjs` remains the single entry point. Its behavior is divided into focused internal operations:

1. **Environment discovery** resolves the current Node executable, home directory, supported Claude/Codex roots, settings paths, and repository-owned source artifacts.
2. **Install planning** computes the exact directories, files, and configuration entries required without mutating state.
3. **Safe application** creates directories and writes files atomically, adds only router-owned configuration entries, and records every completed mutation.
4. **Initial build** invokes a local registry or manifest builder only when shipped and applicable. It performs no network work.
5. **Readiness verification** checks deployed files, fingerprints, configuration bindings, and generated state before reporting success.
6. **Owned uninstall** reads the ownership manifest and removes only entries whose identity and current content prove router ownership.

These operations may remain in one source file initially if the result stays readable. Extraction into small standard-library modules is allowed when tests show a clear boundary, but adding a framework or package is not.

## Ownership Manifest

Installation writes a versioned JSON ownership manifest under the router's own runtime directory. It contains only lifecycle metadata:

- schema version and installer version;
- installation timestamp;
- logical runtime roots;
- files created by the installer, with normalized paths and installed content fingerprints;
- directories created by the installer;
- configuration entries added by the installer, with stable entry identity;
- generated artifacts produced during initial build;
- completion state used to detect and repair an interrupted install.

The manifest does not claim ownership of pre-existing files or directories. It contains no prompts, secrets, or unrelated configuration snapshots.

The manifest is written incrementally and atomically. A successful installation marks it complete only after readiness verification passes.

## Installation Behavior

The installer performs the following sequence:

1. Parse arguments and discover the environment.
2. Read and validate existing supported configuration. Missing settings objects may be minimally initialized when doing so is unambiguous.
3. Produce an install plan and validate all source artifacts before the first mutation.
4. Create required router-owned directories.
5. Deploy router-owned files through temporary-file-plus-rename writes.
6. Add a uniquely identifiable router binding without replacing other hook groups or settings.
7. Run the local initial-state builder when available.
8. Verify installed files, binding shape, generated state, and ownership data.
9. Mark the ownership manifest complete and print a concise readiness summary.

Rerunning install compares desired state with the ownership manifest and current filesystem. It no-ops when healthy and repairs missing router-owned artifacts when safe. It never creates duplicate bindings.

## Uninstallation Behavior

Uninstall performs the inverse operation using positive ownership evidence:

1. If no ownership manifest exists and no uniquely identifiable router binding exists, report `already uninstalled` and exit successfully.
2. Load and validate the ownership manifest before mutating anything.
3. Remove only configuration entries whose stable identity matches the recorded router-owned entry.
4. Delete an owned file only when its current fingerprint matches the installed fingerprint, or when it is a generated artifact stored exclusively under an owned directory.
5. Preserve modified, missing, or ambiguous files and report them as retained.
6. Remove directories created by the installer only when empty.
7. Verify that router bindings are absent and retained user state is unchanged.
8. Remove the ownership manifest last and report a concise uninstall summary.

A malformed ownership manifest fails closed: uninstall reports the problem and performs no deletion.

## Failure and Recovery

- Preflight failures cause no mutation.
- Every settings write and manifest write is atomic.
- If installation fails after mutations begin, the installer uses its transaction record to reverse only mutations completed in that run.
- An interrupted or incomplete ownership manifest causes the next install to enter repair mode.
- Uninstall ambiguity preserves the artifact and exits nonzero with an actionable explanation when full removal cannot be proven safe.
- Diagnostic messages identify the failed step and affected logical path without exposing unnecessary absolute home paths.

## Testing Strategy

Tests use Node's built-in test runner and isolated temporary home directories. No test mutates live Claude or Codex configuration.

Required test cases:

- fresh one-command install;
- install with missing safe-to-create directories and settings containers;
- repeated install produces no duplicate binding or file;
- repair of a missing owned artifact;
- initial builder execution and readiness verification;
- clean owned uninstall;
- repeated uninstall reports already uninstalled;
- uninstall preserves unrelated settings added after installation;
- uninstall preserves a user-modified formerly owned file and reports it;
- malformed or incomplete ownership manifest fails closed;
- interrupted install repairs or rolls back deterministically;
- settings and artifacts remain byte-preserved outside router-owned changes;
- `--help` documents install and uninstall as the primary paths.

Focused lifecycle tests must pass before the complete existing `node --test tests/*.test.mjs` suite is run.

## Acceptance Criteria

- A fresh user can run `node install-router.mjs` with no other setup command.
- Successful install ends with verified, usable router integration and a complete ownership manifest.
- Rerunning install is a verified no-op or safe repair.
- `node install-router.mjs --uninstall` removes only proven router-owned state.
- Changes made by the user after installation remain intact after uninstall.
- Repeated uninstall succeeds without mutation.
- The implementation adds no production dependency and performs no network request.
- Lifecycle operations emit concise summaries and actionable failure diagnostics.
