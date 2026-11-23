/**
 * "Whenever ~ attacks, up to one hundred target creatures each get +0/+X until end of turn, where X is the number of cards in your hand." (Baldin, Century Herdmaster; CR 115.1,
 * 601.2c, 603.3d, 611.2a, 613.4c): several targets of one slot ("up to" a number of them), all of which get the change. The engine's `modifyPt` of the slot's targets, as
 * `effect.gain-keyword-targets` grants keywords to them.
 */
import { choice, literal, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';
import { PUMP_TAIL, pumpArgs } from './pump';

/**
 * `effect.pump-targets`: "up to two target creatures each get +1/+1 until end of turn": the creatures chosen as the ability is put on the stack (none to that many), each getting the
 * change. Which creatures are fixed then (CR 601.2c, 603.3d); the change is applied as the effect resolves (CR 611.2a, 613.4c). Not read: a singular verb, a subject that is not a
 * plural target noun of "up to", no duration.
 */
export const EFFECT_PUMP_TARGETS = defineRule<Clauses>({
  id: 'effect.pump-targets',
  family: 'effect',
  leading: ['up'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 611.2a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'up to two target creatures each get +1/+1 until end of turn',
    'up to one hundred target creatures each get +0/+X until end of turn',
    'up to three target creatures you control get +2/+0 until end of turn',
  ],
  rejects: [
    'up to two target creatures each gets +1/+1 until end of turn',
    'up to two target creatures each get +1/+1',
    'up to two target creatures each get +1/+1 until your next turn',
    'up to two creatures each get +1/+1 until end of turn',
    'up to one target creature gets +1/+1 until end of turn',
    'up to two target creatures each get +1/+1 and gain flying until end of turn',
  ],
  parse: single(
    'effect.pump-targets',
    sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (subject) => subject.upTo === true && subject.plural,
      ),
      choice(literal(' each get '), literal(' get ')),
      PUMP_TAIL,
    ),
    ([objects, , [pt, , duration, count]]) => ({
      verb: 'modifyPt',
      args: pumpArgs(objects, pt, count),
      duration,
    }),
  ),
});

export const PUMP_TARGETS_EFFECT_RULES = [EFFECT_PUMP_TARGETS];
