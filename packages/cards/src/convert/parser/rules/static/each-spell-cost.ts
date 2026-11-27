/**
 * Static rule of the Tannuk deck (issue 347, Goblin Anarchomancer) and of the Miracle Worker deck (issue 109, Ancient Cellarspawn): a cost reduction for the spells of either of two colors or
 * of two or three creature types, stated with "each spell" (CR 118.7a, 601.2f, 604.2).
 */
import type { Parser } from '../../combinators';
import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrFilter, IrNoun, IrStatic } from '../../ir/types';
import { SUBTYPE_WORD_NUMBERED, type SubtypeWord } from '../noun/subtypes';
import { defineRule, spanned } from '../registry';

const COLOR = '(white|blue|black|red|green)';

/** "red or green": the two colors of the spells, each its own alternative of the filter. */
const COLORS: Parser<readonly IrFilter[]> = (ctx, pos) => {
  const r = pattern(new RegExp(`${COLOR} or ${COLOR}`, 'iu'))(ctx, pos);
  if (!r.ok) return r;
  const first = (r.value[1] ?? '').toLowerCase();
  const second = (r.value[2] ?? '').toLowerCase();
  if (first === second) return fail(ctx, pos);
  const anyOf: IrFilter[] = [first, second].map((c) => ({ colors: [c], raw: c }));
  return { ok: true, value: anyOf, pos: r.pos };
};

const SINGULAR_TYPE: Parser<SubtypeWord> = (ctx, pos) => {
  const r = SUBTYPE_WORD_NUMBERED(ctx, pos);
  if (!r.ok) return r;
  return r.value.plural === true ? fail(ctx, pos) : r;
};

/** "a Demon or Horror", "a Demon, Horror, or Nightmare" (CR 205.3m): two or three different creature types, the spell has at least one of them. */
const TYPES: Parser<readonly IrFilter[]> = (ctx, pos) => {
  const article = pattern(/an? /u)(ctx, pos);
  if (!article.ok) return article;
  const list = choice(
    map(
      sequence(SINGULAR_TYPE, literal(', '), SINGULAR_TYPE, literal(', or '), SINGULAR_TYPE),
      ([a, , b, , c]): SubtypeWord[] => [a, b, c],
    ),
    map(sequence(SINGULAR_TYPE, literal(' or '), SINGULAR_TYPE), ([a, , b]): SubtypeWord[] => [
      a,
      b,
    ]),
  )(ctx, article.pos);
  if (!list.ok) return list;
  const types = list.value.map((w) => w.subtype);
  if (new Set(types).size !== types.length) return fail(ctx, pos);
  const anyOf: IrFilter[] = types.map((t) => ({ subtypes: [t], raw: t }));
  return { ok: true, value: anyOf, pos: list.pos };
};

/**
 * `static.each-spell-cost-reduction`: "Each spell you cast that's red or green costs {1} less to cast." (CR 118.7a, 601.2f, 604.2: a static ability of a permanent that reduces the
 * generic mana of the spells its controller casts that have at least one of the colors; a spell of both colors is reduced once, the same reduction `static.spells-cost-reduction`
 * reads for "Blue spells and red spells you cast cost {1} less to cast."). Issue 109 (Ancient Cellarspawn, CR 205.3m): the same for "that's a Demon, Horror, or Nightmare", the spells that
 * have at least one of two or three creature types. Not read: a single color or type, "and", three colors, the spells of other players, colored mana in the reduction, an increase.
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
    'CR 205.3m (Subtypes)',
  ],
  examples: [
    "Each spell you cast that's red or green costs {1} less to cast.",
    "Each spell you cast that's white or blue costs {2} less to cast.",
    "Each spell you cast that's a Demon, Horror, or Nightmare costs {1} less to cast.",
    "Each spell you cast that's an Elf or Goblin costs {1} less to cast.",
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
    "Each spell you cast that's a Demon costs {1} less to cast.",
    "Each spell you cast that's a Demon and Horror costs {1} less to cast.",
    "Each spell you cast that's a Demon or Demon costs {1} less to cast.",
    "Each spell you cast that's a Demon, Horror or Nightmare costs {1} less to cast.",
    "Each spell you cast that's a Demon, Horror, Nightmare, or Elf costs {1} less to cast.",
    "Each spell you cast that's Demon or Horror costs {1} less to cast.",
    "Each spell you cast that's a Demon or red costs {1} less to cast.",
    "Each spell you cast that's a Demons or Horrors costs {1} less to cast.",
    "Each spell you cast that's a Demon or Horror costs {1} more to cast.",
    "Each spell your opponents cast that's a Demon or Horror costs {1} less to cast.",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('Each spell you cast that'),
      pattern(/['’]s /),
      choice(COLORS, TYPES),
      literal(' costs '),
      map(
        spanned(pattern(/\{([1-9]\d*)\}/)),
        ({ value, span }): IrAmount => ({ kind: 'number', value: Number(value[1]), span }),
      ),
      literal(' less to cast.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , anyOf, , amount] = r.value;
    const subject: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { anyOf: [...anyOf], controller: 'you', raw: ctx.text.slice(pos, r.pos) },
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
