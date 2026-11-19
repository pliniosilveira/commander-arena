/**
 * Effect rule of the Multiverse Reforged deck (issue 81, Sunfall): the keyword action Incubate (CR 701.53).
 */
import { literal, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.incubate`: "Incubate 3", "Incubate X" (CR 701.53a, 111.10i: create an Incubator token that enters with N +1/+1 counters; X is the X of the spell or what a "where X is ..." says).
 * The engine's `createToken` of the Incubator preset and the counters on the token made. Not read: no number, "you incubate", another count word.
 */
export const EFFECT_INCUBATE = defineRule<Clauses>({
  id: 'effect.incubate',
  family: 'effect',
  leading: ['incubate'],
  cites: ['CR 701.53a (Incubate)', 'CR 111.10i (Tokens)'],
  examples: ['incubate 3', 'incubate X', 'incubate two'],
  rejects: ['incubate', 'incubate Y', 'incubate 3 times', 'incubates 3', 'you incubate 3'],
  parse: single(
    'effect.incubate',
    sequence(
      literal('incubate '),
      family<IrArg>('amount', { only: ['amount.number', 'amount.x'] }),
    ),
    ([, count]) => ({ verb: 'incubate', args: { count } }),
  ),
});

export const INCUBATE_EFFECT_RULES = [EFFECT_INCUBATE];
