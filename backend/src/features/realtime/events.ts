import { EventEmitter } from 'node:events';

/**
 * Internal bus: any module that changes a guild's visible state (voice connection,
 * queue, channel members) calls notifyGuild(); the Socket.IO layer pushes the update.
 */
const bus = new EventEmitter();

export function notifyGuild(guildId: string): void {
  bus.emit('guild', guildId);
}

export function onGuildChange(listener: (guildId: string) => void): void {
  bus.on('guild', listener);
}
