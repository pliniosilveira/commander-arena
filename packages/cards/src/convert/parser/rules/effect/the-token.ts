/**
 * Effect rules of Ashling, the Limitless: "The token gains haste until end of turn." and "At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}." after
 * "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it."
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrCost } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { gainParser } from './gain';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.gain-keyword-the-token`: "The token gains haste until end of turn." (CR 611.2a, 613.1f, 111.2, 400.7j): the one token the instruction before made gains keywords until end of
 * turn, as `effect.gain-keyword` reads of "that token". The subject is `noun.the-token`, bound like "that token" to the token of the sentence before. Not read: the plural, a duration that
 * is not the end of the turn, a verb that does not agree, another subject.
 */
export const EFFECT_GAIN_KEYWORD_THE_TOKEN = defineRule<Clauses>({
  id: 'effect.gain-keyword-the-token',
  family: 'effect',
  leading: ['the'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 111.2 (Tokens)',
    'CR 400.7 (General)',
  ],
  examples: [
    'the token gains haste until end of turn',
    'The token gains haste until end of turn',
    'the token gains flying and trample until end of turn',
  ],
  rejects: [
    'the token gains haste',
    'the token gains haste until your next turn',
    'the token gain haste until end of turn',
    'the tokens gain haste until end of turn',
    'the creature gains haste until end of turn',
    'the token gains haste until end of turn and draw a card',
    'the token created this way gains haste until end of turn',
  ],
  parse: gainParser('effect.gain-keyword-the-token', ['noun.the-token'], false),
});

/**
 * `effect.sacrifice-made-unless-pays`: "sacrifice it unless you pay {W}{U}{B}{R}{G}" (CR 118.12a, 701.21a, 603.7c): the instruction of a delayed sentence ("At the beginning of your
 * next end step, ...") about the tokens the instruction before it made: its controller pays the mana cost or sacrifices them. The engine's `unlessPays` of the controller with a
 * `sacrifice` of `moved`; the lowering checks that the instruction before made the tokens, so "it" is never another object. Not read: another object than "it", a payer other than
 * "you", a cost that is not mana, "if", another verb.
 */
export const EFFECT_SACRIFICE_MADE_UNLESS_PAYS = defineRule<Clauses>({
  id: 'effect.sacrifice-made-unless-pays',
  family: 'effect',
  leading: ['sacrifice'],
  cites: [
    'CR 118.12a (Costs)',
    'CR 701.21a (Sacrifice)',
    'CR 603.7c (Delayed Triggered Abilities)',
    'CR 400.7j (General)',
  ],
  examples: [
    'sacrifice it unless you pay {W}{U}{B}{R}{G}',
    'Sacrifice it unless you pay {2}',
    'sacrifice it unless you pay {R}{R}',
  ],
  rejects: [
    'sacrifice it',
    'sacrifice them unless you pay {2}',
    'sacrifice ~ unless you pay {2}',
    'sacrifice it unless that player pays {2}',
    'sacrifice it unless they pay {2}',
    'sacrifice it unless you pay 2 life',
    'sacrifice it unless you pay {X}',
    'sacrifice it unless you pay {W/U}',
    'sacrifice it unless you pay',
    'sacrifice it if you pay {2}',
    'sacrifice it unless you pay {2} and draw a card',
    'sacrifice target creature unless you pay {2}',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/sacrifice it unless you pay /iu),
        family<IrCost>('cost', { only: ['cost.mana'] }),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    // The instruction ends the sentence: another clause after it is not this rule's.
    if (!/^(?:\.|$)/u.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const [, cost] = r.value.value;
    // A mana cost with numbers and colored symbols only (an {X} or a hybrid symbol is another cost).
    if (cost.kind !== 'mana' || cost.symbols.some((symbol) => !/^(\d+|[WUBRGC])$/u.test(symbol))) {
      return fail(ctx, pos);
    }
    const { span } = r.value;
    const id = 'effect.sacrifice-made-unless-pays';
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'sacrificeMadeUnlessPays',
          { cost: { kind: 'costList', costs: [cost], span, rule: id } },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/** Quiet: a line these rules do not read stops where it always did. */
export const THE_TOKEN_EFFECT_RULES = [
  quietly(EFFECT_GAIN_KEYWORD_THE_TOKEN),
  quietly(EFFECT_SACRIFICE_MADE_UNLESS_PAYS),
];
