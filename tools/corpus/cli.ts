// Entry point of `pnpm corpus:templates` and `pnpm coverage:cards`:
//
//   node tools/corpus/cli.ts templates --file <oracle_cards file>
//   node tools/corpus/cli.ts coverage --download
//   node tools/corpus/cli.ts replay
//   node tools/corpus/cli.ts decks --file <oracle_cards file> --deck <decklist>
//
// The workspace packages are written for a bundler (imports without file extensions). The hooks
// installed by register.ts retry such imports with ".ts", so plain Node can load the card
// pipeline; main.ts is therefore imported only after they are in place.

import './register.ts';

const { run, REPO_ROOT } = await import('./main.ts');

process.exitCode = await run(
  process.argv.slice(2),
  {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  },
  { repoRoot: REPO_ROOT },
);
