/**
 * "that creature has power 7 or greater" (Yavimaya Bloomsage, CR 208.1, 608.2c): a test of the power of the permanent an earlier instruction of the text named
 * ("put a +1/+1 counter on target creature you control. Then if that creature has power 7 or greater, ..."), read as it is now, after the counter. The engine's
 * `objectMatches` with a power comparison, in a `conditional` effect.
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition, IrFilter, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.that-object-power`: "~ has power 7 or greater" (Cloud, Ex-SOLDIER: the permanent with the ability), "that creature has power 7 or greater", "that permanent has power 3 or less". The number is a digit string; the direction is "or greater"
 * or "or less". Not read: a word for the number, "or more", a missing direction, a player or a card, and the past tense.
 */
export const CONDITION_THAT_OBJECT_POWER = defineRule<IrCondition>({
  id: 'condition.that-object-power',
  family: 'condition',
  leading: ['that', '~'],
  cites: ['CR 208.1 (Power and Toughness)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'that creature has power 7 or greater',
    'that creature has power 3 or less',
    'that permanent has power 4 or greater',
    // Limit Break deck, group 1 (Cloud, Ex-SOLDIER, CR 208.1): the permanent with the ability, as it is now.
    '~ has power 7 or greater',
    '~ has power 3 or less',
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
    '~ has power',
    '~ has power seven or greater',
    '~ has power 7 or more',
    '~ had power 7 or greater',
  ],
  parse: (ctx, pos) => {
    const own = pattern(/~ has power (\d+) or (greater|less)(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (own.ok) {
      const value = Number(own.value[1]);
      if (!Number.isSafeInteger(value)) return fail(ctx, pos);
      const self: IrNoun = {
        kind: 'noun',
        det: 'self',
        filter: { raw: '~' },
        upTo: false,
        plural: false,
        other: false,
        span: { start: pos, end: pos + 1 },
        rule: 'condition.that-object-power',
      };
      const filter: IrFilter = {
        power: { cmp: (own.value[2] ?? '').toLowerCase() === 'less' ? 'atMost' : 'atLeast', value },
        raw: own.value[0],
      };
      return {
        ok: true,
        value: {
          kind: 'condition',
          test: { kind: 'objectMatches', who: self, filter },
          span: { start: pos, end: own.pos },
          rule: 'condition.that-object-power',
        },
        pos: own.pos,
      };
    }
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
