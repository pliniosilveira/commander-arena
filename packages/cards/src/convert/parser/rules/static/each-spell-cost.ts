/**
 * Static rule of the Tannuk deck (issue 347, Goblin Anarchomancer): a cost reduction for the spells of either of two colors, stated with "each spell" (CR 118.7a, 601.2f, 604.2).
 */
import { fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrFilter, IrNoun, IrStatic } from '../../ir/types';
import { defineRule, spanned } from '../registry';

const COLOR = '(white|blue|black|red|green)';

/**
 * `static.each-spell-cost-reduction`: "Each spell you cast that's red or green costs {1} less to cast." (CR 118.7a, 601.2f, 604.2: a static ability of a permanent that reduces the
 * generic mana of the spells its controller casts that have at least one of the colors; a spell of both colors is reduced once, the same reduction `static.spells-cost-reduction`
 * reads for "Blue spells and red spells you cast cost {1} less to cast."). Not read: a single color, "and", three colors, the spells of other players, colored mana in the
 * reduction, an increase.
 */
export const STATIC_EACH_SPELL_COST_REDUCTION = defineRule<IrStatic>({
  id: 'static.each-spell-cost-reduction',
  family: 'static',
  leading: [],
  cites: [
    'CR 118.7a (Costs)',
    'CR 601.2f (Casting Spells)',
    'CR 604.2 (Handling Static Abilities)',
    'CR 105.2 (Colors)',
  ],
  examples: [
    "Each spell you cast that's red or green costs {1} less to cast.",
    "Each spell you cast that's white or blue costs {2} less to cast.",
  ],
  rejects: [
    "Each spell you cast that's red costs {1} less to cast.",
    "Each spell you cast that's red and green costs {1} less to cast.",
    "Each spell you cast that's red or red costs {1} less to cast.",
    "Each spell you cast that's red or green costs {1} less to cast",
    "Each spell you cast that's red or green costs {1} more to cast.",
    "Each spell you cast that's red or green costs {R} less to cast.",
    "Each spell your opponents cast that's red or green costs {1} less to cast.",
    "Each spell you cast that's red or green or blue costs {1} less to cast.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('Each spell you cast that'),
      pattern(/['’]s /),
      pattern(new RegExp(`${COLOR} or ${COLOR}`, 'iu')),
      literal(' costs '),
      map(
        spanned(pattern(/\{([1-9]\d*)\}/)),
        ({ value, span }): IrAmount => ({ kind: 'number', value: Number(value[1]), span }),
      ),
      literal(' less to cast.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , colors, , amount] = r.value;
    const first = (colors[1] ?? '').toLowerCase();
    const second = (colors[2] ?? '').toLowerCase();
    if (first === second) return fail(ctx, pos);
    const anyOf: IrFilter[] = [first, second].map((c) => ({ colors: [c], raw: c }));
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { anyOf, controller: 'you', raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: 'static.each-spell-cost-reduction',
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [{ kind: 'costReduction', amount }],
        span: { start: pos, end: r.pos },
        rule: 'static.each-spell-cost-reduction',
      },
      pos: r.pos,
    };
  },
});

export const EACH_SPELL_COST_STATIC_RULES = [STATIC_EACH_SPELL_COST_REDUCTION];
