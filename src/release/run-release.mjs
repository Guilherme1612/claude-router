import { createHash } from 'node:crypto';
import { accessSync, closeSync, constants, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';

export const REQUIREMENT_IDS = Object.freeze([
  'REG-01', 'REG-02', 'REG-03', 'ADP-01', 'ADP-02', 'CHG-01', 'CHG-02',
  'SAF-09', 'SAF-10', 'MAP-01', 'MAP-02', 'ACT-01', 'CTX-01', 'CTX-02',
  'ORC-01', 'ORC-02', 'TOK-01', 'TOK-02', 'EVO-05', 'REL-01',
]);
const V13_REQUIREMENT_IDS = Object.freeze(
  Array.from({ length: 9 }, (_, index) => `REL-0${index + 1}`),
);

export const RELEASE_VERSIONS = Object.freeze({
  registry: 'canonical-registry-v1', index: 'compiled-index-v1',
  policy: 'workflow-transitions-v1', corpus: 'router-calibration-v1',
});

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ALLOWED_TOP_KEYS = ['schema_version', 'milestone', 'versions', 'requirements'];
const ALLOWED_ROW_KEYS = ['id', 'primary', 'secondary'];
const COMMAND = /^node --test (tests\/router\.[a-z0-9.-]+\.test\.mjs)(?: (tests\/router\.[a-z0-9.-]+\.test\.mjs))*$/;
const TEST_FILE = /^tests\/router\.[a-z0-9.-]+\.test\.mjs$/;
// Phase 19 D-09 (Plan 19-04 Task 3): secondary evidence schema is now per-label. The
// phase-18-cross-cutting label keeps the executable-commands shape (D-10/D-11). The
// phase-19-live-path label cites the extended Phase 18 E2E test files directly as
// live-path evidence for ORC-01 + TOK-02, with documentation fields
// (phase/tests/scope/closure). Both shapes fail closed on malformed entries (T-19-08
// mitigation preserved: tests must exist and be readable, scope/closure non-empty).
const SECONDARY_LABEL_SCHEMA = Object.freeze({
  'phase-18-cross-cutting': Object.freeze(['label', 'commands']),
  'phase-19-live-path': Object.freeze(['label', 'phase', 'tests', 'scope', 'closure']),
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const sha256 = value => createHash('sha256').update(value).digest('hex');

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
  const v13 = matrix?.milestone === 'v1.3';
  exactKeys(matrix, v13 ? [...ALLOWED_TOP_KEYS, 'thresholds', 'stages'] : ALLOWED_TOP_KEYS, 'matrix');
  if (matrix.schema_version !== 1 || (!v13 && matrix.milestone !== 'v1.2')) throw new TypeError('matrix version mismatch');
  if (JSON.stringify(matrix.versions) !== JSON.stringify(RELEASE_VERSIONS)) throw new TypeError('immutable version mismatch');
  if (!Array.isArray(matrix.requirements)) throw new TypeError('requirements coverage missing');
  const requirementIds = v13 ? V13_REQUIREMENT_IDS : REQUIREMENT_IDS;
  const ids = matrix.requirements.map(row => row?.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) throw new TypeError(`duplicate primary ownership: ${duplicates[0]}`);
  const unknown = ids.filter(id => !requirementIds.includes(id));
  if (unknown.length) throw new TypeError(`unknown requirement: ${unknown[0]}`);
  if (ids.length !== requirementIds.length || requirementIds.some(id => !ids.includes(id))) throw new TypeError('incomplete requirement coverage');
  for (const row of matrix.requirements) {
    exactKeys(row, ALLOWED_ROW_KEYS, `requirement ${row.id}`);
    exactKeys(row.primary, ['phase', 'owner', 'commands', 'gate_ids'], `primary ${row.id}`);
    const validPhase = v13 ? row.primary.phase === 26
      : Number.isInteger(row.primary.phase) && row.primary.phase >= 11 && row.primary.phase <= 17;
    if (!validPhase || typeof row.primary.owner !== 'string' || !row.primary.owner) throw new TypeError('invalid primary owner');
    if (!Array.isArray(row.primary.gate_ids) || !row.primary.gate_ids.length || row.primary.gate_ids.some(id => typeof id !== 'string' || !id)) throw new TypeError('missing primary gates');
    validateCommands(row.primary.commands, repoRoot, { primary: true });
    if (row.secondary !== undefined) {
      if (!Array.isArray(row.secondary)) throw new TypeError('secondary evidence must be an array');
      for (const secondary of row.secondary) {
        const allowedKeys = SECONDARY_LABEL_SCHEMA[secondary.label];
        if (!allowedKeys) throw new TypeError(`secondary ${row.id} has unknown label: ${secondary.label}`);
        exactKeys(secondary, allowedKeys, `secondary ${row.id}`);
        if (secondary.label === 'phase-18-cross-cutting') {
          validateCommands(secondary.commands, repoRoot);
        } else if (secondary.label === 'phase-19-live-path') {
          // Phase 19 D-09 live-path evidence: cite concrete E2E test files. Fail closed
          // if the phase is implausible, tests are missing/invalid, or scope/closure are
          // empty (T-19-08 tampering mitigation).
          if (!Number.isInteger(secondary.phase) || secondary.phase < 18) throw new TypeError(`secondary ${row.id} invalid phase`);
          if (!Array.isArray(secondary.tests) || !secondary.tests.length) throw new TypeError(`secondary ${row.id} missing tests`);
          for (const file of secondary.tests) {
            if (typeof file !== 'string' || !TEST_FILE.test(file)) throw new TypeError(`secondary ${row.id} invalid test file: ${file}`);
            accessSync(resolve(repoRoot, file), constants.R_OK);
          }
          if (typeof secondary.scope !== 'string' || !secondary.scope) throw new TypeError(`secondary ${row.id} missing scope`);
          if (typeof secondary.closure !== 'string' || !secondary.closure) throw new TypeError(`secondary ${row.id} missing closure`);
        }
      }
    }
  }
  if (v13) validateStages(matrix, repoRoot);
  return Object.freeze({ status: 'valid', requirement_count: ids.length });
}

function validateStages(matrix, repoRoot) {
  exactKeys(matrix.thresholds, ['warm_p95_ms_lt', 'max_route_ms_lt', 'context_max_bytes'], 'release thresholds');
  if (matrix.thresholds.warm_p95_ms_lt !== 25
    || matrix.thresholds.max_route_ms_lt !== 100
    || matrix.thresholds.context_max_bytes !== 2048) {
    throw new TypeError('release thresholds mismatch');
  }
  if (!Array.isArray(matrix.stages) || matrix.stages.length === 0) throw new TypeError('release stages missing');
  const stageIds = matrix.stages.map(stage => stage?.id);
  if (new Set(stageIds).size !== stageIds.length) throw new TypeError('duplicate release stage');
  for (const stage of matrix.stages) {
    exactKeys(stage, ['id', 'files', 'gate_ids', 'isolated'], `release stage ${stage.id}`);
    if (typeof stage.id !== 'string' || !stage.id
      || !Array.isArray(stage.files) || stage.files.length === 0
      || !Array.isArray(stage.gate_ids) || stage.gate_ids.length === 0
      || stage.gate_ids.some(id => typeof id !== 'string' || !id)
      || (stage.isolated !== undefined && typeof stage.isolated !== 'boolean')) {
      throw new TypeError('malformed release stage');
    }
    for (const file of stage.files) {
      if (typeof file !== 'string' || !TEST_FILE.test(file)) throw new TypeError(`invalid release stage file: ${file}`);
      if (file === 'tests/router.phase26-release.test.mjs') throw new TypeError('circular release stage evidence');
      try { accessSync(resolve(repoRoot, file), constants.R_OK); } catch { throw new TypeError(`release stage file not readable: ${file}`); }
    }
  }
  const stageGates = new Set(matrix.stages.flatMap(stage => stage.gate_ids));
  const requiredGates = matrix.requirements.flatMap(row => row.primary.gate_ids);
  if (requiredGates.some(id => !stageGates.has(id))) throw new TypeError('release stage gate coverage incomplete');
  const latency = matrix.stages.find(stage => stage.id === 'latency');
  if (!latency?.isolated
    || !['warm-p95', 'hard-route-ceiling', 'context-budget'].every(id => latency.gate_ids.includes(id))) {
    throw new TypeError('isolated release metric stage incomplete');
  }
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

const stagesFor = matrix => matrix.stages || STAGES;
const thresholdsFor = matrix => matrix.thresholds || {
  warm_p95_ms_lt: 25,
  max_route_ms_lt: 100,
};

// Parse child test stdout into gate_results reflecting real TAP pass/fail counts and
// RELEASE_METRICS evidence. Returns { gate_results, reason_code?, measurements? }.
// Fail-closed reason codes: 'child-error', 'skipped', 'no-tap-summary', 'tap-fail',
// 'metrics-missing'. The latency stage maps warm_p95_ms -> 'warm-p95' and max_route_ms ->
// 'hard-route-ceiling'; non-latency stages pass every gate_id when TAP reports fail=0 pass>0.
export function parseChildEvidence({ stdout, stage, gate_ids, error, skipped, thresholds = thresholdsFor({}) }) {
  if (error) return { gate_results: [], reason_code: 'child-error' };
  if (skipped) return { gate_results: [], reason_code: 'skipped' };
  const passMatch = stdout.match(/^# pass (\d+)/m);
  const failMatch = stdout.match(/^# fail (\d+)/m);
  if (!passMatch) return { gate_results: [], reason_code: 'no-tap-summary' };
  const passCount = Number(passMatch[1]);
  const failCount = failMatch ? Number(failMatch[1]) : 0;
  if (failCount > 0) return { gate_results: [], reason_code: 'tap-fail' };
  if (passCount === 0) return { gate_results: [], reason_code: 'no-tap-summary' };
  const metricsMatch = stdout.match(/RELEASE_METRICS (\{[^\n]+\})/);
  let measurements;
  try { if (metricsMatch) measurements = JSON.parse(metricsMatch[1]); } catch { /* invalid evidence -> metrics-missing for latency */ }
  const gate_results = [];
  if (stage === 'latency') {
    if (!measurements) return { gate_results: [], reason_code: 'metrics-missing' };
    const warm = measurements.warm_p95_ms;
    const max = measurements.max_route_ms;
    const warmPass = Number.isFinite(warm) && warm < thresholds.warm_p95_ms_lt;
    const maxPass = Number.isFinite(max) && max < thresholds.max_route_ms_lt;
    gate_results.push({ id: 'warm-p95', pass: warmPass, reason_code: warmPass ? 'warm-p95_pass' : 'threshold' });
    gate_results.push({ id: 'hard-route-ceiling', pass: maxPass, reason_code: maxPass ? 'hard-route-ceiling_pass' : 'threshold' });
    if (gate_ids.includes('context-budget')) {
      const contextPass = Number.isFinite(measurements.context_max_bytes)
        && measurements.context_max_bytes <= thresholds.context_max_bytes;
      gate_results.push({ id: 'context-budget', pass: contextPass, reason_code: contextPass ? 'context-budget_pass' : 'threshold' });
    }
    const metricIds = new Set(gate_results.map(gate => gate.id));
    for (const id of gate_ids) {
      if (!metricIds.has(id)) gate_results.push({ id, pass: true, reason_code: `${id}_pass` });
    }
    return { gate_results, measurements };
  }
  for (const id of gate_ids) gate_results.push({ id, pass: true, reason_code: `${id}_pass` });
  return { gate_results };
}

function executeChild({ stage, command, gate_ids, timeout_ms, thresholds }) {
  const files = command.split(' ').slice(2);
  return new Promise(resolveResult => {
    execFile(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: MODULE_ROOT, timeout: timeout_ms, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ROUTER_RELEASE_STAGE: stage } }, (error, stdout = '', stderr = '') => {
      // Only treat the stage as skipped when there are NO passing tests. A stage with 5 passing
      // tests and 1 platform-specific `# SKIP` must not be marked fully skipped — that would
      // block legitimate releases where a single test is conditionally skipped.
      const passMatch = stdout.match(/^# pass (\d+)/m);
      const skipped = (/^ok .* # SKIP\b/im.test(stdout) || /^# skipped [1-9]/m.test(stdout))
        && (!passMatch || Number(passMatch[1]) === 0);
      const parsed = parseChildEvidence({ stdout, stage, gate_ids, error, skipped, thresholds });
      resolveResult({
        status: error?.killed ? 'timed_out' : error ? 'failed' : 'passed',
        exit_code: error?.code ?? 0, skipped,
        gate_results: parsed.gate_results,
        ...(parsed.reason_code ? { reason_code: parsed.reason_code } : {}),
        ...(parsed.measurements ? { measurements: parsed.measurements } : {}),
        diagnostic: stderr.slice(0, 512),
      });
    });
  });
}

function assertStageResult(stage, result, thresholds) {
  const gates = Array.isArray(result?.gate_results) ? result.gate_results : [];
  const complete = stage.gate_ids.every(id => gates.some(gate => gate?.id === id && gate.pass === true && typeof gate.reason_code === 'string'));
  const latencyPass = stage.id !== 'latency' || (
    Number.isFinite(result?.measurements?.warm_p95_ms) && result.measurements.warm_p95_ms < thresholds.warm_p95_ms_lt
    && Number.isFinite(result?.measurements?.max_route_ms) && result.measurements.max_route_ms < thresholds.max_route_ms_lt
    && (!stage.gate_ids.includes('context-budget') || (
      Number.isFinite(result?.measurements?.context_max_bytes)
      && result.measurements.context_max_bytes <= thresholds.context_max_bytes
    ))
  );
  if (result?.status !== 'passed' || result.exit_code !== 0 || result.skipped || !complete || !latencyPass) {
    const reason = result?.status !== 'passed' ? result?.status
      : result.exit_code !== 0 ? `exit-${result.exit_code}`
      : result.skipped ? 'skipped'
      : !complete ? (result.reason_code || 'structured-evidence-missing')
      : 'threshold';
    throw new Error(`release gate failed: ${stage.id} (${reason})`);
  }
}

function canonicalReport(matrix, stages) {
  return {
    schema_version: 1,
    milestone: matrix.milestone,
    matrix_sha256: sha256(canonical(matrix)),
    versions: { ...RELEASE_VERSIONS },
    thresholds: { ...thresholdsFor(matrix) },
    stages: stages.map(stage => ({
      id: stage.id,
      command: stage.command,
      result: 'pass',
      gates: stage.gate_results.map(gate => ({ id: gate.id, pass: true, reason_code: gate.reason_code })),
      ...(stage.id === 'latency' ? { measurements: {
        warm_p95_ms: stage.measurements.warm_p95_ms,
        max_route_ms: stage.measurements.max_route_ms,
        ...(Number.isFinite(stage.measurements.context_max_bytes)
          ? { context_max_bytes: stage.measurements.context_max_bytes }
          : {}),
      } } : {}),
    })),
  };
}

function publishAtomic(outputPath, bytes) {
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, 'w', 0o600);
    writeFileSync(descriptor, bytes, 'utf8');
    closeSync(descriptor); descriptor = undefined;
    renameSync(temporary, target);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch { /* no partial file */ }
    throw error;
  }
}

export function verifyReleaseReport({ reportPath, matrixPath = resolve(MODULE_ROOT, 'release/v1.2-matrix.json') } = {}) {
  const matrix = loadReleaseMatrix({ matrixPath });
  const stages = stagesFor(matrix);
  const thresholds = thresholdsFor(matrix);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  exactKeys(report, ['schema_version', 'milestone', 'matrix_sha256', 'versions', 'thresholds', 'stages'], 'release report');
  if (report.schema_version !== 1 || report.milestone !== matrix.milestone) throw new TypeError('release report version mismatch');
  if (report.matrix_sha256 !== sha256(canonical(matrix))) throw new TypeError('release report matrix hash mismatch');
  if (canonical(report.versions) !== canonical(RELEASE_VERSIONS)) throw new TypeError('release report immutable version mismatch');
  if (canonical(report.thresholds) !== canonical(thresholds)) throw new TypeError('release thresholds mismatch');
  if (!Array.isArray(report.stages) || report.stages.length !== stages.length || stages.some((stage, index) => report.stages[index]?.id !== stage.id || report.stages[index]?.result !== 'pass')) throw new TypeError('release stages incomplete');
  for (let index = 0; index < stages.length; index += 1) {
    const expected = stages[index]; const actual = report.stages[index];
    if (actual.command !== `node --test ${expected.files.join(' ')}` || !Array.isArray(actual.gates) || expected.gate_ids.some(id => !actual.gates.some(gate => gate.id === id && gate.pass === true))) throw new TypeError(`release stage evidence mismatch: ${expected.id}`);
  }
  const latency = report.stages.at(-1)?.measurements;
  if (!Number.isFinite(latency?.warm_p95_ms) || latency.warm_p95_ms >= thresholds.warm_p95_ms_lt
    || !Number.isFinite(latency?.max_route_ms) || latency.max_route_ms >= thresholds.max_route_ms_lt
    || (thresholds.context_max_bytes !== undefined
      && (!Number.isFinite(latency?.context_max_bytes) || latency.context_max_bytes > thresholds.context_max_bytes))) {
    throw new TypeError('release latency threshold mismatch');
  }
  return Object.freeze({ status: 'verified', versions: Object.freeze({ ...report.versions }), matrix_sha256: report.matrix_sha256 });
}

export async function runRelease({
  matrix, matrixPath, execute = executeChild, timeoutMs = 120_000, publish = true, outputPath,
} = {}) {
  matrix ||= loadReleaseMatrix({ matrixPath });
  validateReleaseMatrix(matrix);
  const stagesForMatrix = stagesFor(matrix);
  const thresholds = thresholdsFor(matrix);
  const stages = [];
  for (const definition of stagesForMatrix) {
    const request = {
      stage: definition.id, command: `node --test ${definition.files.join(' ')}`,
      gate_ids: [...definition.gate_ids], timeout_ms: timeoutMs,
      isolated: definition.isolated === true,
      thresholds,
    };
    const result = await execute(request);
    assertStageResult(definition, result, thresholds);
    stages.push({ id: definition.id, command: request.command, gate_results: result.gate_results, ...(result.measurements ? { measurements: result.measurements } : {}) });
  }
  const release = { status: 'passed', stages };
  if (publish) {
    if (typeof outputPath !== 'string') throw new TypeError('release evidence output path is required');
    const report = canonicalReport(matrix, stages);
    publishAtomic(outputPath, `${canonical(report)}\n`);
    verifyReleaseReport({ reportPath: outputPath, matrixPath: matrixPath || resolve(MODULE_ROOT, `release/${matrix.milestone}-matrix.json`) });
    release.report_path = resolve(outputPath);
    release.matrix_sha256 = report.matrix_sha256;
  }
  return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const matrixArg = process.argv.find(argument => argument.startsWith('--matrix='));
    const outputArg = process.argv.find(argument => argument.startsWith('--output='));
    const matrixPath = matrixArg?.slice('--matrix='.length) || resolve(MODULE_ROOT, 'release/v1.2-matrix.json');
    const matrix = loadReleaseMatrix({ matrixPath });
    const result = await runRelease({
      matrix,
      matrixPath,
      outputPath: outputArg?.slice('--output='.length) || resolve(MODULE_ROOT, `release/${matrix.milestone}-report.json`),
    });
    process.stdout.write(`${JSON.stringify({ status: result.status, stages: result.stages.map(stage => stage.id) })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
