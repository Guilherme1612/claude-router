import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';
import { canonicalizeCapability, stableStringify } from '../../src/registry/schema.mjs';

export const syntheticRoots = Object.freeze({
  home: 'fixture_home',
  project: 'fixture_project',
  worktree: 'fixture_worktree',
});

export const mutationPlayback = Object.freeze([
  'add',
  'edit',
  'rename',
  'move',
  'disable',
  'replace',
  'dependency-loss',
  'removal',
]);

export const recommendationKinds = Object.freeze([
  'command', 'skill', 'agent', 'workflow', 'mcp', 'tool',
]);

function scenarioObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function scenarioFiles(runtime, key) {
  const value = runtime[key] ?? (key === 'projectFiles' ? [] : undefined);
  if (!Array.isArray(value)) throw new TypeError(`${key} must be an array`);
  return value.map((entry, index) => {
    scenarioObject(entry, `${key}[${index}]`);
    const path = entry.path;
    const normalized = typeof path === 'string' ? posix.normalize(path) : '';
    if (!path || path.includes('\\') || isAbsolute(path) || win32.isAbsolute(path)
      || normalized !== path || normalized === '.' || path.split('/').includes('..')) {
      throw new TypeError(`${key}[${index}].path must be a relative normalized path`);
    }
    if (typeof entry.content !== 'string') throw new TypeError(`${key}[${index}].content must be a string`);
    return { path, content: entry.content };
  });
}

export async function materializeRuntimeInventoryScenario(scenarioOrPath) {
  const scenario = scenarioObject(typeof scenarioOrPath === 'string'
    ? JSON.parse(await readFile(scenarioOrPath, 'utf8'))
    : scenarioOrPath, 'scenario');
  const claude = scenarioObject(scenario.claude, 'claude');
  const codex = scenarioObject(scenario.codex, 'codex');
  const files = {
    claude: scenarioFiles(claude, 'files'),
    codex: scenarioFiles(codex, 'files'),
    claudeProject: scenarioFiles(claude, 'projectFiles'),
    codexProject: scenarioFiles(codex, 'projectFiles'),
  };

  const root = await mkdtemp(join(tmpdir(), 'router-v18-inventory-'));
  const claudeRoot = join(root, 'claude');
  const codexRoot = join(root, 'codex');
  const projectRoot = files.claudeProject.length || files.codexProject.length ? join(root, 'project') : null;
  const cleanup = () => rm(root, { recursive: true, force: true });
  const writeEntries = async (base, entries) => {
    for (const entry of entries) {
      const target = resolve(base, entry.path);
      const fromBase = relative(base, target);
      if (fromBase === '..' || fromBase.startsWith(`..${sep}`) || isAbsolute(fromBase)) {
        throw new TypeError('scenario path escapes its runtime root');
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, entry.content, 'utf8');
    }
  };

  try {
    await mkdir(claudeRoot, { recursive: true });
    await mkdir(codexRoot, { recursive: true });
    await writeEntries(claudeRoot, files.claude);
    await writeEntries(codexRoot, files.codex);
    if (projectRoot) {
      await writeEntries(join(projectRoot, '.claude'), files.claudeProject);
      await writeEntries(join(projectRoot, '.codex'), files.codexProject);
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  return { claudeRoot, codexRoot, ...(projectRoot ? { projectRoot } : {}), cleanup };
}

function record(name, overrides = {}) {
  const runtime = overrides.runtime || 'claude';
  const scope = overrides.scope || { kind: 'global' };
  const nativeType = overrides.native_type || `${runtime}:skill`;
  return {
    schema_version: 1,
    type: 'skill',
    native_type: nativeType,
    semantic_type: overrides.semantic_type || 'skill',
    lifecycle: 'ready',
    lifecycle_role: overrides.lifecycle_role || 'invocable',
    name,
    scope,
    enabled: overrides.enabled ?? true,
    dispatchable: overrides.dispatchable ?? true,
    invocation: overrides.invocation || {
      availability: 'available',
      runtime,
      command: 'Skill',
      args: [name],
    },
    dependencies: overrides.dependencies || { state: 'unknown', items: [] },
    provenance: [{
      runtime,
      scope: scope.kind,
      logical_root: scope.kind === 'global' ? syntheticRoots.home : syntheticRoots.project,
      relative_path: `capabilities/${name}/manifest.md`,
      source_fingerprint: `fixture-${name}`,
      adapter: `${runtime}@fixture`,
      parser: 'frontmatter@fixture',
    }],
    adapter_evidence: [{
      namespace: runtime,
      native_type: nativeType,
      adapter: `${runtime}@fixture`,
      parser: 'frontmatter@fixture',
    }],
    runtime_variants: [{ runtime, native_identity: name, native: { fixture: true } }],
    conflicts: [],
    diagnostics: [],
    ...overrides,
  };
}

export function buildLargeMixedProfile(size = 312) {
  if (!Number.isSafeInteger(size) || size < 300) {
    throw new TypeError('large fixture size must be an integer of at least 300');
  }
  return Array.from({ length: size }, (_, index) => {
    const kind = recommendationKinds[index % recommendationKinds.length];
    const runtime = index % 2 === 0 ? 'claude' : 'codex';
    const semanticType = kind === 'workflow' ? 'skill' : kind === 'mcp' ? 'tool' : kind;
    const name = `p${index.toString(36).padStart(3, '0')}`;
    return record(name, {
      runtime,
      type: semanticType,
      native_type: `${runtime}:${kind}`,
      semantic_type: semanticType,
      invocation: { availability: 'available', runtime, command: kind, args: [name] },
      dependencies: { state: 'declared', items: [] },
      ...(index < recommendationKinds.length
        ? { mapping: { explicit_subjects: [`phase26-${kind}`] } }
        : {}),
    });
  });
}

export function buildClaudeHeavyProfile() {
  return [
    record('atlas'),
    record('beacon'),
    record('cairn', { native_type: 'claude:agent', semantic_type: 'agent' }),
    record('dock', {
      native_type: 'claude:instructions',
      semantic_type: 'instruction',
      lifecycle_role: 'instruction',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'inert-artifact' },
    }),
  ];
}

export function buildCodexHeavyProfile() {
  return [
    record('ember', { runtime: 'codex', native_type: 'codex:skill' }),
    record('flint', { runtime: 'codex', native_type: 'codex:agent', semantic_type: 'agent' }),
    record('grove', {
      runtime: 'codex',
      native_type: 'codex:config',
      semantic_type: 'configuration',
      lifecycle_role: 'configuration',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'inert-artifact' },
    }),
  ];
}

