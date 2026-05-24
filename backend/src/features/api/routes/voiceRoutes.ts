import { Router } from 'express';
import { client } from '../../../bot.js';
import { getConnection, joinChannel, leaveChannel } from '../../../voice.js';
import { isPlaying } from '../../../player.js';
import { listVoices } from '../../../tts.js';

export function buildVoiceRoutes(): Router {
  const router = Router();

  router.post('/voice/join', async (req, res) => {
    const { guildId, channelId } = req.body;
    if (typeof guildId !== 'string' || !guildId) {
      res.status(400).json({ error: 'guildId required' });
      return;
    }
    if (typeof channelId !== 'string' || !channelId) {
      res.status(400).json({ error: 'channelId required' });
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      res.status(404).json({ error: 'Guild not found' });
      return;
    }

    try {
      await joinChannel(guildId, channelId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Internal error' });
    }
  });

  router.post('/voice/leave', (req, res) => {
    const { guildId } = req.body;
    if (typeof guildId !== 'string' || !guildId) {
      res.status(400).json({ error: 'guildId required' });
      return;
    }

    leaveChannel(guildId);
    res.json({ ok: true });
  });

  router.get('/voices', (_req, res) => {
    res.json(listVoices().map(v => ({ id: v.id, language: v.language })));
  });

  router.get('/status', (_req, res) => {
    const guilds = client.guilds.cache.map(g => {
      const connection = getConnection(g.id);
      const connected = !!connection;
      const channelId = connected ? (connection as any).joinConfig?.channelId : undefined;
      return {
        guildId: g.id,
        connected,
        ...(channelId ? { channelId } : {}),
        playing: isPlaying(g.id),
      };
    });

    res.json({ guilds });
  });

  return router;
}
