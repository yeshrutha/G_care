import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];
let stopping = false;

function start(command, args) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  children.push(child);
  child.on('exit', (code, signal) => {
    if (!stopping && (code !== 0 || signal)) {
      console.error(`\n${command} stopped unexpectedly.`);
      stop(code || 1);
    }
  });
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

start(process.execPath, ['server.js']);
start(process.execPath, [viteEntry]);
