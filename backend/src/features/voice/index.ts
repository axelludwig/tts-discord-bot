import { getConnection, removeConnection } from './connections.js';
import { joinChannel } from './join.js';
import { listVoiceChannels } from './channels.js';

export { joinChannel, listVoiceChannels, getConnection };

export function leaveChannel(guildId: string): void {
  const connection = getConnection(guildId);
  if (connection) {
    connection.destroy();
    removeConnection(guildId);
  }
}
