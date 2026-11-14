/**
 * SYNTHETIC stored cards for the conversion and request tests. Nothing here is real Scryfall data:
 * the ids are obviously invented, and the Oracle text is written to exercise the parser (some
 * names are real card names so the engine's name-keyed fixtures can be matched).
 */
import type { StoredCard, StoredFace } from '../src/index';

export function syntheticFace(overrides: Partial<StoredFace> = {}): StoredFace {
  return {
    name: 'SYNTHETIC Face',
    manaCost: '',
    typeLine: 'Creature — Test',
    oracleText: '',
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    colors: [],
    imageUris: null,
    artist: null,
    ...overrides,
  };
}

/** A single-faced SYNTHETIC card; `face` overrides the face, `card` the card-level fields. */
export function syntheticCard(
  face: Partial<StoredFace> = {},
  card: Partial<StoredCard> = {},
): StoredCard {
  const full = syntheticFace(face);
  return {
    oracleId: `synthetic-oracle-${full.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    scryfallId: 'synthetic-scryfall-0000',
    name: full.name,
    layout: 'normal',
    faces: [full],
    cmc: 0,
    colorIdentity: [],
    keywords: [],
    producedMana: [],
    commanderLegality: 'legal',
    edhrecRank: null,
    gameChanger: null,
    relatedParts: [],
    fetchedAt: 0,
    ...card,
  };
}

export const SYNTHETIC_VANILLA = syntheticCard(
  {
    name: 'SYNTHETIC Vanilla Bear',
    manaCost: '{1}{G}',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
    colors: ['G'],
  },
  { colorIdentity: ['G'], cmc: 2 },
);

export const SYNTHETIC_KEYWORD_CREATURE = syntheticCard(
  {
    name: 'SYNTHETIC Skyknight',
    manaCost: '{3}{W}{W}',
    typeLine: 'Creature — Angel',
    oracleText: 'Flying, vigilance',
    power: '4',
    toughness: '4',
    colors: ['W'],
  },
  { colorIdentity: ['W'], cmc: 5 },
);

export const SYNTHETIC_FOREST = syntheticCard(
  {
    name: 'SYNTHETIC Wildwood',
    typeLine: 'Basic Land — Forest',
    oracleText: '({T}: Add {G}.)',
  },
  { colorIdentity: ['G'] },
);

/** Same name and text as the engine fixture, so the fixture is used. */
export const SYNTHETIC_MANA_DORK = syntheticCard(
  {
    name: 'Llanowar Elves',
    manaCost: '{G}',
    typeLine: 'Creature — Elf Druid',
    oracleText: '{T}: Add {G}.',
    power: '1',
    toughness: '1',
    colors: ['G'],
  },
  { colorIdentity: ['G'], cmc: 1, oracleId: 'synthetic-oracle-llanowar-elves' },
);
