/**
 * Static rule of the Elven Council deck (issue 98), creature group: "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s
 * toughness." (Arwen, Weaver of Hope). The lowering is the one of `static.others-enter-with-counters` (`lower/angels.ts`).
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { staticOf } from './angels-words';

/**
 * `static.others-enter-with-counters-equal-to`: "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s toughness." (CR 614.1c, 614.12,
 * 122.6: a replacement effect of a permanent on the battlefield for the permanents that enter; the amount is worked out as the permanent enters, from the permanent with the ability, so
 * a permanent that enters together with it does not see it, CR 614.12). The permanents are the same phrases as `static.others-enter-with-counters` reads, of the controller of the
 * permanent with the ability. Not read: "each other creature" of no controller, a counter that is not "additional", a plain number ("a number of" is the word of an amount), an
 * amount other than the toughness of `~` and any word after the period.
 */
export const STATIC_OTHERS_ENTER_WITH_COUNTERS_EQUAL_TO = defineRule<IrStatic>({
  id: 'static.others-enter-with-counters-equal-to',
  family: 'static',
  leading: ['each', 'nontoken', 'token', 'creatures'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 122.6 (Counters)',
    'CR 208.1 (Power/Toughness)',
  ],
  examples: [
    "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s toughness.",
    "Each other Elf you control enters with a number of additional +1/+1 counters on it equal to ~'s toughness.",
  ],
  rejects: [
    "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s power.",
    "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s toughness",
    "Each other creature enters with a number of additional +1/+1 counters on it equal to ~'s toughness.",
    "Each other creature an opponent controls enters with a number of additional +1/+1 counters on it equal to ~'s toughness.",
    "Each other creature you control enters with a number of +1/+1 counters on it equal to ~'s toughness.",
    "Each other creature you control enter with a number of additional +1/+1 counters on it equal to ~'s toughness.",
    "Each other creature you control enters with a number of additional +1/+1 counters on it equal to ~'s toughness and draws a card.",
    'Each other creature you control enters with a number of additional +1/+1 counters on it equal to the number of lands you control.',
    "Each other creature you control enters with a number of additional +1/+1 counters on them equal to ~'s toughness.",
    "Each other creature you control enters with a number of additional +1/+1 counters on it equal to that creature's toughness.",
  ],
  parse: (ctx, pos) => {
    const id = 'static.others-enter-with-counters-equal-to';
    const subject = quiet(
      family<IrNoun>('noun', { only: ['noun.each-permanent', 'noun.plain-permanents'] }),
    )(ctx, pos);
    if (!subject.ok) return subject;
    const noun = subject.value;
    if (noun.filter.controller !== 'you') return fail(ctx, pos);
    const tail = sequence(
      pattern(
        noun.plural
          ? / enter with a number of additional /iu
          : / enters with a number of additional /iu,
      ),
      pattern(/([+-]\d+\/[+-]\d+|[a-z]+) counters(?![\p{L}\p{N}])/iu),
      literal(noun.plural ? ' on them ' : ' on it '),
      family<IrAmount>('amount', { only: ['amount.equal-to'] }),
      literal('.'),
    )(ctx, subject.pos);
    if (!tail.ok) return tail;
    const [, kind, , count] = tail.value;
    // Only a number read from the permanent with the ability ("~'s toughness"): "that creature's" would be the one that enters, which has no toughness to read yet.
    if (count.kind !== 'toughnessOf' || count.of.det !== 'self') {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: staticOf(
        id,
        noun,
        [{ kind: 'othersEnterWithCounters', counter: (kind[1] ?? '').toLowerCase(), count }],
        pos,
        tail.pos,
      ),
      pos: tail.pos,
    };
  },
});

export const ARWEN_STATIC_RULES = [STATIC_OTHERS_ENTER_WITH_COUNTERS_EQUAL_TO].map(quietly);
