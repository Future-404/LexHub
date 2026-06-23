/**
 * LexHub Runtime Starter
 *
 * This script is spawned by ProcessManager as:
 *   node starter.js <moduleDir>
 *
 * It imports the module's lifecycle.js, calls start(ctx),
 * and keeps the process alive as long as the child is running.
 */

import path from 'path';
import fs from 'fs';
import { ModuleManager } from '../manager/module.js';

const moduleDir = process.argv[2];

if (!moduleDir) {
  console.error('[LexHub Starter] ERROR: No module directory provided.');
  process.exit(1);
}

async function main() {
  const lifecyclePath = path.join(moduleDir, 'lifecycle.js');
  let lifecycle;
  try {
    lifecycle = await import(lifecyclePath);
  } catch (err: any) {
    console.error(`[LexHub Starter] Failed to load lifecycle.js: ${err.message}`);
    process.exit(1);
  }

  if (typeof lifecycle.start !== 'function') {
    console.error('[LexHub Starter] lifecycle.js must export a start() function.');
    process.exit(1);
  }

  const metaPath = path.join(moduleDir, 'lexhub-module.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const ctx = ModuleManager.buildContext(meta, moduleDir);

  try {
    const child = await lifecycle.start(ctx);
    if (child && typeof child.on === 'function') {
      child.stdout?.pipe(process.stdout);
      child.stderr?.pipe(process.stderr);

      // Forward signals to child process to ensure graceful exit
      const forwardSignal = (sig: NodeJS.Signals) => {
        try {
          child.kill(sig);
        } catch {}
      };
      process.on('SIGTERM', () => forwardSignal('SIGTERM'));
      process.on('SIGINT', () => forwardSignal('SIGINT'));

      await new Promise<void>((resolve) => {
        child.on('exit', (code: number | null, signal: string | null) => {
          if (code !== null) {
            process.exit(code);
          } else if (signal) {
            process.exit(1);
          } else {
            process.exit(0);
          }
          resolve();
        });
      });
    }
  } catch (err: any) {
    console.error(`[LexHub Starter] start() threw an error: ${err.message}`);
    process.exit(1);
  }
}

main();
