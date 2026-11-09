import { existsSync } from 'node:fs';
import express, { Router } from 'express';
import { config } from '../../../config.js';

export function buildPublicRoutes(): Router {
  const router = Router();

  // Production: the built dashboard (npm run build) is served by the API itself.
  if (existsSync(config.DASHBOARD_DIR)) {
    router.use(express.static(config.DASHBOARD_DIR));
  } else {
    router.get('/', (_req, res) => {
      res.type('text/plain; charset=utf-8').send(
        'Dashboard not built. Run "npm run build" (production) or "npm run dev" and open http://localhost:5173.',
      );
    });
  }

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/config', (_req, res) => {
    res.json({ guildId: config.GUILD_ID });
  });

  return router;
}
