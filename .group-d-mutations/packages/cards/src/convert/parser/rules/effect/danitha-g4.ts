/**
 * Effect rules of group 4 of the Danitha deck (issue 26, D-419): the second line of Golden-Tail Trainer, "Whenever ~ attacks, other modified creatures you control
 * get +X/+X until end of turn, where X is ~'s power." The trigger is `trigger.attacks`, the group of creatures is `noun.other-permanents` (with the filter word
 * "modified", D-416) and the tail "where X is ~'s power" is `amount.where-x`; the lowering is `lower.pump` (`lower/effects-more.ts`).
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';
import { PUMP_TAIL, pumpArgs } from './pump';

/**
 * `effect.pump-others`: "other creatures you control get +1/+1 until end of turn" (CR 611.2a, 611.2c, 613.4c): every permanent the group describes, except the source of
 * the ability, as the effect resolves (CR 611.2c: the set is fixed then). The group is `noun.other-permanents` ("other creatures you control", "other modified creatures
 * you control", "other nonland permanents you control"), a plural that names a controller or none. Not read: the singular ("another creature you control"), "all other",
 * a creature type after "other" (`noun.other-subtype-permanents`: not built here), the verb in the singular, no duration, a second change ("and gain trample").
 */
export const EFFECT_PUMP_OTHERS = defineRule<Clauses>({
  id: 'effect.pump-others',
  family: 'effect',
  leading: ['other'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'other creatures you control get +1/+1 until end of turn',
    'other modified creatures you control get +2/+2 until end of turn',
    'other nonland permanents you control get +1/+0 until end of turn',
    'other creatures you control get +X/+X until end of turn',
    'other modified creatures you control get +X/+X until end of turn',
  ],
  rejects: [
    'other creatures you control gets +1/+1 until end of turn',
    'other creatures you control get +1/+1',
    'other creatures you control get +1/+1 until your next turn',
    'other creature you control gets +1/+1 until end of turn',
    'all other creatures you control get +1/+1 until end of turn',
    'other creatures you control get +1/+1 and gain trample until end of turn',
    'other Elves you control get +1/+1 until end of turn',
    'target creature gets +1/+1 until end of turn',
  ],
  parse: single(
    'effect.pump-others',
    sequence(
      family<IrNoun>('noun', { only: ['noun.other-permanents'] }),
      literal(' get '),
      PUMP_TAIL,
    ),
    ([objects, , [pt, , duration, count]]) => ({
      verb: 'modifyPt',
      args: pumpArgs(objects, pt, count),
      duration,
    }),
  ),
});

/** Quiet: a line this rule does not read ("Other creatures you control have vigilance") stops where it always did. */
export const DANITHA_G4_EFFECT_RULES = [quietly(EFFECT_PUMP_OTHERS)];
