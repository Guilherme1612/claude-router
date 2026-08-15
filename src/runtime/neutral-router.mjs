import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CONTEXT_BYTES = 2048;
const RUNTIMES = new Set(['claude', 'codex']);

function bounded(value, max = 256) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function digest(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function safeStateRoot(value) {
  if (!isAbsolute(String(value || ''))) return null;
  const root = resolve(value);
  if (root.split('/').includes('.router')) return null;
  return root;
}

function stateRoot() {
  return safeStateRoot(process.env.ROUTER_STATE_ROOT);
}

function runtime() {
  return RUNTIMES.has(process.env.ROUTER_RUNTIME) ? process.env.ROUTER_RUNTIME : 'unknown';
}

function words(value, max = 256) {
  return bounded(value, max)?.normalize('NFKC').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function capabilities(root) {
  if (!root) return [];
  try {
    const value = JSON.parse(readFileSync(join(root, 'capabilities.json'), 'utf8'));
    const records = Array.isArray(value?.capabilities) ? value.capabilities : value?.records;
    return Array.isArray(records) ? records.slice(0, 128) : [];
  } catch {
    return [];
  }
}

function safeId(value) {
  return bounded(value, 128)?.replace(/[^A-Za-z0-9._:@/-]/g, '_') || null;
}

function dispatchable(capability) {
  const invocation = capability?.invocation;
  const authority = capability?.authority;
  const authorityObject = typeof authority === 'object' && authority;
  const authorityEvidence = authorityObject ? authority.kind || authority.ceiling : authority;
  const evidence = authorityObject ? authority.evidence || authority.evidence_class : null;
  const authorityKnown = authorityObject
    ? authority.kind
      ? bounded(authority.kind, 128) && (!('evidence' in authority || 'evidence_class' in authority)
        || (bounded(evidence, 64) && evidence !== 'unknown'))
      : bounded(authority.ceiling, 128) && bounded(evidence, 64) && evidence !== 'unknown'
    : bounded(authority, 128);
  return capability?.state === 'dispatchable'
    && capability?.dispatchable === true
    && bounded(invocation?.method || invocation?.kind, 64)
    && bounded(invocation?.target || invocation?.command, 128)
    && bounded(authorityEvidence, 128)
    && authorityKnown;
}

function selectCapability(records, prompt) {
  if (!Array.isArray(records) || typeof prompt !== 'string') return null;
  const tokens = new Set(words(prompt, 4096));
  const activeRuntime = runtime();
  if (activeRuntime === 'unknown') return null;
  const candidates = records.flatMap(capability => {
    const id = safeId(capability?.id || capability?.stable_id || capability?.name);
    const relationships = capability?.relationships && typeof capability.relationships === 'object'
      ? capability.relationships
      : {};
    const runtimes = [
      ...(Array.isArray(capability?.runtimes) ? capability.runtimes : []),
      capability?.runtime,
    ].filter(Boolean).map(value => bounded(value, 32)?.toLowerCase()).filter(Boolean);
    const signals = [
      capability?.id, capability?.name, capability?.command, capability?.agent, capability?.skill,
      capability?.keywords, capability?.aliases, capability?.role, capability?.roles,
      relationships.aliases, relationships.equivalents,
    ].flat(Infinity).filter(value => typeof value === 'string');
    if (!id || !dispatchable(capability) || capability?.enabled === false || (runtimes.length && !runtimes.includes(activeRuntime)) || !signals.length) return [];
    const score = signals.reduce((total, signal) => {
      const signalWords = words(signal, 128);
      const overlap = signalWords.filter(token => tokens.has(token)).length;
      if (!overlap) return total;
      return total + (overlap === signalWords.length ? 4 + signalWords.length : overlap);
    }, 0);
    return score ? [{ id, score }] : [];
  });
  candidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return candidates[0] || null;
}

function status(records) {
  const count = Array.isArray(records) ? records.length : 0;
  const dispatchableCount = (Array.isArray(records) ? records : []).filter(dispatchable).length;
  return {
    done: 'neutral runtime active',
    current: count ? `explicit neutral capability manifest loaded (${count}; dispatchable=${dispatchableCount})` : 'safe pass-through active',
    blocked: dispatchableCount ? 'none recorded' : 'no dispatchable capability with invocation and authority evidence registered',
    next: dispatchableCount ? 'owner-controlled capability selection remains available' : 'register a neutral descriptor with explicit dispatchability, invocation, and authority evidence',
    route: 'pass_through',
    owner_action: count ? 'choose_or_override_route' : 'register_capabilities_if_needed',
  };
}

function appendEvent(root, payload, event, route, records) {
  if (!root) return;
  const record = {
    ts: new Date().toISOString(),
    event,
    runtime: runtime(),
    session_id_hash: bounded(payload?.session_id, 256) ? digest(payload.session_id) : null,
    cwd_hash: bounded(payload?.cwd, 1024) ? digest(payload.cwd) : null,
    prompt_hash: bounded(payload?.prompt, 4096) ? digest(payload.prompt) : null,
    route: route?.id || 'pass_through',
    capability_count: Array.isArray(records) ? records.length : 0,
    dispatchable_count: (Array.isArray(records) ? records : []).filter(dispatchable).length,
  };
  try {
    mkdirSync(root, { recursive: true });
    appendFileSync(join(root, 'events.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch { /* lifecycle hooks are fail-open */ }
}

function briefing(event, records) {
  const current = status(records);
  const output = [
    `<!-- router-neutral event=${event} -->`,
    `Done: ${current.done}.`,
    `Current: ${current.current}.`,
    `Blocked: ${current.blocked}.`,
    `Next: ${current.next}.`,
    `Route: ${current.route}.`,
    `Owner action: ${current.owner_action}.`,
  ].join('\n');
  return output.slice(0, MAX_CONTEXT_BYTES);
}

export function handle(payload = {}) {
  const event = bounded(payload.hook_event_name, 64) || 'UserPromptSubmit';
  const root = stateRoot();
  const records = capabilities(root);
  const route = selectCapability(records, payload.prompt);
  appendEvent(root, payload, event, route, records);
  if (event === 'UserPromptSubmit' && route) {
    return { hookSpecificOutput: {
      hookEventName: event,
      additionalContext: `<!-- router-neutral route=${route.id} selection=explicit owner-controlled -->`,
    } };
  }
  if (!['SessionStart', 'Stop', 'PreCompact'].includes(event)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: briefing(event, records),
    },
  };
}

function isMain() {
  try {
    return process.argv[1] && (resolve(process.argv[1]) === fileURLToPath(import.meta.url)
      || process.argv[1].endsWith('/router-neutral.mjs'));
  } catch {
    return false;
  }
}

if (isMain()) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(input || '{}'); } catch { payload = {}; }
    const output = handle(payload);
    if (output) process.stdout.write(JSON.stringify(output));
  });
}
