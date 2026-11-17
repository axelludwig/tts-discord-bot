import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { config } from '../../config.js';
import { preparePronunciation } from '../pronunciation/pronunciation.js';
import { piperEnv } from './piperRuntime.js';
import type { Voice } from './voices.js';

export interface Synthesis {
  /** Signed 16-bit little-endian PCM, 48 kHz stereo — what Discord's Raw stream type expects. */
  stream: Readable;
  /** Kills piper and ffmpeg (used when an item is skipped mid-playback). */
  kill: () => void;
}

/** atempo only accepts 0.5–2.0 per instance, so larger factors are chained. */
function atempoChain(value: number): string[] {
  const filters: string[] = [];
  let remaining = value;
  while (remaining > 2) { filters.push('atempo=2'); remaining /= 2; }
  while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5; }
  filters.push(`atempo=${remaining.toFixed(5)}`);
  return filters;
}

/** `channels`: 2 for Discord (default), 1 for the browser extension's WAV render. */
export function synthesize(text: string, voice: Voice, pitch: number, tempo: number, channels: 1 | 2 = 2): Synthesis {
  const piper = spawn(config.PIPER_BIN, ['--model', voice.modelPath, '--output_raw'], { env: piperEnv() });

  // Pitch shift via resampling, then compensate the speed change with atempo.
  const factor = Math.pow(2, pitch / 12);
  const filter = [
    `asetrate=${Math.round(voice.sampleRate * factor)}`,
    'aresample=48000',
    ...atempoChain(tempo / factor),
  ].join(',');

  const ffmpeg = spawn(config.FFMPEG_BIN, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', String(voice.sampleRate), '-ac', '1', '-i', 'pipe:0',
    '-af', filter,
    '-f', 's16le', '-ar', '48000', '-ac', String(channels), 'pipe:1',
  ]);

  piper.on('error', err => console.error(`[piper] spawn error (${config.PIPER_BIN}):`, err.message));
  ffmpeg.on('error', err => console.error(`[ffmpeg] spawn error (${config.FFMPEG_BIN}):`, err.message));
  piper.stderr.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (/error|fail/i.test(line)) console.error('[piper]', line);
  });
  ffmpeg.stderr.on('data', (d: Buffer) => console.error('[ffmpeg]', d.toString().trim()));

  // A killed downstream process makes writes fail with EPIPE; that's expected on skip.
  piper.stdin.on('error', () => {});
  ffmpeg.stdin.on('error', () => {});

  piper.stdout.pipe(ffmpeg.stdin);
  // English words and brands are rewritten for the French voices (~15 ms); piper waits on stdin meanwhile.
  preparePronunciation(text)
    .then(r => r.text)
    .catch(err => {
      console.error('[pronunciation] failed, reading the text as is:', err);
      return text;
    })
    .then(spoken => piper.stdin.end(spoken));

  return {
    stream: ffmpeg.stdout,
    kill: () => {
      if (piper.exitCode === null) piper.kill();
      if (ffmpeg.exitCode === null) ffmpeg.kill();
    },
  };
}
