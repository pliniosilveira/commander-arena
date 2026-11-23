import { fail, pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.it-is-an-enchantment`: "It's an enchantment." (Enduring Tenacity: "When ~ dies, if it was a creature, return it to the battlefield under its owner's control. It's an
 * enchantment.", CR 205.1a, 613.1d, 611.2a). The sentence after the instruction that returned the card: the permanent that came back is only an enchantment, for good, so it has no
 * other card type and no creature type (the engine's `setTypes` of what was moved, with no end). Not read: another card type, "in addition to its other types" (another rule), "until
 * end of turn", another subject, a plural, a second type.
 */
export const EFFECT_IT_IS_AN_ENCHANTMENT = defineRule<Clauses>({
  id: 'effect.it-is-an-enchantment',
  family: 'effect',
  leading: ['it', 'it’s', "it's"],
  cites: [
    'CR 205.1a (Type Line)',
    'CR 613.1d (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: ["It's an enchantment", 'It’s an enchantment', 'It is an enchantment'],
  rejects: [
    "It's an enchantment in addition to its other types",
    "It's an enchantment until end of turn",
    "It's an artifact",
    "It's an enchantment creature",
    "It's an enchantments",
    "They're enchantments",
    "It's an enchantment and",
    'It is not an enchantment',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/it(?:['’]s| is) an enchantment(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [makeClause('effect.it-is-an-enchantment', 'becomesOnlyEnchantment', {}, span)],
      pos: r.pos,
    };
  },
});

export const ENDURING_EFFECT_RULES = [EFFECT_IT_IS_AN_ENCHANTMENT];
