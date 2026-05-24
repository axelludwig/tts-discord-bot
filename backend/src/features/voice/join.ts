import {
  DiscordGatewayAdapterCreator,
  entersState,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionsBitField, VoiceChannel } from 'discord.js';
import { client } from '../../bot.js';
import { getConnection, removeConnection, setConnection } from './connections.js';

export async function joinChannel(guildId: string, channelId: string): Promise<VoiceConnection> {
  const existing = getConnection(guildId);
  if (existing) {
    const existingChannelId = (existing as any).joinConfig?.channelId;
    if (existingChannelId === channelId) {
      console.log(`[voice] Already connected to channel ${channelId}, reusing connection`);
      return existing;
    }

    console.log(`[voice] Already connected to channel ${existingChannelId}, leaving first`);
    existing.destroy();
    removeConnection(guildId);
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error(`Guild not found: ${guildId}`);

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error(`Voice channel not found: ${channelId}`);
  }

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

    console.log(`[voice] Permissions OK for channel "${channel.name}": Connect OK Speak OK ViewChannel OK`);
  } else {
    console.warn('[voice] Could not check permissions - guild.members.me is null');
  }

  const voiceChannel = channel as VoiceChannel;
  if (voiceChannel.userLimit > 0 && voiceChannel.members.size >= voiceChannel.userLimit) {
    console.warn(`[voice] Channel "${channel.name}" is full (${voiceChannel.members.size}/${voiceChannel.userLimit})`);
  }

  console.log(`[voice] Joining channel ${channelId} in guild ${guildId} ("${guild.name}" / "#${channel.name}")`);

  const adapterCreator: DiscordGatewayAdapterCreator = methods => {
    const wrapped = { ...methods };
    return (guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator)(wrapped);
  };

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  connection.on(VoiceConnectionStatus.Connecting, () => console.log('[voice] -> connecting'));
  connection.on(VoiceConnectionStatus.Signalling, () => console.log('[voice] -> signalling'));
  connection.on(VoiceConnectionStatus.Ready, () => console.log('[voice] -> ready'));
  connection.on(VoiceConnectionStatus.Destroyed, () => console.log('[voice] -> destroyed'));

  connection.on('error', err => {
    console.error('[voice] Connection error:', err.message);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    console.log('[voice] Disconnected - attempting reconnect...');
    Promise.race([
      entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
      entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
    ]).then(() => {
      console.log('[voice] Reconnecting...');
    }).catch(() => {
      console.log('[voice] Reconnect failed, destroying connection');
      try {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
          connection.destroy();
        }
      } catch {
        // no-op, already destroyed
      }
      removeConnection(guildId);
    });
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    console.log(`[voice] Ready in channel "${channel.name}"`);
  } catch {
    const state = connection.state.status;
    console.error(`[voice] Failed to reach Ready state within 15s - stuck in: ${state}`);
    if (state === VoiceConnectionStatus.Signalling) {
      console.error('[voice] Hint: stuck in "signalling" = Discord never sent VOICE_SERVER_UPDATE via WebSocket.');
      console.error('[voice] Probable causes:');
      console.error('[voice]   1. Bot missing Connect/Speak permissions in that channel');
      console.error('[voice]   2. voiceAdapterCreator not wiring up the gateway events (check [gateway] logs above)');
      console.error('[voice]   3. Bot token lacks SERVER_MEMBERS or GUILD_VOICE_STATES intent on the Dev Portal');
    } else if (state === VoiceConnectionStatus.Connecting) {
      console.error('[voice] Hint: stuck in "connecting" = VOICE_SERVER_UPDATE received but UDP handshake failed.');
      console.error('[voice] Probable causes: outbound UDP ports 50000-65535 blocked by firewall or NAT.');
    }

    try {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    } catch {
      // no-op, already destroyed
    }
    removeConnection(guildId);

    const hint = state === VoiceConnectionStatus.Signalling
      ? ' (gateway never responded - check [gateway] logs, bot permissions, and Discord Dev Portal intents)'
      : state === VoiceConnectionStatus.Connecting
        ? ' (UDP handshake failed - check outbound UDP 50000-65535 is not blocked by firewall)'
        : '';

    throw new Error(`Cannot join voice channel "${channel.name}"${hint}`);
  }

  setConnection(guildId, connection);
  return connection;
}
