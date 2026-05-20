import { config } from './config.js';
import { loginBot } from './bot.js';
import { startApi } from './api.js';
import { loadVoices } from './tts.js';

async function main() {
  loadVoices();
  await loginBot();
  startApi(config.API_PORT);
  console.log(`Bot ready. API listening on ${config.API_PORT}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
