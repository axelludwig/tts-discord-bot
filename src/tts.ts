import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { config } from './config.js';

type Voice = {
  id: string;
  modelPath: string;
  sampleRate: number;
  language: string;
};

const voices = new Map<string, Voice>();

export function loadVoices(): void {
  const voicesDir = resolve(config.VOICES_DIR);
  if (!existsSync(voicesDir)) {
    console.warn(`[tts] Voices directory not found: ${voicesDir}`);
    return;
  }

  const files = readdirSync(voicesDir);
  for (const file of files) {
    if (!file.endsWith('.onnx')) continue;
    const jsonFile = file + '.json';
    const jsonPath = join(voicesDir, jsonFile);
    if (!existsSync(jsonPath)) {
      console.warn(`[tts] Missing config file for ${file}, skipping`);
      continue;
    }

    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      const id = basename(file, '.onnx');
      const modelPath = resolve(join(voicesDir, file));
      const sampleRate: number = raw?.audio?.sample_rate ?? 22050;
      const language: string = raw?.language?.code ?? raw?.language ?? 'unknown';

      voices.set(id, { id, modelPath, sampleRate, language });
      console.log(`[tts] Loaded voice: ${id} (${language}, ${sampleRate}Hz)`);
    } catch (err) {
      console.error(`[tts] Failed to load voice ${file}:`, err);
    }
  }

  console.log(`[tts] ${voices.size} voice(s) loaded`);
}

export function listVoices(): Voice[] {
  return Array.from(voices.values());
}

export function getVoice(id: string): Voice | undefined {
  return voices.get(id);
}

export function synthesize(text: string, voiceId: string): Readable {
  const voice = voices.get(voiceId);
  if (!voice) throw new Error(`Voice not found: ${voiceId}`);

  const piperBin = resolve(config.PIPER_BIN);
  const piper = spawn(piperBin, ['--model', voice.modelPath, '--output_raw']);

  piper.stderr.on('data', (d: Buffer) => console.error('[piper]', d.toString()));
  piper.on('error', err => console.error('[piper] spawn error:', err));

  piper.stdin.write(text);
  piper.stdin.end();

  piper.stdout.on('close', () => {
    if (!piper.killed) piper.kill();
  });

  return piper.stdout;
}
