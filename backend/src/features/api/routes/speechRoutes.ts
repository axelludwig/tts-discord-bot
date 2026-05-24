import { Router } from 'express';
import { stop } from '../../../player.js';
import { speak } from '../../../speak.js';

export function buildSpeechRoutes(): Router {
  const router = Router();

  router.post('/speak', (req, res) => {
    const { guildId, text, voiceId, pitch = 0, tempo = 1 } = req.body;

    if (typeof guildId !== 'string' || !guildId) {
      res.status(400).json({ error: 'guildId required' });
      return;
    }
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    if (typeof voiceId !== 'string' || !voiceId) {
      res.status(400).json({ error: 'voiceId required' });
      return;
    }
    if (typeof pitch !== 'number' || pitch < -24 || pitch > 24) {
      res.status(400).json({ error: 'pitch must be a number between -24 and 24' });
      return;
    }
    if (typeof tempo !== 'number' || tempo < 0.5 || tempo > 2.0) {
      res.status(400).json({ error: 'tempo must be a number between 0.5 and 2.0' });
      return;
    }

    try {
      speak(guildId, text, voiceId, pitch, tempo);
      res.json({ ok: true });
    } catch (err: any) {
      const msg: string = err?.message ?? 'Internal error';
      if (msg.includes('No active voice connection') || msg.includes('Voice not found')) {
        res.status(404).json({ error: msg });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  router.post('/stop', (req, res) => {
    const { guildId } = req.body;
    if (typeof guildId !== 'string' || !guildId) {
      res.status(400).json({ error: 'guildId required' });
      return;
    }

    stop(guildId);
    res.json({ ok: true });
  });

  return router;
}
