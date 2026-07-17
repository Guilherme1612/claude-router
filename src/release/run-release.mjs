import { accessSync, constants, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';

export const REQUIREMENT_IDS = Object.freeze([
  'REG-01', 'REG-02', 'REG-03', 'ADP-01', 'ADP-02', 'CHG-01', 'CHG-02',
  'SAF-09', 'SAF-10', 'MAP-01', 'MAP-02', 'ACT-01', 'CTX-01', 'CTX-02',
  'ORC-01', 'ORC-02', 'TOK-01', 'TOK-02', 'EVO-05', 'REL-01',
]);

export const RELEASE_VERSIONS = Object.freeze({
  registry: 'canonical-registry-v1', index: 'compiled-index-v1',
  policy: 'workflow-transitions-v1', corpus: 'router-calibration-v1',
});

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ALLOWED_TOP_KEYS = ['schema_version', 'milestone', 'versions', 'requirements'];
const ALLOWED_ROW_KEYS = ['id', 'primary', 'secondary'];
const COMMAND = /^node --test (tests\/router\.[a-z0-9.-]+\.test\.mjs)(?: (tests\/router\.[a-z0-9.-]+\.test\.mjs))*$/;

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new TypeError(`${label} has unknown fields: ${extras.join(', ')}`);
}

function validateCommands(commands, repoRoot, { primary = false } = {}) {
  if (!Array.isArray(commands) || commands.length === 0) throw new TypeError('non-executable evidence commands');
  for (const command of commands) {
    if (typeof command !== 'string' || /\b(skip|todo)\b/i.test(command) || !COMMAND.test(command)) throw new TypeError('non-executable or skipped evidence command');
    const files = command.split(' ').slice(2);
    if (primary && files.length === 1 && files[0] === 'tests/router.v12-release.test.mjs') throw new TypeError('circular matrix-only behavioral evidence');
    for (const file of files) accessSync(resolve(repoRoot, file), constants.R_OK);
  }
}

export function validateReleaseMatrix(matrix, { repoRoot = MODULE_ROOT } = {}) {
  exactKeys(matrix, ALLOWED_TOP_KEYS, 'matrix');
  if (matrix.schema_version !== 1 || matrix.milestone !== 'v1.2') throw new TypeError('matrix version mismatch');
  if (JSON.stringify(matrix.versions) !== JSON.stringify(RELEASE_VERSIONS)) throw new TypeError('immutable version mismatch');
  if (!Array.isArray(matrix.requirements)) throw new TypeError('requirements coverage missing');
  const ids = matrix.requirements.map(row => row?.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) throw new TypeError(`duplicate primary ownership: ${duplicates[0]}`);
  const unknown = ids.filter(id => !REQUIREMENT_IDS.includes(id));
  if (unknown.length) throw new TypeError(`unknown requirement: ${unknown[0]}`);
  if (ids.length !== REQUIREMENT_IDS.length || REQUIREMENT_IDS.some(id => !ids.includes(id))) throw new TypeError('incomplete requirement coverage');
  for (const row of matrix.requirements) {
    exactKeys(row, ALLOWED_ROW_KEYS, `requirement ${row.id}`);
    exactKeys(row.primary, ['phase', 'owner', 'commands', 'gate_ids'], `primary ${row.id}`);
    if (!Number.isInteger(row.primary.phase) || row.primary.phase < 11 || row.primary.phase > 17 || typeof row.primary.owner !== 'string' || !row.primary.owner) throw new TypeError('invalid primary owner');
    if (!Array.isArray(row.primary.gate_ids) || !row.primary.gate_ids.length || row.primary.gate_ids.some(id => typeof id !== 'string' || !id)) throw new TypeError('missing primary gates');
    validateCommands(row.primary.commands, repoRoot, { primary: true });
    if (row.secondary !== undefined) {
      if (!Array.isArray(row.secondary)) throw new TypeError('secondary evidence must be an array');
      for (const secondary of row.secondary) {
        exactKeys(secondary, ['label', 'commands'], `secondary ${row.id}`);
        if (secondary.label !== 'phase-18-cross-cutting') throw new TypeError('secondary evidence label mismatch');
        validateCommands(secondary.commands, repoRoot);
      }
    }
  }
  return Object.freeze({ status: 'valid', requirement_count: ids.length });
}

export function loadReleaseMatrix({ matrixPath = resolve(MODULE_ROOT, 'release/v1.2-matrix.json'), repoRoot = MODULE_ROOT } = {}) {
  try {
    const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
    validateReleaseMatrix(matrix, { repoRoot });
    return matrix;
  } catch (error) {
    throw new TypeError(`release matrix invalid: ${error.message}`, { cause: error });
  }
}

