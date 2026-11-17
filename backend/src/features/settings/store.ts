import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { config } from '../../config.js';

/** Per-user voice preferences, set with /voix. */
export interface UserVoicePrefs {
  voiceId?: string;
  pitch?: number;
  tempo?: number;
}

/** Saved message shown as a quick-send button in the dashboard. */
export interface Preset {
  id: string;
  label: string;
  text: string;
  /** When unset, the dashboard's current voice/pitch/tempo are used. */
  voiceId?: string;
  pitch?: number;
  tempo?: number;
}

export interface GuildSettings {
  /** Text channel whose messages are read aloud automatically (/tts-salon). */
  ttsChannelId?: string;
  users: Record<string, UserVoicePrefs>;
  presets?: Preset[];
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

export function listPresets(guildId: string): Preset[] {
  return store[guildId]?.presets ?? [];
}

export function createPreset(guildId: string, data: Omit<Preset, 'id'>): Preset {
  const preset: Preset = { id: randomUUID(), ...data };
  (guild(guildId).presets ??= []).push(preset);
  save();
  return preset;
}

/** Replaces every field but the id. Returns null if the preset does not exist. */
export function updatePreset(guildId: string, id: string, data: Omit<Preset, 'id'>): Preset | null {
  const presets = guild(guildId).presets ?? [];
  const index = presets.findIndex(p => p.id === id);
  if (index === -1) return null;
  presets[index] = { id, ...data };
  save();
  return presets[index];
}

export function deletePreset(guildId: string, id: string): boolean {
  const presets = guild(guildId).presets ?? [];
  const index = presets.findIndex(p => p.id === id);
  if (index === -1) return false;
  presets.splice(index, 1);
  save();
  return true;
}

/** Reorders presets to follow `ids`; unknown ids are ignored, missing ones keep their relative order at the end. */
export function reorderPresets(guildId: string, ids: string[]): Preset[] {
  const presets = guild(guildId).presets ?? [];
  const rank = new Map(ids.map((id, i) => [id, i]));
  presets.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  save();
  return presets;
}
