/**
 * SYNTHETIC CARDS FOR ROLLING A DIE. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-941 (CR 706): "roll a die of N sides" and "if the result is ...". A graveyard recursion that rolls a
 * four-sided die at the beginning of its owner's upkeep, spells that roll a six-sided, a twenty-sided and two dice and read the result
 * in one or more `conditional` instructions (with an "otherwise"), and one more graveyard trigger whose condition is not the one the
 * recursion needs. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and
 * none of these is the definition of a real card.
 */
import type { Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const THIS = { kind: 'this' } as const;

const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });
const lose = (amount: number): Effect => ({ kind: 'loseLife', player: YOU, amount });

/** The graveyard recursion of the Angel the Bruna deck plays, in the engine's words. */
const RETURN_THIS: Effect = {
  kind: 'moveToZone',
  objects: THIS,
  to: 'battlefield',
  controller: 'owner',
};

export const SYNTHETIC_DICE_LIST: readonly CardDefinition[] = [
  // "Flying. At the beginning of your upkeep, if this card is in your graveyard, roll a four-sided die. If the result is 1, return this card from your
  // graveyard to the battlefield."
  singleFace({
    name: 'SYNTHETIC Die Angel',
    manaCost: ['4', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 4,
    toughness: 4,
    oracleText:
      'Flying. At the beginning of your upkeep, if this card is in your graveyard, roll a four-sided die. If the result is 1, return this card from your graveyard to the battlefield.',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: { kind: 'thisInYourGraveyard' },
        functionsIn: 'graveyard',
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'rollDie', sides: 4 },
            {
              kind: 'conditional',
              condition: { kind: 'dieResult', compare: { cmp: 'equal', value: 1 } },
              effect: RETURN_THIS,
            },
          ],
        },
      },
    ],
  }),
  // "Roll a six-sided die. If the result is 4 or more, you gain 4 life. Otherwise, you lose 2 life."
  singleFace({
    name: 'SYNTHETIC Die Gambit',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Roll a six-sided die. If the result is 4 or more, you gain 4 life. Otherwise, you lose 2 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'rollDie', sides: 6 },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'atLeast', value: 4 } },
            effect: gain(4),
            else: lose(2),
          },
        ],
      },
    },
  }),
  // "Roll a d20. If the result is 20, you gain 5 life. If the result is 2 or less, you lose 3 life." Two sentences read the one result.
  singleFace({
    name: 'SYNTHETIC Twenty Wheel',
    manaCost: ['2', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Roll a d20. If the result is 20, you gain 5 life. If the result is 2 or less, you lose 3 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'rollDie', sides: 20 },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'equal', value: 20 } },
            effect: gain(5),
          },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'atMost', value: 2 } },
            effect: lose(3),
          },
        ],
      },
    },
  }),
  // "Roll a six-sided die. Roll a six-sided die. If the result is 6, you gain 1 life." The result is the second roll's.
  singleFace({
    name: 'SYNTHETIC Die Twice',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Roll a six-sided die. Roll a six-sided die. If the result is 6, you gain 1 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'rollDie', sides: 6 },
          { kind: 'rollDie', sides: 6 },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'equal', value: 6 } },
            effect: gain(1),
          },
        ],
      },
    },
  }),
  // "Roll a four-sided die." Alone: the roll is an event of its own, and nothing reads the result.
  singleFace({
    name: 'SYNTHETIC Die Alone',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Roll a four-sided die.',
    spell: { effect: { kind: 'rollDie', sides: 4 } },
  }),
  // "Roll a two-sided die. If the result is 1, you gain 1 life. Otherwise, you lose 1 life." A coin of a die: every outcome is one of two.
  singleFace({
    name: 'SYNTHETIC Die Coin',
    manaCost: ['R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Roll a two-sided die. If the result is 1, you gain 1 life. Otherwise, you lose 1 life.',
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'rollDie', sides: 2 },
          {
            kind: 'conditional',
            condition: { kind: 'dieResult', compare: { cmp: 'equal', value: 1 } },
            effect: gain(1),
            else: lose(1),
          },
        ],
      },
    },
  }),
  // "Exile target card from a graveyard." The answer to a graveyard trigger: the card is a new object once it has left (CR 400.7).
  singleFace({
    name: 'SYNTHETIC Die Scour',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Exile target card from a graveyard.',
    spell: {
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'graveyard' } } }],
      effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
    },
  }),
];
