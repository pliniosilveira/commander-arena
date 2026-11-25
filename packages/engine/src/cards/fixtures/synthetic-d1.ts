/**
 * SYNTHETIC CARDS FOR THE GRAND LARCENY DECK, GROUP D1. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of: "can't be blocked except by creatures with flying" (`cantBeBlockedBy` with blockers that do not have flying, CR 509.1b). Names start with "SYNTHETIC ";
 * oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_D1_LIST: readonly CardDefinition[] = [
  // "This creature can't be blocked except by creatures with flying."
  singleFace({
    name: 'SYNTHETIC Skyward Sneak',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: "This creature can't be blocked except by creatures with flying.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'cantBeBlockedBy',
          subject: { kind: 'this' },
          blockers: { types: ['creature'], notKeywords: ['flying'] },
        },
      },
    ],
  }),
  // "Whenever an opponent casts a spell from anywhere other than their hand, draw a card."
  singleFace({
    name: 'SYNTHETIC Foreign Cast Watcher',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Whenever an opponent casts a spell from anywhere other than their hand, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { stackKind: 'spell', notCastFromHand: true },
          by: 'opponent',
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
  // "When this creature enters, search your library and/or graveyard for a card named Grizzly Bears, reveal it, and put it into your hand. If you search your library this way, shuffle."
  singleFace({
    name: 'SYNTHETIC Bear Finder',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Snake'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'When this creature enters, search your library and/or graveyard for a card named Grizzly Bears, reveal it, and put it into your hand. If you search your library this way, shuffle.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'search',
              player: { kind: 'you' },
              filter: { named: 'Grizzly Bears' },
              max: 1,
              zones: ['library', 'graveyard'],
              destinations: [{ zone: 'hand', count: 1 }],
              reveal: true,
              shuffle: false,
            },
            {
              kind: 'conditional',
              condition: { kind: 'thisWayAtLeast', what: 'searched', count: 1 },
              effect: { kind: 'shuffle', player: { kind: 'you' } },
            },
          ],
        },
      },
    ],
  }),
  // "Reach"
  singleFace({
    name: 'SYNTHETIC Reach Spider',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Spider'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 3,
    oracleText: 'Reach',
    abilities: [{ kind: 'keyword', keyword: { kind: 'reach' } }],
  }),
];
