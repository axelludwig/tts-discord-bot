import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

export function loginBot(): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('clientReady', () => {
      console.log(`[bot] Logged in as ${client.user?.tag}`);
      resolve();
    });
    client.once('error', reject);
    client.login(config.DISCORD_TOKEN).catch(reject);
  });
}
