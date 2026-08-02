import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('concurrent hook processes preserve every evolution trigger increment', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-evolve-trigger-'));
  try {
    const hook = join(root, 'router.mjs');
    const trigger = join(root, '.evolve-trigger');
    writeFileSync(hook, readFileSync(new URL('./router.mjs.snapshot', import.meta.url)));
    writeFileSync(join(root, 'router.evolve.mjs'), readFileSync(new URL('./router.evolve.mjs.snapshot', import.meta.url)));
    writeFileSync(trigger, '0');
    const code = `const m=await import(${JSON.stringify(pathToFileURL(hook).href)});m.bumpEvolveTrigger({triggerPath:${JSON.stringify(trigger)},workerPath:${JSON.stringify(join(root, 'unused.mjs'))}});`;
    const count = 24;
    await Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' });
      child.once('exit', status => status === 0 ? resolve() : reject(new Error(`child exited ${status}`)));
      child.once('error', reject);
    })));
    assert.equal(Number(readFileSync(trigger, 'utf8')), count);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
