import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { client } from './bot.js';
import { config } from './config.js';
import { authMiddleware } from './features/api/auth.js';
import { buildGuildRoutes } from './features/api/routes/guildRoutes.js';
import { buildPublicRoutes } from './features/api/routes/publicRoutes.js';
import { buildSpeechRoutes } from './features/api/routes/speechRoutes.js';
import { buildVoiceRoutes } from './features/api/routes/voiceRoutes.js';
import { onGuildChange } from './features/realtime/events.js';
import { getQueueState } from './features/speech/queue.js';
import { getConnectedChannelId, listVoiceChannels } from './features/voice/index.js';

const app = express();

app.use(express.json());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(buildPublicRoutes());
app.use(authMiddleware);
app.use(buildGuildRoutes());
app.use(buildVoiceRoutes());
app.use(buildSpeechRoutes());

export function buildGuildState(guildId: string) {
  const channelId = getConnectedChannelId(guildId);
  const queue = getQueueState(guildId);
  return {
    guildId,
    connected: !!channelId,
    ...(channelId ? { channelId } : {}),
    playing: !!queue.current,
    queue,
    channels: listVoiceChannels(guildId),
  };
}

export function startApi(port: number): void {
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.CORS_ORIGIN, methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.['token'];
    if (token !== config.API_TOKEN) {
      next(new Error('Unauthorized'));
      return;
    }
    next();
  });

  io.on('connection', socket => {
    socket.emit('socket:ready', { ok: true });

    socket.on('guild:subscribe', payload => {
      const guildId = typeof payload?.guildId === 'string' ? payload.guildId : '';
      if (!client.guilds.cache.has(guildId)) {
        socket.emit('socket:error', { message: guildId ? 'Guild not found' : 'guildId required' });
        return;
      }
      socket.join(`guild:${guildId}`);
      socket.emit('guild:update', buildGuildState(guildId));
    });

    socket.on('guild:unsubscribe', payload => {
      if (typeof payload?.guildId === 'string') socket.leave(`guild:${payload.guildId}`);
    });
  });

  // Coalesce bursts of changes (e.g. several voice state updates) into one push per guild.
  const pending = new Set<string>();
  onGuildChange(guildId => {
    if (pending.has(guildId)) return;
    pending.add(guildId);
    setTimeout(() => {
      pending.delete(guildId);
      io.to(`guild:${guildId}`).emit('guild:update', buildGuildState(guildId));
    }, 50);
  });

  httpServer.listen(port, () => {
    console.log(`[api] Listening on http://localhost:${port}`);
  });
}
