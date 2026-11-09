import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStaticModule from 'ffmpeg-static';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Works from both src/ (tsx) and dist/ (compiled): both sit one level below backend/.
export const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(backendDir, '..');

// Load backend/.env whatever the current working directory is.
dotenv.config({ path: resolve(backendDir, '.env') });

const PIPER_EXE = process.platform === 'win32' ? 'piper.exe' : 'piper';

/** Resolves a user-supplied path against cwd, backend/ and the repo root; falls back to defaults. */
function resolvePath(value: string | undefined, fallback: string): string {
  const raw = value?.trim();
  if (!raw) return fallback;
  if (isAbsolute(raw)) return raw;

  const candidates = [process.cwd(), backendDir, projectRoot].map(base => resolve(base, raw));
  const found = candidates.find(existsSync);
  if (found) return found;
  if (existsSync(fallback)) {
    console.warn(`[config] "${raw}" not found, using default ${fallback}`);
    return fallback;
  }
  return candidates[0];
}

// ffmpeg-static is CommonJS (module.exports = path) but its types declare an ESM default export.
const ffmpegStatic = ffmpegStaticModule as unknown as string | null;

function resolveFfmpeg(): string {
  const fromEnv = process.env['FFMPEG_BIN']?.trim();
  if (fromEnv) return fromEnv;
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  return 'ffmpeg'; // rely on PATH
}

export const config = {
  DISCORD_TOKEN: requireEnv('DISCORD_TOKEN'),
  API_TOKEN: requireEnv('API_TOKEN'),
  API_PORT: intEnv('API_PORT', 3000),
  GUILD_ID: process.env['GUILD_ID'] ?? '',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',

  PIPER_BIN: resolvePath(process.env['PIPER_BIN'], resolve(backendDir, 'piper', PIPER_EXE)),
  VOICES_DIR: resolvePath(process.env['VOICES_DIR'], resolve(backendDir, 'voices')),
  FFMPEG_BIN: resolveFfmpeg(),
  DASHBOARD_DIR: resolve(projectRoot, 'frontend', 'dist'),
  SETTINGS_FILE: resolve(backendDir, process.env['SETTINGS_FILE']?.trim() || 'data/settings.json'),

  /** Voice used when neither the request nor the user's /voix preference picks one. */
  DEFAULT_VOICE: process.env['DEFAULT_VOICE']?.trim() || 'fr_FR-siwis-medium',
  /**
   * Reading a text channel aloud needs the privileged "Message Content" intent.
   * Off by default: enabling it without ticking the box in the Developer Portal makes login fail.
   */
  ENABLE_TEXT_CHANNEL: process.env['ENABLE_TEXT_CHANNEL'] === 'true',

  MAX_QUEUE_LENGTH: intEnv('MAX_QUEUE_LENGTH', 20),
  MAX_TEXT_LENGTH: intEnv('MAX_TEXT_LENGTH', 500),
};
