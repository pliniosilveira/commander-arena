// Entry point of `pnpm corpus:fetch-rulings` (issue 284): the workspace hooks first, then the fetch with the real network and clock.

import './register.ts';

const { mainFetch } = await import('./rulings.ts');

process.exitCode = await mainFetch(
  process.argv.slice(2),
  (text) => process.stdout.write(`${text}\n`),
  {
    fetch: (url, init) => fetch(url, init),
    now: () => performance.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    userAgent:
      'commander-arena-deck-support/1 (+https://github.com/pliniosilveira/commander-arena)',
  },
);
