import { Router } from 'express';
import { config } from '../../../config.js';
import {
  MAX_ENTRIES,
  hasEntry,
  listCustomEntries,
  listDefaultEntries,
  parseEntry,
  removeEntry,
  upsertEntry,
} from '../../pronunciation/lexicon.js';
import { listRecent, phonemize, preparePronunciation } from '../../pronunciation/pronunciation.js';

export function buildPronunciationRoutes(): Router {
  const router = Router();

  router.get('/pronunciation', (_req, res) => {
    res.json({ entries: listCustomEntries(), defaults: listDefaultEntries(), recent: listRecent() });
  });

  router.put('/pronunciation/entries', (req, res) => {
    const entry = parseEntry(req.body);
    if (typeof entry === 'string') return void res.status(400).json({ error: entry });
    if (!hasEntry(entry) && listCustomEntries().length >= MAX_ENTRIES) {
      return void res.status(400).json({ error: `too many entries (${MAX_ENTRIES} max)` });
    }
    res.json(upsertEntry(entry));
  });

  router.delete('/pronunciation/entries', (req, res) => {
    const word = typeof req.body?.word === 'string' ? req.body.word : '';
    if (!removeEntry(word, req.body?.caseSensitive === true)) return void res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true });
  });

  /** What the voices will actually read, with the phonemes (to tune a spelling before saving it). */
  router.post('/pronunciation/preview', async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return void res.status(400).json({ error: 'text required' });
    if (text.length > config.MAX_TEXT_LENGTH) {
      return void res.status(400).json({ error: `text too long (${config.MAX_TEXT_LENGTH} characters max)` });
    }
    // `raw: true` skips the rewriting: used to check a spelling typed in the "say" field.
    const result = req.body?.raw === true ? { text, changes: [], unresolved: [] } : await preparePronunciation(text);
    const [phonemes] = (await phonemize([result.text])) ?? [null];
    res.json({ ...result, phonemes });
  });

  return router;
}
