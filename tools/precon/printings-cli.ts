// `node tools/precon/printings-cli.ts --decks <dir> --snapshots <dir> [--report <file>]`: rewrites the decklists of the precons of the app with the printings
// Archidekt names (the decks of `scan-cli.ts` are in <dir>), and says what happened to each. Used by the workflow "Precon printings".
// The workspace packages are written for a bundler: the hooks of tools/corpus/register.ts must be in place before the card pipeline is imported.

import '../corpus/register.ts';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { decks: { type: 'string' }, snapshots: { type: 'string' }, report: { type: 'string' } },
});
if (values.decks === undefined || values.snapshots === undefined) {
  process.stderr.write(
    'usage: printings-cli.ts --decks <dir> --snapshots <dir> [--report <file>]\n',
  );
  process.exit(2);
}
try {
  const { refreshPrintings } = await import('./printings.ts');
  const outcomes = await refreshPrintings(values.decks, values.snapshots);
  const lines = outcomes.map((o) => `- ${o.id}: ${o.status}, ${o.detail}`);
  const updated = outcomes.filter((o) => o.status === 'updated').length;
  const text = `${updated} of ${outcomes.length} precon(s) updated\n\n${lines.join('\n')}\n`;
  process.stdout.write(text);
  if (values.report !== undefined) await writeFile(values.report, text);
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
