/**
 * Effect rules of the Draconic Dissent deck (issue 167) about goad and what is said with it.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrArg, IrDuration } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';
import { targetCreatures } from './restrict';

const ID_UNBLOCKABLE = 'effect.restrict-unblockable-until-next-turn';

/**
 * `effect.restrict-unblockable-until-next-turn`: "until your next turn, target creature an opponent controls can't be blocked" (Sly Instigator; CR 509.1b, 611.2a, 611.2c, 500.1): the engine's
 * `restrict` of `cantBeBlocked` until the next turn of the controller of the effect begins, on the creature the target names as the effect resolves. Not read: another duration, "this
 * turn", the duration after the sentence, another restriction, several creatures, a group, "except by".
 */
export const EFFECT_RESTRICT_UNBLOCKABLE_NEXT_TURN = defineRule<Clauses>({
  id: ID_UNBLOCKABLE,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    "until your next turn, target creature can't be blocked",
    "Until your next turn, target creature an opponent controls can't be blocked",
    'until your next turn, target creature can’t be blocked',
  ],
  rejects: [
    "until end of turn, target creature can't be blocked",
    "target creature can't be blocked until your next turn",
    "until your next turn, target creature can't block",
    "until your next turn, target creatures can't be blocked",
    "until your next turn, target creature can't be blocked this turn",
    "until your next turn, target creature can't be blocked except by creatures with flying",
    "until your next turn target creature can't be blocked",
    "until your next turn, creatures you control can't be blocked",
    "until your next turn, ~ can't be blocked",
    "until your next turn, target creature can't be blocked and draw a card",
  ],
  parse: single(
    ID_UNBLOCKABLE,
    sequence(
      spanned(pattern(/until your next turn(?![\p{L}\p{N}])/iu)),
      literal(', '),
      targetCreatures,
      pattern(/ can['’]t be blocked(?![\p{L}\p{N}])/iu),
    ),
    ([until, , objects]) => {
      const kind: IrArg = {
        kind: 'restrictionKind',
        restriction: 'cantBeBlocked',
        span: until.span,
        rule: ID_UNBLOCKABLE,
      };
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilYourNextTurn',
        span: until.span,
        rule: ID_UNBLOCKABLE,
      };
      return { verb: 'restrict', args: { objects, restriction: kind }, duration };
    },
  ),
});

export const GOAD_DRACONIC_EFFECT_RULES = [EFFECT_RESTRICT_UNBLOCKABLE_NEXT_TURN];
