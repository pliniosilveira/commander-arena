/**
 * SYNTHETIC CARDS FOR FOUR SMALL PRIMITIVES OF THE NIV-MIZZET DECK PROGRAM (issue 25). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the conditions and amounts the real cards need: "Activate only if you've cast three or more spells this turn"
 * (`spellsCastThisTurn`, D-981), two mana of different colors (`anyCombination` with `distinct`, D-982), "Untap this permanent during each other
 * player's untap step" (`untapInOthersUntapStep` with `self`, D-983) and "the number of cards in your hand minus 4" (the `minus` amount, D-984).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_NIV_PRIMITIVES_LIST: readonly CardDefinition[] = [
  // "{T}: You gain 1 life. Activate only if you've cast three or more spells this turn." (D-981)
  singleFace({
    name: 'SYNTHETIC Spell Gate',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "{T}: You gain 1 life. Activate only if you've cast three or more spells this turn.",
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        activateOnlyIf: { kind: 'spellsCastThisTurn', atLeast: 3 },
      },
    ],
  }),
  // "{T}: Add two mana of different colors." (D-982, CR 106.1b)
  singleFace({
    name: 'SYNTHETIC Prism Vessel',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '{T}: Add two mana of different colors.',
    abilities: [
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }],
        production: { kind: 'anyCombination', count: 2, distinct: true },
      },
    ],
  }),
  // "{W}{U}" and "{G}{G}" instants, to pay with it.
  singleFace({
    name: 'SYNTHETIC Azorius Sip',
    manaCost: ['W', 'U'],
    types: ['instant'],
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    oracleText: 'You gain 1 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Green Pair',
    manaCost: ['G', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You gain 1 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Green Splash',
    manaCost: ['1', 'G'],
    types: ['instant'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'You gain 1 life.',
    spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
  // "Untap this artifact during each other player's untap step. {T}: Add {C}." (D-983, CR 502.3)
  singleFace({
    name: 'SYNTHETIC Dew Flask',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: "Untap this artifact during each other player's untap step. {T}: Add {C}.",
    abilities: [
      { kind: 'static', static: { kind: 'untapInOthersUntapStep', self: true } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
    ],
  }),
  // "This artifact doesn't untap during your untap step. Untap this artifact during each other player's untap step. {T}: Add {C}." (D-983, D-229: the
  // extra untap is not the controller's own untap step, so "doesn't untap" does not stop it)
  singleFace({
    name: 'SYNTHETIC Sleepy Flask',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "This artifact doesn't untap during your untap step. Untap this artifact during each other player's untap step. {T}: Add {C}.",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'restriction', subject: { kind: 'this' }, restriction: 'doesntUntap' },
      },
      { kind: 'static', static: { kind: 'untapInOthersUntapStep', self: true } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
    ],
  }),
  // "You gain X life, where X is the number of cards in your hand minus 4." (D-984, CR 107.1b)
  singleFace({
    name: 'SYNTHETIC Hand Tithe',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'You gain X life, where X is the number of cards in your hand minus 4.',
    spell: {
      effect: {
        kind: 'gainLife',
        player: { kind: 'you' },
        amount: {
          kind: 'minus',
          of: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
          by: 4,
        },
      },
    },
  }),
  // "Each opponent loses X life, where X is the number of cards in your hand minus 4." (D-984: a negative result is 0, so it never gains life)
  singleFace({
    name: 'SYNTHETIC Hand Drain',
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Each opponent loses X life, where X is the number of cards in your hand minus 4.',
    spell: {
      effect: {
        kind: 'loseLife',
        player: { kind: 'eachOpponent' },
        amount: {
          kind: 'minus',
          of: { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
          by: 4,
        },
      },
    },
  }),
];
