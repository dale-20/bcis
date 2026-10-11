import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

export function electronViteEnvironment(environment) {
  const result = { ...environment };
  delete result.ELECTRON_RUN_AS_NODE;
  return result;
}

const require = createRequire(import.meta.url);
const electronViteEntry = require.resolve('electron-vite');
const electronViteCli = resolve(dirname(electronViteEntry), '../bin/electron-vite.js');
const child = spawn(process.execPath, [electronViteCli, ...process.argv.slice(2)], {
  env: electronViteEnvironment(process.env),
  stdio: 'inherit',
});

child.once('error', (error) => {
  process.stderr.write(`Unable to start electron-vite: ${error.message}\n`);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
