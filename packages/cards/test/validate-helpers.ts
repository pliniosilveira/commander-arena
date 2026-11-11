/**
 * SYNTHETIC test data for deck validation. None of these are real Scryfall objects: ids are
 * invented (`synthetic-...`), numbers are invented, and Oracle text is hand-written, modeled on
 * the real cards only where the rule under test needs the wording (for example the "any number of
 * cards named" sentence or a partner ability line).
 */
import type { ColorLetter, StoredCard, StoredFace } from '../src/types';
import type { DeckMainEntry } from '../src/validate/index';

export interface CardOptions {
  readonly typeLine?: string;
  readonly text?: string;
  readonly identity?: readonly ColorLetter[];
  readonly power?: string | null;
  readonly toughness?: string | null;
  readonly legality?: StoredCard['commanderLegality'];
  readonly gameChanger?: boolean | null;
  readonly keywords?: readonly string[];
  readonly producedMana?: readonly string[];
  readonly manaCost?: string;
  readonly faces?: readonly StoredFace[];
  readonly layout?: string;
}

export function face(name: string, options: CardOptions = {}): StoredFace {
  return {
    name,
    manaCost: options.manaCost ?? '',
    typeLine: options.typeLine ?? 'Artifact',
    oracleText: options.text ?? '',
    power: options.power ?? null,
    toughness: options.toughness ?? null,
    loyalty: null,
    defense: null,
    colors: [],
    imageUris: null,
    artist: null,
  };
}

let serial = 0;

export function card(name: string, options: CardOptions = {}): StoredCard {
  serial += 1;
  return {
    oracleId: `synthetic-oracle-${serial}`,
    scryfallId: `synthetic-scryfall-${serial}`,
    name,
    layout: options.layout ?? 'normal',
    faces: options.faces ?? [face(name, options)],
    cmc: 0,
    colorIdentity: options.identity ?? [],
    keywords: options.keywords ?? [],
    producedMana: options.producedMana ?? [],
    commanderLegality: options.legality ?? 'legal',
    edhrecRank: null,
    gameChanger: options.gameChanger ?? null,
    relatedParts: [],
    fetchedAt: 0,
  };
}

/** A legendary creature with the given identity; extra options override. */
export function legend(
  name: string,
  identity: readonly ColorLetter[] = [],
  options: CardOptions = {},
): StoredCard {
  return card(name, {
    typeLine: 'Legendary Creature — Synthetic Test',
    power: '2',
    toughness: '2',
    identity,
    ...options,
  });
}

export function basicLand(name: string, color: ColorLetter | null): StoredCard {
  const type = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' } as const;
  return card(name, {
    typeLine: color ? `Basic Land — ${type[color]}` : 'Basic Land',
    identity: color ? [color] : [],
    producedMana: color ? [color] : [],
  });
}

/** `count` distinct colorless cards named `Synthetic Filler 001`, ... */
export function fillers(count: number): DeckMainEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    card: card(`Synthetic Filler ${String(i + 1).padStart(3, '0')}`),
    count: 1,
  }));
}

/** A legal-sized main deck: `extras` plus distinct fillers so commanders + main total 100. */
export function fullMain(
  commanderCount: number,
  extras: readonly DeckMainEntry[] = [],
): DeckMainEntry[] {
  const used = extras.reduce((sum, entry) => sum + entry.count, 0);
  return [...extras, ...fillers(100 - commanderCount - used)];
}

export const ONE = (c: StoredCard): DeckMainEntry => ({ card: c, count: 1 });

/** The first face of a card, for building multi-faced cards from single-faced ones. */
export function faceOf(c: StoredCard): StoredFace {
  const first = c.faces[0];
  if (!first) throw new Error(`${c.name} has no faces`);
  return first;
}
