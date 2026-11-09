import { NextFunction, Request, Response } from 'express';
import { config } from '../../config.js';

/** Everything mounted after this middleware requires `Authorization: Bearer <API_TOKEN>`. */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['authorization'] !== `Bearer ${config.API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
