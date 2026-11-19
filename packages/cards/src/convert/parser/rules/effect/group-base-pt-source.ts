/**
 * Effect rule of Tanazir Quandrix: "have the base power and toughness of other creatures you control become equal to ~'s power and toughness until end of turn"
 * (CR 613.4b, 611.2c): `effect.have-group-base-pt-source`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrBasePt, IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.have-group-base-pt-source';

/**
 * `effect.have-group-base-pt-source`: the words after "you may" of "you may have the base power and toughness of other creatures you control become equal to ~'s power and
 * toughness until end of turn". One `setPt` (layer 7b, CR 613.4b) over the group as the effect resolves (CR 611.2c) whose numbers are the source's power and toughness
 * as it resolves, fixed from then on (the engine's `powerOf` and `toughnessOf` of `this`); counters and +N/+N effects still apply on top (layer 7c). The instruction is
 * optional by the sentence's "you may". Not read: the singular, a missing duration, another duration, "target", another source than `~`, "equal to ~'s power" alone.
 */
export const EFFECT_HAVE_GROUP_BASE_PT_SOURCE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['have'],
  cites: [
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    "have the base power and toughness of other creatures you control become equal to ~'s power and toughness until end of turn",
    'have the base power and toughness of other creatures you control become equal to ~’s power and toughness until end of turn',
  ],
  rejects: [
    "have the base power and toughness of other creatures you control become equal to ~'s power and toughness",
    "have the base power and toughness of other creatures you control become equal to ~'s power and toughness until your next turn",
    "have the base power and toughness of other creature you control become equal to ~'s power and toughness until end of turn",
    "have the base power and toughness of target creature become equal to ~'s power and toughness until end of turn",
    "have the base power and toughness of creatures you control become equal to ~'s power and toughness until end of turn",
    "have the base power and toughness of other creatures you control become equal to ~'s power until end of turn",
    "have the base power and toughness of other creatures you control become equal to target creature's power and toughness until end of turn",
    "has the base power and toughness of other creatures you control become equal to ~'s power and toughness until end of turn",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('have the '),
      spanned(literal('base power and toughness of ')),
      family<IrNoun>('noun', { only: ['noun.other-permanents'] }),
      spanned(pattern(/ become equal to ~['’]s power and toughness(?![\p{L}\p{N}/])/u)),
      literal(' '),
      family<IrDuration>('duration'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, head, subject, tail, , duration] = r.value;
    // A plural group only: "other creatures you control", never one creature.
    if (!subject.plural) return fail(ctx, pos);
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: 0,
      toughness: 0,
      fromSource: true,
      span: { start: head.span.start, end: tail.span.end },
      rule: ID,
    };
    const clause = makeClause(ID, 'setPt', { objects: subject, basePt }, basePt.span);
    return { ok: true, value: [{ ...clause, duration }], pos: r.pos };
  },
});

export const GROUP_BASE_PT_SOURCE_RULES = [EFFECT_HAVE_GROUP_BASE_PT_SOURCE];
