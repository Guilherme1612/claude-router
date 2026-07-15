#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRollback, previewRollback, verifyVersion } from '../registry/activate.mjs';
import { stableStringify } from '../registry/schema.mjs';

const VERSION_ID = /^v1-[a-f0-9]{16}$/;
const MAX_VALUE = 256;
const MAX_DIFF = 256;
const EXIT = Object.freeze({ success: 0, usage: 2, invalid: 3, unsafe: 4, mutation: 5 });

function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return { schema_version: 1, command, ok, reason_code: reasonCode, data, warnings: [...warnings].sort() };
}

function pointer(root) {
  try {
    const value = JSON.parse(readFileSync(join(root, 'active.json'), 'utf8'));
    return VERSION_ID.test(value.version_id) && Number.isInteger(value.sequence) ? value : null;
  } catch { return null; }
}

function versionIds(root) {
  const directory = join(root, 'versions');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(value => VERSION_ID.test(value)).sort((a, b) => {
    const at = statSync(join(directory, a)).mtimeMs;
    const bt = statSync(join(directory, b)).mtimeMs;
    return bt - at || a.localeCompare(b);
  });
}

function readVersion(root, versionId) {
  const verdict = verifyVersion({ ownedRoot: root, versionId });
  if (!verdict.valid) return { verdict };
  const directory = join(root, 'versions', versionId);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  return {
    verdict,
    manifest,
    registry: JSON.parse(readFileSync(join(directory, 'registry.json'), 'utf8')),
    mapping: JSON.parse(readFileSync(join(directory, 'mappings.json'), 'utf8')),
    verification: JSON.parse(readFileSync(join(directory, 'verification.json'), 'utf8')),
  };
}

function projection(versionId, version) {
  return {
    version_id: versionId,
    created_at: version.manifest.created_at,
    bundle_fingerprint: version.verdict.bundle_fingerprint,
    verification_fingerprint: version.verdict.verification_fingerprint,
  };
}

function mappingRows(mapping) {
  return (mapping?.subjects || mapping?.results || []).map(subject => ({
    subject_id: subject.subject_id,
    target_id: subject.target_id || null,
    disposition: subject.disposition,
  })).sort((a, b) => a.subject_id.localeCompare(b.subject_id));
}

function diffVersions(root, sourceId, destinationId) {
  const source = readVersion(root, sourceId), destination = readVersion(root, destinationId);
  if (!source.verdict.valid || !destination.verdict.valid) return { ok: false, reason_code: !source.verdict.valid ? source.verdict.reason_code : destination.verdict.reason_code };
  const sourceRecords = new Map((source.registry.records || []).map(record => [record.id, record]));
  const destinationRecords = new Map((destination.registry.records || []).map(record => [record.id, record]));
  const recordIds = [...new Set([...sourceRecords.keys(), ...destinationRecords.keys()])].sort().slice(0, MAX_DIFF);
  const recordChanges = recordIds.flatMap(id => {
    const before = sourceRecords.get(id), after = destinationRecords.get(id);
    if (!before) return [{ id, change: 'added' }];
    if (!after) return [{ id, change: 'removed' }];
    return stableStringify(before) === stableStringify(after) ? [] : [{ id, change: 'changed' }];
  });
  const sourceMappings = new Map(mappingRows(source.mapping).map(row => [row.subject_id, row]));
  const destinationMappings = new Map(mappingRows(destination.mapping).map(row => [row.subject_id, row]));
  const mappingChanges = [...new Set([...sourceMappings.keys(), ...destinationMappings.keys()])].sort().slice(0, MAX_DIFF).flatMap(subjectId => {
    const before = sourceMappings.get(subjectId), after = destinationMappings.get(subjectId);
    if (stableStringify(before) === stableStringify(after)) return [];
    return [{ subject_id: subjectId, from: before?.target_id || null, to: after?.target_id || null }];
  });
  return { ok: true, source: projection(sourceId, source), destination: projection(destinationId, destination), record_changes: recordChanges, mapping_changes: mappingChanges };
}

function parse(argv) {
  const args = [...argv], options = { format: 'text', execute: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.length > MAX_VALUE) throw new TypeError('argument_too_long');
    if (value === '--format' || value === '--owned-root' || value === '--confirm') {
      const next = args[++index];
      if (!next || next.length > MAX_VALUE) throw new TypeError('missing_option_value');
      options[value.slice(2).replace('-', '_')] = next;
    } else if (value === '--execute') options.execute = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value.startsWith('--')) throw new TypeError('unknown_option');
    else positional.push(value);
  }
  if (!['text', 'json'].includes(options.format)) throw new TypeError('invalid_format');
  return { positional, options };
}

