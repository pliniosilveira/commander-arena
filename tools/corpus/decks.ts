// Per-deck coverage (M9): how much of each given decklist the engine fully supports, which cards
// block it and which blocking shapes are shared between the decks.
//
// Nothing here decides what "supported" means. Names are read with the decklist parser of the
// cards package, resolved against the bulk file the way deck import matches them (the front-face
// name, case and punctuation normalised, D-048), and every card goes through `importCard`, the
// same per-card analysis that `pnpm coverage:cards` uses. A card is supported when its
// `support.status` says so; its blockers are its unparsed ability shapes (`templateOf`, as in
// reports/backlog.md) and its other reasons (layout, type, validation).

import {
  type ImportedCard,
  importCard,
  normalizeNameKey,
  parseDecklistDetailed,
  parseStoredCard,
  templateOf,
} from '@commander-arena/cards';
import { reasonCategory } from './coverage.ts';
import type { CardItem } from './read-cards.ts';

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- reading a decklist

export type DeckSectionName = 'commander' | 'main';

/** One line of a decklist that counts towards the deck (commander and main deck). */
export interface DeckLine {
  /** The name as the parser normalised it, with every face when the list had them. */
  readonly name: string;
  readonly count: number;
  readonly section: DeckSectionName;
}

export interface ParsedDeck {
  readonly name: string;
  readonly lines: readonly DeckLine[];
  /** Lines the parser could not read, as "line N: message". */
  readonly errors: readonly string[];
  /** Cards in sections that are not part of the deck (sideboard, maybeboard, companion). */
  readonly ignored: number;
}

/** Reads decklist text (Arena, MTGO, Moxfield or Archidekt export). Never throws. */
export function readDeck(name: string, text: string): ParsedDeck {
  const { parsed } = parseDecklistDetailed(text);
  const lines: DeckLine[] = [];
  for (const section of ['commander', 'main'] as const) {
    for (const entry of parsed.sections[section]) {
      lines.push({ name: entry.name, count: entry.count, section });
    }
  }
  let ignored = 0;
  for (const section of ['sideboard', 'maybeboard', 'companion'] as const) {
    for (const entry of parsed.sections[section]) ignored += entry.count;
  }
  return {
    name,
    lines,
    errors: parsed.errors.map((error) => `line ${error.line}: ${error.message}`),
    ignored,
  };
}

// ---------------------------------------------------------------- resolving names in the bulk file

/** The key of a full card name, and the key of its front face (the part before ` // `). */
function keysOf(name: string): { full: string; front: string } {
  const full = normalizeNameKey(name);
  const at = full.indexOf(' // ');
  return { full, front: at === -1 ? full : full.slice(0, at) };
}

interface Candidate {
  readonly card: ImportedCard;
  /** Single-faced: its full name is its front face, so a request for that name means this card. */
  readonly single: boolean;
  readonly legal: boolean;
}

/** The cards of a bulk file that the decks ask for, found by full name and by front-face name. */
export interface CardIndex {
  readonly byFull: ReadonlyMap<string, ImportedCard>;
  readonly byFront: ReadonlyMap<string, ImportedCard>;
  readonly read: number;
  readonly malformed: number;
  readonly rejected: number;
}

/**
 * A better candidate: single-faced first (so "Fire" is not taken by "Fire // Ice"), then
 * Commander-legal, then the lower oracle id, so file order never matters.
 */
function better(a: Candidate, b: Candidate | undefined): boolean {
  if (b === undefined) return true;
  if (a.single !== b.single) return a.single;
  if (a.legal !== b.legal) return a.legal;
  return compare(a.card.stored.oracleId, b.card.stored.oracleId) < 0;
}

/**
 * Streams the bulk file once and imports only the cards whose name some deck asks for. Every
 * legality is kept: a card that is not Commander-legal is still resolved (and analysed).
 */
export async function indexCards(
  items: AsyncIterable<CardItem>,
  wanted: ReadonlySet<string>,
): Promise<CardIndex> {
  const full = new Map<string, Candidate>();
  const front = new Map<string, Candidate>();
  let read = 0;
  let malformed = 0;
  let rejected = 0;
  for await (const item of items) {
    if (item.kind === 'bad') {
      malformed += 1;
      continue;
    }
    read += 1;
    // fetchedAt is 0: the report must not depend on the clock.
    const converted = parseStoredCard(item.value, 0);
    if (converted.card === null) {
      rejected += 1;
      continue;
    }
    const stored = converted.card;
    const keys = keysOf(stored.name);
    if (!wanted.has(keys.full) && !wanted.has(keys.front)) continue;
    let imported: ImportedCard;
    try {
      imported = importCard(stored);
    } catch {
      rejected += 1;
      continue;
    }
    const candidate: Candidate = {
      card: imported,
      single: keys.full === keys.front,
      legal: stored.commanderLegality === 'legal' || stored.commanderLegality === 'restricted',
    };
    if (better(candidate, full.get(keys.full))) full.set(keys.full, candidate);
    if (better(candidate, front.get(keys.front))) front.set(keys.front, candidate);
  }
  const unwrap = (map: Map<string, Candidate>) =>
    new Map([...map].map(([key, candidate]) => [key, candidate.card]));
  return { byFull: unwrap(full), byFront: unwrap(front), read, malformed, rejected };
}

