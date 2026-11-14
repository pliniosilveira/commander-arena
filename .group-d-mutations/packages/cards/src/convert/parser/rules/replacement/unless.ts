/**
 * Replacement rules for lands that enter tapped on a condition (CR 614.1c, 614.12): "~ enters
 * tapped unless <condition>." and the shock land's "As ~ enters, you may pay 2 life. If you don't,
 * it enters tapped." Both are replacement effects of the permanent itself, not triggered abilities
 * (CR 603.6d).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAbility, IrAmount, IrClause, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, family, spanned } from '../registry';
import { ENTERS, replacement } from './shared';

/**
 * `replacement.enters-tapped-unless`: "~ enters tapped unless you control two or more basic
 * lands." The condition is read by the condition family. The clause says when the permanent
 * enters tapped, which is when the condition is false: `condition` is `not(<condition>)`.
 */
export const REPLACEMENT_ENTERS_TAPPED_UNLESS = defineRule<IrAbility>({
  id: 'replacement.enters-tapped-unless',
  family: 'replacement',
  leading: ['~'],
  cites: ['CR 614.1c (Replacement Effects)', 'CR 614.12 (Replacement Effects)', 'CR 603.6d'],
  examples: [
    '~ enters tapped unless you control two or more basic lands.',
    '~ enters tapped unless you control two or more other lands.',
    '~ enters tapped unless you have two or more opponents.',
    '~ enters tapped unless you control an Island or a Mountain.',
    '~ enters the battlefield tapped unless you control a Forest.',
    '~ enters tapped unless you control two or fewer other lands.',
    '~ enters tapped unless you control a Dragon.',
  ],
  rejects: [
    '~ enters tapped.',
    '~ enters tapped unless you control two or more basic lands',
    '~ enters tapped unless an opponent controls a land.',
    '~ enters tapped unless you control two or more basic lands and you have two or more opponents.',
    '~ enters untapped unless you control two or more basic lands.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      ENTERS,
      literal(' tapped unless '),
      spanned(family<IrCondition>('condition')),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , unless] = r.value;
    const id = 'replacement.enters-tapped-unless';
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersTapped',
      args: {},
      optional: false,
      condition: {
        kind: 'condition',
        test: { kind: 'not', term: unless.value },
        span: unless.span,
        rule: id,
      },
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

/**
 * `replacement.enters-tapped-unless-pays`: "As ~ enters, you may pay 2 life. If you don't, it
 * enters tapped." (a shock land; CR 614.1c "As [this permanent] enters", 119.4 paying life). The
 * amount is a whole number of at least one; a payment in mana or any other "if you do" text is
 * not read.
 */
export const REPLACEMENT_ENTERS_TAPPED_UNLESS_PAYS = defineRule<IrAbility>({
  id: 'replacement.enters-tapped-unless-pays',
  family: 'replacement',
  leading: ['as'],
  cites: ['CR 614.1c (Replacement Effects)', 'CR 614.12 (Replacement Effects)', 'CR 119.4 (Life)'],
  examples: [
    "As ~ enters, you may pay 2 life. If you don't, it enters tapped.",
    'As ~ enters, you may pay 3 life. If you don’t, it enters tapped.',
    "As ~ enters the battlefield, you may pay 2 life. If you don't, it enters tapped.",
  ],
  rejects: [
    "As ~ enters, you may pay 0 life. If you don't, it enters tapped.",
    "As ~ enters, you may pay {2}. If you don't, it enters tapped.",
    "As ~ enters, you may pay 2 life. If you don't, it enters tapped and you lose 1 life.",
    'As ~ enters, you may pay 2 life.',
    'As ~ enters, choose a creature type.',
    "~ enters, you may pay 2 life. If you don't, it enters tapped.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/as ~ enters(?: the battlefield)?, you may pay /i),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(/ life\. if you don['’]t, it enters tapped\./i),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, life] = r.value;
    const id = 'replacement.enters-tapped-unless-pays';
    const span = { start: pos, end: r.pos };
    const amount: IrAmount = { kind: 'number', value: life.value, span: life.span };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersTappedUnlessPays',
      args: { amount },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const UNLESS_RULES = [
  REPLACEMENT_ENTERS_TAPPED_UNLESS,
  REPLACEMENT_ENTERS_TAPPED_UNLESS_PAYS,
];
