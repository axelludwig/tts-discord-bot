import { VoiceConnection } from '@discordjs/voice';

const connections = new Map<string, VoiceConnection>();

export function getConnection(guildId: string): VoiceConnection | undefined {
  return connections.get(guildId);
}

export function setConnection(guildId: string, connection: VoiceConnection): void {
  connections.set(guildId, connection);
}

export function removeConnection(guildId: string): void {
  connections.delete(guildId);
}
