import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const OUTCOME_CLASSES = Object.freeze([
  'selected', 'ignored', 'rejected', 'substituted', 'completed', 'failed', 'accepted',
]);
const GRAPH_STATUSES = new Set(['not_triggered', 'graph_missing', 'ok', 'queried', 'graph_error']);
const SHADOW_OUTCOMES = new Set(['accepted', 'rejected', 'no_signal']);
const RECEIPT_STATES = new Set([
  'pending', 'invoked', 'paused', 'completed', 'failed', 'recommendation_only',
  'blocked', 'rejected', 'substituted', 'ignored', 'quarantined',
]);

function help() {
  return `Privacy-safe v1.9 outcome and graph observability report

Usage:
  node scripts/v19-observability-report.mjs --claude-root <path> --codex-root <path> --output <path>

Options:
  --claude-root <path> Claude configuration root
  --codex-root <path>  Codex configuration root
  --output <path>      Atomic JSON report output path
  --help               Show this help
`;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help') { values.help = true; continue; }
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
    values[token.slice(2)] = value;
    index += 1;
  }
  return values;
}

function token(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized && normalized.length <= 128 ? normalized : null;
}

function emptyLog() {
  return { exists: false, records: 0, malformed_lines: 0 };
}

function readJsonl(path, project) {
  if (!existsSync(path)) return emptyLog();
  let content;
  try { content = readFileSync(path, 'utf8'); } catch { return { exists: true, records: 0, malformed_lines: 1 }; }
  const result = { exists: true, records: 0, malformed_lines: 0 };
  for (const line of content.split(/\r?\n/)) {
    if (!line) continue;
    let value;
    try { value = JSON.parse(line); } catch { result.malformed_lines += 1; continue; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      result.malformed_lines += 1;
      continue;
    }
    result.records += 1;
    project(value, result);
  }
  return result;
}

function count(map, key) {
  const safe = token(key) || 'unknown';
  map[safe] = (map[safe] || 0) + 1;
}

function newOutcomeCounts() {
  return Object.fromEntries(OUTCOME_CLASSES.map((name) => [name, 0]));
}

function selectedCapability(row) {
  const direct = token(row.suggested_mode);
  if (direct) return direct;
  const first = Array.isArray(row.suggested_skills) ? row.suggested_skills[0]
    : Array.isArray(row.suggested_agents) ? row.suggested_agents[0] : null;
  if (typeof first === 'string') return token(first);
  return token(first?.canonical_identity || first?.id || first?.name);
}

function suggestionId(row) {
  const candidates = [
    row.suggestion_id,
    row.bounded_evidence?.suggestion_id,
    row.selected?.suggestion_id,
    row.invocation_identity?.identity?.suggestion_id,
  ];
  return candidates.find((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) || null;
}

function routeId(row) {
  return token(row.route_id)
    || token(row.invocation_identity?.identity?.route_id)
    || token(row.selected?.route_id || row.selected?.route)
    || token(row.actual?.route_id || row.actual?.route)
    || null;
}

function buildReceiptIndex(path) {
  const latest = new Map();
  const stateCounts = {};
  const log = readJsonl(path, (row) => {
    const state = token(row.completion_evidence?.state || row.route_state) || 'unknown';
    count(stateCounts, state);
    const id = token(row.receipt_id);
    if (id) latest.set(id, row);
  });
  const bySuggestion = new Map();
  const byRoute = new Map();
  let verifiedCompletionRecords = 0;
  let nativeIdentityRecords = 0;
  let runtimeMatchRecords = 0;
  const latestStateCounts = {};
  for (const row of latest.values()) {
    const state = token(row.completion_evidence?.state || row.route_state) || 'unknown';
    count(latestStateCounts, state);
    const sid = suggestionId(row);
    if (sid) bySuggestion.set(sid, row);
    const rid = routeId(row);
    if (rid) byRoute.set(rid, row);
    if (state === 'completed' && row.postcondition_evidence?.verified === true) verifiedCompletionRecords += 1;
    if (row.invocation_identity?.native_identity && typeof row.invocation_identity.native_identity === 'object') nativeIdentityRecords += 1;
    if (row.invocation_identity?.runtime === 'claude' || row.invocation_identity?.runtime === 'codex') runtimeMatchRecords += 1;
  }
  return {
    log,
    latest,
    bySuggestion,
    byRoute,
    stateCounts,
    latestStateCounts,
    verifiedCompletionRecords,
    nativeIdentityRecords,
    runtimeMatchRecords,
  };
}

function classifyReceipt(receipt, selectedRoute) {
  const state = token(receipt?.completion_evidence?.state || receipt?.route_state) || 'selected';
  const actualRoute = token(receipt?.actual?.route_id || receipt?.actual?.route);
  if ((state === 'substituted') || (selectedRoute && actualRoute && selectedRoute !== actualRoute)) return 'substituted';
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'recommendation_only' || state === 'ignored' || state === 'paused') return 'ignored';
  if (state === 'rejected' || state === 'blocked' || state === 'quarantined') return 'rejected';
  return 'selected';
}

