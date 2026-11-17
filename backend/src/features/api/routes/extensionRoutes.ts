import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { client } from '../../../bot.js';
import { config } from '../../../config.js';
import { listPresets } from '../../settings/store.js';
import { synthesize } from '../../speech/synthesis.js';
import { getVoice, listVoices } from '../../speech/voices.js';

/**
 * Routes used by the Teams browser extension (extension/ at the repo root).
 * The extension mixes the rendered audio into the microphone Teams web captures,
 * so here we only synthesize: no queue, no Discord connection.
 */

const SAMPLE_RATE = 48000;
const MAX_CONCURRENT_RENDERS = 2;
const RENDER_TIMEOUT_MS = 30_000;
let activeRenders = 0;

function extensionAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.EXTENSION_TOKEN) return void res.status(404).json({ error: 'Extension API disabled (EXTENSION_TOKEN unset)' });
  const given = Buffer.from(req.headers['authorization'] ?? '');
  const expected = Buffer.from(`Bearer ${config.EXTENSION_TOKEN}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return void res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/** 44-byte header for 16-bit mono PCM. */
function wavHeader(dataLength: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dataLength, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dataLength, 40);
  return h;
}

export function buildExtensionRoutes(): Router {
  const router = Router();
  router.use(extensionAuth);

  router.get('/voices', (_req, res) => {
    res.json(listVoices().map(v => ({ id: v.id, language: v.language })));
  });

  /** Presets of every guild, so the extension can offer the same quick messages as the dashboard. */
  router.get('/presets', (_req, res) => {
    res.json(
      client.guilds.cache.map(g => ({ guildId: g.id, guildName: g.name, presets: listPresets(g.id) }))
        .filter(g => g.presets.length > 0),
    );
  });

  /** Returns the message as a WAV (16-bit mono 48 kHz). */
  router.post('/render', (req, res) => {
    const { text, voiceId, pitch = 0, tempo = 1 } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim()) return void res.status(400).json({ error: 'text required' });
    if (text.length > config.MAX_TEXT_LENGTH) {
      return void res.status(400).json({ error: `text too long (${config.MAX_TEXT_LENGTH} characters max)` });
    }
    const voice = typeof voiceId === 'string' ? getVoice(voiceId) : undefined;
    if (!voice) return void res.status(404).json({ error: `Voice not found: ${voiceId}` });
    if (typeof pitch !== 'number' || pitch < -24 || pitch > 24) {
      return void res.status(400).json({ error: 'pitch must be a number between -24 and 24' });
    }
    if (typeof tempo !== 'number' || tempo < 0.5 || tempo > 2.0) {
      return void res.status(400).json({ error: 'tempo must be a number between 0.5 and 2.0' });
    }
    if (activeRenders >= MAX_CONCURRENT_RENDERS) return void res.status(429).json({ error: 'Too many renders in progress' });

    activeRenders++;
    const { stream, kill } = synthesize(text.trim(), voice, pitch, tempo, 1);
    const chunks: Buffer[] = [];
    let done = false;
    const finish = () => {
      if (done) return false;
      done = true;
      activeRenders--;
      clearTimeout(timer);
      return true;
    };
    const timer = setTimeout(() => {
      if (!finish()) return;
      kill();
      res.status(504).json({ error: 'Synthesis timed out' });
    }, RENDER_TIMEOUT_MS);

    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => {
      if (!finish()) return;
      const pcm = Buffer.concat(chunks);
      if (pcm.length === 0) return void res.status(500).json({ error: 'Synthesis produced no audio' });
      res.type('audio/wav').send(Buffer.concat([wavHeader(pcm.length), pcm]));
    });
    stream.on('error', err => {
      if (!finish()) return;
      console.error('[ext] render failed:', err.message);
      res.status(500).json({ error: 'Synthesis failed' });
    });
    res.on('close', () => {
      if (finish()) kill(); // client went away before the end
    });
  });

  return router;
}
