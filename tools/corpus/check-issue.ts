// `pnpm corpus:check-issue --body <file>`: is a "deck support" issue complete (D-251)? The import screen's "Ask for support on GitHub"
// button writes an issue with the decklist, the template report, the names of the unsupported cards and their card data (D-244, D-245).
// A request is complete when everything the work needs is in the description and agrees with itself. The issue workflow runs this on every
// issue its owner opens or edits: complete ones get the `deck-support:ready` label, incomplete ones a comment that lists what is missing.
// Prints one JSON line `{ complete, problems, commander, unsupported }`; exit 0 when complete, 1 when not, 2 on bad usage. No network.
// The command line entry is check-issue-cli.ts.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { CARD_DATA_ENCODING, CARD_DATA_SUMMARY } from '@commander-arena/cards';
import { cardsOfIssue } from './from-issue.ts';

export interface IssueCheck {
  readonly complete: boolean;
  /** What is missing or wrong, one sentence each; empty when complete. */
  readonly problems: readonly string[];
  /** The commander line of the decklist (without its count), or null. */
  readonly commander: string | null;
  /** The names of the unsupported cards the issue lists. */
  readonly unsupported: readonly string[];
}

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

/** Checks an issue description against what the app's button writes. */
export function checkIssue(description: string): IssueCheck {
  const problems: string[] = [];
  const all = lines(description);

  const commanderLines = section(all, 'Commander');
  const mainLines = section(all, 'Mainboard');
  const entry = /^\d+x \S.*$/;
  if (commanderLines.length === 0 || !commanderLines.every((l) => entry.test(l))) {
    problems.push('the decklist has no "Commander" section with `1x Name` lines');
  }
  if (mainLines.length === 0 || !mainLines.every((l) => entry.test(l))) {
    problems.push('the decklist has no "Mainboard" section with `Nx Name` lines');
  }
  const commander = commanderLines[0]?.replace(/^\d+x /, '') ?? null;

  if (!all.some((l) => /^Template report for ".*": \d+ unsupported card\(s\)\.$/.test(l))) {
    problems.push('the template report ("Template report for ...") is missing');
  }
  const unsupported = nameList(all, /^Unsupported cards \(\d+\): /);
  if (unsupported === null || unsupported.length === 0) {
    problems.push('the "Unsupported cards (N): ..." line is missing');
  }
  const names = unsupported ?? [];
  if (!all.some((l) => /^Build \S+ \(.*\) · Engine \d+ · Card parser \d+$/.test(l))) {
    problems.push('the build line ("Build ... · Engine ... · Card parser ...") is missing');
  }
  const notFound = nameList(all, /^Names not found: /);
  if (notFound !== null) {
    problems.push(`these names were not found when the deck was imported: ${notFound.join('; ')}`);
  }
  if (all.some((l) => /^\d+ more card\(s\) are left out/.test(l))) {
    problems.push("some cards were left out of the card data to fit GitHub's size limit");
  }

  let recordNames: string[] = [];
  try {
    const records = cardsOfIssue(description, 0);
    recordNames = records.map((card) => card.name);
    const summary = all.find((l) => l.includes(CARD_DATA_SUMMARY)) ?? '';
    const promised = /\((\d+) card\(s\), /.exec(summary)?.[1];
    if (!summary.includes(CARD_DATA_ENCODING) || promised === undefined) {
      problems.push('the card data block does not say how it is encoded');
    } else if (Number(promised) !== records.length) {
      problems.push(`the card data says ${promised} card(s) but holds ${records.length}`);
    }
  } catch (error) {
    problems.push(
      `the card data cannot be read: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (recordNames.length > 0) {
    const missing = names.filter((name) => !recordNames.includes(name));
    if (missing.length > 0) {
      problems.push(`the card data has no record for: ${missing.join('; ')}`);
    }
  }
  return { complete: problems.length === 0, problems, commander, unsupported: names };
}

/** The command line: reads the description from `--body`, prints the result, returns the exit code. */
export async function main(argv: readonly string[], out: (text: string) => void): Promise<number> {
  const { values } = parseArgs({ args: [...argv], options: { body: { type: 'string' } } });
  if (values.body === undefined) {
    out('usage: node tools/corpus/check-issue.ts --body <file with the issue description>');
    return 2;
  }
  const result = checkIssue(await readFile(values.body, 'utf8'));
  out(JSON.stringify(result));
  return result.complete ? 0 : 1;
}
