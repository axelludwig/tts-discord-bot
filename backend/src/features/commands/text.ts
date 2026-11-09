import { config } from '../../config.js';

/** Turns a Discord message into something pleasant to hear. Returns '' when nothing is left. */
export function toSpeakableText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' bloc de code ')
    .replace(/https?:\/\/\S+/gi, ' lien ')
    .replace(/<a?:(\w+):\d+>/g, ' $1 ') // custom emoji -> its name
    .replace(/<t:\d+(:\w)?>/g, ' ') // timestamps
    .replace(/[*_~`|>#]+/g, ' ') // markdown
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, config.MAX_TEXT_LENGTH);
}
