import cors from 'cors';
import express from 'express';
import { config } from './config.js';
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

export function startApi(port: number): void {
  app.listen(port, () => {
    console.log(`[api] Listening on http://localhost:${port}`);
  });
}
