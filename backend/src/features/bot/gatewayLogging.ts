import { Client } from 'discord.js';

export function registerGatewayVoiceDebugLogging(client: Client): void {
  client.ws.on('VOICE_SERVER_UPDATE' as any, (data: any) => {
    console.log(`[gateway] VOICE_SERVER_UPDATE -> guild: ${data.guild_id}, endpoint: ${data.endpoint}`);
  });

  client.ws.on('VOICE_STATE_UPDATE' as any, (data: any) => {
    if (data.user_id === client.user?.id) {
      console.log(`[gateway] VOICE_STATE_UPDATE (bot) -> channel: ${data.channel_id ?? 'null'}, session: ${data.session_id}`);
    }
  });
}
