import type { LexiconEntry } from './lexicon.js';

/**
 * Built-in pronunciations, for words the automatic layers get wrong or do not see
 * (espeak reads them with French phonemes, but not the way people say them).
 * Each spelling was checked with piper_phonemize: espeak must read it with French phonemes only.
 * A custom entry with the same word replaces the default one.
 */
export const DEFAULT_LEXICON: LexiconEntry[] = [
  // Acronyms
  { word: 'TTS', say: 'té té èss' },
  { word: 'AI', say: 'a i', caseSensitive: true }, // case-sensitive: leaves the French "ai" alone
  { word: 'CEO', say: 'si i o' },
  { word: 'GG', say: 'djidji' },
  { word: 'IRL', say: 'i èr èl' },
  { word: 'ChatGPT', say: 'tchatte djé pé té' },
  { word: 'OpenAI', say: 'opeunn a i' },

  // Brands and apps
  { word: 'Teams', say: 'timmze' },
  { word: 'Gmail', say: 'djimèle' },
  { word: 'Discord', say: 'discorde' },
  { word: 'YouTube', say: 'youtioube' },
  { word: 'iPhone', say: 'aillefone' },
  { word: 'iPad', say: 'aillepade' },
  { word: 'WhatsApp', say: 'ouatsape' },
  { word: 'LinkedIn', say: 'linnkedine' },
  { word: 'Spotify', say: 'spautifaille' },
  { word: 'Twitter', say: 'touiteur' },
  { word: 'Reddit', say: 'rèdite' },
  { word: 'Uber', say: 'oubeur' },
  { word: 'Snapchat', say: 'snapchate' },
  { word: 'Nvidia', say: 'ènvidia' },
  { word: 'PowerPoint', say: 'paoueur poïnnte' },
  { word: 'Minecraft', say: 'maillnnkraft' },
  { word: 'Fortnite', say: 'fortnaillte' },
  { word: 'League of Legends', say: 'ligue ove lèdjeunnde' },

  // Everyday English
  { word: 'wifi', say: 'ouifi' },
  { word: 'wi-fi', say: 'ouifi' },
  { word: 'weekend', say: 'ouikènnde' },
  { word: 'week-end', say: 'ouikènnde' },
  { word: 'parking', say: 'parkinng' },
  { word: 'shopping', say: 'chopinng' },
  { word: 'email', say: 'imèle' },
  { word: 'e-mail', say: 'imèle' },
  { word: 'mail', say: 'mèle' },
  { word: 'download', say: 'daounelode' },
  { word: 'please', say: 'pliz' },
  { word: 'thanks', say: 'sènnkse' },
  { word: 'with', say: 'ouisse' },
];
