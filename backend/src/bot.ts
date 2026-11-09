import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { registerGatewayVoiceDebugLogging } from './features/bot/gatewayLogging.js';
import { notifyGuild } from './features/realtime/events.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Push channel/member changes to the dashboard as they happen.
client.on('voiceStateUpdate', (_old, state) => notifyGuild(state.guild.id));
client.on('channelCreate', channel => notifyGuild(channel.guild.id));
client.on('channelDelete', channel => { if ('guild' in channel) notifyGuild(channel.guild.id); });
client.on('channelUpdate', (_old, channel) => { if ('guild' in channel) notifyGuild(channel.guild.id); });

export function loginBot(): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('clientReady', () => {
      console.log(`[bot] Logged in as ${client.user?.tag}`);
      registerGatewayVoiceDebugLogging(client);
      resolve();
    });
    client.once('error', reject);
    client.login(config.DISCORD_TOKEN).catch(reject);
  });
}
