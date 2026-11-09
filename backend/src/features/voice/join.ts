import {
  entersState,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionsBitField, VoiceChannel } from 'discord.js';
import { client } from '../../bot.js';
import { attachQueue, destroyQueue } from '../speech/queue.js';
import { getConnection, removeConnection, setConnection } from './connections.js';

function safeDestroy(connection: VoiceConnection): void {
  if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
}

export async function joinChannel(guildId: string, channelId: string): Promise<VoiceConnection> {
  const existing = getConnection(guildId);
  if (existing) {
    if (existing.joinConfig.channelId === channelId) {
      console.log(`[voice] Already connected to channel ${channelId}, reusing connection`);
      return existing;
    }
    console.log(`[voice] Switching from channel ${existing.joinConfig.channelId} to ${channelId}`);
    // Unregister first so the Destroyed handler keeps the queue alive across the move.
    removeConnection(guildId);
    safeDestroy(existing);
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error(`Guild not found: ${guildId}`);

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    throw new Error(`Voice channel not found: ${channelId}`);
  }
  const voiceChannel = channel as VoiceChannel;

  const me = guild.members.me;
  if (me) {
    const perms = voiceChannel.permissionsFor(me);
    const missing = (['ViewChannel', 'Connect', 'Speak'] as const)
      .filter(flag => !perms?.has(PermissionsBitField.Flags[flag]));
    if (missing.length > 0) {
      throw new Error(`Bot is missing permissions in channel "${channel.name}": ${missing.join(', ')}`);
    }
  }

  if (voiceChannel.userLimit > 0 && voiceChannel.members.size >= voiceChannel.userLimit) {
    console.warn(`[voice] Channel "${channel.name}" is full (${voiceChannel.members.size}/${voiceChannel.userLimit})`);
  }

  console.log(`[voice] Joining "${guild.name}" / #${channel.name}`);

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false,
  });

  connection.on('stateChange', (oldState, newState) => {
    if (oldState.status !== newState.status) console.log(`[voice] ${oldState.status} -> ${newState.status}`);
  });
  connection.on('error', err => console.error('[voice] Connection error:', err.message));

  // Single cleanup point: whoever destroys the connection (leave, failed reconnect, kick).
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (getConnection(guildId) !== connection) return;
    removeConnection(guildId);
    destroyQueue(guildId);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    // Signalling/Connecting within 5s = Discord is moving us (region change, channel move).
    Promise.race([
      entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
      entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
    ]).catch(() => {
      console.log('[voice] Reconnect failed, leaving');
      safeDestroy(connection);
    });
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch {
    const state = connection.state.status;
    safeDestroy(connection);
    if (!getConnection(guildId)) destroyQueue(guildId);

    const hint = state === VoiceConnectionStatus.Signalling
      ? ' (gateway never answered: check bot permissions and the GUILD_VOICE_STATES intent)'
      : state === VoiceConnectionStatus.Connecting
        ? ' (UDP handshake failed: check that outbound UDP 50000-65535 is not blocked)'
        : '';
    console.error(`[voice] Failed to reach Ready within 15s, stuck in "${state}"${hint}`);
    throw new Error(`Cannot join voice channel "${channel.name}"${hint}`);
  }

  console.log(`[voice] Ready in #${channel.name}`);
  setConnection(guildId, connection);
  attachQueue(guildId);
  return connection;
}