const STAGES = Object.freeze([
  { id: 'regression', files: ['tests/router.registry-schema.test.mjs', 'tests/router.registry-build.test.mjs', 'tests/router.adapters.test.mjs', 'tests/router.registry-diff.test.mjs', 'tests/router.registry-watcher.test.mjs', 'tests/router.registry-reconcile.test.mjs', 'tests/router.hook-reconcile.test.mjs', 'tests/router.registry-map.test.mjs', 'tests/router.registry-activate.test.mjs'], gate_ids: ['regression'] },
  { id: 'calibration', files: ['tests/router.evolution-canary.test.mjs', 'tests/router.compiled-evolution.test.mjs'], gate_ids: ['calibration', 'canary-rollback'] },
  { id: 'privacy', files: ['tests/router.privacy.test.mjs'], gate_ids: ['privacy'] },
  { id: 'coexistence', files: ['tests/router.installer-coexistence.test.mjs', 'tests/router.coexistence.test.mjs'], gate_ids: ['coexistence'] },
  { id: 'recovery', files: ['tests/router.autonomous-lifecycle.test.mjs', 'tests/router.lifecycle-recovery.test.mjs'], gate_ids: ['lifecycle', 'recovery'] },
  { id: 'context-token', files: ['tests/router.context-capsule.test.mjs', 'tests/router.context-resume.test.mjs', 'tests/router.context-prompt-integration.test.mjs', 'tests/router.workflow-orchestrator.test.mjs', 'tests/router.context-budget.test.mjs', 'tests/router.token-budget.test.mjs'], gate_ids: ['context', 'orchestration', 'token-budget'] },
  { id: 'latency', files: ['tests/router.compiled-evolution.test.mjs'], gate_ids: ['warm-p95', 'hard-route-ceiling'], isolated: true },
]);

function executeChild({ stage, command, gate_ids, timeout_ms }) {
  const files = command.split(' ').slice(2);
  return new Promise(resolveResult => {
    execFile(process.execPath, ['--test', ...files], { cwd: MODULE_ROOT, timeout: timeout_ms, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ROUTER_RELEASE_STAGE: stage } }, (error, stdout = '', stderr = '') => {
      const skipped = /# SKIP|\bskipped [1-9]/i.test(stdout);
      const metricsMatch = stdout.match(/RELEASE_METRICS (\{[^\n]+\})/);
      let measurements;
      try { if (metricsMatch) measurements = JSON.parse(metricsMatch[1]); } catch { /* invalid evidence is handled below */ }
      resolveResult({
        status: error?.killed ? 'timed_out' : error ? 'failed' : 'passed',
        exit_code: error?.code ?? 0, skipped,
        gate_results: error || skipped ? [] : gate_ids.map(id => ({ id, pass: true, reason_code: `${id}_pass` })),
        ...(measurements ? { measurements } : {}),
        diagnostic: stderr.slice(0, 512),
      });
    });
  });
}

function assertStageResult(stage, result) {
  const gates = Array.isArray(result?.gate_results) ? result.gate_results : [];
  const complete = stage.gate_ids.every(id => gates.some(gate => gate?.id === id && gate.pass === true && typeof gate.reason_code === 'string'));
  const latencyPass = stage.id !== 'latency' || (
    Number.isFinite(result?.measurements?.warm_p95_ms) && result.measurements.warm_p95_ms < 25
    && Number.isFinite(result?.measurements?.max_route_ms) && result.measurements.max_route_ms < 100
  );
  if (result?.status !== 'passed' || result.exit_code !== 0 || result.skipped || !complete || !latencyPass) throw new Error(`release gate failed: ${stage.id}`);
}

export async function runRelease({
  matrix = loadReleaseMatrix(), execute = executeChild, timeoutMs = 120_000,
  publish = true, outputPath,
} = {}) {
  validateReleaseMatrix(matrix);
  const stages = [];
  for (const definition of STAGES) {
    const request = {
      stage: definition.id, command: `node --test ${definition.files.join(' ')}`,
      gate_ids: [...definition.gate_ids], timeout_ms: timeoutMs,
      isolated: definition.isolated === true,
    };
    const result = await execute(request);
    assertStageResult(definition, result);
    stages.push({ id: definition.id, command: request.command, gate_results: result.gate_results, ...(result.measurements ? { measurements: result.measurements } : {}) });
  }
  const release = { status: 'passed', stages };
  if (publish) {
    if (typeof outputPath !== 'string') throw new TypeError('release evidence output path is required');
    throw new TypeError('release evidence publication is not implemented');
  }
  return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const outputArg = process.argv.find(argument => argument.startsWith('--output='));
    const result = await runRelease({ outputPath: outputArg?.slice('--output='.length) || resolve(MODULE_ROOT, 'release/v1.2-report.json') });
    process.stdout.write(`${JSON.stringify({ status: result.status, stages: result.stages.map(stage => stage.id) })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
