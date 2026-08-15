import { readFileSync } from 'node:fs';

import { reconcileReleaseEvidence } from '../src/release/preflight.mjs';

const evidencePath = process.argv[2];
let evidence = {};
if (evidencePath) {
  try { evidence = JSON.parse(readFileSync(evidencePath, 'utf8')); }
  catch (error) { evidence = { parse_error: error.code || 'evidence_read_failed' }; }
}
const result = reconcileReleaseEvidence(evidence);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.status === 'ready' ? 0 : 1;
