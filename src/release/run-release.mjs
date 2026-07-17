import { accessSync, constants, readFileSync } from 'node:fs';
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const matrix = loadReleaseMatrix();
    process.stdout.write(`${JSON.stringify({ status: 'matrix-valid', requirements: matrix.requirements.length })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
