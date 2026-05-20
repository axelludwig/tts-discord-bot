import {
  AudioPlayer,
  AudioPlayerStatus,
  StreamType,
  createAudioPlayer,
  createAudioResource,
} from '@discordjs/voice';
import { Readable } from 'node:stream';
import { getConnection } from './voice.js';

const players = new Map<string, AudioPlayer>();

export function getPlayer(guildId: string): AudioPlayer {
  let player = players.get(guildId);
  if (!player) {
    player = createAudioPlayer();
    players.set(guildId, player);
    player.on('error', err => console.error(`[player] error in guild ${guildId}:`, err));
  }

  const connection = getConnection(guildId);
  if (connection) {
    connection.subscribe(player);
  }

  return player;
}

export function playStream(guildId: string, stream: Readable, inputType?: StreamType): void {
  const player = getPlayer(guildId);
  const resource = createAudioResource(stream, {
    inputType: inputType ?? StreamType.Arbitrary,
  });
  player.play(resource);
}

export function stop(guildId: string): void {
  const player = players.get(guildId);
  if (player) {
    player.stop();
  }
}

export function isPlaying(guildId: string): boolean {
  const player = players.get(guildId);
  if (!player) return false;
  return player.state.status === AudioPlayerStatus.Playing;
}
