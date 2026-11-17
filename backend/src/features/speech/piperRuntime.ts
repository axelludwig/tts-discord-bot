import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { config } from '../../config.js';

const piperDir = dirname(config.PIPER_BIN);

/** Environment for the binaries of the Piper release (piper, piper_phonemize). */
export function piperEnv(): NodeJS.ProcessEnv {
  if (process.platform !== 'linux') return process.env;
  // The Linux release ships its .so files next to the binary.
  const current = process.env['LD_LIBRARY_PATH'];
  return { ...process.env, LD_LIBRARY_PATH: current ? `${piperDir}${delimiter}${current}` : piperDir };
}

/** piper_phonemize and its espeak-ng data, shipped in the same release as piper. Null if absent. */
export function phonemizerPaths(): { bin: string; espeakData: string } | null {
  const bin = join(piperDir, process.platform === 'win32' ? 'piper_phonemize.exe' : 'piper_phonemize');
  const espeakData = join(piperDir, 'espeak-ng-data');
  return existsSync(bin) && existsSync(espeakData) ? { bin, espeakData } : null;
}
