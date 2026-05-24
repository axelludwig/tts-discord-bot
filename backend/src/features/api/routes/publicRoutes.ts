import { Router } from 'express';
import { config } from '../../../config.js';
import { buildDashboardHtml } from '../dashboardHtml.js';

export function buildPublicRoutes(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildDashboardHtml(config.GUILD_ID));
  });

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}
