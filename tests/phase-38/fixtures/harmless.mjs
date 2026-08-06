// tests/phase-38/fixtures/harmless.mjs — Phase 38 HOST-01 harmless fixture.
//
// Real host process the NativeDispatchAdapter spawns. Self-contained stdlib
// script: writes a temp file under os.tmpdir() with a known content string,
// prints a deterministic multi-byte UTF-8 stdout line, and exits 0.
//
// The stdout line is CONSTANT so completion_evidence.stdout_sha256 is
// reproducible across runs (HOST-01 acceptance criteria). The multi-byte
// ☕ (U+2615 → 0xE2 0x98 0x95) is intentional so Test 6 can assert the
// receipt's stdout_sha256 is computed over the raw UTF-8 bytes (Buffer),
// not over a normalized/stringified form.
//
// The path to this script is a fixed, validated constant supplied to the
// adapter — NEVER derived from untrusted prompt input (T-38-01/T-38-06).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const PAYLOAD = 'router-dispatch-fixture-v1\n';
const STDOUT_LINE = 'router-dispatch-ok 38a1b2c3 ☕\n';

function main() {
  // Side effect: write a temp file with known content so the receipt's
  // artifact_ref could be wired in a later phase. The path uses os.tmpdir()
  // and the script writes NOTHING outside that directory.
  const tmpPath = join(tmpdir(), `router-dispatch-fixture-${process.pid}.txt`);
  writeFileSync(tmpPath, PAYLOAD);

  // Deterministic stdout — sha256 reproducible for the receipt's
  // completion_evidence.stdout_sha256 (computed over the raw UTF-8 bytes).
  process.stdout.write(STDOUT_LINE);

  // Emit the temp-file content hash on stderr for diagnostic capture; this
  // is NOT used by the receipt (receipts hash stdout only) but helps
  // debugging when a test inspects the fixture's behavior.
  const contentHash = createHash('sha256').update(PAYLOAD).digest('hex').slice(0, 16);
  process.stderr.write(`fixture-content-sha256=${contentHash}\n`);

  process.exit(0);
}

main();