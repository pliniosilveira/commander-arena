/**
 * Effect rule of the Elminster deck (issue 576): a group gains keywords until your next turn, "Non-Angel creatures you control gain indestructible until your next turn."
 * (CR 611.2a: a continuous effect of a resolving spell lasts as long as it states; CR 611.2c: the group is fixed as it resolves; CR 613.1f: a layer 6 effect; CR 500.1:
 * the next turn of its controller).
 */
import { fail, map, type Parser, pattern } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { gainParser } from './gain';
import type { Clauses } from './operands';

const ID = 'effect.gain-keyword-all-next-turn';

/** "until your next turn" (CR 500.1, 611.2a): the duration family reads only "until end of turn", the rules that need this one read it themselves. */
const UNTIL_YOUR_NEXT_TURN = map(
  spanned(pattern(/until your next turn(?![\p{L}\p{N}])/iu)),
  ({ span }): IrDuration => ({ kind: 'duration', scope: 'untilYourNextTurn', span, rule: ID }),
);

const PARSE: Parser<Clauses> = gainParser(
  ID,
  ['noun.plain-permanents', 'noun.all-permanents', 'noun.token-permanents'],
  true,
  undefined,
  UNTIL_YOUR_NEXT_TURN,
);

/**
 * `effect.gain-keyword-all-next-turn`: a group, whoever controls it, gains keywords until the next turn of the controller of the effect: "creatures you control gain
 * indestructible until your next turn", "Non-Angel creatures you control gain indestructible until your next turn" (a creature type after "non-", CR 205.3d). The
 * group is fixed as the effect resolves (CR 611.2c). Not read: another duration, a verb that does not agree, a singular or a target, "other", no duration.
 */
export const EFFECT_GAIN_KEYWORD_ALL_NEXT_TURN = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: [],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 500.1 (Beginning of Turn)',
    'CR 205.3d (Subtypes)',
  ],
  examples: [
    'creatures you control gain indestructible until your next turn',
    'Non-Angel creatures you control gain indestructible until your next turn',
    'nonland permanents you control gain hexproof and indestructible until your next turn',
    'creatures you control get +1/+1 and gain vigilance until your next turn',
  ],
  rejects: [
    'creatures you control gain indestructible until end of turn',
    'creatures you control gain indestructible',
    'creatures you control gains indestructible until your next turn',
    'Non-Angel creatures you control gain indestructible until your next turn.',
    'other creatures you control gain indestructible until your next turn',
    'creature you control gains indestructible until your next turn',
    'target creatures gain indestructible until your next turn',
    'creatures you control gain flash until your next turn',
    'creatures you control get +1/+1 until your next turn',
  ],
  parse: (ctx, pos) =>
    // The rule has no leading word ("Non-Angel creatures" starts with any creature type), so it first checks that the sentence names its duration: a text that does not stays
    // for the rules that read it, and their diagnostics are not displaced by this one's.
    /^[^.\n]*\buntil your next turn(?![\p{L}\p{N}])/iu.test(ctx.text.slice(pos))
      ? PARSE(ctx, pos)
      : fail(ctx, pos),
});

export const GAIN_NEXT_TURN_EFFECT_RULES = [EFFECT_GAIN_KEYWORD_ALL_NEXT_TURN];
