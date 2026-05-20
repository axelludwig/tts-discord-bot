import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  DISCORD_TOKEN: requireEnv('DISCORD_TOKEN'),
  API_TOKEN: requireEnv('API_TOKEN'),
  API_PORT: parseInt(process.env['API_PORT'] ?? '3000', 10),
  PIPER_BIN: process.env['PIPER_BIN'] ?? './bin/piper-runtime/piper',
  VOICES_DIR: process.env['VOICES_DIR'] ?? './voices',
  CORS_ORIGIN: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
  GUILD_ID: process.env['GUILD_ID'] ?? '',
};
