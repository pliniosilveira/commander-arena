/**
 * Effect rule of the Food and Fellowship deck, group B (Motivated Pony): "..., untap those creatures and they get an additional +2/+2 until end of turn." The creatures the
 * sentence before it gave something, getting one more change of power and toughness. The words "an additional" say only that the change is in addition to the one before it, as
 * every continuous effect that changes power and toughness is (CR 613.4c).
 */
import { choice, literal, optional, satisfy, sequence } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';
import { PUMP_TAIL } from './pump';

/**
 * `effect.pump-those`: "those creatures get +2/+2 until end of turn", "they get an additional +2/+2 until end of turn" (CR 611.2a, 611.2c, 613.4c): the group an instruction before it
 * named, as `effect.untap-those` and `effect.gain-keyword-those` read it, getting a change of power and toughness. The lowering reads the group from that instruction and refuses the
 * sentence after any other. Not read: the verb in the singular, "get" with no change, no duration, a count of "for each" or an X (the change is a fixed one), "them", "those cards".
 */
export const EFFECT_PUMP_THOSE = defineRule<Clauses>({
  id: 'effect.pump-those',
  family: 'effect',
  leading: ['those', 'they'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    'those creatures get +2/+2 until end of turn',
    'they get +2/+2 until end of turn',
    'they get an additional +2/+2 until end of turn',
    'those creatures get an additional +1/+0 until end of turn',
  ],
  rejects: [
    'those creatures gets +2/+2 until end of turn',
    'they gets +2/+2 until end of turn',
    'those creatures get +2/+2',
    'those creatures get +2/+2 until your next turn',
    'those creatures get +X/+X until end of turn',
    'those creatures get +1/+1 until end of turn for each creature you control',
    'those cards get +2/+2 until end of turn',
    'them get +2/+2 until end of turn',
    'they get an additional until end of turn',
  ],
  parse: single(
    'effect.pump-those',
    satisfy(
      sequence(
        choice(literal('those creatures'), literal('they')),
        literal(' get '),
        optional(literal('an additional '), null),
        PUMP_TAIL,
      ),
      // A fixed change only: an X or a count of "for each" would be read as the effect resolves, which the group of an earlier sentence does not say.
      ([, , , [pt, , , count]]) =>
        count === null && typeof pt.power === 'number' && typeof pt.toughness === 'number',
    ),
    ([, , , [pt, , duration]]) => ({
      verb: 'pumpThose',
      args: { pt },
      duration,
    }),
  ),
});

export const PUMP_THOSE_EFFECT_RULES = [EFFECT_PUMP_THOSE];
