import { ChannelType } from 'discord.js';
import { client } from '../../bot.js';

export function listVoiceChannels(guildId: string): { id: string; name: string }[] {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];

  return guild.channels.cache
    .filter(c => c.type === ChannelType.GuildVoice)
    .map(c => ({ id: c.id, name: c.name }));
}
