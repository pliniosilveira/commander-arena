// Reading Archidekt (https://archidekt.com/commander-precons) for the workflow "Precon issues": the ids of the deck pages the listing links to, a deck's
// API answer as decklist text, and the text of the issue that asks for the deck's support and for its place among the ready-made decks.
// Pure: no network and no clock. What a page says is untrusted: it goes into an issue of a public repository, so every name that reaches the issue passes
// `clean` (no control characters, no mention, a length limit) and is never run as a command.

export const ARCHIDEKT = 'https://archidekt.com';

/** The ids of the decks a page links to (`/decks/<id>` or `/decks/<id>/<slug>`), once each, in the order first seen. */
export function deckIdsFromListing(page: string): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const match of page.matchAll(/\/decks\/(\d{1,9})(?![\d])/g)) {
    const id = Number(match[1]);
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** A name or a line from outside: one line, no control characters, no mention, at most 100 characters. */
export function clean(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    // Control characters, zero-width and bidirectional marks, and the line and paragraph separators become spaces.
    const hidden =
      code < 0x20 ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);
    out += hidden ? ' ' : char === '@' ? '@ ' : char;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 100);
}

interface ApiCard {
  readonly quantity?: unknown;
  readonly categories?: unknown;
  readonly card?: { readonly oracleCard?: { readonly name?: unknown }; readonly name?: unknown };
}

export interface ArchidektDeck {
  readonly id: number;
  readonly name: string;
  /** The decklist as text: "Commander", then "Mainboard", with "1x Name" lines. */
  readonly text: string;
  /** The cards of the commander and main deck, counting quantities. */
  readonly cards: number;
}

const OUTSIDE = /^(sideboard|maybeboard|considering)$/i;

/** The deck of an API answer (`/api/decks/<id>/`), or a message that says what is wrong with it. */
export function deckFromApi(id: number, answer: unknown): ArchidektDeck | string {
  if (typeof answer !== 'object' || answer === null)
    return `deck ${id}: the answer is not an object`;
  const { name, cards } = answer as { name?: unknown; cards?: unknown };
  if (typeof name !== 'string' || name.trim() === '') return `deck ${id}: the answer has no name`;
  if (!Array.isArray(cards)) return `deck ${id}: the answer has no cards`;
  const commander: string[] = [];
  const main: string[] = [];
  let count = 0;
  for (const raw of cards as ApiCard[]) {
    const cardName = raw.card?.oracleCard?.name ?? raw.card?.name;
    const quantity = raw.quantity;
    if (typeof cardName !== 'string' || typeof quantity !== 'number' || quantity < 1) continue;
    const categories = Array.isArray(raw.categories) ? raw.categories.map(String) : [];
    if (categories.some((c) => OUTSIDE.test(c))) continue;
    const line = `${quantity}x ${clean(cardName)}`;
    (categories.some((c) => /^commander$/i.test(c)) ? commander : main).push(line);
    count += quantity;
  }
  if (count === 0) return `deck ${id}: no card could be read`;
  const sort = (lines: string[]) => lines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parts: string[] = [];
  if (commander.length > 0) parts.push(`Commander\n${sort(commander).join('\n')}`);
  parts.push(`Mainboard\n${sort(main).join('\n')}`);
  return { id, name: clean(name), text: parts.join('\n\n'), cards: count };
}

/** An id for a ready-made deck: lower-case letters, digits and single dashes. */
export function preconId(name: string): string {
  const id = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id === '' ? 'precon' : id.slice(0, 60).replace(/-+$/g, '');
}

export interface IssueInput {
  readonly deck: ArchidektDeck;
  /** The names of the cards the engine cannot fully run, in order; empty when it can run every card. */
  readonly unsupported: readonly string[];
  /** Each unsupported card with a short why, for the reader. */
  readonly why: readonly string[];
  /** Names the card list did not match. */
  readonly notFound: readonly string[];
}

export interface PreconIssue {
  readonly title: string;
  readonly body: string;
  readonly deckName: string;
  readonly deckId: number;
  /** True when the title starts with "deck support": the triage workflow checks it and the routine builds it. */
  readonly needsSupport: boolean;
}

/**
 * The issue for one deck. A deck with an unsupported card is a "deck support" issue in the shape of the one the app's button writes (the decklist, then
 * `Unsupported cards (N): a; b`), so the triage workflow fetches the cards' data and the routine builds them. A deck the engine already runs completely
 * only asks for its place among the ready-made decks, under a title that does not start the routine.
 */
export function preconIssue(input: IssueInput): PreconIssue {
  const { deck, unsupported, why, notFound } = input;
  const needsSupport = unsupported.length > 0;
  const title = `${needsSupport ? 'deck support' : 'precon'} ${deck.name}`;
  const id = preconId(deck.name);
  const parts: string[] = [`${deck.text}`, '---'];
  if (needsSupport) {
    parts.push(`Unsupported cards (${unsupported.length}): ${unsupported.join('; ')}`);
    parts.push(`Unsupported cards, and why each is blocked:\n\n${why.join('\n\n')}`);
  } else {
    parts.push('The game already supports every card of this deck.');
  }
  if (notFound.length > 0) parts.push(`Names not found: ${notFound.join('; ')}`);
  parts.push(
    [
      '## Add it to the ready-made decks',
      '',
      'This is a Commander precon. Once every card is supported, please also **add the deck as a prebuilt deck (a precon) in the app, so everyone can play it** from Quick start:',
      '',
      `- id \`${id}\`, name "${deck.name}", and a one-sentence blurb about the deck;`,
      '- the decklist above goes to `decks/` and the card data to a snapshot, the way `apps/web/src/precons/snapshots/README.md` and `docs/CORPUS.md` ("Precon snapshots") describe;',
      `- the snapshot is made with \`pnpm precon:snapshot --file <oracle_cards file> --deck decks/${id}.txt --id ${id} --name "${deck.name}" --blurb "<one sentence>"\`, which needs Scryfall's bulk file (the owner runs it, or a runner does).`,
    ].join('\n'),
  );
  parts.push(
    `Source: ${ARCHIDEKT}/decks/${deck.id} (a precon listed on ${ARCHIDEKT}/commander-precons). Opened by the "Precon issues" workflow.`,
  );
  return { title, body: parts.join('\n\n'), deckName: deck.name, deckId: deck.id, needsSupport };
}
