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
  /** Every card of the answer by category ("Commander 1, Sideboard 10 (left out), ..."), so a count that is not 100 can be explained in the log. */
  readonly breakdown: string;
}

/** Categories that are not part of the deck: the boards a player keeps beside it, and the tokens and extras that come in the box. */
const OUTSIDE = /^(sideboard|maybeboard|considering|tokens?|extras?|attractions?|stickers?)$/i;

/**
 * The name a ready-made deck shows: the deck's own name without the product it came in ("Eternal Might - Aetherdrift Commander" is "Eternal Might").
 * Cut at the first " - " (spaced hyphen, en dash or em dash); a name that would be left empty stays whole.
 */
export function displayName(name: string): string {
  const cut = name.split(/\s+[-–—]\s+/)[0]?.trim() ?? '';
  return cut === '' ? name : cut;
}

/** The deck of an API answer (`/api/decks/<id>/`), or a message that says what is wrong with it. */
export function deckFromApi(id: number, answer: unknown): ArchidektDeck | string {
  if (typeof answer !== 'object' || answer === null)
    return `deck ${id}: the answer is not an object`;
  const {
    name,
    cards,
    categories: deckCategories,
  } = answer as {
    name?: unknown;
    cards?: unknown;
    categories?: unknown;
  };
  if (typeof name !== 'string' || name.trim() === '') return `deck ${id}: the answer has no name`;
  if (!Array.isArray(cards)) return `deck ${id}: the answer has no cards`;
  // Archidekt says for each category of the deck whether it counts towards the deck (`includedInDeck`): the sideboard and the maybeboard do not.
  const notInDeck = new Set<string>();
  if (Array.isArray(deckCategories)) {
    for (const c of deckCategories as { name?: unknown; includedInDeck?: unknown }[]) {
      if (typeof c?.name === 'string' && c.includedInDeck === false)
        notInDeck.add(c.name.toLowerCase());
    }
  }
  const outside = (category: string): boolean =>
    OUTSIDE.test(category) || notInDeck.has(category.toLowerCase());
  const commander: string[] = [];
  const main: string[] = [];
  const byCategory = new Map<string, { count: number; left: boolean }>();
  let count = 0;
  for (const raw of cards as ApiCard[]) {
    const cardName = raw.card?.oracleCard?.name ?? raw.card?.name;
    const quantity = raw.quantity;
    if (typeof cardName !== 'string' || typeof quantity !== 'number' || quantity < 1) continue;
    const categories = Array.isArray(raw.categories) ? raw.categories.map(String) : [];
    const left = categories.some(outside);
    const label = clean(categories[0] ?? 'no category');
    const held = byCategory.get(label);
    byCategory.set(label, {
      count: (held?.count ?? 0) + quantity,
      left: held?.left === true || left,
    });
    if (left) continue;
    const line = `${quantity}x ${clean(cardName)}`;
    (categories.some((c) => /^commander$/i.test(c)) ? commander : main).push(line);
    count += quantity;
  }
  if (count === 0) return `deck ${id}: no card could be read`;
  const sort = (lines: string[]) => lines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const parts: string[] = [];
  if (commander.length > 0) parts.push(`Commander\n${sort(commander).join('\n')}`);
  parts.push(`Mainboard\n${sort(main).join('\n')}`);
  const breakdown = [...byCategory]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([label, v]) => `${label} ${v.count}${v.left ? ' (left out)' : ''}`)
    .join(', ');
  return { id, name: displayName(clean(name)), text: parts.join('\n\n'), cards: count, breakdown };
}

/** A card of a decklist: the name and how many. */
export interface Entry {
  readonly name: string;
  readonly count: number;
}

const keyOf = (name: string): string => name.trim().toLowerCase();

/**
 * True when two decklists are the same deck, possibly one revision apart: at least 80 percent of the larger list's distinct card names are in both (two
 * different precons share a few staples, never four fifths of a deck). Names are compared without case.
 */
