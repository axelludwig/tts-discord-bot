import { spawn } from 'node:child_process';
import { phonemizerPaths, piperEnv } from '../speech/piperRuntime.js';
import { LexiconEntry, effectiveLexicon, onLexiconChange } from './lexicon.js';

/**
 * Makes French voices read English words and brands the French way, before the text goes to Piper.
 *
 * Piper phonemizes with espeak-ng (French). Its dictionary knows many English words but gives them
 * English phonemes (ɪ, θ, ɹ, aɪ…) that the French voices never heard in training, so they come out
 * garbled. Three layers, in order:
 *   1. lexicon: explicit replacements (defaults + the ones added from Discord or the dashboard);
 *   2. acronyms: short all-caps words read the English way (AFK…) are spelled with French letter names;
 *   3. auto: other words read the English way are rewritten from their phonemes into a French spelling
 *      ("Windows" → "ouinndoze"), kept only if espeak then reads it with French phonemes alone.
 */

export type ChangeSource = 'lexique' | 'sigle' | 'auto';

export interface Change {
  from: string;
  to: string;
  source: ChangeSource;
}

export interface PronunciationResult {
  text: string;
  changes: Change[];
  /** Words still read the English way (no correction found): candidates for the lexicon. */
  unresolved: string[];
}

// ---------------------------------------------------------------------------
// Phonemizer (piper_phonemize, one process per call: ~15 ms)

const PHONEMIZE_TIMEOUT_MS = 3000;

