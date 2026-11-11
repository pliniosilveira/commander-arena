// Entry point of `pnpm corpus:check-issue --body <file>` (D-251): the workspace hooks first, then the check (see cli.ts).

import './register.ts';

const { main } = await import('./check-issue.ts');

process.exitCode = await main(process.argv.slice(2), (text) => process.stdout.write(`${text}\n`));
