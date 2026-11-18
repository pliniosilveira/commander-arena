// Entry point of `pnpm precon:from-issue`; the hooks of register.ts let plain Node load the card pipeline (see cli.ts).

import '../corpus/register.ts';

const { run } = await import('./from-issue.ts');

process.exitCode = await run(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
});