export function sameDeck(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map(keyOf));
  const right = new Set(b.map(keyOf));
  const larger = Math.max(left.size, right.size);
  if (larger === 0) return false;
  let shared = 0;
  for (const name of left) if (right.has(name)) shared += 1;
  return shared / larger >= 0.8;
}

export interface ListDiff {
  /** On Archidekt, not in the app. */
  readonly added: readonly Entry[];
  /** In the app, not on Archidekt. */
  readonly removed: readonly Entry[];
  /** In both with another count: the count in the app, then the count on Archidekt. */
  readonly changed: readonly {
    readonly name: string;
    readonly ours: number;
    readonly theirs: number;
  }[];
}

const merged = (entries: readonly Entry[]): Map<string, Entry> => {
  const map = new Map<string, Entry>();
  for (const e of entries) {
    const key = keyOf(e.name);
    const held = map.get(key);
    map.set(key, { name: held?.name ?? e.name, count: (held?.count ?? 0) + e.count });
  }
  return map;
};

/** What differs between the list the app has and the list on Archidekt, by name and count; every list sorted by name. */
export function listDiff(ours: readonly Entry[], theirs: readonly Entry[]): ListDiff {
  const mine = merged(ours);
  const other = merged(theirs);
  const byName = (x: { name: string }, y: { name: string }) =>
    x.name < y.name ? -1 : x.name > y.name ? 1 : 0;
  const added: Entry[] = [];
  const removed: Entry[] = [];
  const changed: { name: string; ours: number; theirs: number }[] = [];
  for (const [key, entry] of other) {
    const have = mine.get(key);
    if (have === undefined) added.push(entry);
    else if (have.count !== entry.count)
      changed.push({ name: entry.name, ours: have.count, theirs: entry.count });
  }
  for (const [key, entry] of mine) if (!other.has(key)) removed.push(entry);
  return {
    added: added.sort(byName),
    removed: removed.sort(byName),
    changed: changed.sort(byName),
  };
}

export const isSameList = (diff: ListDiff): boolean =>
  diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;

/** Six hex digits that name a decklist (names and counts, in any order): a changed list gets a new one, so an update issue is not opened twice for the same list. */
export function listHash(entries: readonly Entry[]): string {
  const lines = [...merged(entries).values()].map((e) => `${e.count} ${keyOf(e.name)}`).sort();
  let hash = 0x811c9dc5;
  for (const char of lines.join('\n')) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
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
  /** Cards that came with the deck but are not part of a Commander deck (the planar deck: Plane and Phenomenon cards, and the like), left out of the decklist for now. */
  readonly leftOut?: readonly string[];
  /** Set when the app already offers this deck: its precon id and name, and how its list differs from the one on Archidekt. */
  readonly installed?: {
    readonly id: string;
    readonly name: string;
    readonly diff: ListDiff;
    readonly hash: string;
  };
}

export interface PreconIssue {
  readonly title: string;
  readonly body: string;
  readonly deckName: string;
  readonly deckId: number;
  /** True when the title starts with "deck support": the triage workflow checks it and the routine builds it. */
  readonly needsSupport: boolean;
  /**
   * What the issue is, as a stable key: "precon-issues:deck=<id>:add" for a deck the app lacks, "precon-issues:deck=<id>:update:<hash>" for one list of a deck
   * the app has. It is in the body as an HTML comment, so a later run finds an issue it opened before even if the title was edited, and opens none twice.
   */
  readonly marker: string;
}

const entryLine = (e: Entry): string => `${e.count}x ${clean(e.name)}`;

