/**
 * SYNTHETIC CARDS FOR GROUP 3 OF THE LOREHOLD SPIRIT DECK (issue 86, D-622 and later). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real card of the group needs from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to these same
 * nodes): a preparation card (CR 722) whose creature becomes prepared at the beginning of its controller's upkeep when a player has one or fewer cards in hand, and whose prepare spell makes each
 * player discard their hand and then draw seven cards. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const EACH_PLAYER = { kind: 'eachPlayer' } as const;

const jackalFront = singleFace({
  name: 'Lore Jackal',
  manaCost: ['2', 'R'],
  types: ['creature'],
  subtypes: ['Jackal', 'Wizard'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 3,
  toughness: 3,
  oracleText:
    'At the beginning of your upkeep, if a player has one or fewer cards in hand, this creature becomes prepared.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      interveningIf: { kind: 'aPlayerCardsInHand', compare: { cmp: 'atMost', value: 1 } },
      effect: { kind: 'prepare', objects: { kind: 'this' } },
    },
  ],
});
const wheelSpell = singleFace({
  name: 'Spin of Fate',
  manaCost: ['2', 'R'],
  types: ['sorcery'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Each player discards their hand, then draws seven cards.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'discard', player: EACH_PLAYER, count: 0, hand: true },
        { kind: 'draw', player: EACH_PLAYER, count: 7 },
      ],
    },
  },
});

export const SYNTHETIC_LOREHOLD_G3_LIST: readonly CardDefinition[] = [
  {
    ...jackalFront,
    name: 'SYNTHETIC Lore Jackal // Spin of Fate',
    layout: 'prepare',
    faces: [...jackalFront.faces, ...wheelSpell.faces],
  },
  // A plain sorcery that draws nobody a card and lets a test put a hand to one or fewer cards: "Each player discards their hand." alone.
  singleFace({
    name: 'SYNTHETIC Empty Hands',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Each player discards their hand.',
    spell: { effect: { kind: 'discard', player: EACH_PLAYER, count: 0, hand: true } },
  }),
  // An instant that lets a test refill a hand at instant speed: "Draw three cards."
  singleFace({
    name: 'SYNTHETIC Rush of Cards',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Draw three cards.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 3 } },
  }),
];
