/**
 * Noun rule of the card "Destroy all creatures with power greater than target creature's power." (CR 208.1, 608.2c): `noun.all-with-power-above-target`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { permanentPhrase } from './phrases';

const ID = 'noun.all-with-power-above-target';

/**
 * `noun.all-with-power-above-target`: "all creatures with power greater than target creature's power" (CR 208.1, 608.2c): every creature whose power, as the effect resolves,
 * is more than the power of the creature the spell targets. The target is a noun of its own, numbered with the other targets of the text (the binding pass walks the
 * `powerGreaterThanNoun` of the filter); the engine's `powerGreaterThan` of that target (`selector:powerGreaterThan`), read where an effect's `each` selector is read. Not read:
 * "each", "other", a number or "its power" for the comparison, a target that is not a creature or permanent noun, "target creature's toughness", "less than", "at least",
 * a controller said in the phrase, a singular.
 */
export const NOUN_ALL_WITH_POWER_ABOVE_TARGET = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['all'],
  cites: [
    'CR 208.1 (Power/Toughness)',
    'CR 115.1 (Targets)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "all creatures with power greater than target creature's power",
    "all creatures with power greater than target creature you control's power",
  ],
  rejects: [
    "each creature with power greater than target creature's power",
    "all creatures with power less than target creature's power",
    "all creatures with power greater than target creature's toughness",
    'all creatures with power greater than its power',
    'all creatures with power greater than 3',
    'all creatures with power greater than target creature',
    "all creature with power greater than target creature's power",
    "all other creatures with power greater than target creature's power",
    "all creatures you control with power greater than target creature's power",
    "all creatures with power greater than that creature's power",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('all '),
      permanentPhrase(true, 'all'),
      pattern(/ with power greater than /iu),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      pattern(/['’]s power(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, filter, , target] = r.value;
    // The comparison is with one target: "two target creatures" or "up to one" are not "target creature's power".
    if (target.plural || target.upTo || target.count !== undefined) return fail(ctx, pos);
    // A phrase that already says who controls the creatures is not this one.
    if (filter.controller !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, powerGreaterThanNoun: target, raw: ctx.text.slice(pos, r.pos) },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ID,
    };
    return { ok: true, value: noun, pos: r.pos };
  },
});

export const POWER_ABOVE_TARGET_NOUN_RULES = [NOUN_ALL_WITH_POWER_ABOVE_TARGET];
