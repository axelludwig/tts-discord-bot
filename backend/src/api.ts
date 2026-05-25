import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { client } from './bot.js';
import { config } from './config.js';
import { isPlaying } from './player.js';
import { getConnection, listVoiceChannels } from './voice.js';
import { authMiddleware } from './features/api/auth.js';
import { buildGuildRoutes } from './features/api/routes/guildRoutes.js';
import { buildPublicRoutes } from './features/api/routes/publicRoutes.js';
import { buildSpeechRoutes } from './features/api/routes/speechRoutes.js';
import { buildVoiceRoutes } from './features/api/routes/voiceRoutes.js';

const app = express();

app.use(express.json());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(buildPublicRoutes());
app.use(authMiddleware);
app.use(buildGuildRoutes());
app.use(buildVoiceRoutes());
app.use(buildSpeechRoutes());

function buildGuildRealtimeState(guildId: string) {
  const connection = getConnection(guildId);
  const connected = !!connection;
  const channelId = connected ? (connection as any).joinConfig?.channelId : undefined;

  return {
    guildId,
    connected,
    ...(channelId ? { channelId } : {}),
    playing: isPlaying(guildId),
    channels: listVoiceChannels(guildId),
  };
}

export function startApi(port: number): void {
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: config.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  io.use((socket, next) => {
    const token = typeof socket.handshake.auth?.['token'] === 'string'
      ? socket.handshake.auth['token']
      : '';
    if (token !== config.API_TOKEN) {
      next(new Error('Unauthorized'));
      return;
    }
    next();
  });

  io.on('connection', socket => {
    socket.emit('socket:ready', { ok: true });

    socket.on('ping', () => {
      socket.emit('pong', { ts: Date.now() });
    });

    socket.on('guild:subscribe', payload => {
      const guildId = typeof payload?.guildId === 'string' ? payload.guildId : '';
      if (!guildId) {
        socket.emit('socket:error', { message: 'guildId required' });
        return;
      }
      if (!client.guilds.cache.has(guildId)) {
        socket.emit('socket:error', { message: 'Guild not found' });
        return;
      }

      socket.join(`guild:${guildId}`);
      socket.emit('guild:update', buildGuildRealtimeState(guildId));
    });

    socket.on('guild:unsubscribe', payload => {
      const guildId = typeof payload?.guildId === 'string' ? payload.guildId : '';
      if (!guildId) return;
      socket.leave(`guild:${guildId}`);
    });
  });

  setInterval(() => {
    for (const guildId of client.guilds.cache.keys()) {
      const roomName = `guild:${guildId}`;
      const room = io.sockets.adapter.rooms.get(roomName);
      if (!room || room.size === 0) continue;
      io.to(roomName).emit('guild:update', buildGuildRealtimeState(guildId));
    }
  }, 3000);

  httpServer.listen(port, () => {
    console.log(`[api] Listening on http://localhost:${port}`);
  });
}
