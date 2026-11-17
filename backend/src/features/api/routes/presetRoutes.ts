import { Router } from 'express';
import { client } from '../../../bot.js';
import { config } from '../../../config.js';
import { notifyGuild } from '../../realtime/events.js';
import {
  Preset,
  createPreset,
  deletePreset,
  listPresets,
  reorderPresets,
  updatePreset,
} from '../../settings/store.js';

const MAX_PRESETS = 100;
const MAX_LABEL_LENGTH = 40;

/** Validates a preset body; returns the cleaned data or an error message. */
function parsePreset(body: any): Omit<Preset, 'id'> | string {
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return 'text required';
  if (text.length > config.MAX_TEXT_LENGTH) return `text too long (${config.MAX_TEXT_LENGTH} characters max)`;
  if (label.length > MAX_LABEL_LENGTH) return `label too long (${MAX_LABEL_LENGTH} characters max)`;

  const preset: Omit<Preset, 'id'> = { label: label || text.slice(0, MAX_LABEL_LENGTH), text };

  const { voiceId, pitch, tempo } = body;
  if (voiceId !== undefined && voiceId !== null && voiceId !== '') {
    if (typeof voiceId !== 'string') return 'voiceId must be a string';
    preset.voiceId = voiceId;
  }
  if (pitch !== undefined && pitch !== null) {
    if (typeof pitch !== 'number' || pitch < -24 || pitch > 24) return 'pitch must be a number between -24 and 24';
    preset.pitch = pitch;
  }
  if (tempo !== undefined && tempo !== null) {
    if (typeof tempo !== 'number' || tempo < 0.5 || tempo > 2.0) return 'tempo must be a number between 0.5 and 2.0';
    preset.tempo = tempo;
  }
  return preset;
}

export function buildPresetRoutes(): Router {
  const router = Router();

  // Every route is scoped to a guild the bot is in.
  router.use('/guilds/:guildId/presets', (req, res, next) => {
    if (!client.guilds.cache.has(req.params.guildId)) return void res.status(404).json({ error: 'Guild not found' });
    next();
  });

  router.get('/guilds/:guildId/presets', (req, res) => {
    res.json(listPresets(req.params.guildId));
  });

  router.post('/guilds/:guildId/presets', (req, res) => {
    const { guildId } = req.params;
    if (listPresets(guildId).length >= MAX_PRESETS) {
      return void res.status(400).json({ error: `too many presets (${MAX_PRESETS} max)` });
    }
    const data = parsePreset(req.body);
    if (typeof data === 'string') return void res.status(400).json({ error: data });
    const preset = createPreset(guildId, data);
    notifyGuild(guildId);
    res.status(201).json(preset);
  });

  // Declared before /:id so "order" is not taken for an id.
  router.put('/guilds/:guildId/presets/order', (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) {
      return void res.status(400).json({ error: 'ids must be an array of strings' });
    }
    const presets = reorderPresets(req.params.guildId, ids);
    notifyGuild(req.params.guildId);
    res.json(presets);
  });

  router.put('/guilds/:guildId/presets/:id', (req, res) => {
    const { guildId, id } = req.params;
    const data = parsePreset(req.body);
    if (typeof data === 'string') return void res.status(400).json({ error: data });
    const preset = updatePreset(guildId, id, data);
    if (!preset) return void res.status(404).json({ error: 'Preset not found' });
    notifyGuild(guildId);
    res.json(preset);
  });

  router.delete('/guilds/:guildId/presets/:id', (req, res) => {
    const { guildId, id } = req.params;
    if (!deletePreset(guildId, id)) return void res.status(404).json({ error: 'Preset not found' });
    notifyGuild(guildId);
    res.json({ ok: true });
  });

  return router;
}
