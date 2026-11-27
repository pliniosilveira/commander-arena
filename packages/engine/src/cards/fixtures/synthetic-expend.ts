/**
 * SYNTHETIC CARDS FOR EXPEND (CR 700.14). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Whenever you expend N": the `expend` trigger and the mana a player has spent to cast spells this turn (`TurnLog.manaSpentOnSpells`). Each gains a
 * different amount of life, so a test reads which abilities triggered from the life total. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const expend = (amount: number, life: number): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'expend', amount },
  effect: { kind: 'gainLife', player: { kind: 'you' }, amount: life },
});

export const SYNTHETIC_EXPEND_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Expend Two',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever you expend 2, you gain 1 life.',
    abilities: [expend(2, 1)],
  }),
  singleFace({
    name: 'SYNTHETIC Expend Four',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Raccoon'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Whenever you expend 4, you gain 10 life.',
    abilities: [expend(4, 10)],
  }),
  // The activated ability costs mana that is not spent to cast a spell.
  singleFace({
    name: 'SYNTHETIC Expend Six',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Whenever you expend 6, you gain 100 life.\n{4}: Draw a card.',
    abilities: [
      expend(6, 100),
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['4'] }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
];
