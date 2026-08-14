#!/usr/bin/env node

import {
  createNativeInventorySubject,
  runV21Benchmark,
  ROUTING_MODES,
} from '../src/evaluation/v21.mjs';

const RUNTIMES = ['claude', 'codex'];

class ArgumentError extends Error {}

function selection(value, allowed, all) {
  if (value === all) return [...allowed];
  if (allowed.includes(value)) return [value];
  throw new ArgumentError('unsupported benchmark selection');
}

function parseArgs(args) {
  const result = { runtimes: RUNTIMES, routingModes: ROUTING_MODES, native: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--native') {
      result.native = true;
      continue;
    }
    if (arg === '--runtime' || arg === '--mode') {
      const value = args[++index];
      if (!value) throw new ArgumentError('missing benchmark selection');
      if (arg === '--runtime') result.runtimes = selection(value, RUNTIMES, 'both');
      else result.routingModes = selection(value, ROUTING_MODES, 'all');
      continue;
    }
    throw new ArgumentError('unsupported benchmark argument');
  }
  return result;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const report = await runV21Benchmark({
    runtimes: options.runtimes,
    routingModes: options.routingModes,
    nativeSubject: options.native ? createNativeInventorySubject() : null,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.status === 'passed' ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    status: 'error',
    reason_code: error instanceof ArgumentError ? 'invalid_benchmark_arguments' : 'benchmark_execution_failed',
  })}\n`);
  process.exitCode = error instanceof ArgumentError ? 2 : 1;
}
