import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { ChannelType, PermissionsBitField, VoiceChannel } from 'discord.js';
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
    const existingChannelId = (existing as any).joinConfig?.channelId;
    if (existingChannelId === channelId) {
      console.log(`[voice] Already connected to channel ${channelId}, reusing connection`);
      return existing;
    }
    console.log(`[voice] Already connected to channel ${existingChannelId}, leaving first`);
    existing.destroy();
    connections.delete(guildId);
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error(`Guild not found: ${guildId}`);

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error(`Voice channel not found: ${channelId}`);
  }

  // Check bot permissions in the channel
  const me = guild.members.me;
  if (me) {
    const perms = (channel as VoiceChannel).permissionsFor(me);
    const missing: string[] = [];
    if (!perms?.has(PermissionsBitField.Flags.Connect)) missing.push('Connect');
    if (!perms?.has(PermissionsBitField.Flags.Speak)) missing.push('Speak');
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) missing.push('ViewChannel');
    if (missing.length > 0) {
      throw new Error(`Bot is missing permissions in channel "${channel.name}": ${missing.join(', ')}`);
    }
    console.log(`[voice] Permissions OK for channel "${channel.name}": Connect ✓ Speak ✓ ViewChannel ✓`);
  } else {
    console.warn(`[voice] Could not check permissions — guild.members.me is null`);
  }

  // Check user limit
  const vc = channel as VoiceChannel;
  if (vc.userLimit > 0 && vc.members.size >= vc.userLimit) {
    console.warn(`[voice] Channel "${channel.name}" is full (${vc.members.size}/${vc.userLimit})`);
  }

  console.log(`[voice] Joining channel ${channelId} in guild ${guildId} ("${guild.name}" / "#${channel.name}")`);

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator as any,
    selfDeaf: true,
    selfMute: false,
  });

  // Log every state transition
  connection.on(VoiceConnectionStatus.Connecting, () =>
    console.log(`[voice] → connecting`));
  connection.on(VoiceConnectionStatus.Signalling, () =>
    console.log(`[voice] → signalling`));
  connection.on(VoiceConnectionStatus.Ready, () =>
    console.log(`[voice] → ready`));
  connection.on(VoiceConnectionStatus.Destroyed, () =>
    console.log(`[voice] → destroyed`));

  // Absorb unhandled errors on the connection so they don't crash Node
  connection.on('error', (err) => {
    console.error(`[voice] Connection error:`, err.message);
  });

  // Handle disconnects: try to reconnect automatically, give up after 5s
  connection.on(VoiceConnectionStatus.Disconnected, () => {
    console.log(`[voice] Disconnected — attempting reconnect…`);
    Promise.race([
      entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
      entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
    ]).then(() => {
      console.log(`[voice] Reconnecting…`);
    }).catch(() => {
      console.log(`[voice] Reconnect failed, destroying connection`);
      try {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
      } catch { /* already destroyed */ }
      connections.delete(guildId);
    });
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    console.log(`[voice] Ready in channel "${channel.name}"`);
  } catch (err) {
    const state = connection.state.status;
    console.error(`[voice] Failed to reach Ready state within 15s — stuck in: ${state}`);
    if (state === VoiceConnectionStatus.Signalling) {
      console.error(`[voice] Hint: "signalling" means Discord never sent VOICE_SERVER_UPDATE back.`);
      console.error(`[voice] Possible causes: UDP port 50000-65535 blocked by firewall, or Discord region issue.`);
    }
    try {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    } catch { /* already destroyed */ }
    connections.delete(guildId);
    const hint = state === VoiceConnectionStatus.Signalling
      ? ' (Discord never responded — check firewall UDP 50000-65535 or try a different channel region)'
      : '';
    throw new Error(`Cannot join voice channel "${channel.name}"${hint}`);
  }

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
