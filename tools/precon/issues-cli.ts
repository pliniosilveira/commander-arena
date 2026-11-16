// `node tools/precon/issues-cli.ts --decks <dir> (--file <oracle_cards file> | --download) --out <issues.json> [--installed <snapshots dir>]`: the issues the workflow "Precon issues"
// opens, as JSON ([{ title, body, deckName, deckId, needsSupport }]). `--download` fetches Scryfall's bulk file into `.cache/corpus/` (a runner can reach it).
// The workspace packages are written for a bundler: the hooks of tools/corpus/register.ts must be in place before the card pipeline is imported.

import '../corpus/register.ts';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    decks: { type: 'string' },
    file: { type: 'string' },
    download: { type: 'boolean' },
    out: { type: 'string' },
    installed: { type: 'string' },
  },
});
if (
  values.decks === undefined ||
  values.out === undefined ||
  (values.file === undefined) === (values.download !== true)
) {
  process.stderr.write(
    'usage: issues-cli.ts --decks <dir> (--file <oracle_cards file> | --download) --out <issues.json>\n',
  );
  process.exit(2);
}
const log = (line: string) => process.stdout.write(`${line}\n`);
try {
  const { downloadOracleCards } = await import('../corpus/download.ts');
  const { buildIssues, writeIssues } = await import('./issues.ts');
  const cards = values.file ?? (await downloadOracleCards({ cacheDir: '.cache/corpus', log }));
  const { issues, upToDate, skipped } = await buildIssues(values.decks, cards, values.installed);
  for (const skip of upToDate)
    log(`up to date: "${skip.deck}" is the precon "${skip.precon}" of the app`);
  for (const why of skipped) log(`skipped: ${why}`);
  await writeIssues(issues, values.out);
  const needs = issues.filter((i) => i.needsSupport).length;
  const updates = issues.filter((i) => i.marker.includes(':update:')).length;
  log(
    `${issues.length} issue(s): ${needs} deck support, ${issues.length - needs} without an unsupported card; ${updates} of them update a precon the app has`,
  );
  for (const issue of issues) log(`- ${issue.title}`);
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
