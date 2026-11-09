import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { config } from '../../config.js';

export type Voice = {
  id: string;
  modelPath: string;
  sampleRate: number;
  language: string;
};

const voices = new Map<string, Voice>();

export function loadVoices(): void {
  const voicesDir = config.VOICES_DIR;
  if (!existsSync(voicesDir)) {
    console.warn(`[tts] Voices directory not found: ${voicesDir} (run "npm run setup")`);
    return;
  }

  for (const file of readdirSync(voicesDir)) {
    if (!file.endsWith('.onnx')) continue;
    const jsonPath = join(voicesDir, `${file}.json`);
    if (!existsSync(jsonPath)) {
      console.warn(`[tts] Missing config file for ${file}, skipping`);
      continue;
    }

    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      const id = basename(file, '.onnx');
      voices.set(id, {
        id,
        modelPath: join(voicesDir, file),
        sampleRate: raw?.audio?.sample_rate ?? 22050,
        language: raw?.language?.code ?? raw?.language ?? 'unknown',
      });
    } catch (err) {
      console.error(`[tts] Failed to load voice ${file}:`, err);
    }
  }

  console.log(`[tts] ${voices.size} voice(s) loaded: ${[...voices.keys()].join(', ')}`);
}

export function listVoices(): Voice[] {
  return Array.from(voices.values());
}

export function getVoice(id: string): Voice | undefined {
  return voices.get(id);
}

/** Picks the first voice that exists among the candidates, then the configured default, then any. */
export function resolveVoice(...candidates: (string | undefined)[]): Voice | undefined {
  for (const id of [...candidates, config.DEFAULT_VOICE]) {
    const voice = id ? voices.get(id) : undefined;
    if (voice) return voice;
  }
  return voices.values().next().value;
}
