/**
 * SYNTHETIC SEARCH AND DISCARD CARDS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of library search (CR 701.23), shuffling (CR 701.24), revealing
 * (CR 701.20) and discarding (CR 701.9). Names start with "SYNTHETIC "; oracleId is null. The
 * text describes what the AST does; it is not Oracle text and none of these is a copy of a real
 * card's definition.
 */
import type { Effect, ObjectFilter, SearchDestination } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const BASIC_LAND: ObjectFilter = { types: ['land'], supertypes: ['basic'] };

const search = (
  filter: ObjectFilter,
  max: number,
  destinations: readonly SearchDestination[],
  options: { reveal?: boolean; shuffle?: boolean } = {},
): Effect => ({
  kind: 'search',
  player: YOU,
  filter,
  max,
  destinations,
  reveal: options.reveal ?? false,
  shuffle: options.shuffle ?? true,
});

export const SYNTHETIC_SEARCH_LIST: readonly CardDefinition[] = [
  // One basic land onto the battlefield tapped, then shuffle (the shape of a one-land ramp spell).
  singleFace({
    name: 'SYNTHETIC Land Fetch',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    spell: {
      effect: search(BASIC_LAND, 1, [{ zone: 'battlefield', tapped: true, count: 1 }]),
    },
  }),
  // Two basic lands: the first onto the battlefield tapped, the other into your hand (split).
  singleFace({
    name: 'SYNTHETIC Twin Land Fetch',
    manaCost: ['2', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for up to two basic land cards, reveal those cards. Put one onto the ' +
      'battlefield tapped and the other into your hand, then shuffle.',
    spell: {
      effect: search(
        BASIC_LAND,
        2,
        [
          { zone: 'battlefield', tapped: true, count: 1 },
          { zone: 'hand', count: 'rest' },
        ],
        { reveal: true },
      ),
    },
  }),
  // A land of one subtype onto the battlefield untapped.
  singleFace({
    name: 'SYNTHETIC Forest Fetch',
    manaCost: ['G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for a Forest card, put that card onto the battlefield, then shuffle.',
    spell: {
      effect: search({ subtypes: ['Forest'] }, 1, [{ zone: 'battlefield', count: 1 }]),
    },
  }),
  // A creature card into your hand, revealed.
  singleFace({
    name: 'SYNTHETIC Creature Tutor',
    manaCost: ['1', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for a creature card, reveal it, put it into your hand, then shuffle.',
    spell: {
      effect: search({ types: ['creature'] }, 1, [{ zone: 'hand', count: 1 }], { reveal: true }),
    },
  }),
  // No shuffle and no reveal: the library keeps its order.
  singleFace({
    name: 'SYNTHETIC Quiet Land Search',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Search your library for a land card and put it into your hand.',
    spell: {
      effect: search({ types: ['land'] }, 1, [{ zone: 'hand', count: 1 }], { shuffle: false }),
    },
  }),
  // Any card into the graveyard, a destination other than the battlefield and hand.
  singleFace({
    name: 'SYNTHETIC Graveyard Search',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Search your library for a card and put it into your graveyard. Then shuffle.',
    spell: {
      effect: search({}, 1, [{ zone: 'graveyard', count: 1 }]),
    },
  }),
  // Three destinations in order: battlefield, hand, graveyard.
  singleFace({
    name: 'SYNTHETIC Triple Fetch',
    manaCost: ['3', 'G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Search your library for up to three basic land cards. Put the first onto the battlefield ' +
      'tapped, the second into your hand and the third into your graveyard. Then shuffle.',
    spell: {
      effect: search(BASIC_LAND, 3, [
        { zone: 'battlefield', tapped: true, count: 1 },
        { zone: 'hand', count: 1 },
        { zone: 'graveyard', count: 'rest' },
      ]),
    },
  }),
  // A trigger that searches: the search is part of an ability resolving from the stack.
  singleFace({
    name: 'SYNTHETIC Scout Creature',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Scout'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText:
      'When this creature enters, search your library for a basic land card, reveal it, put it ' +
      'into your hand, then shuffle.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: search(BASIC_LAND, 1, [{ zone: 'hand', count: 1 }], { reveal: true }),
      },
    ],
  }),
  // "Draw a card, then discard a card" as a sequence.
  singleFace({
    name: 'SYNTHETIC Loot',
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'Draw a card, then discard a card.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: 1 },
          { kind: 'discard', player: YOU, count: 1 },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Discard Three',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'You discard three cards.',
    spell: { effect: { kind: 'discard', player: YOU, count: 3 } },
  }),
  singleFace({
    name: 'SYNTHETIC Each Player Discards',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each player discards a card.',
    spell: { effect: { kind: 'discard', player: { kind: 'eachPlayer' }, count: 1 } },
  }),
];
