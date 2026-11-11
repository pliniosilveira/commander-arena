/**
 * The GitHub issue that asks for a deck's support, filled in from the import report (D-244, D-245): the decklist, the template report of
 * what blocks it, the unsupported cards with why each is blocked, their card data for the golden corpus (compressed), and the build.
 * The app is a static site with no secret of its own, so it cannot create the issue: it builds the address of GitHub's "new issue" page
 * with the title and the body already in it, and the player presses Submit there. No React; the compression uses the browser's
 * `CompressionStream` (also in Node, for the tests).
 */
import {
  analyzeTemplates,
  cardDataBlock,
  cardDataText,
  formatTemplateReport,
  type GoldenCard,
  type ImportedCard,
  ISSUE_CARD_SOURCE,
  toGoldenCard,
  type UnparsedAbility,
} from '@commander-arena/cards';
import { type VersionInfo, versionLine } from '../version';
import type { ImportedEntry, ImportReport } from './types';

export const ISSUES_NEW_URL = 'https://github.com/pliniosilveira/commander-arena/issues/new';

/**
 * The longest address GitHub takes with confidence (its servers refuse a request line of about 8,000
 * characters); a longer report goes to the clipboard and the page opens with a short body.
 */
export const MAX_ISSUE_URL_LENGTH = 7000;

/**
 * The longest issue body this module writes. GitHub refuses a description of more than 65,536 characters; the margin is for the
 * characters GitHub may count differently.
 */
export const MAX_ISSUE_BODY_LENGTH = 60000;

export interface DeckIssue {
  readonly title: string;
  /** The whole report, as the issue should read. */
  readonly body: string;
  /** The "new issue" address: with the whole body when it fits, else with a short body that asks to paste. */
  readonly url: string;
  /** False when `body` is too long for an address: the caller copies `body` to the clipboard before opening `url`. */
  readonly fitsInLink: boolean;
}

/** `1x Name` lines, the way the lists the owner pastes are written. */
function deckLines(entries: readonly ImportedEntry[]): readonly string[] {
  return entries.map((e) => `${e.count}x ${e.card.stored.name}`);
}

/** The decklist as resolved: a Commander section, then the Mainboard. */
export function decklistText(report: ImportReport): string {
  const commander = report.entries.filter((e) => e.section === 'commander');
  const main = report.entries.filter((e) => e.section === 'main');
  const sections: string[] = [];
  if (commander.length > 0) sections.push(['Commander', ...deckLines(commander)].join('\n'));
  if (main.length > 0) sections.push(['Mainboard', ...deckLines(main)].join('\n'));
  return sections.join('\n\n');
}

/** Why one unparsed ability stops the card, in a line: what the grammar met, what the engine lacks, or the word with no referent. */
function blockLine(u: UnparsedAbility): string {
  if (u.reason === 'notRunnable') {
    const needs = (u.needs ?? []).join(', ');
    return `- engine: cannot run it yet${needs === '' ? '' : `; missing ${needs}`}`;
  }
  if (u.reason === 'unboundReference') {
    return `- grammar: "${u.reference ?? ''}" has nothing to refer to`;
  }
  return `- grammar: stopped at "${u.stoppedAt}" (closest rule ${u.closestRule})`;
}

/**
 * One unsupported card as a reader sees it: the cost and type line of each face and why it is blocked. Its whole Oracle text is in the
 * card data (compressed), which keeps the description short enough to fit in a link more often.
 */
export function cardSection(card: ImportedCard): string {
  const faces = card.stored.faces.map((face) =>
    face.manaCost === '' ? face.typeLine : `${face.manaCost}  ${face.typeLine}`,
  );
  const why = [
    ...card.support.unparsed.map(blockLine),
    ...card.support.reasons.map((r) => `- ${r}`),
  ];
  return [`### ${card.stored.name}`, faces.join(' // '), ...why].join('\n');
}

/** The golden record of a card as the app has it from Scryfall (D-245): what `pnpm corpus:from-issue` adds to the corpus. */
export function issueRecord(card: ImportedCard): GoldenCard {
  return toGoldenCard(card.stored, ISSUE_CARD_SOURCE, { acceptance: true });
}

/** The gzip of a text in base64url, with the browser's own compression. */
export async function gzipBase64url(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The readable sections of the shown cards, and the line that names the cards left out. */
function sectionsText(shown: readonly ImportedCard[], omitted: readonly ImportedCard[]): string {
  const lines = [
    'Unsupported cards, and why each is blocked:',
    ...shown.flatMap((card) => ['', cardSection(card)]),
  ];
  if (omitted.length > 0) {
    const names = omitted.map((c) => c.stored.name).join('; ');
    lines.push(
      '',
      `${omitted.length} more card(s) are left out, to keep the issue within GitHub's size limit: ${names}`,
    );
  }
  return lines.join('\n');
}

/**
 * The card sections and the card data block, with as many cards as fit in `budget` characters, in coverage order; the cards that do not
 * fit are only named. A browser without compression gets the sections and a line that says the data is missing.
 */
async function cardParts(cards: readonly ImportedCard[], budget: number): Promise<string[]> {
  if (cards.length === 0) return [];
  for (let n = cards.length; n >= 0; n -= 1) {
    const shown = cards.slice(0, n);
    const parts = [sectionsText(shown, cards.slice(n))];
    if (n > 0) {
      try {
        const payload = await gzipBase64url(cardDataText(shown.map(issueRecord)));
        parts.push(cardDataBlock(payload, n));
      } catch {
        parts.push('This browser could not compress the card data, so it is not included.');
      }
    }
    if (parts.join('\n\n').length <= budget) return parts;
  }
  return [];
}

/**
 * What the player pastes into the issue: the decklist, the template report, the unsupported names, why each is blocked, their card data
 * for the corpus, and the build.
 */
export async function deckIssueBody(report: ImportReport, version: VersionInfo): Promise<string> {
  const analysis = analyzeTemplates(report.entries.map((e) => e.card));
  const unsupported = report.coverage.unsupported.map((e) => e.card);
  const head = [decklistText(report), '---', formatTemplateReport(report.deckName, analysis)];
  if (unsupported.length > 0) {
    const names = unsupported.map((c) => c.stored.name).join('; ');
    head.push(`Unsupported cards (${unsupported.length}): ${names}`);
  }
  const tail: string[] = [];
  if (report.notFound.length > 0) {
    tail.push(`Names not found: ${report.notFound.map((p) => p.name).join('; ')}`);
  }
  tail.push(versionLine(version));
  const fixed = [...head, ...tail].filter((part) => part !== '').join('\n\n');
  // The cards take what the size limit leaves (blank lines join the parts).
  const cards = await cardParts(unsupported, MAX_ISSUE_BODY_LENGTH - fixed.length - 6);
  return [...head, ...cards, ...tail].filter((part) => part !== '').join('\n\n');
}

const issueUrl = (title: string, body: string): string =>
  `${ISSUES_NEW_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

/** The issue for an import report that has unsupported cards. */
export async function deckIssue(report: ImportReport, version: VersionInfo): Promise<DeckIssue> {
  const name = report.deckName.trim();
  const title = name === '' ? 'deck support' : `deck support ${name}`;
  const body = await deckIssueBody(report, version);
  const full = issueUrl(title, body);
  if (full.length <= MAX_ISSUE_URL_LENGTH) return { title, body, url: full, fitsInLink: true };
  const short =
    'The full report (the decklist, what blocks it, the card data and the build) was copied to your clipboard when you pressed the button: paste it here, then submit.';
  return { title, body, url: issueUrl(title, short), fitsInLink: false };
}
