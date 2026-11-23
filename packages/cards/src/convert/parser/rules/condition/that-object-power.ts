/**
 * "that creature has power 7 or greater" (Yavimaya Bloomsage, CR 208.1, 608.2c): a test of the power of the permanent an earlier instruction of the text named
 * ("put a +1/+1 counter on target creature you control. Then if that creature has power 7 or greater, ..."), read as it is now, after the counter. The engine's
 * `objectMatches` with a power comparison, in a `conditional` effect.
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition, IrFilter, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.that-object-power`: "that creature has power 7 or greater", "that permanent has power 3 or less". The number is a digit string; the direction is "or greater"
 * or "or less". Not read: a word for the number, "or more", a missing direction, a player or a card, and the past tense.
 */
export const CONDITION_THAT_OBJECT_POWER = defineRule<IrCondition>({
  id: 'condition.that-object-power',
  family: 'condition',
  leading: ['that'],
  cites: ['CR 208.1 (Power and Toughness)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'that creature has power 7 or greater',
    'that creature has power 3 or less',
    'that permanent has power 4 or greater',
  ],
  rejects: [
    'that creature has power',
    'that creature has power seven or greater',
    'that creature has power 7 or more',
    'that creature has power 7',
    'that creature had power 7 or greater',
    'that card has power 7 or greater',
    'that creature has toughness 7 or greater',
    'that creature has power X or greater',
    'those creatures have power 7 or greater',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /that (creature|permanent) has power (\d+) or (greater|less)(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const value = Number(r.value[2]);
    if (!Number.isSafeInteger(value)) return fail(ctx, pos);
    const that: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: `that ${(r.value[1] ?? '').toLowerCase()}` },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 5 + (r.value[1] ?? '').length },
      rule: 'condition.that-object-power',
    };
    const filter: IrFilter = {
      power: { cmp: (r.value[3] ?? '').toLowerCase() === 'less' ? 'atMost' : 'atLeast', value },
      raw: r.value[0],
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'objectMatches', who: that, filter },
        span: { start: pos, end: r.pos },
        rule: 'condition.that-object-power',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.that-object-greater-power-than-self`: "that creature has greater power than ~" (Conformer Shuriken, CR 208.1, 608.2c): the power of the permanent an earlier instruction of the
 * text named, as it is now, against the power of the permanent with the ability ("~"; for a granted ability that is the creature that has it). The engine's `objectMatches` with
 * `powerGreaterThanSource`, in a `conditional` effect; the lowering remembers the object, for "equal to the difference" after it. Not read: another comparison ("less", "at least",
 * "equal"), "its power", a player or a card, a stat other than power, the past tense, a plural.
 */
export const CONDITION_THAT_OBJECT_GREATER_POWER_THAN_SELF = defineRule<IrCondition>({
  id: 'condition.that-object-greater-power-than-self',
  family: 'condition',
  leading: ['that'],
  cites: ['CR 208.1 (Power and Toughness)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['that creature has greater power than ~', 'that permanent has greater power than ~'],
  rejects: [
    'that creature has greater power than',
    'that creature has lesser power than ~',
    'that creature has greater toughness than ~',
    'that creature has greater power than its controller',
    'that creature had greater power than ~',
    'that card has greater power than ~',
    'those creatures have greater power than ~',
    "that creature has greater power than ~'s toughness",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/that (creature|permanent) has greater power than ~(?![\p{L}\p{N}'’])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const that: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: `that ${(r.value[1] ?? '').toLowerCase()}` },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 5 + (r.value[1] ?? '').length },
      rule: 'condition.that-object-greater-power-than-self',
    };
    const filter: IrFilter = { powerGreaterThanSource: true, raw: r.value[0] };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'objectMatches', who: that, filter },
        span: { start: pos, end: r.pos },
        rule: 'condition.that-object-greater-power-than-self',
      },
      pos: r.pos,
    };
  },
});
