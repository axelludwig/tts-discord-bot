import { randomUUID } from 'node:crypto';
import {
  AudioPlayer,
  AudioPlayerStatus,
  StreamType,
  createAudioPlayer,
  createAudioResource,
} from '@discordjs/voice';
import { config } from '../../config.js';
import { notifyGuild } from '../realtime/events.js';
import { getConnection } from '../voice/connections.js';
import { synthesize } from './synthesis.js';
import { getVoice } from './voices.js';

export interface SpeechRequest {
  text: string;
  voiceId: string;
  pitch: number;
  tempo: number;
  /** Free-form label shown in the dashboard (e.g. "dashboard", a Discord username). */
  author?: string;
}

export interface QueueItem extends SpeechRequest {
  id: string;
  queuedAt: number;
}

export interface QueueState {
  current: QueueItem | null;
  pending: QueueItem[];
}

export class QueueError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface GuildQueue {
  player: AudioPlayer;
  pending: QueueItem[];
  current: { item: QueueItem; kill: () => void } | null;
}

const queues = new Map<string, GuildQueue>();

function getQueue(guildId: string): GuildQueue {
  let queue = queues.get(guildId);
  if (queue) return queue;

  const player = createAudioPlayer();
  const created: GuildQueue = { player, pending: [], current: null };
  queue = created;

  player.on(AudioPlayerStatus.Idle, () => {
    created.current?.kill();
    created.current = null;
    playNext(guildId);
  });
  player.on('error', err => {
    // The player moves to Idle right after, which advances the queue.
    console.error(`[queue] playback error in guild ${guildId}:`, err.message);
  });

  queues.set(guildId, created);
  return created;
}

function playNext(guildId: string): void {
  const queue = queues.get(guildId);
  if (!queue || queue.current) return;

  const item = queue.pending.shift();
  if (!item) {
    notifyGuild(guildId);
    return;
  }

  const connection = getConnection(guildId);
  const voice = getVoice(item.voiceId);
  if (!connection || !voice) {
    destroyQueue(guildId);
    return;
  }

  connection.subscribe(queue.player);
  const { stream, kill } = synthesize(item.text, voice, item.pitch, item.tempo);
  queue.current = { item, kill };
  queue.player.play(createAudioResource(stream, { inputType: StreamType.Raw }));
  notifyGuild(guildId);
}

/** Adds a message to the guild's queue; starts playback immediately if idle. */
export function enqueue(guildId: string, request: SpeechRequest): { item: QueueItem; position: number } {
  if (!getConnection(guildId)) throw new QueueError(`No active voice connection for guild: ${guildId}`, 404);
  if (!getVoice(request.voiceId)) throw new QueueError(`Voice not found: ${request.voiceId}`, 404);

  const queue = getQueue(guildId);
  if (queue.pending.length >= config.MAX_QUEUE_LENGTH) {
    throw new QueueError(`Queue is full (${config.MAX_QUEUE_LENGTH} messages max)`, 429);
  }

  const item: QueueItem = { ...request, id: randomUUID(), queuedAt: Date.now() };
  queue.pending.push(item);
  // 0 = playing right now, n = n messages ahead of it.
  const position = queue.pending.length - 1 + (queue.current ? 1 : 0);

  if (!queue.current) playNext(guildId);
  else notifyGuild(guildId);

  return { item, position };
}

/** Stops the current message and moves on to the next one. */
export function skip(guildId: string): void {
  const queue = queues.get(guildId);
  if (!queue?.current) return;
  queue.player.stop(true); // → Idle → playNext
}

/** Removes a pending message (not the one currently playing). */
export function remove(guildId: string, itemId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;
  const index = queue.pending.findIndex(i => i.id === itemId);
  if (index === -1) return false;
  queue.pending.splice(index, 1);
  notifyGuild(guildId);
  return true;
}

/** Empties the queue and stops what's playing. */
export function clear(guildId: string): void {
  const queue = queues.get(guildId);
  if (!queue) return;
  queue.pending = [];
  if (queue.current) queue.player.stop(true);
  else notifyGuild(guildId);
}

/** Re-attaches the player after the bot moved to another channel. */
export function attachQueue(guildId: string): void {
  const queue = queues.get(guildId);
  const connection = getConnection(guildId);
  if (queue && connection) connection.subscribe(queue.player);
}

/** Called when the bot leaves voice: drops everything for that guild. */
export function destroyQueue(guildId: string): void {
  const queue = queues.get(guildId);
  if (!queue) return;
  queues.delete(guildId);
  queue.pending = [];
  queue.current?.kill();
  queue.current = null;
  queue.player.removeAllListeners();
  queue.player.on('error', () => {}); // never leave an EventEmitter without an error listener
  queue.player.stop(true);
  notifyGuild(guildId);
}

export function getQueueState(guildId: string): QueueState {
  const queue = queues.get(guildId);
  return {
    current: queue?.current?.item ?? null,
    pending: queue ? [...queue.pending] : [],
  };
}

export function isPlaying(guildId: string): boolean {
  return !!queues.get(guildId)?.current;
}
