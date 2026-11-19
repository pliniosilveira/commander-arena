// Entry point of `pnpm corpus:rulings-from-comment` (issue 284); the hooks of register.ts let plain Node load the packages.

import './register.ts';

const { mainRead } = await import('./rulings.ts');

process.exitCode = await mainRead(process.argv.slice(2), (text) =>
  process.stdout.write(`${text}\n`),
);
