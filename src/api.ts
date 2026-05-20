import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { client } from './bot.js';
import { listVoiceChannels, joinChannel, leaveChannel, getConnection } from './voice.js';
import { listVoices } from './tts.js';
import { stop, isPlaying } from './player.js';
import { speak } from './speak.js';

const app = express();

app.use(express.json());
app.use(cors({ origin: config.CORS_ORIGIN }));

// Auth middleware — skip for GET /health
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' && req.path === '/health') return next();
  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${config.API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

// GET /health
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /guilds
app.get('/guilds', (_req: Request, res: Response) => {
  const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name }));
  res.json(guilds);
});

// GET /guilds/:id/channels
app.get('/guilds/:id/channels', (req: Request, res: Response) => {
  const { id } = req.params;
  const guild = client.guilds.cache.get(id);
  if (!guild) {
    res.status(404).json({ error: 'Guild not found' });
    return;
  }
  res.json(listVoiceChannels(id));
});

// POST /voice/join
app.post('/voice/join', async (req: Request, res: Response) => {
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

// POST /voice/leave
app.post('/voice/leave', (req: Request, res: Response) => {
  const { guildId } = req.body;
  if (typeof guildId !== 'string' || !guildId) {
    res.status(400).json({ error: 'guildId required' });
    return;
  }
  leaveChannel(guildId);
  res.json({ ok: true });
});

// GET /voices
app.get('/voices', (_req: Request, res: Response) => {
  res.json(listVoices().map(v => ({ id: v.id, language: v.language })));
});

// POST /speak
app.post('/speak', (req: Request, res: Response) => {
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

// POST /stop
app.post('/stop', (req: Request, res: Response) => {
  const { guildId } = req.body;
  if (typeof guildId !== 'string' || !guildId) {
    res.status(400).json({ error: 'guildId required' });
    return;
  }
  stop(guildId);
  res.json({ ok: true });
});

// GET /status
app.get('/status', (_req: Request, res: Response) => {
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

export function startApi(port: number): void {
  app.listen(port, () => {
    console.log(`[api] Listening on http://localhost:${port}`);
  });
}