/** Every name key the decks need looked up: the full name and the front face of each line. */
export function wantedKeys(decks: readonly ParsedDeck[]): Set<string> {
  const wanted = new Set<string>();
  for (const deck of decks) {
    for (const line of deck.lines) {
      const keys = keysOf(line.name);
      wanted.add(keys.full);
      wanted.add(keys.front);
    }
  }
  return wanted;
}

/** The card for a requested name, or undefined: an exact full name first, then the front face. */
export function lookup(index: CardIndex, name: string): ImportedCard | undefined {
  const keys = keysOf(name);
  return index.byFull.get(keys.full) ?? index.byFront.get(keys.front);
}

// ---------------------------------------------------------------- blockers

/** One reason why a card is not supported. */
export interface Blocker {
  /** Identity across cards and decks. */
  readonly id: string;
  readonly kind: 'shape' | 'reason';
  /** The shape of an unparsed ability (numbers as N, mana costs as {M}), or of a reason. */
  readonly text: string;
  /** One real text: the ability as normalised, or the reason as the pipeline wrote it. */
  readonly example: string;
  /** What it would take, as the pipeline reports it (rule that stopped, missing features, ...). */
  readonly needs: readonly string[];
}

function describeNeeds(ability: ImportedCard['support']['unparsed'][number]): string {
  const kind = ability.reason ?? 'unrecognised';
  if (kind === 'notRunnable') {
    const needs = ability.needs ?? [];
    return needs.length > 0
      ? `read, but the engine lacks ${[...needs].sort(compare).join(', ')}`
      : 'read, but the lowering refused it without naming a gap';
  }
  if (kind === 'unboundReference') {
    return `read, but ${ability.reference === undefined ? 'a pronoun' : `"${ability.reference}"`} had nothing to mean`;
  }
  return `no rule reads it; closest rule ${ability.closestRule}`;
}

/** The blockers of an unsupported card, one per distinct shape or reason, in a fixed order. */
export function blockersOf(card: ImportedCard): Blocker[] {
  const found = new Map<string, { blocker: Blocker; needs: Set<string> }>();
  const add = (kind: Blocker['kind'], text: string, example: string, need: string) => {
    const id = `${kind}:${text}`;
    const slot = found.get(id) ?? {
      blocker: { id, kind, text, example, needs: [] },
      needs: new Set<string>(),
    };
    slot.needs.add(need);
    found.set(id, slot);
  };
  for (const ability of card.support.unparsed) {
    add('shape', templateOf(ability.text), ability.text, describeNeeds(ability));
  }
  for (const reason of card.support.reasons) {
    add('reason', templateOf(reason), reason, `${reasonCategory(reason)} (not an ability)`);
  }
  return [...found.values()]
    .map(({ blocker, needs }) => ({ ...blocker, needs: [...needs].sort(compare) }))
    .sort((a, b) => compare(a.id, b.id));
}

// ---------------------------------------------------------------- one deck

export interface BlockedCard {
  readonly name: string;
  readonly count: number;
  readonly commander: boolean;
  readonly blockers: readonly Blocker[];
  /** Another blocker is not needed: this card becomes supported when its one blocker is cleared. */
  readonly solo: boolean;
}

export interface DeckReport {
  readonly name: string;
  /** Cards with quantity (commander and main deck; unresolved names count). */
  readonly cards: number;
  readonly unique: number;
  readonly supportedCards: number;
  readonly supportedUnique: number;
  readonly fullySupported: boolean;
  /** Names of the commander lines (resolved names where possible). */
  readonly commanders: readonly string[];
  /** Unsupported cards that resolved, sorted by name. */
  readonly blocked: readonly BlockedCard[];
  /** Requested names no card of the bulk file matched, sorted. */
  readonly unresolved: readonly { readonly name: string; readonly count: number }[];
  readonly errors: readonly string[];
  readonly ignored: number;
}

interface Slot {
  name: string;
  count: number;
  commander: boolean;
  card: ImportedCard | undefined;
}

