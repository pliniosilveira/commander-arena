// `pnpm corpus:check-issue --body <file> [--card-data <file>]`: is a "deck support" issue complete (D-251, D-290)? The import screen's "Ask for support on
// GitHub" button writes an issue with the decklist, the template report, the names of the unsupported cards and their card data (D-244, D-245). What the
// work needs is the NAMES of the unsupported cards and their card data; everything else the button writes (the decklist, the template report, the build
// line) is a note when it is missing, because the cards can be built without it (the whole-deck claim cannot then be checked). The names are read from the
// "Unsupported cards (N): ..." line or, when it is missing, from the `cards:` lines of the template report. The card data is the block of the description or,
// when the description has none, the block of the comment in which the workflow keeps what it fetched from Scryfall (`--card-data`, D-290): `needsCardData`
// then says that the workflow should fetch it. The issue workflow runs this on every issue opened or edited: complete ones get the `deck-support:ready`
// label, incomplete ones a comment that lists what is missing.
// Prints one JSON line `{ complete, problems, notes, needsCardData, commander, unsupported }`; exit 0 when complete, 1 when not, 2 on bad usage. No network.
// The command line entry is check-issue-cli.ts.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { CARD_DATA_ENCODING, CARD_DATA_SUMMARY, cardDataPayload } from '@commander-arena/cards';
import { cardsOfIssue } from './from-issue.ts';

export interface IssueCheck {
  readonly complete: boolean;
  /** What is missing or wrong, one sentence each; empty when complete. */
  readonly problems: readonly string[];
  /** What the button writes and is missing, but does not stop the work (D-290); shown to the person, never a reason to refuse. */
  readonly notes: readonly string[];
  /**
   * True when the names are readable and nothing but the card data is wrong or missing, and no card data comment was given: the workflow should fetch the cards
   * from Scryfall and check again with `cardData` (D-290).
   */
  readonly needsCardData: boolean;
  /** The commander line of the decklist (without its count), or null. */
  readonly commander: string | null;
  /** The names of the unsupported cards the issue lists. */
  readonly unsupported: readonly string[];
}

export interface CheckExtras {
  /** The text of the workflow's card data comment (D-290): its block is read in place of the description's. */
  readonly cardData?: string;
}

/** Most names the workflow will look up for one issue (a Commander deck has 100 cards), and the longest name it will send to Scryfall. */
export const MAX_NAMES = 100;
export const MAX_NAME_LENGTH = 200;

const lines = (text: string): string[] => text.split(/\r?\n/).map((line) => line.trimEnd());

/** The `Nx Name` lines that follow a section heading line, up to the next blank line. */
function section(all: readonly string[], heading: string): string[] {
  const at = all.indexOf(heading);
  if (at < 0) return [];
  const out: string[] = [];
  for (const line of all.slice(at + 1)) {
    if (line.trim() === '') break;
    out.push(line);
  }
  return out;
}

