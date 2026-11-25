// Entry point of `node tools/ai/report.ts --body <file> [--json]` (issue 627): decodes the replay block of a "That was a dumb move"
// issue, replays the game to the reported AI decision and prints the position from the AI seat's view (report-main.ts). The
// workspace hooks are installed first, then the command is loaded (see tools/corpus/register.ts).

import '../corpus/register.ts';

const { main } = await import('./report-main.ts');

process.exitCode = await main(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
});