function classifyShadow(row) {
  const outcome = SHADOW_OUTCOMES.has(row?.outcome) ? row.outcome : null;
  if (outcome === 'accepted') return 'accepted';
  if (outcome === 'rejected') return 'rejected';
  if (outcome === 'no_signal') return 'ignored';
  return null;
}

function buildRuntimeReport(root) {
  const router = join(root, 'router');
  const telemetryRows = [];
  const telemetry = readJsonl(join(router, 'telemetry.jsonl'), (row) => telemetryRows.push(row));
  const shadowBySuggestion = new Map();
  const shadowOutcomeCounts = {};
  const shadow = readJsonl(join(router, 'shadow-log.jsonl'), (row) => {
    const outcome = SHADOW_OUTCOMES.has(row.outcome) ? row.outcome : 'unknown';
    count(shadowOutcomeCounts, outcome);
    const sid = suggestionId(row);
    if (sid) shadowBySuggestion.set(sid, row);
  });
  const receipts = buildReceiptIndex(join(router, 'receipts', 'receipts.jsonl'));
  const healthOutcomeCounts = {};
  const healthRoutes = new Set();
  const health = readJsonl(join(router, 'health', 'outcomes.jsonl'), (row) => {
    count(healthOutcomeCounts, row.outcome_kind);
    const route = token(row.route_id);
    if (route) healthRoutes.add(route);
  });
  const auditOutcomeCounts = {};
  const audit = readJsonl(join(router, 'audit.jsonl'), (row) => count(auditOutcomeCounts, row.outcome));
  const graphStatusCounts = {};
  const outcomeCounts = newOutcomeCounts();
  let selectedRecords = 0;
  let routeAnchorRecords = 0;
  let outcomeNullRecords = 0;
  let downstreamNullRecords = 0;
  let receiptLinkedRecords = 0;
  let shadowLinkedRecords = 0;
  let healthLinkedRecords = 0;
  let graphMissingCount = 0;
  const receiptIds = new Set();
  for (const row of telemetryRows) {
    const capability = selectedCapability(row);
    const sid = suggestionId(row);
    const rid = token(row.route_id);
    if (rid) routeAnchorRecords += 1;
    const receipt = (sid && receipts.bySuggestion.get(sid)) || (rid && receipts.byRoute.get(rid)) || null;
    const shadowRow = sid ? shadowBySuggestion.get(sid) : null;
    const classification = receipt ? classifyReceipt(receipt, rid) : classifyShadow(shadowRow) || (capability ? 'selected' : 'ignored');
    count(outcomeCounts, classification);
    if (capability) selectedRecords += 1;
    if (row.outcome === null || row.outcome === undefined) outcomeNullRecords += 1;
    if (row.downstream_invocations === null || row.downstream_invocations === undefined) downstreamNullRecords += 1;
    if (receipt) {
      receiptLinkedRecords += 1;
      if (receipt.receipt_id) receiptIds.add(receipt.receipt_id);
    }
    if (shadowRow) shadowLinkedRecords += 1;
    if (rid && healthRoutes.has(rid)) healthLinkedRecords += 1;
    if (GRAPH_STATUSES.has(row.graph_status)) count(graphStatusCounts, row.graph_status);
    else count(graphStatusCounts, 'unknown');
    if (row.graph_status === 'graph_missing') graphMissingCount += 1;
  }
  const graphMissing = graphMissingCount > 0
    ? {
      count: graphMissingCount,
      state: 'open',
      reason_code: 'local_graph_unavailable',
      remediation: 'provide_local_graph_or_mark_not_applicable',
    }
    : {
      count: 0,
      state: 'resolved',
      reason_code: 'local_graph_available_or_not_required',
      remediation: 'none',
    };
  return {
    telemetry: {
      exists: telemetry.exists,
      records: telemetry.records,
      malformed_lines: telemetry.malformed_lines,
      selected_records: selectedRecords,
      route_anchor_records: routeAnchorRecords,
      outcome_null_records: outcomeNullRecords,
      downstream_invocations_null_records: downstreamNullRecords,
      graph_status_counts: graphStatusCounts,
    },
    shadow: {
      exists: shadow.exists,
      records: shadow.records,
      malformed_lines: shadow.malformed_lines,
      outcome_counts: shadowOutcomeCounts,
    },
    receipts: {
      exists: receipts.log.exists,
      records: receipts.log.records,
      malformed_lines: receipts.log.malformed_lines,
      state_counts: receipts.stateCounts,
      latest_state_counts: receipts.latestStateCounts,
      route_linked_records: receipts.byRoute.size,
      native_identity_records: receipts.nativeIdentityRecords,
      runtime_identity_records: receipts.runtimeMatchRecords,
      verified_completion_records: receipts.verifiedCompletionRecords,
    },
    health: {
      exists: health.exists,
      records: health.records,
      malformed_lines: health.malformed_lines,
      outcome_kind_counts: healthOutcomeCounts,
    },
    audit: {
      exists: audit.exists,
      records: audit.records,
      malformed_lines: audit.malformed_lines,
      outcome_counts: auditOutcomeCounts,
    },
    correlation: {
      outcome_counts: outcomeCounts,
      receipt_linked_records: receiptLinkedRecords,
      shadow_linked_records: shadowLinkedRecords,
      health_linked_records: healthLinkedRecords,
      receipt_ids_observed: receiptIds.size,
    },
    graph: {
      status_counts: graphStatusCounts,
      graph_missing: graphMissing,
    },
  };
}

