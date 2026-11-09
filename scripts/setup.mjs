#!/usr/bin/env node
// One-shot setup, identical on Windows / Linux / macOS:
//   npm run setup                       -> deps + Piper + default voice + backend/.env
//   npm run setup -- fr_FR-tom-medium   -> also download extra voices
//   npm run setup -- --force            -> re-download Piper
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'backend');
const frontend = join(root, 'frontend');

const PIPER_RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const VOICES_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';
const DEFAULT_VOICES = ['fr_FR-siwis-medium'];

const PIPER_ASSETS = {
  'win32-x64': 'piper_windows_amd64.zip',
  'linux-x64': 'piper_linux_x86_64.tar.gz',
  'linux-arm64': 'piper_linux_aarch64.tar.gz',
  'darwin-x64': 'piper_macos_x64.tar.gz',
  'darwin-arm64': 'piper_macos_aarch64.tar.gz',
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const skipInstall = args.includes('--no-install');
const extraVoices = args.filter(a => !a.startsWith('--'));

const step = msg => console.log(`\n\x1b[36m==>\x1b[0m ${msg}`);
const fail = msg => { console.error(`\x1b[31m✗ ${msg}\x1b[0m`); process.exit(1); };

function run(cmd, cmdArgs, cwd) {
  // shell is needed on Windows to resolve npm.cmd
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(' ')} failed (in ${cwd})`);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) fail(`Download failed (${res.status}): ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// ---------------------------------------------------------------------------

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) fail(`Node.js >= 20 required (found ${process.version})`);

if (!skipInstall) {
  step('Installing backend dependencies');
  run('npm', ['install'], backend);
  step('Installing frontend dependencies');
  run('npm', ['install'], frontend);
}

// --- Piper -----------------------------------------------------------------
const platformKey = `${process.platform}-${process.arch}`;
const asset = PIPER_ASSETS[platformKey];
const piperDir = join(backend, 'piper');
const piperBin = join(piperDir, process.platform === 'win32' ? 'piper.exe' : 'piper');

step(`Piper (${platformKey})`);
if (!asset) {
  console.warn(`No Piper build for ${platformKey}. Install it manually and set PIPER_BIN in backend/.env.`);
} else if (existsSync(piperBin) && !force) {
  console.log(`already installed: ${piperBin}`);
} else {
  const archive = join(tmpdir(), asset);
  console.log(`downloading ${asset}…`);
  await download(`${PIPER_RELEASE}/${asset}`, archive);
  rmSync(piperDir, { recursive: true, force: true });
  // tar ships with Windows 10+ (bsdtar, reads .zip too) and every Linux/macOS.
  // On Windows, use System32's bsdtar explicitly: Git Bash's GNU tar can't read zips.
  const tar = process.platform === 'win32'
    ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const r = spawnSync(tar, ['-xf', archive, '-C', backend], { stdio: 'inherit' });
  rmSync(archive, { force: true });
  if (r.status !== 0) fail('Could not extract the Piper archive (is "tar" available?)');
  if (process.platform !== 'win32') chmodSync(piperBin, 0o755);
  console.log(`installed: ${piperBin}`);
}

// --- Voices ----------------------------------------------------------------
const voicesDir = join(backend, 'voices');
mkdirSync(voicesDir, { recursive: true });

step('Voices');
for (const voice of new Set([...DEFAULT_VOICES, ...extraVoices])) {
  // fr_FR-siwis-medium -> fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx
  const match = /^(([a-z]{2,3})_[A-Z]{2})-(.+)-(x_low|low|medium|high)$/.exec(voice);
  if (!match) { console.warn(`skipping "${voice}": expected <lang>_<REGION>-<name>-<quality>`); continue; }
  const [, locale, lang, name, quality] = match;

  for (const ext of ['.onnx', '.onnx.json']) {
    const dest = join(voicesDir, voice + ext);
    if (existsSync(dest)) continue;
    console.log(`downloading ${voice}${ext}…`);
    await download(`${VOICES_BASE}/${lang}/${locale}/${name}/${quality}/${voice}${ext}`, dest);
  }
  console.log(`ok: ${voice}`);
}
console.log('More voices: https://rhasspy.github.io/piper-samples/');

// --- Smoke test --------------------------------------------------------------
if (existsSync(piperBin)) {
  step('Testing Piper');
  const model = join(voicesDir, `${DEFAULT_VOICES[0]}.onnx`);
  const env = process.platform === 'linux'
    ? { ...process.env, LD_LIBRARY_PATH: [piperDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') }
    : process.env;
  const r = spawnSync(piperBin, ['--model', model, '--output_raw'], { input: 'Test.', env, maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0 && r.stdout.length > 0) console.log(`ok (${r.stdout.length} bytes of audio)`);
  else console.warn(`Piper did not produce audio:\n${r.stderr?.toString() ?? r.error}`);
}

// --- .env ------------------------------------------------------------------
step('backend/.env');
const envPath = join(backend, '.env');
if (existsSync(envPath)) {
  console.log('already exists, left untouched');
} else {
  copyFileSync(join(backend, '.env.example'), envPath);
  const token = randomBytes(24).toString('base64url');
  writeFileSync(envPath, readFileSync(envPath, 'utf-8').replace(/^API_TOKEN=.*$/m, `API_TOKEN=${token}`));
  console.log('created from .env.example with a random API_TOKEN.');
  console.log('\x1b[33m→ Fill in DISCORD_TOKEN and GUILD_ID before starting.\x1b[0m');
}

console.log('\n\x1b[32m✓ Setup done.\x1b[0m  Dev: npm run dev   |   Prod: npm run build && npm start');
