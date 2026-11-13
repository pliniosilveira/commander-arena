// Entry point of `node tools/corpus/coverage-badge-cli.ts ...` (D-410): see coverage-badge.ts.

import { main } from './coverage-badge.ts';

process.exitCode = await main(process.argv.slice(2), (text) => process.stdout.write(`${text}\n`));
