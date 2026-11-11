// Entry point of `pnpm precon:snapshot`:
//
//   node tools/precon/cli.ts --file <oracle_cards file> --deck decks/zombies.txt --id zombies ...
//
// The workspace packages are written for a bundler (imports without file extensions). The hooks
// installed by tools/corpus/register.ts retry such imports with ".ts", so plain Node can load the
// card pipeline; main.ts is therefore imported only after they are in place.

import '../corpus/register.ts';

const { run, REPO_ROOT } = await import('./main.ts');

process.exitCode = await run(
  process.argv.slice(2),
  {
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(`${text}\n`),
  },
  { repoRoot: REPO_ROOT },
);
