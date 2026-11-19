/**
 * Effect rule of the card "{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types." (CR 613.1d, 613.4b, 611.2c,
 * 205.3m, 107.3a): `effect.lead-group-base-pt`.
 */
import { fail, literal, optional, pattern, sequence } from '../../combinators';
import type { IrBasePt, IrClause, IrDuration, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.lead-group-base-pt';

/**
 * `effect.lead-group-base-pt`: "Until end of turn, creatures you control have base power and toughness X/X and gain all creature types." The duration first, then a group
 * of permanents ("creatures you control", `noun.plain-permanents`) with the plural verb "have", base power and toughness of numbers or of X (the X of the ability, CR 107.3a),
 * and, when the text says it, "and gain all creature types" (every creature type added in layer 4, CR 613.1d, 205.3m). The engine's `setPt` and `setTypes` with
 * `allCreatureTypes`, one effect each over the group the selector names as the effect begins (CR 611.2c). Not read: the singular, "target", "all", "each", a duration
 * other than "until end of turn", a power and toughness that are not both numbers or both X, "+X/+X", "gains" without the plural verb, other words after the types.
 */
export const EFFECT_LEAD_GROUP_BASE_PT = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 205.3m (Subtypes)',
    'CR 107.3a (Variables)',
  ],
  examples: [
    'Until end of turn, creatures you control have base power and toughness X/X and gain all creature types',
    'Until end of turn, creatures you control have base power and toughness 3/3',
    'Until end of turn, creatures you control have base power and toughness 2/2 and gain all creature types',
  ],
  rejects: [
    'Until end of turn, creatures you control have base power and toughness X/X and gain all creature types until end of turn',
    'Until end of turn, creatures you control have base power and toughness X/X and gains all creature types',
    'Until end of turn, creatures you control have base power and toughness X/3',
    'Until end of turn, creatures you control have base power and toughness +X/+X',
    'Until end of turn, creatures you control have base power and toughness X/X and gain all creature',
    'Until end of turn, creatures you control have base power and toughness X/X and gain all colors',
    'Until end of turn, target creature has base power and toughness X/X',
    'Until your next turn, creatures you control have base power and toughness X/X',
    'Until end of turn creatures you control have base power and toughness X/X',
    'Until end of turn, creatures you control has base power and toughness X/X',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      family<IrNoun>('noun', { only: ['noun.plain-permanents'] }),
      literal(' have '),
      spanned(pattern(/base power and toughness (?:(\d+)\/(\d+)|X\/X)(?![\p{L}\p{N}/])/u)),
      optional(spanned(pattern(new RegExp(` and gain all creature types${BOUNDARY}`, 'u'))), null),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , subject, , pt, types] = r.value;
    // The plural group of the plain permanent phrase, never a single permanent: "creatures you control", "Elves you control".
    if (!subject.plural) return fail(ctx, pos);
    const numbers = pt.value[1] !== undefined;
    const basePt: IrBasePt = {
      kind: 'basePt',
      power: numbers ? Number(pt.value[1]) : 0,
      toughness: numbers ? Number(pt.value[2]) : 0,
      ...(numbers ? {} : { x: true as const }),
      span: pt.span,
      rule: ID,
    };
    const clauses: IrClause[] = [
      {
        ...makeClause(ID, 'setPt', { objects: subject, basePt }, pt.span),
        duration,
        ...(types === null ? {} : { connector: 'and' as const }),
      },
    ];
    if (types !== null) {
      clauses.push({
        ...makeClause(ID, 'gainAllCreatureTypes', { objects: subject }, types.span),
        duration,
      });
    }
    return { ok: true, value: clauses, pos: r.pos };
  },
});

export const GROUP_BASE_PT_RULES = [EFFECT_LEAD_GROUP_BASE_PT];
