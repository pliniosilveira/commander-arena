/**
 * Effect rules of stage P42 (D-190): the control-change slice of the Korvold deck. "Gain control of that artifact until the end of your next turn"
 * (CR 613.1b, 611.2).
 */
import { choice, literal, map, optional, refuseAt, sequence } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

const RULE = 'effect.gain-control';

/**
 * How long the control lasts, from the words after the object: "until end of turn", "until the end of your next turn" (the end of the next turn
 * of the controller of the effect, D-151) and "for as long as you control ~" (CR 611.2b); none is no duration (CR 611.2a: until the game ends).
 */
const DURATION = optional(
  spanned(
    choice(
      map(literal(' until end of turn'), () => 'untilEndOfTurn' as const),
      map(literal(' until the end of your next turn'), () => 'untilEndOfNextTurn' as const),
      map(literal(' for as long as you control ~'), () => 'whileYouControlSelf' as const),
    ),
  ),
  null,
);

/**
 * `effect.gain-control`: "gain control of target creature until end of turn", "gain control of that artifact until the end of your next turn",
 * "gain control of target artifact for as long as you control ~", "gain control of target creature" (CR 613.1b: a control-changing effect is
 * applied in layer 2; CR 611.2a: its duration is the one it states, and none stated means the rest of the game; CR 611.2c: the permanent is
 * fixed when it begins). One object, a target or the permanent an earlier word of the text names ("that artifact", "it"); the player who gains
 * control is the controller of the ability. A group, "up to" and a player who is not "you" are other lines, and so are the durations the engine has
 * no node for ("until your next turn", "for as long as ~ remains tapped").
 */
export const EFFECT_GAIN_CONTROL = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['gain'],
  cites: [
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2b (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 110.2 (Permanents)',
  ],
  examples: [
    'gain control of target creature until end of turn',
    'gain control of target creature',
    'gain control of target artifact until the end of your next turn',
    'gain control of that artifact until the end of your next turn',
    'gain control of that creature until end of turn',
    'gain control of it until end of turn',
    'gain control of target creature for as long as you control ~',
    'gain control of target permanent until end of turn',
    'gain control of target creature an opponent controls until end of turn',
  ],
  rejects: [
    'gain control of target creature until your next turn',
    'gain control of target creature until end of combat',
    'gain control of target creature for as long as ~ remains tapped',
    'gain control of target creature for as long as you control a Dragon',
    'gain control of target creature until end of turn and untap it',
    'gain control of target creatures until end of turn',
    'gain control of up to one target creature until end of turn',
    'gain control of each creature until end of turn',
    'gain control of all creatures until end of turn',
    'gain control of ~ until end of turn',
    'gain control of target player until end of turn',
    'gain control of target creature until end of turn, then',
    'gains control of target creature until end of turn',
    'gain control of that card until end of turn',
    'gain control of target creature until the end of turn',
    'gain control of target creature until the end of your turn',
    'gain control of target creature and target land until end of turn',
  ],
  parse: single(
    RULE,
    sequence(
      literal('gain control of '),
      // One permanent: a target, or "that artifact" and "it" for what the text named before. A plural, "up to" and a player are other nouns.
      refuseAt(
        family<IrNoun>('noun', { only: ['noun.target-permanent', 'noun.that-object', 'noun.it'] }),
        (n) => !n.plural && !n.upTo && n.filter.player === undefined,
        (_n, _ctx, start) => start,
      ),
      DURATION,
    ),
    ([, objects, ended]) => {
      const duration: IrDuration | undefined =
        ended === null
          ? undefined
          : { kind: 'duration', scope: ended.value, span: ended.span, rule: RULE };
      return {
        verb: 'gainControl',
        args: { objects },
        ...(duration === undefined ? {} : { duration }),
      };
    },
  ),
});

export const CONTROL_EFFECT_RULES = [EFFECT_GAIN_CONTROL];