export function buildObservabilityReport({ claudeRoot, codexRoot, capturedAt = new Date().toISOString() } = {}) {
  if (!claudeRoot || !codexRoot) throw new TypeError('claudeRoot and codexRoot are required');
  return {
    schema_version: 'v19-observability-v1',
    captured_at: capturedAt,
    privacy: {
      raw_prompt: false,
      raw_jsonl_lines: false,
      raw_commands: false,
      raw_stdout: false,
      raw_cwd: false,
    },
    runtimes: {
      claude: buildRuntimeReport(resolve(claudeRoot)),
      codex: buildRuntimeReport(resolve(codexRoot)),
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(help()); return; }
  if (!args['claude-root'] || !args['codex-root'] || !args.output) throw new Error('claude-root, codex-root, and output are required');
  const claudeRoot = resolve(args['claude-root']);
  const codexRoot = resolve(args['codex-root']);
  const output = resolve(args.output);
  for (const [name, path] of [['claude-root', claudeRoot], ['codex-root', codexRoot]]) {
    if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${name} must be an existing directory`);
  }
  if (!existsSync(dirname(output)) || !statSync(dirname(output)).isDirectory()) throw new Error('output parent must exist');
  const report = buildObservabilityReport({ claudeRoot, codexRoot });
  const temporary = `${output}.tmp.${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, output);
  process.stdout.write(`${JSON.stringify({ status: 'ready', schema_version: report.schema_version })}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
