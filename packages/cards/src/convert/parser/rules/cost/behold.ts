/**
 * `cost.behold`: "Behold a Jace" (CR 701.4, D-151), the additional cost of a spell. The player
 * reveals a matching card from their hand or chooses a matching permanent they control.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrCost, IrNoun } from '../../ir/types';
import { PLANESWALKER_TYPES } from '../noun/subtypes';
import { defineRule, family, spanned } from '../registry';

export const COST_BEHOLD = defineRule<IrCost>({
  id: 'cost.behold',
  family: 'cost',
  leading: ['behold'],
  cites: ['CR 701.4 (Behold)', 'CR 118.8 (Costs)'],
  examples: ['behold a Jace', 'behold a Dragon'],
  rejects: ['behold', 'behold a Jace or', 'behold another Jace', 'behold a Jace permanent'],
  parse: (ctx, pos) => {
    // "a Jace": a planeswalker type alone names a planeswalker of that type here (CR 205.3j, 701.4: "behold a Jace"). The noun grammar leaves a bare
    // planeswalker type unread, since it names no group of permanents by itself.
    const type = spanned(pattern(/behold a (\p{Lu}[\p{L}'’-]*)(?![\p{L}\p{N}'’-])/u))(ctx, pos);
    if (type.ok && PLANESWALKER_TYPES.has(type.value.value[1] ?? '')) {
      const word = type.value.value[1] ?? '';
      return {
        ok: true,
        value: {
          kind: 'behold',
          what: {
            kind: 'noun',
            det: 'a',
            filter: { raw: word, types: ['planeswalker'], subtypes: [word] },
            upTo: false,
            plural: false,
            other: false,
            span: type.value.span,
            rule: 'cost.behold',
          },
          span: type.value.span,
          rule: 'cost.behold',
        },
        pos: type.pos,
      };
    }
    const r = sequence(literal('behold '), family<IrNoun>('noun'))(ctx, pos);
    if (!r.ok) return r;
    const what = r.value[1];
    if (what.det !== 'a' || what.other || what.upTo || what.filter.raw === '') {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: {
        kind: 'behold',
        what,
        span: { start: pos, end: r.pos },
        rule: 'cost.behold',
      },
      pos: r.pos,
    };
  },
});
