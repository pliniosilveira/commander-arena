/**
 * Noun rules of stage P34 (D-151, D-152): "each other opponent" (CR 102.2: the opponents of the player who are still in the game, except the one the
 * event of the trigger is about) and "each of up to two other targets" (CR 115.3: a slot of targets that are none of the targets of an earlier slot
 * of the same ability, "Drakuseth deals 4 damage to any target and 3 damage to each of up to two other targets").
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';

const END = '(?![\\p{L}\\p{N}])';

/**
 * `noun.each-other-opponent`: "each other opponent" (CR 102.2, 603.2): the opponents of the controller besides the player the event of the trigger
 * is about ("Whenever ... deal combat damage to an opponent, ~ deals 4 damage to each other opponent"). With two players there is none.
 */
export const NOUN_EACH_OTHER_OPPONENT = defineRule<IrNoun>({
  id: 'noun.each-other-opponent',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 102.2 (Players)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['each other opponent', 'Each other opponent'],
  rejects: [
    'each other opponents',
    'each opponent',
    'each other player',
    'each other',
    'another opponent',
    'each other creature',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(new RegExp(`each other opponent${END}`, 'iu')))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'eachOpponent',
        filter: { raw: r.value.value[0] },
        upTo: false,
        plural: false,
        other: true,
        span: r.value.span,
        rule: 'noun.each-other-opponent',
      },
      pos: r.pos,
    };
  },
});

/**
 * `noun.other-targets`: "each of up to two other targets", "up to two other targets" (CR 115.3, 601.2c: targets of any kind, at most as many as
 * the text says, none of them a target of the slot before in the same ability). The "other" is what makes the slots differ: two slots of an ability
 * may otherwise share a target. Two or more only ("up to one other target" is a different phrase).
 */
export const NOUN_OTHER_TARGETS = defineRule<IrNoun>({
  id: 'noun.other-targets',
  family: 'noun',
  leading: ['each', 'up'],
  cites: ['CR 115.3 (Targets)', 'CR 601.2c (Casting Spells)', 'CR 115.4 (Targets)'],
  examples: [
    'each of up to two other targets',
    'up to two other targets',
    'each of up to three other targets',
  ],
  rejects: [
    'each of up to two targets',
    'each of up to one other target',
    'each of two other targets',
    'each of up to two other target',
    'each of up to two other creatures',
    'up to two other',
    'each of up to X other targets',
    'each of up to two other targets you control',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      optional(literal('each of '), null),
      literal('up to '),
      spanned(satisfy(quantity, (n) => n >= 2)),
      pattern(new RegExp(` other targets${END}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , count] = r.value;
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'target',
        filter: { anyTarget: true, raw: 'any target' },
        count: { kind: 'number', value: count.value, span: count.span },
        upTo: true,
        plural: true,
        other: false,
        otherTarget: true,
        span: { start: pos, end: r.pos },
        rule: 'noun.other-targets',
      },
      pos: r.pos,
    };
  },
});

export const DRAGON_NOUN_RULES = [NOUN_EACH_OTHER_OPPONENT, NOUN_OTHER_TARGETS].map(quietly);
