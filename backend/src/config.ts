import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(backendDir, '..');

function resolveExistingPath(value: string | undefined, fallbackCandidates: string[]): string {
  const raw = value?.trim();
  const candidates: string[] = [];

  if (raw && raw.length > 0) {
    if (isAbsolute(raw)) {
      candidates.push(raw);
    } else {
      candidates.push(resolve(process.cwd(), raw));
      candidates.push(resolve(backendDir, raw));
      candidates.push(resolve(projectRoot, raw));
    }
  }

  candidates.push(...fallbackCandidates);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0] ?? fallbackCandidates[0];
}

export const config = {
  DISCORD_TOKEN: requireEnv('DISCORD_TOKEN'),
  API_TOKEN: requireEnv('API_TOKEN'),
  API_PORT: parseInt(process.env['API_PORT'] ?? '3000', 10),
  PIPER_BIN: resolveExistingPath(process.env['PIPER_BIN'], [
    resolve(backendDir, 'piper', 'piper.exe'),
    resolve(projectRoot, 'bin', 'piper', 'piper.exe'),
  ]),
  VOICES_DIR: resolveExistingPath(process.env['VOICES_DIR'], [
    resolve(backendDir, 'voices'),
    resolve(projectRoot, 'voices'),
  ]),
  CORS_ORIGIN: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
  GUILD_ID: process.env['GUILD_ID'] ?? '',
};
