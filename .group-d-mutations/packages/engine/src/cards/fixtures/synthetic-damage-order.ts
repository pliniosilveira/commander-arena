/**
 * SYNTHETIC CARDS FOR THE ORDER OF PREVENTION EFFECTS ON ONE DAMAGE EVENT. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-191 (CR 616.1: when two or more prevention effects apply to one damage event the affected player chooses which
 * to apply first): shields of two more sizes (the existing "Shield Three" is the third), a burn spell big enough to use three of them, and
 * the targetless versions the hidden deck of the browser test plays (a shield for you, and 3 damage to you).
 * Names start with "SYNTHETIC "; oracleId is null. The text is what the AST does, written the way Oracle text words these shapes; none of
 * these copies a real card definition. They are kept out of the generic card pools of the AI tests (packages/ai/test/helpers.ts), which
 * expect the decision kinds they already have: only the tests that name them play them.
 */
import type { Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const ANY_TARGET: TargetSpec = { id: 't1', what: { kind: 'anyTarget' } };

const shield = (name: string, amount: number): CardDefinition =>
  singleFace({
    name,
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: `Prevent the next ${amount} damage that would be dealt to any target this turn.`,
    spell: {
      targets: [ANY_TARGET],
      effect: {
        kind: 'preventDamage',
        scope: 'all',
        amount,
        to: T1,
        duration: 'untilEndOfTurn',
      } satisfies Effect,
    },
  });

/** "Prevent the next N damage that would be dealt to you this turn": no target, so a game can play it without choosing one. */
const brace = (name: string, amount: number): CardDefinition =>
  singleFace({
    name,
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: `Prevent the next ${amount} damage that would be dealt to you this turn.`,
    spell: {
      effect: {
        kind: 'preventDamage',
        scope: 'all',
        amount,
        to: { kind: 'you' },
        duration: 'untilEndOfTurn',
      } satisfies Effect,
    },
  });

export const SYNTHETIC_DAMAGE_ORDER_LIST: readonly CardDefinition[] = [
  shield('SYNTHETIC Shield Two', 2),
  shield('SYNTHETIC Shield Five', 5),
  brace('SYNTHETIC Brace Three', 3),
  brace('SYNTHETIC Brace Five', 5),
  singleFace({
    name: 'SYNTHETIC Backdraft',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'SYNTHETIC Backdraft deals 3 damage to you.',
    spell: { effect: { kind: 'dealDamage', amount: 3, to: { kind: 'you' } } },
  }),
  singleFace({
    name: 'SYNTHETIC Order Blast',
    manaCost: ['2', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC Order Blast deals 6 damage to any target.',
    spell: { targets: [ANY_TARGET], effect: { kind: 'dealDamage', amount: 6, to: T1 } },
  }),
];
