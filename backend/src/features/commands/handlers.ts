import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  Guild,
  Message,
  MessageFlags,
} from 'discord.js';
import { config } from '../../config.js';
import {
  getUserPrefs,
  getGuildSettings,
  resetUserPrefs,
  setTtsChannel,
  setUserPrefs,
} from '../settings/store.js';
import { QueueError, clear, enqueue, getQueueState, skip } from '../speech/queue.js';
import { getVoice, listVoices, resolveVoice } from '../speech/voices.js';
import { getConnectedChannelId, joinChannel, leaveChannel } from '../voice/index.js';
import { commandDefinitions } from './definitions.js';
import { toSpeakableText } from './text.js';

/** Thrown inside a command to send the message back to the user as an ephemeral reply. */
class UserError extends Error {}

function userVoiceChannelId(guild: Guild, userId: string): string | undefined {
  return guild.voiceStates.cache.get(userId)?.channelId ?? undefined;
}

/** Commands that act on playback require being in the bot's channel, so nobody trolls from afar. */
function requireSameChannel(guild: Guild, userId: string): void {
  const botChannel = getConnectedChannelId(guild.id);
  if (!botChannel) throw new UserError('Je ne suis dans aucun salon vocal. Utilise `/join`.');
  if (userVoiceChannelId(guild, userId) !== botChannel) {
    throw new UserError(`Rejoins <#${botChannel}> pour faire ça.`);
  }
}

/** Joins the user's channel if the bot is not connected yet; otherwise checks they share it. */
async function ensureConnectedWithUser(guild: Guild, userId: string): Promise<void> {
  if (getConnectedChannelId(guild.id)) return requireSameChannel(guild, userId);
  const channelId = userVoiceChannelId(guild, userId);
  if (!channelId) throw new UserError('Rejoins d\'abord un salon vocal.');
  await joinChannel(guild.id, channelId);
}

function describeVoice(voiceId: string | undefined, pitch = 0, tempo = 1): string {
  return `\`${voiceId ?? '?'}\` · pitch ${pitch > 0 ? '+' : ''}${pitch} · vitesse ${tempo}x`;
}

