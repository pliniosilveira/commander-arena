// Entry point of the top-1000 vs. ready-issues report (see top-blockers.ts); the workspace hooks first (see cli.ts).

import './register.ts';

const { main } = await import('./top-blockers.ts');

process.exitCode = await main(process.argv.slice(2), (text) => process.stdout.write(`${text}\n`));