/** Phonemes of each line, with stress marks. Null if the phonemizer is unavailable or fails. */
export async function phonemize(lines: string[]): Promise<string[] | null> {
  const paths = phonemizerPaths();
  if (!paths || lines.length === 0) return lines.length === 0 ? [] : null;

  return new Promise(resolve => {
    const proc = spawn(paths.bin, ['-l', 'fr', '--espeak_data', paths.espeakData, '--allow_missing_phonemes'], {
      env: piperEnv(),
    });
    let out = '';
    let settled = false;
    const done = (value: string[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => { proc.kill(); done(null); }, PHONEMIZE_TIMEOUT_MS);

    proc.stdout.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
    proc.on('error', err => { console.error('[pronunciation] phonemizer failed:', err.message); done(null); });
    proc.stdin.on('error', () => {});
    proc.on('close', () => {
      const results = out.split('\n').filter(Boolean).map(line => {
        try {
          return (JSON.parse(line).phonemes as string[]).join('');
        } catch {
          return null;
        }
      });
      done(results.length === lines.length && results.every(r => r !== null) ? results as string[] : null);
    });
    proc.stdin.end(lines.join('\n') + '\n');
  });
}

/** Phonemes no French word produces: the word is being read the English way. */
function isEnglish(phonemes: string): boolean {
  return /[ɪʊθðɹʌɒæɜːɐɚɝᵻɾʔh]|ɑ(?!̃)/.test(phonemes);
}

// ---------------------------------------------------------------------------
// Layer 2: acronyms

const LETTER_NAMES: Record<string, string> = {
  A: 'a', B: 'bé', C: 'cé', D: 'dé', E: 'e', F: 'èf', G: 'gé', H: 'ache', I: 'i', J: 'ji', K: 'ka', L: 'èl',
  M: 'èm', N: 'ènne', O: 'o', P: 'pé', Q: 'ku', R: 'èr', S: 'èss', T: 'té', U: 'u', V: 'vé',
  W: 'doublevé', X: 'ix', Y: 'igrec', Z: 'zèd',
};

/** All caps (AFK), or a short word espeak spelled out on its own (afk: one stress mark per letter). */
function isAcronym(token: string, phonemes: string): boolean {
  if (/^[A-Z][A-Z0-9]{1,4}$/.test(token)) return true;
  const stresses = phonemes.match(/[ˈˌ]/g)?.length ?? 0;
  return token.length <= 5 && /^\p{L}+$/u.test(token) && stresses >= token.length;
}

function spell(token: string): string {
  return [...token].map(c => LETTER_NAMES[c] ?? c).join(' ');
}

// ---------------------------------------------------------------------------
// Layer 3: phonemes → French spelling

type Kind = 'V' | 'C';
interface Unit { fr: string; kind: Kind; nasal?: boolean }

/** Longest first. Length marks (ː) are dropped before parsing. */
const UNITS: [string, string, Kind][] = [
  ['aɪ', 'aill', 'V'], ['aʊ', 'aou', 'V'], ['eɪ', 'é', 'V'], ['əʊ', 'o', 'V'], ['oʊ', 'o', 'V'], ['ɔɪ', 'oï', 'V'],
  ['ɪə', 'ia', 'V'], ['eə', 'èr', 'V'], ['ʊə', 'our', 'V'],
  ['ɔ̃', 'on', 'V'], ['ɑ̃', 'an', 'V'], ['ɛ̃', 'in', 'V'], ['œ̃', 'un', 'V'],
  ['tʃ', 'tch', 'C'], ['dʒ', 'dj', 'C'],
  ['i', 'i', 'V'], ['ɪ', 'i', 'V'], ['ᵻ', 'i', 'V'], ['y', 'u', 'V'], ['u', 'ou', 'V'], ['ʊ', 'ou', 'V'],
  ['e', 'é', 'V'], ['ɛ', 'è', 'V'], ['a', 'a', 'V'], ['æ', 'a', 'V'], ['ɑ', 'a', 'V'], ['ɐ', 'a', 'V'],
  ['ʌ', 'eu', 'V'], ['ɜ', 'eu', 'V'], ['œ', 'eu', 'V'], ['ø', 'eu', 'V'], ['ɚ', 'eur', 'V'], ['ɝ', 'eur', 'V'],
  ['ə', 'eu', 'V'], ['o', 'o', 'V'], ['ɔ', 'o', 'V'], ['ɒ', 'o', 'V'],
  ['p', 'p', 'C'], ['b', 'b', 'C'], ['t', 't', 'C'], ['d', 'd', 'C'], ['k', 'k', 'C'], ['ɡ', 'g', 'C'],
  ['g', 'g', 'C'], ['f', 'f', 'C'], ['v', 'v', 'C'], ['s', 's', 'C'], ['θ', 's', 'C'], ['z', 'z', 'C'],
  ['ð', 'z', 'C'], ['ʃ', 'ch', 'C'], ['ʒ', 'j', 'C'], ['m', 'm', 'C'], ['n', 'n', 'C'], ['ɲ', 'gn', 'C'],
  ['ŋ', 'ng', 'C'], ['l', 'l', 'C'], ['ɫ', 'l', 'C'], ['ɹ', 'r', 'C'], ['r', 'r', 'C'], ['ʁ', 'r', 'C'],
  ['w', 'ou', 'C'], ['j', 'y', 'C'], ['x', 'k', 'C'], ['ɾ', 't', 'C'], ['h', '', 'C'], ['ʔ', '', 'C'],
];

function parse(phonemes: string): Unit[] | null {
  const units: Unit[] = [];
  const s = phonemes.replace(/[ːˈˌ]/g, '').replace(/[\s-]/g, '');
  let i = 0;
  while (i < s.length) {
    const match = UNITS.find(([ipa]) => s.startsWith(ipa, i));
    if (!match) return null; // unknown phoneme: better not guess
    const [ipa, fr, kind] = match;
    if (fr) units.push({ fr, kind, nasal: ipa.includes('̃') });
    i += ipa.length;
  }
  return units;
}

/** Spelling read by the French rules of espeak as close as possible to the phonemes. */
export function respell(phonemes: string): string | null {
  const units = parse(phonemes);
  if (!units || units.length === 0) return null;

  let out = '';
  units.forEach((unit, idx) => {
    const prev = units[idx - 1];
    const next = units[idx + 1];
    const last = idx === units.length - 1;
    let fr = unit.fr;

    if (unit.kind === 'C') {
      const afterVowel = prev?.kind === 'V' && !prev.nasal;
      if (fr === 'g' && next?.kind === 'V' && /^[eéèiïy]/.test(next.fr)) fr = 'gu';
      // Vowel + m/n + consonant (or end) would turn into a nasal vowel: double the consonant.
      // (after "aou", espeak takes "aounn" for English: a mute e works there.)
      else if ((fr === 'm' || fr === 'n') && afterVowel && (!next || next.kind === 'C')) fr += prev.fr === 'aou' ? 'e' : fr;
      else if (fr === 'ng' && afterVowel) fr = next?.fr === 'k' ? 'nn' : 'nng'; // "innk" is read ink
      else if (fr === 's' && prev?.kind === 'V' && (next?.kind === 'V' || last)) fr = 'ss';
      // French spelling drops most final consonants: a trailing mute e keeps them.
      if (last && fr === 'g') fr = 'gu'; // "ge" would be read ʒ
      if (last && !fr.endsWith('ng') && /(?:[tdszpbvjm]|gu|nn?|ch|tch|dj)$/.test(fr)) fr += 'e';
    } else {
      // Two vowels in a row would form a digraph (ai, oi, au…): diaeresis on the second one.
      if (prev?.kind === 'V' && /[aoeu]$/.test(out) && fr.startsWith('i')) fr = 'ï' + fr.slice(1);
      if (fr === 'aill' && last) fr = 'aille';
      if (fr === 'eu' && last && units.length > 2) fr = 'eur'; // final schwa: -er in English (gamer)
    }
    out += fr;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Pipeline

interface Segment { text: string; locked: boolean }

const WORD_CHAR = '[\\p{L}\\p{N}]';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledLexicon { regex: RegExp; lookup: Map<string, string>; caseSensitive: boolean }

let compiled: CompiledLexicon[] | null = null;

function compileLexicon(): CompiledLexicon[] {
  if (compiled) return compiled;
  const groups = [true, false].map(caseSensitive => {
    const entries = effectiveLexicon().filter(e => !!e.caseSensitive === caseSensitive && e.word);
    if (entries.length === 0) return null;
    const lookup = new Map<string, string>();
    for (const e of entries) lookup.set(caseSensitive ? e.word : e.word.toLowerCase(), e.say);
    // Longest first so "Google Meet" wins over "Google".
    const alternatives = [...entries]
      .sort((a, b) => b.word.length - a.word.length)
      .map(e => escapeRegExp(e.word).replace(/ /g, '\\s+'));
    const regex = new RegExp(`(?<!${WORD_CHAR})(?:${alternatives.join('|')})(?!${WORD_CHAR})`, caseSensitive ? 'gu' : 'giu');
    return { regex, lookup, caseSensitive };
  });
  compiled = groups.filter((g): g is CompiledLexicon => g !== null);
  return compiled;
}

function applyLexicon(segments: Segment[], changes: Change[]): Segment[] {
  for (const { regex, lookup, caseSensitive } of compileLexicon()) {
    segments = segments.flatMap(segment => {
      if (segment.locked) return [segment];
      const parts: Segment[] = [];
      let lastIndex = 0;
      for (const match of segment.text.matchAll(regex)) {
        const found = match[0];
        const key = found.replace(/\s+/g, ' ');
        const say = lookup.get(caseSensitive ? key : key.toLowerCase());
        if (say === undefined) continue;
        if (match.index > lastIndex) parts.push({ text: segment.text.slice(lastIndex, match.index), locked: false });
        parts.push({ text: say, locked: true });
        if (say !== found) changes.push({ from: found, to: say, source: 'lexique' });
        lastIndex = match.index + found.length;
      }
      if (lastIndex < segment.text.length) parts.push({ text: segment.text.slice(lastIndex), locked: false });
      return parts;
    });
  }
  return segments;
}

/** Result of layers 2–3 for one word: replacement, or null to keep it. Cached until the lexicon changes. */
interface WordDecision { say: string | null; source?: ChangeSource; unresolved?: boolean }

const MAX_CACHE = 5000;
const cache = new Map<string, WordDecision>();

onLexiconChange(() => { compiled = null; });

async function decideWords(words: string[]): Promise<Map<string, WordDecision>> {
  const result = new Map<string, WordDecision>();
  const todo = words.filter(w => {
    const hit = cache.get(w);
    if (hit) result.set(w, hit);
    return !hit;
  });
  if (todo.length === 0) return result;

  const phonemes = await phonemize(todo);
  if (!phonemes) return result; // no phonemizer: lexicon only

  const decisions = new Map<string, WordDecision>();
  const candidates: { word: string; say: string }[] = [];
  todo.forEach((word, i) => {
    const p = phonemes[i];
    if (!isEnglish(p)) return void decisions.set(word, { say: null });
    if (isAcronym(word, p)) return void decisions.set(word, { say: spell(word.toUpperCase()), source: 'sigle' });
    const say = respell(p);
    if (say) candidates.push({ word, say });
    else decisions.set(word, { say: null, unresolved: true });
  });

  // Keep a respelling only if espeak now reads it with French phonemes.
  const check = await phonemize(candidates.map(c => c.say));
  candidates.forEach(({ word, say }, i) => {
    const ok = check && !isEnglish(check[i]);
    decisions.set(word, ok ? { say, source: 'auto' } : { say: null, unresolved: true });
  });

  for (const [word, decision] of decisions) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(word, decision);
    result.set(word, decision);
  }
  return result;
}

const TOKEN = /[\p{L}\p{N}]+/gu;

/** A message written mostly in capitals is shouted, not full of acronyms. */
function isShouting(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const upper = letters.filter(c => c !== c.toLowerCase()).length;
  return letters.length >= 8 && upper / letters.length > 0.6;
}

export async function preparePronunciation(text: string): Promise<PronunciationResult> {
  const changes: Change[] = [];
  const unresolved: string[] = [];
  const segments = applyLexicon([{ text, locked: false }], changes);
  const shouting = isShouting(text);

  // Words to look at: at least 2 characters, at least one letter.
  const normalize = (w: string) => (shouting ? w.toLowerCase() : w);
  const words = new Set<string>();
  for (const s of segments) {
    if (s.locked) continue;
    for (const [w] of s.text.matchAll(TOKEN)) if (w.length >= 2 && /\p{L}/u.test(w)) words.add(normalize(w));
  }
  const decisions = await decideWords([...words]);

  const out = segments.map(s => {
    if (s.locked) return s.text;
    return s.text.replace(TOKEN, word => {
      const decision = decisions.get(normalize(word));
      if (decision?.unresolved && !unresolved.includes(word)) unresolved.push(word);
      if (!decision?.say) return word;
      changes.push({ from: word, to: decision.say, source: decision.source! });
      return decision.say;
    });
  }).join('');

  recordRecent(changes, unresolved);
  return { text: out, changes, unresolved };
}

// ---------------------------------------------------------------------------
// Recent automatic corrections, shown in the dashboard so they can be fixed by hand.

export interface RecentWord {
  word: string;
  /** Null when no correction was found (still read the English way). */
  say: string | null;
  source: ChangeSource | null;
  count: number;
  lastSeen: number;
}

const MAX_RECENT = 60;
const recent = new Map<string, RecentWord>();

function recordRecent(changes: Change[], unresolved: string[]): void {
  const now = Date.now();
  const touch = (word: string, say: string | null, source: ChangeSource | null) => {
    const key = word.toLowerCase();
    const entry = recent.get(key) ?? { word, say, source, count: 0, lastSeen: now };
    recent.delete(key); // re-insert at the end (most recent)
    recent.set(key, { ...entry, say, source, count: entry.count + 1, lastSeen: now });
    if (recent.size > MAX_RECENT) recent.delete(recent.keys().next().value!);
  };
  for (const c of changes) if (c.source !== 'lexique') touch(c.from, c.to, c.source);
  for (const w of unresolved) touch(w, null, null);
}

export function listRecent(): RecentWord[] {
  const lexiconKeys = new Set(effectiveLexicon().map(e => e.word.toLowerCase()));
  return [...recent.values()].filter(r => !lexiconKeys.has(r.word.toLowerCase())).reverse();
}

export type { LexiconEntry };