export function buildMixedCustomProfile() {
  return [
    record('harbor'),
    record('islet', { runtime: 'codex', native_type: 'codex:tool', semantic_type: 'tool' }),
    record('junction', {
      native_type: 'vendor.example:bundle',
      semantic_type: 'container',
      lifecycle_role: 'container',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'container-only' },
      container_id: 'vendor.example:bundle:junction',
    }),
  ];
}

export function buildUnknownFutureProfile() {
  return [
    record('keystone', {
      native_type: 'future.runtime:oracle',
      semantic_type: 'unknown',
      lifecycle_role: 'opaque',
      dispatchable: false,
      invocation: { availability: 'unavailable', reason: 'unknown-semantic-type' },
    }),
  ];
}

export function playbackMutation(profile, mutation, mutate = value => value) {
  if (!mutationPlayback.includes(mutation)) throw new TypeError(`unknown fixture mutation: ${mutation}`);
  return mutate(structuredClone(profile), mutation);
}

export function assertSemanticBytesEqual(left, right) {
  const bytes = value => stableStringify(value.map(canonicalizeCapability)
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))));
  assert.equal(bytes(left), bytes(right));
}

export function contractEvidence(record, variant = 'accepted') {
  const structural = {
    purpose: record.name,
    triggers: [record.name],
    inputs: [],
    outputs: [],
    preconditions: [],
    dependencies: record.dependencies.items.map(item => item.id),
    permissions: [],
    side_effects: [],
    reversibility: 'unknown',
    risk: 'unknown',
    invocation_kind: record.invocation.availability === 'available' ? record.semantic_type : 'none',
    lifecycle_role: record.lifecycle_role,
    scope: record.scope,
    workflow_transitions: [],
    action: record.invocation.availability === 'available' ? 'invoke' : 'none',
    cost: 'unknown',
    completion: { evidence_type: 'exit_code' },
    native_invocation: { runtime: record.invocation.runtime || 'unknown' },
    authority: 'advice',
  };
  const evidence = Object.fromEntries(Object.entries(structural).map(([field, value]) => [field, [{
    value,
    provenance: 'adapter',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    rule: `adapter-${field}-v1`,
  }]]));
  if (variant === 'missing') evidence.invocation_kind = [];
  if (variant === 'conflicting') evidence.invocation_kind.push({
    value: 'command',
    provenance: 'authored',
    confidence_basis_points: 9000,
    freshness: 'fresh',
    rule: 'authored-invocation-kind-v1',
  });
  if (variant === 'stale') evidence.invocation_kind[0].freshness = 'stale';
  if (variant === 'below-threshold') evidence.invocation_kind[0].confidence_basis_points = 8499;
  if (variant === 'rejected') evidence.purpose.push({
    value: 'SECRET=/Users/example/private authored body',
    provenance: 'authored',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    rule: 'authored-purpose-v1',
  });
  if (variant === 'workflow-transitions') {
    evidence.workflow_transitions[0].value = ['gsd.execute'];
  }
  if (variant === 'declared-safe') {
    evidence.side_effects[0].value = ['none'];
    evidence.reversibility[0].value = 'reversible';
    evidence.risk[0].value = 'low';
  }
  if (variant === 'unknown-effects') evidence.side_effects = [];
  if (variant === 'unknown-authority') evidence.authority = [];
  if (variant === 'unknown-dependencies') evidence.dependencies = [];
  if (variant === 'unknown-risk') evidence.risk = [];
  if (![
    'accepted', 'missing', 'conflicting', 'stale', 'below-threshold', 'rejected',
    'workflow-transitions', 'declared-safe', 'unknown-effects', 'unknown-authority',
    'unknown-dependencies', 'unknown-risk',
  ].includes(variant)) {
    throw new TypeError(`unknown contract evidence variant: ${variant}`);
  }
  return evidence;
}
