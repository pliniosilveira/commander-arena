// `node tools/precon/scan-cli.ts --out <dir> [--ids 1,2,3] [--limit N] [--delay MS] [--any-size]`: reads Archidekt's Commander precons and writes one
// `<id>.txt` decklist for each and `index.json` ([{ id, name, file, cards }]) into <dir>. Used by the workflow "Precon issues".

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { scanArchidekt } from './scan.ts';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    out: { type: 'string' },
    ids: { type: 'string' },
    limit: { type: 'string' },
    delay: { type: 'string' },
    'any-size': { type: 'boolean' },
  },
});
if (values.out === undefined) {
  process.stderr.write(
    'usage: scan-cli.ts --out <dir> [--ids 1,2,3] [--limit N] [--delay MS] [--any-size]\n',
  );
  process.exit(2);
}
const ids = (values.ids ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);

try {
  const decks = await scanArchidekt({
    fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => process.stdout.write(`${line}\n`),
    ids,
    limit: Number(values.limit ?? 0) || 0,
    delayMs: Number(values.delay ?? 1500) || 0,
    anySize: values['any-size'] === true,
  });
  await mkdir(values.out, { recursive: true });
  const index = [];
  for (const deck of decks) {
    const file = `${deck.id}.txt`;
    await writeFile(path.join(values.out, file), `${deck.text}\n`);
    index.push({ id: deck.id, name: deck.name, file, cards: deck.cards });
  }
  await writeFile(path.join(values.out, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  process.stdout.write(`${decks.length} deck(s) written to ${values.out}\n`);
  process.exitCode = decks.length > 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
