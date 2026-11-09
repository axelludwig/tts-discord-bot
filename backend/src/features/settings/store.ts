import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../config.js';

/** Per-user voice preferences, set with /voix. */
export interface UserVoicePrefs {
  voiceId?: string;
  pitch?: number;
  tempo?: number;
}

export interface GuildSettings {
  /** Text channel whose messages are read aloud automatically (/tts-salon). */
  ttsChannelId?: string;
  users: Record<string, UserVoicePrefs>;
}

type Store = Record<string, GuildSettings>;

let store: Store = load();

function load(): Store {
  if (!existsSync(config.SETTINGS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(config.SETTINGS_FILE, 'utf-8')) as Store;
  } catch (err) {
    console.error(`[settings] Could not read ${config.SETTINGS_FILE}, starting empty:`, err);
    return {};
  }
}

function save(): void {
  mkdirSync(dirname(config.SETTINGS_FILE), { recursive: true });
  // Write then rename so a crash mid-write never leaves a truncated file.
  const tmp = `${config.SETTINGS_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2));
  renameSync(tmp, config.SETTINGS_FILE);
}

function guild(guildId: string): GuildSettings {
  return (store[guildId] ??= { users: {} });
}

export function getGuildSettings(guildId: string): Readonly<GuildSettings> {
  return store[guildId] ?? { users: {} };
}

export function setTtsChannel(guildId: string, channelId: string | undefined): void {
  if (channelId) guild(guildId).ttsChannelId = channelId;
  else delete guild(guildId).ttsChannelId;
  save();
}

export function getUserPrefs(guildId: string, userId: string): UserVoicePrefs {
  return store[guildId]?.users[userId] ?? {};
}

export function setUserPrefs(guildId: string, userId: string, prefs: UserVoicePrefs): void {
  guild(guildId).users[userId] = { ...getUserPrefs(guildId, userId), ...prefs };
  save();
}

export function resetUserPrefs(guildId: string, userId: string): void {
  delete guild(guildId).users[userId];
  save();
}