function textResult(result) {
  const lines = [`COMMAND ${result.command}`, `OK ${result.ok}`, `REASON ${result.reason_code}`];
  for (const [key, value] of Object.entries(result.data).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${key.toUpperCase()} ${typeof value === 'object' ? stableStringify(value) : value}`);
  }
  for (const warning of result.warnings) lines.push(`WARNING ${warning}`);
  return `${lines.join('\n')}\n`;
}

function usage() {
  return 'Usage: router-control <status|diff|explain|registry verify|rollback> [versions or subject] [--format text|json] [--owned-root path] [--execute --confirm version]\n';
}

export function runRouterControl({ argv = [], stdin = '', defaultOwnedRoot, dependencies = {} } = {}) {
  let parsed;
  try { parsed = parse(argv); } catch (error) { return { result: canonical('usage', false, error.message), exitCode: EXIT.usage }; }
  const { positional, options } = parsed;
  if (options.help) return { result: canonical('help', true, 'help', { usage: usage().trim() }), exitCode: EXIT.success };
  const root = resolve(options.owned_root || defaultOwnedRoot || join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const command = positional[0];
  const active = pointer(root);
  if (command === 'status') {
    if (positional.length !== 1) return { result: canonical('status', false, 'invalid_arguments'), exitCode: EXIT.usage };
    if (!active) return { result: canonical('status', false, 'invalid_active_pointer'), exitCode: EXIT.invalid };
    const version = readVersion(root, active.version_id);
    if (!version.verdict.valid) return { result: canonical('status', false, version.verdict.reason_code), exitCode: EXIT.invalid };
    return { result: canonical('status', true, 'healthy', { active: { ...projection(active.version_id, version), sequence: active.sequence }, versions: versionIds(root) }), exitCode: 0 };
  }
  if (command === 'registry' && positional[1] === 'verify') {
    if (positional.length > 3) return { result: canonical('registry verify', false, 'invalid_arguments'), exitCode: EXIT.usage };
    const versionId = positional[2] || active?.version_id;
    if (!versionId) return { result: canonical('registry verify', false, 'invalid_active_pointer'), exitCode: EXIT.invalid };
    const verdict = verifyVersion({ ownedRoot: root, versionId });
    return { result: canonical('registry verify', verdict.valid, verdict.reason_code, { verification: verdict }), exitCode: verdict.valid ? 0 : EXIT.invalid };
  }
  if (command === 'diff') {
    if (![1, 3].includes(positional.length)) return { result: canonical('diff', false, 'invalid_arguments'), exitCode: EXIT.usage };
    const ids = versionIds(root), sourceId = positional[1] || active?.version_id, destinationId = positional[2] || ids.find(id => id !== sourceId) || sourceId;
    if (!sourceId || !destinationId) return { result: canonical('diff', false, 'insufficient_history'), exitCode: EXIT.invalid };
    const data = diffVersions(root, sourceId, destinationId);
    return data.ok ? { result: canonical('diff', true, 'diff_ready', data), exitCode: 0 } : { result: canonical('diff', false, data.reason_code), exitCode: EXIT.invalid };
  }
  if (command === 'explain') {
    if (positional.length > 2) return { result: canonical('explain', false, 'invalid_arguments'), exitCode: EXIT.usage };
    if (!active) return { result: canonical('explain', false, 'invalid_active_pointer'), exitCode: EXIT.invalid };
    const version = readVersion(root, active.version_id);
    if (!version.verdict.valid) return { result: canonical('explain', false, version.verdict.reason_code), exitCode: EXIT.invalid };
    const rows = version.mapping.subjects || version.mapping.results || [];
    const subject = positional[1] ? rows.find(item => item.subject_id === positional[1]) : null;
    if (positional[1] && !subject) return { result: canonical('explain', false, 'subject_not_found'), exitCode: EXIT.invalid };
    const filters = { exact_candidate: true, lifecycle: true, dispatchable: true, invocation: true, scope: true, permissions: true, dependencies: true, collisions: true };
    return { result: canonical('explain', true, 'explanation_ready', subject ? { version: projection(active.version_id, version), subject, filters } : { version: projection(active.version_id, version), subjects: rows, filters }), exitCode: 0 };
  }
  if (command === 'rollback') {
    if (positional.length !== 2 || !VERSION_ID.test(positional[1])) return { result: canonical('rollback', false, 'invalid_version_id'), exitCode: EXIT.usage };
    const destination = positional[1], preview = previewRollback({ ownedRoot: root, destination });
    if (preview.preview_status !== 'ready') return { result: canonical('rollback', false, preview.reason_code, { preview }), exitCode: EXIT.unsafe };
    const diff = diffVersions(root, preview.source_version_id, destination);
    const source = readVersion(root, preview.source_version_id), target = readVersion(root, destination);
    const detail = {
      preview: { ...preview, source: projection(preview.source_version_id, source), destination: projection(destination, target) },
      record_changes: diff.record_changes,
      mapping_changes: diff.mapping_changes,
      verification: target.verdict,
      mutation: { type: 'active_pointer_replacement_only', path: 'active.json', expected_sequence: preview.source_sequence, next_sequence: preview.source_sequence + 1 },
    };
    if (!options.execute) return { result: canonical('rollback', true, 'rollback_preview_ready', detail, ['execution_requires_exact_destination_confirmation']), exitCode: 0 };
    const confirmation = options.confirm ?? String(stdin).replace(/[\r\n]+$/, '');
    if (confirmation !== destination) return { result: canonical('rollback', false, 'confirmation_mismatch', detail), exitCode: EXIT.usage };
    const rollback = executeRollback({ ownedRoot: root, preview, confirmation, reason: 'operator_rollback', io: dependencies.rollbackIo });
    const ok = rollback.rollback_status === 'rolled_back';
    const exitCode = ok ? 0 : rollback.rollback_status === 'recovery_required' ? EXIT.mutation : rollback.reason_code === 'confirmation_mismatch' ? EXIT.usage : EXIT.unsafe;
    return { result: canonical('rollback', ok, ok ? 'rollback_complete' : rollback.reason_code, { ...detail, rollback }), exitCode };
  }
  return { result: canonical(command || 'usage', false, 'unknown_command', { usage: usage().trim() }), exitCode: EXIT.usage };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const stdin = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
    const { positional, options } = parse(process.argv.slice(2));
    const outcome = runRouterControl({ argv: process.argv.slice(2), stdin });
    process.stdout.write(options.format === 'json' ? `${stableStringify(outcome.result)}\n` : textResult(outcome.result));
    process.exitCode = outcome.exitCode;
  } catch {
    process.stderr.write('ROUTER CONTROL FAILED: internal_error\n');
    process.exitCode = EXIT.mutation;
  }
}
