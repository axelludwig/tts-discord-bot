import { ChannelType, VoiceChannel } from 'discord.js';
import { client } from '../../bot.js';

export interface ChannelMember {
  id: string;
  displayName: string;
  avatarUrl: string;
}

export interface VoiceChannelInfo {
  id: string;
  name: string;
  members: ChannelMember[];
}

export function listVoiceChannels(guildId: string): VoiceChannelInfo[] {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];

  return guild.channels.cache
    .filter(c => c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.position - b.position)
    .map(c => {
      const vc = c as VoiceChannel;
      const members = vc.members.map(m => ({
        id: m.id,
        displayName: m.displayName,
        avatarUrl: m.user.displayAvatarURL({ size: 32 }),
      }));
      return { id: c.id, name: c.name, members };
    });
}