/**
 * The issue for one deck. A deck with an unsupported card is a "deck support" issue in the shape of the one the app's button writes (the decklist, then
 * `Unsupported cards (N): a; b`), so the triage workflow fetches the cards' data and the routine builds them. A deck the engine already runs completely
 * only asks for its place among the ready-made decks, under a title that does not start the routine. A deck the app already offers but whose list differs
 * from Archidekt's asks for the precon to be updated (`installed` is set): "update precon <name> (list <hash>)", or "deck support" when the new list has a
 * card the engine cannot run.
 */
export function preconIssue(input: IssueInput): PreconIssue {
  const { deck, unsupported, why, notFound, installed, leftOut = [] } = input;
  const needsSupport = unsupported.length > 0;
  const id = installed?.id ?? preconId(deck.name);
  const name = installed?.name ?? deck.name;
  const title =
    installed === undefined
      ? `${needsSupport ? 'deck support' : 'precon'} ${deck.name}`
      : `${needsSupport ? 'deck support' : 'update precon'} ${name} (list ${installed.hash})`;
  const marker =
    installed === undefined
      ? `precon-issues:deck=${deck.id}:add`
      : `precon-issues:deck=${deck.id}:update:${installed.hash}`;
  const parts: string[] = [`${deck.text}`, '---'];
  if (installed !== undefined) {
    const { diff } = installed;
    const list = (heading: string, lines: readonly string[]) =>
      lines.length === 0 ? [] : [`${heading}:`, ...lines.map((l) => `- ${l}`), ''];
    parts.push(
      [
        `## Update the precon "${name}"`,
        '',
        `The app already offers this deck (id \`${id}\`), but its list differs from the one on Archidekt, so the precon is out of date (or the other way round: check ${ARCHIDEKT}/decks/${deck.id}).`,
        '',
        ...list('Cards to add', diff.added.map(entryLine)),
        ...list('Cards to remove', diff.removed.map(entryLine)),
        ...list(
          'Count changes (in the app, then on Archidekt)',
          diff.changed.map((c) => `${clean(c.name)}: ${c.ours} -> ${c.theirs}`),
        ),
      ].join('\n'),
    );
  }
  if (needsSupport) {
    parts.push(`Unsupported cards (${unsupported.length}): ${unsupported.join('; ')}`);
    parts.push(`Unsupported cards, and why each is blocked:\n\n${why.join('\n\n')}`);
  } else {
    parts.push('The game already supports every card of this deck.');
  }
  if (notFound.length > 0) parts.push(`Names not found: ${notFound.join('; ')}`);
  if (leftOut.length > 0) {
    parts.push(
      [
        `## Left out for now: ${leftOut.length} cards that are not part of the 100`,
        '',
        'The box also has cards that are not played in a Commander deck (a planar deck: Plane and Phenomenon cards). The game cannot play them yet, so they are not in the decklist above and not in the count of unsupported cards. Support the deck as normal without them; they are for a second round.',
        '',
        ...leftOut.map((n) => `- ${clean(n)}`),
      ].join('\n'),
    );
  }
  if (installed === undefined) {
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
  } else {
    parts.push(
      [
        '## How to update it',
        '',
        `Once every card is supported, change \`decks/${id}.txt\` (if the deck has one) to the list above and make the snapshot again, keeping the id, the name and the blurb of the precon:`,
        '',
        `\`pnpm precon:snapshot --file <oracle_cards file> --deck decks/${id}.txt --id ${id} --name "${name}" --blurb "<the blurb it has now>"\``,
        '',
        "The snapshot needs Scryfall's bulk file (the owner runs it, or a runner does). The tests over the shipped snapshots fail until the list is a valid Commander deck of supported cards.",
      ].join('\n'),
    );
  }
  parts.push(
    `Source: ${ARCHIDEKT}/decks/${deck.id} (a precon listed on ${ARCHIDEKT}/commander-precons). Opened by the "Precon issues" workflow.\n\n<!-- ${marker} -->`,
  );
  return {
    title,
    body: parts.join('\n\n'),
    deckName: deck.name,
    deckId: deck.id,
    needsSupport,
    marker,
  };
}
