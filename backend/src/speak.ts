import { StreamType } from '@discordjs/voice';
import { getConnection } from './voice.js';
import { getVoice, synthesize } from './tts.js';
import { applyPitchTempo } from './pitch.js';
import { playStream } from './player.js';

export function speak(
  guildId: string,
  text: string,
  voiceId: string,
  pitch: number = 0,
  tempo: number = 1,
): void {
  const connection = getConnection(guildId);
  if (!connection) throw new Error(`No active voice connection for guild: ${guildId}`);

  const voice = getVoice(voiceId);
  if (!voice) throw new Error(`Voice not found: ${voiceId}`);

  const ttsStream = synthesize(text, voiceId);
  const audioStream = applyPitchTempo(ttsStream, voice.sampleRate, pitch, tempo);
  playStream(guildId, audioStream, StreamType.Raw);
}
