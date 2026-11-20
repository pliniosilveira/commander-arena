/**
 * Conditions about the Ring (Frodo, Adventurous Hobbit; CR 701.54): "~ is your Ring-bearer" and "the Ring has tempted you two or more times this game".
 */
import { fail, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

/**
 * `condition.this-is-ring-bearer`: "~ is your Ring-bearer" (CR 701.54e: a creature on the battlefield under your control that has the Ring-bearer designation of yours). The permanent
 * the ability belongs to, read as the instruction comes up. The engine's `thisIsRingBearer`. Not read: another creature ("target creature is your Ring-bearer"), another player's
 * Ring-bearer, "isn't", "is a Ring-bearer", the past tense.
 */
export const CONDITION_THIS_IS_RING_BEARER = defineRule<IrCondition>({
  id: 'condition.this-is-ring-bearer',
  family: 'condition',
  leading: ['~'],
  cites: ['CR 701.54e (The Ring Tempts You)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['~ is your Ring-bearer'],
  rejects: [
    '~ is your Ring-bearer.',
    '~ is not your Ring-bearer',
    '~ isn’t your Ring-bearer',
    '~ is a Ring-bearer',
    '~ is their Ring-bearer',
    '~ is an opponent’s Ring-bearer',
    '~ was your Ring-bearer',
    'it is your Ring-bearer',
    '~ is your Ring-bearers',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/~ is your Ring-bearer(?![\p{L}\p{N}-])/u))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thisIsRingBearer' },
        span: { start: pos, end: r.pos },
        rule: 'condition.this-is-ring-bearer',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.ring-tempted-times`: "the Ring has tempted you two or more times this game" (CR 701.54a, 701.54c: the number of times the Ring has tempted the player is how many abilities
 * the emblem has). At least two (one is "the Ring tempts you" having just happened, which the Ring abilities cover). The engine's `ringTemptedAtLeast`. Not read: another player,
 * "fewer", "exactly", a span other than the game, the past perfect "had".
 */
export const CONDITION_RING_TEMPTED_TIMES = defineRule<IrCondition>({
  id: 'condition.ring-tempted-times',
  family: 'condition',
  leading: ['the'],
  cites: ['CR 701.54a (The Ring Tempts You)', 'CR 701.54c (The Ring Tempts You)'],
  examples: [
    'the Ring has tempted you two or more times this game',
    'the Ring has tempted you three or more times this game',
    'the Ring has tempted you 4 or more times this game',
  ],
  rejects: [
    'the Ring has tempted you two or more times this turn',
    'the Ring has tempted you two or more times',
    'the Ring has tempted you one or more times this game',
    'the Ring has tempted you two times this game',
    'the Ring has tempted you two or fewer times this game',
    'the Ring has tempted an opponent two or more times this game',
    'the Ring had tempted you two or more times this game',
    'the Ring has tempted you two or more times this game.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/the Ring has tempted you /u),
        satisfy(quantity, (n) => n >= 2),
        pattern(/ or more times this game(?![\p{L}\p{N}])/u),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const times = r.value.value[1];
    if (times < 2) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'ringTemptedAtLeast', times },
        span: { start: pos, end: r.pos },
        rule: 'condition.ring-tempted-times',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.ring-bearer-and-tempted`: "~ is your Ring-bearer and the Ring has tempted you two or more times this game" (CR 701.54a, 701.54c, 701.54e, 608.2c): both tests, read as the
 * instruction comes up (the engine's `and` of `thisIsRingBearer` and `ringTemptedAtLeast`). Only these two, in this order. Not read: "or", another order, a third test, either
 * one of them alone (the rules above read those).
 */
export const CONDITION_RING_BEARER_AND_TEMPTED = defineRule<IrCondition>({
  id: 'condition.ring-bearer-and-tempted',
  family: 'condition',
  leading: ['~'],
  cites: [
    'CR 701.54a (The Ring Tempts You)',
    'CR 701.54e (The Ring Tempts You)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['~ is your Ring-bearer and the Ring has tempted you two or more times this game'],
  rejects: [
    '~ is your Ring-bearer and the Ring has tempted you two or more times this game.',
    '~ is your Ring-bearer or the Ring has tempted you two or more times this game',
    'the Ring has tempted you two or more times this game and ~ is your Ring-bearer',
    '~ is your Ring-bearer and the Ring has tempted you two or more times',
    '~ is your Ring-bearer and you control a Hobbit',
    '~ is your Ring-bearer and the Ring has tempted you two or more times this game and you control a Hobbit',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      CONDITION_THIS_IS_RING_BEARER.parse,
      pattern(/ and /u),
      CONDITION_RING_TEMPTED_TIMES.parse,
    )(ctx, pos);
    if (!r.ok) return r;
    if (pattern(/ (?:and|or)(?![\p{L}\p{N}])/u)(ctx, r.pos).ok) return fail(ctx, pos);
    const [first, , second] = r.value;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'and', terms: [first, second] },
        span: { start: pos, end: r.pos },
        rule: 'condition.ring-bearer-and-tempted',
      },
      pos: r.pos,
    };
  },
});

export const RING_TEMPTED_CONDITION_RULES = [
  CONDITION_RING_BEARER_AND_TEMPTED,
  CONDITION_THIS_IS_RING_BEARER,
  CONDITION_RING_TEMPTED_TIMES,
];
