// Command line of tools/corpus/cli.ts.

import { parseArgs } from 'node:util';

export type Command = 'templates' | 'coverage' | 'extract' | 'replay' | 'decks' | 'from-issue';

export interface Options {
  readonly command: Command;
  readonly file: string | undefined;
  readonly download: boolean;
  readonly all: boolean;
  readonly check: boolean;
  readonly updateBaseline: boolean;
  readonly out: string | undefined;
  readonly baseline: string | undefined;
  readonly cacheDir: string | undefined;
  readonly maxTemplates: number | undefined;
  /** extract: the file of card names, one per line. */
  readonly names: string | undefined;
  /** extract: the golden file to add to (default: the repository's golden.jsonl). */
  readonly golden: string | undefined;
  /** extract: mark the cards as acceptance cards (outside the hold-out split). */
  readonly acceptance: boolean;
  /** decks: the decklist files (or folders of .txt files), in the order given. */
  readonly decks: readonly string[];
  /** from-issue: the file holding the description of a support issue. */
  readonly body: string | undefined;
  /** from-issue: the number of that issue, written into each card's source. */
  readonly issue: number | undefined;
  /** from-issue: never replace a card already in the golden file (an issue of someone else, D-251). */
  readonly noReplace: boolean;
}

export const USAGE = `Usage:
  pnpm coverage:cards  (--file <path> | --download) [options]   all three reports
  pnpm corpus:templates (--file <path> | --download) [options]  backlog.md and templates.json only
  pnpm corpus:extract --file <path> --names <file> [options]    add real cards to the golden corpus
  pnpm corpus:replay [--file <templates.json>] [--out <file>]   replay reports/templates.json through
                                                                the current parser (offline)
  pnpm corpus:decks --file <path> --deck <decklist> [--deck <decklist> ...] [--out <file>]
                                                                how much of each deck the engine
                                                                supports, and what blocks it
  pnpm corpus:from-issue --body <file> --issue <number> [--golden <path>] [--no-replace]
                                                                add the cards of a support issue's
                                                                card data block to the golden corpus

Input (one of):
  --file <path>       Scryfall oracle_cards bulk file: .jsonl.gz, .jsonl or a .json array
  --download          fetch oracle_cards into .cache/corpus/ first (needs network access to Scryfall)

Options:
  --all               keep every card, not only Commander-legal ones
  --out <dir>         where the reports go (default: reports/ at the repository root)
  --cache-dir <dir>   download cache (default: .cache/corpus/)
  --max-templates <n> templates kept in templates.json (default 1000)
  corpus:extract (needs --file, never downloads):
  --names <file>      card names to copy, one per line ("#" starts a comment)
  --golden <path>     golden file to add to (default: packages/cards/test/fixtures/corpus/golden.jsonl);
                      a card already there (same oracle id) is replaced by the fresh data
  --acceptance        mark these cards as acceptance cards (the owner's deck), outside the split
  corpus:replay (offline; reads no bulk file):
  --file <path>       templates file (default: reports/templates.json)
  --out <path>        the report FILE (default: reports/template-replay.md)
  corpus:decks (needs --file, never downloads):
  --deck <path>       a decklist text file (Arena, MTGO, Moxfield or Archidekt export), or a folder
                      of .txt files; repeat for more decks. The deck's name is the file name.
  --out <path>        the report FILE (default: reports/decks.md)
  corpus:from-issue (offline; reads no bulk file):
  --body <file>       the description of a support issue, saved to a file (the issue the import
                      screen's "Ask for support on GitHub" button opens)
  --issue <number>    that issue's number, written into each card's source
  --golden <path>     golden file to add to (default as for corpus:extract); a card already there
                      (same oracle id) is replaced
  --no-replace        keep the cards already there: a card of the issue that is already in the file
                      with the same data is skipped, with different data stops the command (for
                      issues of someone else, D-251)
  coverage:cards only:
  --check             compare with reports/coverage-baseline.json, write nothing, exit 1 on a drop
  --update-baseline   also write reports/coverage-baseline.json
  --baseline <path>   baseline file (default: <out>/coverage-baseline.json)
`;

const SPEC = {
  file: { type: 'string' },
  download: { type: 'boolean' },
  all: { type: 'boolean' },
  check: { type: 'boolean' },
  'update-baseline': { type: 'boolean' },
  out: { type: 'string' },
  baseline: { type: 'string' },
  'cache-dir': { type: 'string' },
  'max-templates': { type: 'string' },
  names: { type: 'string' },
  golden: { type: 'string' },
  acceptance: { type: 'boolean' },
  deck: { type: 'string', multiple: true },
  body: { type: 'string' },
  issue: { type: 'string' },
  'no-replace': { type: 'boolean' },
} as const;

