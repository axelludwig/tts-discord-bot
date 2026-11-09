#!/usr/bin/env node
// Runs the API (tsx watch) and the dashboard (Vite) together, on any OS.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tasks = [
  { name: 'api', color: 34, cwd: join(root, 'backend') },
  { name: 'ui', color: 35, cwd: join(root, 'frontend') },
];

const children = tasks.map(({ name, color, cwd }) => {
  const child = spawn('npm', ['run', 'dev'], { cwd, shell: process.platform === 'win32' });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const forward = out => chunk => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line) out.write(prefix + line + '\n');
  };
  child.stdout.on('data', forward(process.stdout));
  child.stderr.on('data', forward(process.stderr));
  child.on('exit', code => {
    console.log(`${prefix}exited (${code ?? 'signal'})`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // On Windows, npm runs under cmd.exe: kill the whole tree.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
