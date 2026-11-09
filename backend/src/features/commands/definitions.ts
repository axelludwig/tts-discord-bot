import {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

const command = (name: string, description: string) => new SlashCommandBuilder()
  .setName(name)
  .setDescription(description)
  .setContexts(InteractionContextType.Guild);

export const commandDefinitions = [
  command('join', 'Fait venir le bot dans ton salon vocal'),

  command('leave', 'Fait partir le bot du salon vocal (vide la file)'),

  command('say', 'Fait lire un texte au bot')
    .addStringOption(o => o.setName('texte').setDescription('Ce que le bot doit dire').setRequired(true))
    .addStringOption(o => o.setName('voix').setDescription('Voix à utiliser (sinon ta voix par défaut)').setAutocomplete(true))
    .addIntegerOption(o => o.setName('pitch').setDescription('Hauteur en demi-tons').setMinValue(-24).setMaxValue(24))
    .addNumberOption(o => o.setName('vitesse').setDescription('Vitesse de lecture').setMinValue(0.5).setMaxValue(2)),

  command('skip', 'Passe au message suivant'),

  command('stop', 'Arrête la lecture et vide la file'),

  command('queue', 'Affiche la file d\'attente'),

  command('voix', 'Règle ta voix par défaut (sans option : affiche tes réglages)')
    .addStringOption(o => o.setName('voix').setDescription('Voix').setAutocomplete(true))
    .addIntegerOption(o => o.setName('pitch').setDescription('Hauteur en demi-tons').setMinValue(-24).setMaxValue(24))
    .addNumberOption(o => o.setName('vitesse').setDescription('Vitesse de lecture').setMinValue(0.5).setMaxValue(2))
    .addBooleanOption(o => o.setName('reset').setDescription('Revenir aux réglages par défaut')),

  command('tts-salon', 'Lit à voix haute les messages d\'un salon texte (sans option : désactive)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o
      .setName('salon')
      .setDescription('Salon texte à lire')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)),
];