export function analyzeDeck(deck: ParsedDeck, index: CardIndex): DeckReport {
  // Lines of the same card merge: by oracle id when resolved, by the requested name otherwise.
  const slots = new Map<string, Slot>();
  for (const line of deck.lines) {
    const card = lookup(index, line.name);
    const key =
      card === undefined ? `name:${keysOf(line.name).full}` : `id:${card.stored.oracleId}`;
    const slot = slots.get(key) ?? {
      name: card === undefined ? line.name : card.stored.name,
      count: 0,
      commander: false,
      card,
    };
    slot.count += line.count;
    if (line.section === 'commander') slot.commander = true;
    slots.set(key, slot);
  }
  const all = [...slots.values()].sort((a, b) => compare(a.name, b.name));
  let cards = 0;
  let supportedCards = 0;
  let supportedUnique = 0;
  const blocked: BlockedCard[] = [];
  const unresolved: { name: string; count: number }[] = [];
  for (const slot of all) {
    cards += slot.count;
    if (slot.card === undefined) {
      unresolved.push({ name: slot.name, count: slot.count });
    } else if (slot.card.support.status === 'supported') {
      supportedCards += slot.count;
      supportedUnique += 1;
    } else {
      const blockers = blockersOf(slot.card);
      blocked.push({
        name: slot.name,
        count: slot.count,
        commander: slot.commander,
        blockers,
        solo: blockers.length === 1,
      });
    }
  }
  return {
    name: deck.name,
    cards,
    unique: all.length,
    supportedCards,
    supportedUnique,
    fullySupported:
      cards > 0 && supportedCards === cards && deck.errors.length === 0 && unresolved.length === 0,
    commanders: all.filter((slot) => slot.commander).map((slot) => slot.name),
    blocked,
    unresolved,
    errors: deck.errors,
    ignored: deck.ignored,
  };
}

// ---------------------------------------------------------------- across decks

export interface BlockerRow {
  readonly id: string;
  readonly kind: Blocker['kind'];
  readonly text: string;
  readonly example: string;
  readonly needs: readonly string[];
  /** Distinct cards of the given decks with this blocker, sorted. */
  readonly cards: readonly string[];
  /** Decks with a card that has this blocker, sorted. */
  readonly decks: readonly string[];
  /** Per deck: the cards that this blocker alone keeps out (their only blocker). */
  readonly solo: readonly { readonly deck: string; readonly cards: readonly string[] }[];
  readonly soloCards: number;
}

/** The blockers ranked by the cards they block, then the cards they unlock alone, then text. */
export function rankBlockers(reports: readonly DeckReport[]): BlockerRow[] {
  const rows = new Map<
    string,
    {
      first: Blocker;
      needs: Set<string>;
      cards: Set<string>;
      decks: Set<string>;
      solo: Map<string, Set<string>>;
    }
  >();
  for (const report of reports) {
    for (const card of report.blocked) {
      for (const blocker of card.blockers) {
        const row = rows.get(blocker.id) ?? {
          first: blocker,
          needs: new Set<string>(),
          cards: new Set<string>(),
          decks: new Set<string>(),
          solo: new Map<string, Set<string>>(),
        };
        for (const need of blocker.needs) row.needs.add(need);
        row.cards.add(card.name);
        row.decks.add(report.name);
        if (card.solo) {
          const names = row.solo.get(report.name) ?? new Set<string>();
          names.add(card.name);
          row.solo.set(report.name, names);
        }
        rows.set(blocker.id, row);
      }
    }
  }
  return [...rows.values()]
    .map((row) => {
      const solo = [...row.solo]
        .map(([deck, names]) => ({ deck, cards: [...names].sort(compare) }))
        .sort((a, b) => compare(a.deck, b.deck));
      return {
        id: row.first.id,
        kind: row.first.kind,
        text: row.first.text,
        example: row.first.example,
        needs: [...row.needs].sort(compare),
        cards: [...row.cards].sort(compare),
        decks: [...row.decks].sort(compare),
        solo,
        soloCards: new Set(solo.flatMap((entry) => entry.cards)).size,
      };
    })
    .sort(
      (a, b) =>
        b.cards.length - a.cards.length ||
        b.soloCards - a.soloCards ||
        b.decks.length - a.decks.length ||
        compare(a.id, b.id),
    );
}

/** How many other decks of the run have a card with this blocker. */
export function otherDecks(rows: readonly BlockerRow[], blocker: Blocker, deck: string): number {
  const row = rows.find((candidate) => candidate.id === blocker.id);
  return row === undefined ? 0 : row.decks.filter((name) => name !== deck).length;
}