/** The names of a `Label (N): a; b; c` line, or null when the line is not there. */
function nameList(all: readonly string[], label: RegExp): string[] | null {
  const line = all.find((l) => label.test(l));
  if (line === undefined) return null;
  return line
    .slice(line.indexOf(': ') + 2)
    .split('; ')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/** The names the `cards:` lines of the template report give, once each in order (the report lists the cards each unreadable ability blocks). */
function templateNames(all: readonly string[]): string[] {
  const at = all.findIndex((l) =>
    /^\s*Template report for ".*": \d+ unsupported card\(s\)\.$/.test(l),
  );
  if (at < 0) return [];
  const names: string[] = [];
  for (const line of all.slice(at + 1)) {
    const match = /^\s+cards: (.+)$/.exec(line);
    if (match?.[1] === undefined) continue;
    for (const name of match[1].split('; ')) {
      const trimmed = name.trim();
      if (trimmed !== '' && !names.includes(trimmed)) names.push(trimmed);
    }
  }
  return names;
}

/**
 * A name the issue's author wrote, as it may be shown in a comment of the workflow (D-290): in a code span, cut short, with no backtick and no line break, so that a
 * name cannot put a mention, a link or a heading into a comment that speaks as `github-actions`.
 */
export function quoteName(name: string): string {
  const flat = name.replace(/`/g, "'").replace(/\s+/g, ' ');
  return `\`${flat.length > 80 ? `${flat.slice(0, 80)}…` : flat}\``;
}

/** True for a name that can be sent to Scryfall: not empty, not long, no control character. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point of the check is to refuse them
const VALID_NAME = /^[^\u0000-\u001f\u007f]{1,200}$/;

/** Checks an issue description (and the workflow's card data comment, when there is one) against what the work needs. */
export function checkIssue(description: string, extras: CheckExtras = {}): IssueCheck {
  const problems: string[] = [];
  const notes: string[] = [];
  const all = lines(description);

  // What the button writes besides the names and the card data is a note when it is missing (D-290): the unsupported cards can be built without it.
  const commanderLines = section(all, 'Commander');
  const mainLines = section(all, 'Mainboard');
  const entry = /^\d+x \S.*$/;
  if (commanderLines.length === 0 || !commanderLines.every((l) => entry.test(l))) {
    notes.push('the decklist has no "Commander" section with `1x Name` lines');
  }
  if (mainLines.length === 0 || !mainLines.every((l) => entry.test(l))) {
    notes.push('the decklist has no "Mainboard" section with `Nx Name` lines');
  }
  const commander = commanderLines[0]?.replace(/^\d+x /, '') ?? null;
  if (!all.some((l) => /^\s*Template report for ".*": \d+ unsupported card\(s\)\.$/.test(l))) {
    notes.push('the template report ("Template report for ...") is missing');
  }
  if (!all.some((l) => /^Build \S+ \(.*\) · Engine \d+ · Card parser \d+$/.test(l))) {
    notes.push('the build line ("Build ... · Engine ... · Card parser ...") is missing');
  }

  const fromLine = nameList(all, /^Unsupported cards \(\d+\): /) ?? [];
  const names = [...new Set(fromLine.length > 0 ? fromLine : templateNames(all))];
  if (names.length === 0) {
    problems.push(
      'no unsupported card name can be read: the description has neither an "Unsupported cards (N): ..." line nor a template report with `cards:` lines',
    );
  } else if (fromLine.length === 0) {
    notes.push(
      'the "Unsupported cards (N): ..." line is missing: the names are those of the template report',
    );
  }
  if (names.length > MAX_NAMES) {
    problems.push(`the issue lists ${names.length} cards; at most ${MAX_NAMES} are looked up`);
  }
  const badNames = names.filter((name) => !VALID_NAME.test(name));
  if (badNames.length > 0) {
    problems.push(
      `these names cannot be looked up (empty, longer than ${MAX_NAME_LENGTH} characters, or with a control character): ${badNames
        .map(quoteName)
        .join('; ')}`,
    );
  }
  const notFound = nameList(all, /^Names not found: /);
  if (notFound !== null) {
    problems.push(
      `these names were not found when the deck was imported: ${notFound.map(quoteName).join('; ')}`,
    );
  }
  if (all.some((l) => /^\d+ more card\(s\) are left out/.test(l))) {
    problems.push("some cards were left out of the card data to fit GitHub's size limit");
  }

  // The card data: the workflow's comment when there is one, else the description's own block.
  const dataProblems: string[] = [];
  const fetched = extras.cardData !== undefined;
  const dataText = extras.cardData ?? description;
  const where = fetched ? 'the card data comment' : 'the description';
  let hasBlock = false;
  try {
    hasBlock = cardDataPayload(dataText) !== null;
  } catch (error) {
    dataProblems.push(
      `the card data cannot be read: ${error instanceof Error ? error.message : error}`,
    );
    hasBlock = true;
  }
  if (!hasBlock) {
    dataProblems.push(`${where} has no "${CARD_DATA_SUMMARY}" block`);
  } else if (dataProblems.length === 0) {
    try {
      const records = cardsOfIssue(dataText, 0, fetched);
      const summary = lines(dataText).find((l) => l.includes(CARD_DATA_SUMMARY)) ?? '';
      const promised = /\((\d+) card\(s\), /.exec(summary)?.[1];
      if (!summary.includes(CARD_DATA_ENCODING) || promised === undefined) {
        dataProblems.push('the card data block does not say how it is encoded');
      } else if (Number(promised) !== records.length) {
        dataProblems.push(`the card data says ${promised} card(s) but holds ${records.length}`);
      }
      const recordNames = records.map((card) => card.name);
      const missing = names.filter((name) => !recordNames.includes(name));
      if (missing.length > 0) {
        dataProblems.push(`the card data has no record for: ${missing.map(quoteName).join('; ')}`);
      }
      // D-280: a meld card is worked on with its melded face, a card of its own: the data carries it as a `related` record, or the work would have nothing to read.
      const related = new Set(
        records.filter((c) => c.related === true).map((c) => c.name.toLowerCase()),
      );
      const lacking = records
        .filter((c) => c.layout === 'meld' && names.includes(c.name))
        .flatMap((c) =>
          (c.relatedParts ?? [])
            .filter((p) => p.component === 'meld_result' && !related.has(p.name.toLowerCase()))
            .map((p) => `${p.name} (the melded face of ${c.name})`),
        );
      if (lacking.length > 0) {
        dataProblems.push(
          `the card data has no record of the melded face: ${[...new Set(lacking)].join('; ')}`,
        );
      }
    } catch (error) {
      dataProblems.push(
        `the card data cannot be read: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  const needsCardData =
    !fetched && names.length > 0 && problems.length === 0 && dataProblems.length > 0;
  const every = [...problems, ...dataProblems];
  return {
    complete: every.length === 0,
    problems: every,
    notes,
    needsCardData,
    commander,
    unsupported: names,
  };
}

/** The command line: reads the description from `--body` (and the workflow's card data comment from `--card-data`), prints the result, returns the exit code. */
export async function main(argv: readonly string[], out: (text: string) => void): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: { body: { type: 'string' }, 'card-data': { type: 'string' } },
  });
  if (values.body === undefined) {
    out(
      'usage: node tools/corpus/check-issue.ts --body <file with the issue description> [--card-data <file with the workflow comment>]',
    );
    return 2;
  }
  const cardData =
    values['card-data'] === undefined ? undefined : await readFile(values['card-data'], 'utf8');
  const result = checkIssue(
    await readFile(values.body, 'utf8'),
    cardData === undefined ? {} : { cardData },
  );
  out(JSON.stringify(result));
  return result.complete ? 0 : 1;
}
