/**
 * Conditions of group C of the Jump Scare! deck (issue 108): "you control three or more creatures with different powers" (Augur of Autumn, Coven) and "~'s power is even" (Kianne,
 * Corrupted Memory).
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

const DIFFERENT_POWERS_ID = 'condition.control-different-powers';

/**
 * `condition.control-different-powers`: "you control three or more creatures with different powers" (Augur of Autumn; CR 208.1; Coven is an ability word, CR
 * 207.2c): at least that many of the permanents the phrase names whose powers are all different, which is the same as that many different powers among them. The engine's
 * `controlsDifferentPowers`. Not read: fewer than two (one permanent has one power), "or fewer", "other", "different toughnesses", a singular, a phrase with a power of its own.
 */
export const CONDITION_CONTROL_DIFFERENT_POWERS = defineRule<IrCondition>({
  id: DIFFERENT_POWERS_ID,
  family: 'condition',
  leading: ['you'],
  cites: ['CR 208.1 (Power and Toughness)', 'CR 207.2c (Ability Words)', 'CR 109.4 (Objects)'],
  examples: [
    'you control three or more creatures with different powers',
    'you control two or more creatures with different powers',
    'you control 4 or more creatures with different powers',
  ],
  rejects: [
    'you control one or more creatures with different powers',
    'you control three or more creatures',
    'you control three or fewer creatures with different powers',
    'you control three or more other creatures with different powers',
    'you control three or more creatures with different toughnesses',
    'you control three or more creatures with different powers.',
    'you control three or more creatures with power 3 or greater with different powers',
    'an opponent controls three or more creatures with different powers',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('you control '),
        satisfy(quantity, (n) => n >= 2),
        literal(' or more '),
        permanentPhrase(true, 'notBasicLand'),
        pattern(/ with different powers(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count, , phrase] = r.value.value;
    // The phrase says what the permanents are and nothing of their power: "with different powers" is the condition's own.
    if (phrase.power !== undefined || phrase.toughness !== undefined) return fail(ctx, pos);
    const span = r.value.span;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'controlDifferentPowers',
          noun: {
            kind: 'noun',
            det: 'a',
            filter: withoutZone(phrase),
            upTo: false,
            plural: true,
            other: false,
            span,
            rule: DIFFERENT_POWERS_ID,
          },
          atLeast: { kind: 'number', value: count, span },
        },
        span,
        rule: DIFFERENT_POWERS_ID,
      },
      pos: r.pos,
    };
  },
});

const PARITY_ID = 'condition.this-power-parity';

/**
 * `condition.this-power-parity`: "~'s power is even", "~'s power is odd" (Kianne, Corrupted Memory; CR 107.1: the numbers of the game are integers, a power may be negative; CR 208.1): the power of the permanent
 * itself as it is now. The engine's `thisPowerParity`. Not read: another permanent's power, "is an even number", a comparison, "toughness".
 */
export const CONDITION_THIS_POWER_PARITY = defineRule<IrCondition>({
  id: PARITY_ID,
  family: 'condition',
  leading: ["~'s", '~’s'],
  cites: ['CR 107.1 (Numbers)', 'CR 208.1 (Power and Toughness)'],
  examples: ["~'s power is even", "~'s power is odd", '~’s power is even'],
  rejects: [
    "~'s toughness is even",
    "~'s power is even.",
    "~'s power is an even number",
    "~'s power is 4 or greater",
    "that creature's power is even",
    '~ power is even',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~['’]s power is (even|odd)(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const parity = (r.value[1] ?? '').toLowerCase() === 'even' ? 'even' : 'odd';
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thisPowerParity', parity },
        span,
        rule: PARITY_ID,
      },
      pos: r.pos,
    };
  },
});

export const JUMP_SCARE_C_CONDITION_RULES = [
  CONDITION_CONTROL_DIFFERENT_POWERS,
  CONDITION_THIS_POWER_PARITY,
];
