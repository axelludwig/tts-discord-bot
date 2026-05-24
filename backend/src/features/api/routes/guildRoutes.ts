import { Router } from 'express';
import { client } from '../../../bot.js';
import { listVoiceChannels } from '../../../voice.js';

export function buildGuildRoutes(): Router {
  const router = Router();

  router.get('/guilds', (_req, res) => {
    const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
    res.json(guilds);
  });

  router.get('/guilds/:id/channels', (req, res) => {
    const { id } = req.params;
    const guild = client.guilds.cache.get(id);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }
    res.json(listVoiceChannels(id));
  });

  return router;
}