/** Flags that mean nothing to `replay` and `decks`. */
const REPLAY_REJECTS = [
  'download',
  'all',
  'check',
  'update-baseline',
  'baseline',
  'cache-dir',
  'max-templates',
  'names',
  'golden',
  'acceptance',
] as const;

function scan(argv: readonly string[]) {
  return parseArgs({ args: [...argv], options: SPEC, allowPositionals: true, strict: true });
}

/** The options, or an error message. */
export function parseOptions(argv: readonly string[]): Options | string {
  let parsed: ReturnType<typeof scan>;
  try {
    parsed = scan(argv);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const { values, positionals } = parsed;
  const [command, ...extra] = positionals;
  if (
    command !== 'templates' &&
    command !== 'coverage' &&
    command !== 'extract' &&
    command !== 'replay' &&
    command !== 'decks' &&
    command !== 'from-issue'
  ) {
    return 'the first argument must be "templates", "coverage", "extract", "replay", "decks" or "from-issue"';
  }
  if (extra.length > 0) return `unexpected argument "${extra[0]}"`;
  if (command === 'from-issue') return fromIssueOptions(values);
  if (values.body !== undefined || values.issue !== undefined || values['no-replace'] === true) {
    return '--body, --issue and --no-replace belong to corpus:from-issue';
  }
  if (command === 'replay') {
    for (const flag of REPLAY_REJECTS) {
      if (values[flag] !== undefined && values[flag] !== false) {
        return `--${flag} does not apply to corpus:replay (it only takes --file and --out)`;
      }
    }
  }
  if (command === 'decks') {
    for (const flag of REPLAY_REJECTS) {
      if (values[flag] !== undefined && values[flag] !== false) {
        return `--${flag} does not apply to corpus:decks (it takes --file, --deck and --out)`;
      }
    }
    if (values.file === undefined) return 'decks needs --file <oracle_cards file>';
    if ((values.deck ?? []).length === 0) return 'decks needs at least one --deck <decklist file>';
  } else if (values.deck !== undefined) {
    return '--deck belongs to corpus:decks';
  }
  if (command === 'extract') {
    if (values.file === undefined) return 'extract needs --file <oracle_cards file>';
    if (values.names === undefined) return 'extract needs --names <file>';
    if (values.download === true) return 'extract reads a file you already have; use --file';
  } else if (values.names !== undefined || values.golden !== undefined || values.acceptance) {
    return '--names, --golden and --acceptance belong to corpus:extract';
  }
  if (
    command !== 'extract' &&
    command !== 'replay' &&
    command !== 'decks' &&
    values.file === undefined &&
    values.download !== true
  ) {
    return 'give the input with --file <path> or --download';
  }
  if (values.file !== undefined && values.download === true) {
    return 'use either --file or --download, not both';
  }
  if (command === 'templates' && (values.check === true || values['update-baseline'] === true)) {
    return '--check and --update-baseline belong to coverage:cards';
  }
  if (values.check === true && values['update-baseline'] === true) {
    return 'use either --check or --update-baseline, not both';
  }
  let maxTemplates: number | undefined;
  if (values['max-templates'] !== undefined) {
    maxTemplates = Number(values['max-templates']);
    if (!Number.isInteger(maxTemplates) || maxTemplates < 1) {
      return '--max-templates needs a positive whole number';
    }
  }
  return {
    command,
    file: values.file,
    download: values.download === true,
    all: values.all === true,
    check: values.check === true,
    updateBaseline: values['update-baseline'] === true,
    out: values.out,
    baseline: values.baseline,
    cacheDir: values['cache-dir'],
    maxTemplates,
    names: values.names,
    golden: values.golden,
    acceptance: values.acceptance === true,
    decks: values.deck ?? [],
    body: undefined,
    issue: undefined,
    noReplace: false,
  };
}

/** `from-issue` takes --body, --issue, --golden and --no-replace only. */
function fromIssueOptions(values: ReturnType<typeof scan>['values']): Options | string {
  const others = Object.entries(values).filter(
    ([key, value]) =>
      !['body', 'issue', 'golden', 'no-replace'].includes(key) &&
      value !== undefined &&
      value !== false,
  );
  if (others.length > 0) {
    return `--${others[0]?.[0]} does not apply to corpus:from-issue (it takes --body, --issue, --golden and --no-replace)`;
  }
  if (values.body === undefined) return 'from-issue needs --body <file with the issue description>';
  const issue = Number(values.issue);
  if (values.issue === undefined || !Number.isInteger(issue) || issue < 1) {
    return 'from-issue needs --issue <the issue number>';
  }
  return {
    command: 'from-issue',
    file: undefined,
    download: false,
    all: false,
    check: false,
    updateBaseline: false,
    out: undefined,
    baseline: undefined,
    cacheDir: undefined,
    maxTemplates: undefined,
    names: undefined,
    golden: values.golden,
    acceptance: false,
    decks: [],
    body: values.body,
    issue,
    noReplace: values['no-replace'] === true,
  };
}
