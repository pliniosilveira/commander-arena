/**
 * SYNTHETIC CARDS FOR THE PLAYERS WHO LOST LIFE OR WERE DEALT COMBAT DAMAGE THIS TURN. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the Scions & Spellcraft deck, group A: "if a player lost 4 or more life this turn" (`aPlayerLostLifeThisTurn`), "for each player who lost life this turn"
 * (`playerCount` of `lostLifeThisTurn`), "each opponent who lost life this turn sacrifices ..." (`lostLifeThisTurn` as the players of an effect) and "the number of your opponents who were
 * dealt combat damage by this creature or a Dragon this turn" (`combatDamagedThisTurn`). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is
 * not Oracle text, and none of these is the definition of a real card.
 */
import type { Amount } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

/** X of the dragon scholar: the opponents this creature or a Dragon dealt combat damage to this turn. */
const DAMAGED_OPPONENTS: Amount = {
  kind: 'playerCount',
  of: {
    kind: 'combatDamagedThisTurn',
    of: { kind: 'eachOpponent' },
    byThis: true,
    by: { subtypes: ['Dragon'] },
  },
};

export const SYNTHETIC_LIFE_LOST_GROUP_LIST: readonly CardDefinition[] = [
  // "At the beginning of each end step, if a player lost 4 or more life this turn, you draw a card."
  singleFace({
    name: 'SYNTHETIC Night Warden',
    manaCost: ['2', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'At the beginning of each end step, if a player lost 4 or more life this turn, you draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        interveningIf: { kind: 'aPlayerLostLifeThisTurn', atLeast: 4 },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "At the beginning of each end step, if an opponent lost 3 or more life this turn, you draw a card."
  singleFace({
    name: 'SYNTHETIC Opposing Watcher',
    manaCost: ['1', 'U'],
    types: ['enchantment'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText:
      'At the beginning of each end step, if an opponent lost 3 or more life this turn, you draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        interveningIf: { kind: 'aPlayerLostLifeThisTurn', atLeast: 3, opponent: true },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "At the beginning of your end step, put a soul counter on this artifact for each player who lost life this turn."
  singleFace({
    name: 'SYNTHETIC Soul Reaper',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'At the beginning of your end step, put a soul counter on this artifact for each player who lost life this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'addCounters',
          objects: THIS,
          counter: 'soul',
          count: {
            kind: 'playerCount',
            of: { kind: 'lostLifeThisTurn', of: { kind: 'eachPlayer' } },
          },
        },
      },
    ],
  }),
  // "{1}, {T}: Each opponent who lost life this turn sacrifices a creature with the greatest power among creatures they control."
  singleFace({
    name: 'SYNTHETIC Culling Idol',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{1}, {T}: Each opponent who lost life this turn sacrifices a creature with the greatest power among creatures they control.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1'] }, { kind: 'tap' }],
        effect: {
          kind: 'sacrifice',
          objects: {
            kind: 'choose',
            filter: { types: ['creature'], controller: 'you' },
            greatest: 'power',
          },
          player: { kind: 'lostLifeThisTurn', of: { kind: 'eachOpponent' } },
        },
      },
    ],
  }),
  // "At the beginning of your second main phase, you draw X cards and lose X life, where X is the number of your opponents who were dealt combat damage by this creature or a Dragon this turn."
  singleFace({
    name: 'SYNTHETIC Dragon Scholar',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Elf'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      'At the beginning of your second main phase, you draw X cards and lose X life, where X is the number of your opponents who were dealt combat damage by this creature or a Dragon this turn.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'main2', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: DAMAGED_OPPONENTS },
            { kind: 'loseLife', player: YOU, amount: DAMAGED_OPPONENTS },
          ],
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Ember Drake',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText: 'A Dragon with no abilities.',
    abilities: [],
  }),
  // "Target player loses 4 life."
  singleFace({
    name: 'SYNTHETIC Drain Four',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Target player loses 4 life.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'loseLife', player: T1, amount: 4 },
    },
  }),
  // "Target player loses 1 life."
  singleFace({
    name: 'SYNTHETIC Drain One',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Target player loses 1 life.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'loseLife', player: T1, amount: 1 },
    },
  }),
  // "Whenever an opponent loses life for the first time during each of their turns, you draw a card."
  singleFace({
    name: 'SYNTHETIC Patient Tormentor',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Whenever an opponent loses life for the first time during each of their turns, you draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'lifeLost', who: 'opponent', firstEachTurn: true, duringTheirTurn: true },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
];
