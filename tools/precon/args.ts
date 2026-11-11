// Command line of `pnpm precon:snapshot`.

import { parseArgs } from 'node:util';

export const USAGE = `Usage: pnpm precon:snapshot --file <oracle_cards file> --deck <decklist> --id <id> --name <name> --blurb <sentence> [options]

Writes the card-data snapshot of one precon (SPEC 6.2, 15 M9, A16) to
apps/web/src/precons/snapshots/<id>.json: the decklist exactly as given and the stored cards it
names, read from Scryfall's oracle_cards bulk file, so the web app can start the precon offline.
Names are matched the way deck import matches them (front-face name for double-faced cards,
case and punctuation normalised). The output is deterministic: run it twice, get the same file.

Required:
  --file <path>     Scryfall oracle_cards bulk file: .jsonl.gz, .jsonl or a .json array
  --deck <path>     the decklist text file (Arena, MTGO, Moxfield or Archidekt export)
  --id <id>         lower-case letters, digits and dashes (zombies); also the file name
  --name <text>     the name shown in the menu
  --blurb <text>    one sentence for the menu

Options:
  --out <dir>       the folder to write into (default: apps/web/src/precons/snapshots/)
  -h, --help        show this text

Exit code: 0 written, 1 a name was not found or the decklist has unreadable lines (nothing is
written), 2 a usage or file error. Cards the engine cannot fully run, and a deck that breaks the
Commander rules, are reported as warnings: the web app refuses to start such a precon.`;

export interface Options {
  readonly file: string;
  readonly deck: string;
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly out: string | undefined;
  readonly help: boolean;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The parsed options, or a message that says what is wrong with the command line. */
export function parseOptions(argv: readonly string[]): Options | string {
  let values: ReturnType<typeof parseArgs>['values'];
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        file: { type: 'string' },
        deck: { type: 'string' },
        id: { type: 'string' },
        name: { type: 'string' },
        blurb: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const text = (key: string): string => {
    const value = values[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const help = values.help === true;
  const options: Options = {
    file: text('file'),
    deck: text('deck'),
    id: text('id'),
    name: text('name'),
    blurb: text('blurb'),
    out: text('out') === '' ? undefined : text('out'),
    help,
  };
  if (help) return options;
  if (positionals.length > 0) return `unexpected argument ${positionals[0]}`;
  for (const key of ['file', 'deck', 'id', 'name', 'blurb'] as const) {
    if (options[key] === '') return `--${key} is required`;
  }
  if (!ID.test(options.id))
    return '--id may only hold lower-case letters, digits and single dashes';
  return options;
}
