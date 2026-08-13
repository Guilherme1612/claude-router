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

function capabilities(root) {
  if (!root) return [];
  try {
    const value = JSON.parse(readFileSync(join(root, 'capabilities.json'), 'utf8'));
    return Array.isArray(value?.capabilities) ? value.capabilities.slice(0, 128) : [];
  } catch {
    return [];
  }
}

function capabilityCount(root) {
  return capabilities(root).length;
}

function safeId(value) {
  return bounded(value, 128)?.replace(/[^A-Za-z0-9._:@/-]/g, '_') || null;
}

function selectCapability(root, prompt) {
  if (!root || typeof prompt !== 'string') return null;
  const tokens = new Set(prompt.toLowerCase().match(/[a-z0-9][a-z0-9._:@/-]*/g) || []);
  const activeRuntime = runtime();
  const candidates = capabilities(root).flatMap(capability => {
    const id = safeId(capability?.id || capability?.name);
    const keywords = Array.isArray(capability?.keywords) ? capability.keywords : [];
    const runtimes = Array.isArray(capability?.runtimes) ? capability.runtimes : [];
    if (!id || capability?.enabled === false || (runtimes.length && !runtimes.includes(activeRuntime)) || !keywords.length) return [];
    const score = keywords.reduce((total, keyword) => {
      const token = bounded(keyword, 128)?.toLowerCase();
      return token && [...tokens].some(candidate => candidate === token || candidate.includes(token)) ? total + 1 : total;
    }, 0);
    return score ? [{ id, score }] : [];
  });
  candidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return candidates[0] || null;
}

function status(root) {
  const count = capabilityCount(root);
  return {
    done: 'neutral runtime active',
    current: count ? `explicit neutral capability manifest loaded (${count})` : 'safe pass-through active',
    blocked: count ? 'none recorded' : 'no explicit neutral capability manifest registered',
    next: count ? 'owner-controlled capability selection remains available' : 'register capabilities.json only if adaptive selection is needed',
    route: 'pass_through',
    owner_action: count ? 'choose_or_override_route' : 'register_capabilities_if_needed',
  };
}

function appendEvent(root, payload, event, route) {
  if (!root) return;
  const record = {
    ts: new Date().toISOString(),
    event,
    runtime: runtime(),
    session_id_hash: bounded(payload?.session_id, 256) ? digest(payload.session_id) : null,
    cwd_hash: bounded(payload?.cwd, 1024) ? digest(payload.cwd) : null,
    prompt_hash: bounded(payload?.prompt, 4096) ? digest(payload.prompt) : null,
    route: route?.id || 'pass_through',
    capability_count: capabilityCount(root),
  };
  try {
    mkdirSync(root, { recursive: true });
    appendFileSync(join(root, 'events.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch { /* lifecycle hooks are fail-open */ }
}

function briefing(event, root) {
  const current = status(root);
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
  const route = selectCapability(root, payload.prompt);
  appendEvent(root, payload, event, route);
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
      additionalContext: briefing(event, root),
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
