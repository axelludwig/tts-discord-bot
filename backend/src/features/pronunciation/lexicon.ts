import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../../config.js';
import { DEFAULT_LEXICON } from './defaultLexicon.js';

/**
 * Words to say differently, e.g. "Teams" → "timmze". Shared by every guild and by the
 * browser extension: the pronunciation of a word does not depend on where it is said.
 */
export interface LexiconEntry {
  /** Word or expression as written in messages. */
  word: string;
  /** French spelling to read instead. Equal to `word` = keep it as is (disables a default entry). */
  say: string;
  /** Match the case exactly (e.g. "AI" without touching the French "ai"). */
  caseSensitive?: boolean;
}

export const MAX_ENTRIES = 1000;
export const MAX_WORD_LENGTH = 60;

let custom: LexiconEntry[] = load();
const listeners = new Set<() => void>();

function load(): LexiconEntry[] {
  if (!existsSync(config.LEXICON_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(config.LEXICON_FILE, 'utf-8'));
    return Array.isArray(raw?.entries) ? raw.entries : [];
  } catch (err) {
    console.error(`[lexicon] Could not read ${config.LEXICON_FILE}, starting empty:`, err);
    return [];
  }
}

function save(): void {
  mkdirSync(dirname(config.LEXICON_FILE), { recursive: true });
  const tmp = `${config.LEXICON_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ entries: custom }, null, 2));
  renameSync(tmp, config.LEXICON_FILE);
  listeners.forEach(fn => fn());
}

export function keyOf(entry: Pick<LexiconEntry, 'word' | 'caseSensitive'>): string {
  const word = entry.word.trim().replace(/\s+/g, ' ');
  return entry.caseSensitive ? word : word.toLowerCase();
}

/** Called after every change (the pronunciation cache must be dropped). */
export function onLexiconChange(fn: () => void): void {
  listeners.add(fn);
}

export function listCustomEntries(): LexiconEntry[] {
  return custom;
}

export function listDefaultEntries(): LexiconEntry[] {
  return DEFAULT_LEXICON;
}

/** Defaults overridden by the custom entries with the same key. */
export function effectiveLexicon(): LexiconEntry[] {
  const byKey = new Map<string, LexiconEntry>();
  for (const entry of DEFAULT_LEXICON) byKey.set(keyOf(entry), entry);
  for (const entry of custom) byKey.set(keyOf(entry), entry);
  return [...byKey.values()];
}

/** Validates an entry from the API or a command; returns the cleaned entry or an error message. */
export function parseEntry(body: any): LexiconEntry | string {
  const word = typeof body?.word === 'string' ? body.word.trim() : '';
  const say = typeof body?.say === 'string' ? body.say.trim() : '';
  if (!word) return 'word required';
  if (!say) return 'say required';
  if (word.length > MAX_WORD_LENGTH) return `word too long (${MAX_WORD_LENGTH} characters max)`;
  if (say.length > MAX_WORD_LENGTH * 2) return `say too long (${MAX_WORD_LENGTH * 2} characters max)`;
  if (!/[\p{L}\p{N}]/u.test(word)) return 'word must contain a letter or a digit';
  return { word, say, caseSensitive: body?.caseSensitive === true };
}

export function hasEntry(entry: Pick<LexiconEntry, 'word' | 'caseSensitive'>): boolean {
  const key = keyOf(entry);
  return custom.some(e => keyOf(e) === key);
}

export function upsertEntry(entry: LexiconEntry): LexiconEntry {
  const clean: LexiconEntry = {
    word: entry.word.trim().replace(/\s+/g, ' '),
    say: entry.say.trim().replace(/\s+/g, ' '),
    ...(entry.caseSensitive ? { caseSensitive: true } : {}),
  };
  const key = keyOf(clean);
  const index = custom.findIndex(e => keyOf(e) === key);
  if (index === -1) custom.push(clean);
  else custom[index] = clean;
  custom.sort((a, b) => a.word.localeCompare(b.word, 'fr', { sensitivity: 'base' }));
  save();
  return clean;
}

/** Removes the custom entry for `word` (the default one, if any, applies again). */
export function removeEntry(word: string, caseSensitive = false): boolean {
  const key = keyOf({ word, caseSensitive });
  const before = custom.length;
  custom = custom.filter(e => keyOf(e) !== key);
  if (custom.length === before) return false;
  save();
  return true;
}
