import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

export function applyPitchTempo(
  input: Readable,
  inputSampleRate: number,
  pitchSemitones: number,
  tempo: number,
): Readable {
  const factor = Math.pow(2, pitchSemitones / 12);
  const filter = `asetrate=${inputSampleRate}*${factor},aresample=48000,atempo=${tempo / factor}`;

  const ff = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', String(inputSampleRate), '-ac', '1', '-i', 'pipe:0',
    '-af', filter,
    '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1',
  ]);

  ff.stderr.on('data', (d: Buffer) => console.error('[ffmpeg]', d.toString()));
  ff.on('error', err => console.error('[ffmpeg] spawn error:', err));

  input.pipe(ff.stdin);

  return ff.stdout;
}
