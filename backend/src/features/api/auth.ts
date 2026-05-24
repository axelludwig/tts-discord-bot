import { NextFunction, Request, Response } from 'express';
import { config } from '../../config.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/')) {
    next();
    return;
  }

  const auth = req.headers['authorization'];
  if (!auth || auth !== `Bearer ${config.API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
