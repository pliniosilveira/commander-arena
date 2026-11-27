/**
 * Static rule of the Animated Army deck (issue 110, Bello, Bard of the Brambles): a group of permanents that are creatures of a stated size as well as what they are, with
 * what they have.
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family } from '../registry';
import { endsInQuote, predicate } from './grants';

const HAS = predicate('each');

/**
 * `static.each-is-creature`: "Each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater is a 4/4 Elemental creature in addition to its other
 * types and has indestructible, haste, and "Whenever ~ deals combat damage to a player, draw a card."" (CR 613.1d: the card type and the creature type are added in layer 4; CR
 * 613.4b: the numbers are its base power and toughness, layer 7b; CR 613.1f: what it has is given in layer 6; CR 613.6: the three are parts of one effect; CR 205.1b: "in
 * addition to its other types"). One statement: the group under "each", one size, one creature type in the singular, and after "and has" keywords and abilities in quotes. Not
 * read: no "in addition to its other types" (the types would be replaced, another effect), a size with X, no creature type or two, a type that is not a creature type, a
 * color, "gets +N/+N" or a restriction after "and", the plural ("are 4/4 Elemental creatures").
 */
export const STATIC_EACH_IS_CREATURE = defineRule<IrStatic>({
  id: 'static.each-is-creature',
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 613.4b (Interaction of Continuous Effects)',
    'CR 613.6 (Interaction of Continuous Effects)',
    'CR 205.1b (Card Types)',
  ],
  examples: [
    'Each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater is a 4/4 Elemental creature in addition to its other types and has indestructible, haste, and "Whenever ~ deals combat damage to a player, draw a card."',
    'Each non-Equipment artifact and non-Aura enchantment you control with mana value 4 or greater is a 4/4 Elemental creature in addition to its other types.',
    'Each artifact you control is a 2/2 Construct creature in addition to its other types and has haste.',
    'Each Fungus and Saproling you control is a 1/1 Elemental creature in addition to its other types and has trample and haste.',
  ],
  rejects: [
    'Each artifact you control is a 2/2 Construct creature in addition to its other types and has haste',
    'Each artifact you control is a 2/2 Construct creature.',
    'Each artifact you control is a 2/2 Construct creature and has haste.',
    'Each artifact you control is a X/X Construct creature in addition to its other types.',
    'Each artifact you control is a 2/2 creature in addition to its other types.',
    'Each artifact you control is a 2/2 Equipment creature in addition to its other types.',
    'Each artifact you control is a 2/2 green Construct creature in addition to its other types.',
    'Each artifact you control is a 2/2 Construct creature in addition to its other types and gets +1/+1.',
    "Each artifact you control is a 2/2 Construct creature in addition to its other types and can't block.",
    'Each artifact you control is a 2/2 Construct creature in addition to its other types and has haste and gets +1/+1.',
    'Each artifact you control are 2/2 Construct creatures in addition to their other types.',
    'Artifacts you control are 2/2 Construct creatures in addition to their other types.',
    'Each artifact you control is a Construct in addition to its other types.',
  ],
  parse: (ctx, pos) => {
    const rule = 'static.each-is-creature';
    const subject = family<IrNoun>('noun', { only: ['noun.each-pair', 'noun.each-permanent'] })(
      ctx,
      pos,
    );
    if (!subject.ok) return subject;
    const is = sequence(
      pattern(/ is an? (\d+)\/(\d+) /u),
      satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true && CREATURE_TYPES.has(w.subtype)),
      pattern(/ creature in addition to its other types(?![\p{L}\p{N}])/u),
    )(ctx, subject.pos);
    if (!is.ok) return is;
    const [size, type] = is.value;
    let end = is.pos;
    let grants: readonly IrStaticEffect[] = [];
    const and = literal(' and')(ctx, end);
    if (and.ok) {
      const has = HAS(ctx, and.pos);
      if (!has.ok) return has;
      // What the group has: keywords and abilities in quotes, nothing else.
      if (
        !has.value.every(
          (e) => e.kind === 'grantKeyword' || e.kind === 'grantAbility' || e.kind === 'grantQuoted',
        )
      ) {
        return fail(ctx, and.pos);
      }
      grants = has.value;
      end = has.pos;
    }
    if (!endsInQuote(grants)) {
      const period = literal('.')(ctx, end);
      if (!period.ok) return period;
      end = period.pos;
    }
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subject.value,
        effects: [
          {
            kind: 'animate',
            power: Number(size[1]),
            toughness: Number(size[2]),
            cardTypes: ['creature'],
            subtypes: [type.subtype],
            grants,
          },
        ],
        span: { start: pos, end },
        rule,
      },
      pos: end,
    };
  },
});

export const ANIMATE_STATIC_RULES = [STATIC_EACH_IS_CREATURE];
