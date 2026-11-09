import { getConnection } from './connections.js';

export { getConnectedChannelId, getConnection } from './connections.js';
export { joinChannel } from './join.js';
export { listVoiceChannels } from './channels.js';

/** Destroying the connection triggers the cleanup registered in join.ts (connection map + queue). */
export function leaveChannel(guildId: string): void {
  getConnection(guildId)?.destroy();
}