function queueSpeech(guild: Guild, userId: string, authorName: string, text: string, overrides: {
  voiceId?: string | null; pitch?: number | null; tempo?: number | null;
} = {}): number {
  const prefs = getUserPrefs(guild.id, userId);
  const voice = resolveVoice(overrides.voiceId ?? undefined, prefs.voiceId);
  if (!voice) throw new UserError('Aucune voix installée sur le serveur.');
  if (overrides.voiceId && overrides.voiceId !== voice.id) {
    throw new UserError(`Voix inconnue : \`${overrides.voiceId}\`.`);
  }
  try {
    return enqueue(guild.id, {
      text,
      voiceId: voice.id,
      pitch: overrides.pitch ?? prefs.pitch ?? 0,
      tempo: overrides.tempo ?? prefs.tempo ?? 1,
      author: authorName,
    }).position;
  } catch (err) {
    if (err instanceof QueueError) throw new UserError(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------

type Handler = (interaction: ChatInputCommandInteraction<'cached'>) => Promise<string>;

const handlers: Record<string, Handler> = {
  async join(i) {
    const channelId = userVoiceChannelId(i.guild, i.user.id);
    if (!channelId) throw new UserError('Rejoins d\'abord un salon vocal.');
    await joinChannel(i.guildId, channelId);
    return `Je suis dans <#${channelId}>.`;
  },

  async leave(i) {
    requireSameChannel(i.guild, i.user.id);
    leaveChannel(i.guildId);
    return 'À plus 👋';
  },

  async say(i) {
    const text = i.options.getString('texte', true).trim();
    if (text.length > config.MAX_TEXT_LENGTH) {
      throw new UserError(`Texte trop long (${config.MAX_TEXT_LENGTH} caractères max).`);
    }
    await ensureConnectedWithUser(i.guild, i.user.id);
    const position = queueSpeech(i.guild, i.user.id, i.member.displayName, text, {
      voiceId: i.options.getString('voix'),
      pitch: i.options.getInteger('pitch'),
      tempo: i.options.getNumber('vitesse'),
    });
    return position === 0 ? '🔊 Je lis ton message.' : `⏳ Ajouté à la file (position ${position}).`;
  },

  async skip(i) {
    requireSameChannel(i.guild, i.user.id);
    if (!getQueueState(i.guildId).current) throw new UserError('Rien en cours de lecture.');
    skip(i.guildId);
    return '⏭ Message passé.';
  },

  async stop(i) {
    requireSameChannel(i.guild, i.user.id);
    clear(i.guildId);
    return '⏹ Lecture arrêtée, file vidée.';
  },

  async queue(i) {
    const { current, pending } = getQueueState(i.guildId);
    if (!current && pending.length === 0) return 'La file est vide.';
    const clip = (t: string) => (t.length > 80 ? `${t.slice(0, 77)}…` : t);
    const lines = [
      current ? `▶ **${current.author ?? '?'}** : ${clip(current.text)}` : '',
      ...pending.slice(0, 15).map((item, n) => `${n + 1}. **${item.author ?? '?'}** : ${clip(item.text)}`),
      pending.length > 15 ? `… et ${pending.length - 15} autre(s)` : '',
    ];
    return lines.filter(Boolean).join('\n');
  },

  async voix(i) {
    if (i.options.getBoolean('reset')) {
      resetUserPrefs(i.guildId, i.user.id);
      const voice = resolveVoice();
      return `Réglages remis par défaut : ${describeVoice(voice?.id)}.`;
    }

    const voiceId = i.options.getString('voix');
    const pitch = i.options.getInteger('pitch');
    const tempo = i.options.getNumber('vitesse');

    if (voiceId === null && pitch === null && tempo === null) {
      const prefs = getUserPrefs(i.guildId, i.user.id);
      const voice = resolveVoice(prefs.voiceId);
      return `Ta voix : ${describeVoice(voice?.id, prefs.pitch, prefs.tempo)}.`;
    }

    if (voiceId !== null && !getVoice(voiceId)) throw new UserError(`Voix inconnue : \`${voiceId}\`.`);
    setUserPrefs(i.guildId, i.user.id, {
      ...(voiceId !== null ? { voiceId } : {}),
      ...(pitch !== null ? { pitch } : {}),
      ...(tempo !== null ? { tempo } : {}),
    });
    const prefs = getUserPrefs(i.guildId, i.user.id);
    return `C'est noté : ${describeVoice(resolveVoice(prefs.voiceId)?.id, prefs.pitch, prefs.tempo)}.`;
  },

  async 'tts-salon'(i) {
    const channel = i.options.getChannel('salon');
    if (!channel) {
      setTtsChannel(i.guildId, undefined);
      return 'Lecture automatique désactivée.';
    }
    if (!config.ENABLE_TEXT_CHANNEL) {
      throw new UserError(
        'La lecture de salon est désactivée sur ce bot : il faut `ENABLE_TEXT_CHANNEL=true` dans le `.env` '
        + 'et l\'intent *Message Content* coché sur le portail développeur Discord.',
      );
    }
    setTtsChannel(i.guildId, channel.id);
    return `Je lirai les messages de <#${channel.id}> quand je suis en vocal (ceux qui commencent par \`//\` sont ignorés).`;
  },
};

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const handler = handlers[interaction.commandName];
  if (!handler) return;

  // join/say may wait up to 15 s for the voice connection: defer to stay under Discord's 3 s limit.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await interaction.editReply(await handler(interaction));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue.';
    if (!(err instanceof UserError)) console.error(`[commands] /${interaction.commandName} failed:`, err);
    await interaction.editReply(`❌ ${message}`).catch(() => {});
  }
}

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'voix') return interaction.respond([]);
  const query = String(focused.value).toLowerCase();
  const choices = listVoices()
    .filter(v => v.id.toLowerCase().includes(query))
    .slice(0, 25)
    .map(v => ({ name: v.id, value: v.id }));
  await interaction.respond(choices);
}

/** Reads messages posted in the guild's /tts-salon channel, in the author's voice. */
function handleMessage(message: Message): void {
  if (!message.inGuild() || message.author.bot) return;
  const { ttsChannelId } = getGuildSettings(message.guildId);
  if (!ttsChannelId || message.channelId !== ttsChannelId) return;
  if (message.content.startsWith('//')) return;

  const botChannel = getConnectedChannelId(message.guildId);
  if (!botChannel || userVoiceChannelId(message.guild, message.author.id) !== botChannel) return;

  const text = toSpeakableText(message.cleanContent);
  if (!text) return;

  try {
    queueSpeech(message.guild, message.author.id, message.member?.displayName ?? message.author.username, text);
  } catch (err) {
    console.warn(`[commands] text channel message not queued: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------

export async function registerCommands(client: Client<true>): Promise<void> {
  const body = commandDefinitions.map(c => c.toJSON());
  try {
    if (config.GUILD_ID) {
      // Guild commands show up instantly; global ones can take up to an hour.
      await client.application.commands.set(body, config.GUILD_ID);
      console.log(`[commands] ${body.length} slash commands registered on guild ${config.GUILD_ID}`);
    } else {
      await client.application.commands.set(body);
      console.log(`[commands] ${body.length} slash commands registered globally`);
    }
  } catch (err) {
    console.error('[commands] Registration failed (is the bot invited with the applications.commands scope?):', err);
  }
}

export function registerCommandHandlers(client: Client): void {
  client.on('interactionCreate', interaction => {
    const task = interaction.isChatInputCommand() ? handleCommand(interaction)
      : interaction.isAutocomplete() ? handleAutocomplete(interaction)
        : null;
    task?.catch(err => console.error('[commands] interaction failed:', err));
  });

  if (config.ENABLE_TEXT_CHANNEL) client.on('messageCreate', handleMessage);
}
