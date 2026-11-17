/**
 * Shows what the pronunciation step does to some text, without Discord: the rewritten text,
 * which layer changed what, and the phonemes espeak will read.
 *   npx tsx scripts/pronunciation-test.ts "On se fait un Teams ?" "Windows"
 *   printf 'mot1\nmot2\n' | npx tsx scripts/pronunciation-test.ts      (one text per line)
 */
import 'dotenv/config';
import { phonemize, preparePronunciation } from '../src/features/pronunciation/pronunciation.js';

async function main(): Promise<void> {
  let texts = process.argv.slice(2);
  if (texts.length === 0) {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    texts = Buffer.concat(chunks).toString('utf-8').split('\n').map(l => l.trim()).filter(Boolean);
  }
  const results = await Promise.all(texts.map(t => preparePronunciation(t)));
  const phonemes = await phonemize(results.map(r => r.text)) ?? [];
  results.forEach((r, i) => {
    const sources = [...new Set(r.changes.map(c => c.source))].join(',');
    const flag = r.unresolved.length ? `  ⚠ toujours en anglais : ${r.unresolved.join(', ')}` : '';
    console.log(`${texts[i].padEnd(28)} → ${r.text.padEnd(28)} ${(sources || '-').padEnd(12)} /${phonemes[i] ?? '?'}/${flag}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
