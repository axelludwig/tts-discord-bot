import { Client, GatewayIntentBits, OAuth2Scopes, PermissionFlagsBits } from 'discord.js';
import { config } from './config.js';
import { registerGatewayVoiceDebugLogging } from './features/bot/gatewayLogging.js';
import { registerCommandHandlers, registerCommands } from './features/commands/handlers.js';
import { notifyGuild } from './features/realtime/events.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    // Privileged: only requested when text-channel reading is enabled (see config.ENABLE_TEXT_CHANNEL).
    ...(config.ENABLE_TEXT_CHANNEL ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] : []),
  ],
});

// Push channel/member changes to the dashboard as they happen.
client.on('voiceStateUpdate', (_old, state) => notifyGuild(state.guild.id));
client.on('channelCreate', channel => notifyGuild(channel.guild.id));
client.on('channelDelete', channel => { if ('guild' in channel) notifyGuild(channel.guild.id); });
client.on('channelUpdate', (_old, channel) => { if ('guild' in channel) notifyGuild(channel.guild.id); });

registerCommandHandlers(client);

export function loginBot(): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('clientReady', async readyClient => {
      console.log(`[bot] Logged in as ${readyClient.user.tag}`);
      console.log(`[bot] Invite link: ${readyClient.generateInvite({
        scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
        permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      })}`);
      if (config.GUILD_ID && !readyClient.guilds.cache.has(config.GUILD_ID)) {
        console.warn(`[bot] The bot is not a member of GUILD_ID ${config.GUILD_ID}: invite it with the link above.`);
      }
      registerGatewayVoiceDebugLogging(readyClient);
      await registerCommands(readyClient);
      resolve();
    });
    client.once('error', reject);
    client.login(config.DISCORD_TOKEN).catch(reject);
  });
}
