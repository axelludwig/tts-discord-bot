import { VoiceConnection } from '@discordjs/voice';
import { notifyGuild } from '../realtime/events.js';

const connections = new Map<string, VoiceConnection>();

export function getConnection(guildId: string): VoiceConnection | undefined {
  return connections.get(guildId);
}

export function getConnectedChannelId(guildId: string): string | undefined {
  return connections.get(guildId)?.joinConfig.channelId ?? undefined;
}

export function setConnection(guildId: string, connection: VoiceConnection): void {
  connections.set(guildId, connection);
  notifyGuild(guildId);
}

export function removeConnection(guildId: string): void {
  if (connections.delete(guildId)) notifyGuild(guildId);
}
