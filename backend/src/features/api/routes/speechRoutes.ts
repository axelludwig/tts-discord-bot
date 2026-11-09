import { Router } from 'express';
import { config } from '../../../config.js';
import { QueueError, clear, enqueue, getQueueState, remove, skip } from '../../speech/queue.js';

function requireGuildId(body: any): string | null {
  return typeof body?.guildId === 'string' && body.guildId ? body.guildId : null;
}

export function buildSpeechRoutes(): Router {
  const router = Router();

  router.post('/speak', (req, res) => {
    const { text, voiceId, pitch = 0, tempo = 1, author } = req.body ?? {};
    const guildId = requireGuildId(req.body);

    if (!guildId) return void res.status(400).json({ error: 'guildId required' });
    if (typeof text !== 'string' || !text.trim()) return void res.status(400).json({ error: 'text required' });
    if (text.length > config.MAX_TEXT_LENGTH) {
      return void res.status(400).json({ error: `text too long (${config.MAX_TEXT_LENGTH} characters max)` });
    }
    if (typeof voiceId !== 'string' || !voiceId) return void res.status(400).json({ error: 'voiceId required' });
    if (typeof pitch !== 'number' || pitch < -24 || pitch > 24) {
      return void res.status(400).json({ error: 'pitch must be a number between -24 and 24' });
    }
    if (typeof tempo !== 'number' || tempo < 0.5 || tempo > 2.0) {
      return void res.status(400).json({ error: 'tempo must be a number between 0.5 and 2.0' });
    }

    try {
      const { item, position } = enqueue(guildId, {
        text: text.trim(),
        voiceId,
        pitch,
        tempo,
        author: typeof author === 'string' && author ? author.slice(0, 64) : 'dashboard',
      });
      res.json({ ok: true, id: item.id, position });
    } catch (err) {
      if (err instanceof QueueError) return void res.status(err.status).json({ error: err.message });
      console.error('[api] /speak failed:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  router.get('/queue/:guildId', (req, res) => {
    res.json(getQueueState(req.params.guildId));
  });

  router.post('/skip', (req, res) => {
    const guildId = requireGuildId(req.body);
    if (!guildId) return void res.status(400).json({ error: 'guildId required' });
    skip(guildId);
    res.json({ ok: true });
  });

  router.delete('/queue/:guildId/:itemId', (req, res) => {
    const removed = remove(req.params.guildId, req.params.itemId);
    if (!removed) return void res.status(404).json({ error: 'Queue item not found' });
    res.json({ ok: true });
  });

  /** Stops playback and empties the queue. */
  router.post('/stop', (req, res) => {
    const guildId = requireGuildId(req.body);
    if (!guildId) return void res.status(400).json({ error: 'guildId required' });
    clear(guildId);
    res.json({ ok: true });
  });

  return router;
}
