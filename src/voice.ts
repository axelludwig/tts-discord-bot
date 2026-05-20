import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} from '@discordjs/voice';
import { ChannelType } from 'discord.js';
import { client } from './bot.js';

const connections = new Map<string, VoiceConnection>();

export function listVoiceChannels(guildId: string): { id: string; name: string }[] {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  return guild.channels.cache
    .filter(c => c.type === ChannelType.GuildVoice)
    .map(c => ({ id: c.id, name: c.name }));
}

export async function joinChannel(guildId: string, channelId: string): Promise<VoiceConnection> {
  const existing = connections.get(guildId);
  if (existing) {
    // Check if already in the same channel
    const existingChannelId = (existing as any).joinConfig?.channelId;
    if (existingChannelId === channelId) {
      return existing;
    }
    // Connected elsewhere — leave first
    existing.destroy();
    connections.delete(guildId);
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error(`Guild not found: ${guildId}`);

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error(`Voice channel not found: ${channelId}`);
  }

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator as any,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
  } catch {
    connection.destroy();
    throw new Error(`Failed to join voice channel ${channelId} within 5s`);
  }

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    connections.delete(guildId);
  });

  connections.set(guildId, connection);
  return connection;
}

export function leaveChannel(guildId: string): void {
  const connection = connections.get(guildId);
  if (connection) {
    connection.destroy();
    connections.delete(guildId);
  }
}

export function getConnection(guildId: string): VoiceConnection | undefined {
  return connections.get(guildId);
}
