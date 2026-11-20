/**
 * Static ability rules of stage P33 (D-149, D-150): a tax on blocking ("Creatures can't block unless their controller pays {1} for each of
 * those creatures.", CR 509.1b, 509.1d), permanents that enter with counters ("Each other Angel you control enters with an additional +1/+1
 * counter on it for each Angel you already control.", CR 614.1c, 614.12) and an alternative cost that taps creatures ("You may pay {W} and tap
 * four untapped creatures you control with flying rather than pay ~'s mana cost.", CR 118.9, 118.3). Each is one whole line (the protections
 * are in `angels.ts`).
 */
import {
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCost, IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { positiveCount, quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { staticOf, subjectNoun } from './angels-words';
import { TAX_COST } from './play-rules';

const PERIOD = literal('.');

/** The block tax's cost: the mana one blocker pays. */
const BLOCK_COST: Parser<IrCost> = (ctx, pos) => {
  const r = TAX_COST(ctx, pos);
  if (!r.ok) return r;
  return {
    ok: true,
    value: {
      kind: 'mana',
      symbols: r.value,
      span: { start: pos, end: r.pos },
      rule: 'static.block-tax',
    },
    pos: r.pos,
  };
};

/**
 * `static.block-tax`: "As long as ~ is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
 * "Creatures can't block unless their controller pays {1} for each of those creatures." (CR 509.1b, 509.1d, 118.12a: a creature that
 * can't block unless a cost is paid; the total cost of the blockers is paid as they are declared, and a player is never required to pay,
 * CR 509.1c). The cost is mana (plain, hybrid or Phyrexian symbols, never X) and the same for each blocker; "as long as ~ is attacking" is
 * the permanent being a creature that was declared as an attacker and is still in combat (the engine's `whileAttacking`). Not read: another
 * condition, a cost that is not mana, {X}, a count, "creatures you control", "attacking creatures" and a tax on attacking (the rule
 * `static.attack-tax`).
 */
export const STATIC_BLOCK_TAX = defineRule<IrStatic>({
  id: 'static.block-tax',
  family: 'static',
  leading: ['as', 'creatures'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 509.1c (Declare Blockers Step)',
    'CR 509.1d (Declare Blockers Step)',
    'CR 118.12a (Costs)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "As long as ~ is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
    "Creatures can't block unless their controller pays {1} for each of those creatures.",
    'As long as ~ is attacking, creatures can’t block unless their controller pays {2} for each of those creatures.',
    "As long as ~ is attacking, creatures can't block unless their controller pays {W}{1} for each of those creatures.",
  ],
  rejects: [
    "As long as ~ is attacking, creatures can't block unless their controller pays {1} for each of those creatures",
    "As long as ~ is untapped, creatures can't block unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless their controller pays {X} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless their controller pays {0} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless their controller pays 2 life for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless their controller pays {1}.",
    "As long as ~ is attacking, creatures can't block unless their controller pays {1} for each creature.",
    "As long as ~ is attacking, creatures you control can't block unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, attacking creatures can't block unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, creatures can't attack unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block you unless their controller pays {1} for each of those creatures.",
    "As long as ~ is attacking, creatures can't block unless you pay {1} for each of those creatures.",
    "Creatures can't block unless their controller pays {1} for each of those creatures. Draw a card.",
  ],
  parse: (ctx, pos) => {
    const lead = optional(literal('as long as ~ is attacking, '), null)(ctx, pos);
    if (!lead.ok) return lead;
    const r = sequence(
      spanned(pattern(/creatures(?![\p{L}\p{N}])/iu)),
      pattern(/ can['’]t block unless their controller pays /iu),
      BLOCK_COST,
      pattern(/ for each of those creatures/iu),
      PERIOD,
    )(ctx, lead.pos);
    if (!r.ok) return r;
    const [creatures, , cost] = r.value;
    const effect: IrStaticEffect = {
      kind: 'blockTax',
      cost,
      ...(lead.value === null ? {} : { whileAttacking: true as const }),
    };
    return {
      ok: true,
      value: staticOf(
        'static.block-tax',
        subjectNoun('each', 'creatures', creatures.span, 'static.block-tax'),
        [effect],
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

/**
 * `static.others-enter-with-counters`: "Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you
 * already control.", "Each other creature you control of the chosen type enters with an additional +1/+1 counter on it.", "Each other
 * creature you control enters with two additional +1/+1 counters on it." (CR 614.1c, 614.12, 122.6: a replacement effect of a permanent
 * on the battlefield for the permanents that enter; the counters are in addition to those they enter with otherwise). The permanents are
 * any phrase of "each other <permanent you control>" (a type of the table of CR 205.3m, a card type, "of the chosen type"), and the count a
 * number or "for each ..." counted for the controller without the permanent that enters. A matching permanent's own replacement applies
 * to itself too (CR 614.12), unless the subject says "other". Not read: "each other creature" with no controller, "enters tapped", a counter that is not "additional" and a
 * condition.
 */
export const STATIC_OTHERS_ENTER_WITH_COUNTERS = defineRule<IrStatic>({
  id: 'static.others-enter-with-counters',
  family: 'static',
  leading: ['each', 'nontoken', 'token', 'creatures'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 122.6 (Counters)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'Nontoken creatures you control enter with an additional +1/+1 counter on them for each creature that died under your control this turn.',
    'Each other Angel you control enters with an additional +1/+1 counter on it for each Angel you already control.',
    'Each other creature you control of the chosen type enters with an additional +1/+1 counter on it.',
    'Each other creature you control enters with an additional +1/+1 counter on it.',
    'Each other creature you control enters with two additional +1/+1 counters on it.',
    'Each other Zombie you control enters with an additional -1/-1 counter on it for each creature you control.',
    'Each other nontoken creature you control enters with an additional +1/+1 counter on it.',
    // Stage P34 (D-152): no "other", for a permanent that is not one of the kind itself.
    'Each Dragon you control enters with an additional +1/+1 counter on it.',
    'Each creature you control enters with two additional +1/+1 counters on it.',
    // Stage P39 (D-184, CR 601.2h): the mana spent to cast the permanent that enters.
    'Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it.',
    'Each creature you control enters with an additional +1/+1 counter on it for each mana spent to cast it.',
  ],
  rejects: [
    'Each other Angel you control enters with an additional +1/+1 counter on it',
    'Each creature enters with an additional +1/+1 counter on it.',
    'Each other creature enters with an additional +1/+1 counter on it.',
    'Each other creature you control enters with a +1/+1 counter on it.',
    'Each other creature you control enters with an additional +1/+1 counter.',
    'Each other creature you control enters tapped with an additional +1/+1 counter on it.',
    'Each other creature you control enters with an additional +1/+1 counter on it and draws a card.',
    'Each other creature you control enter with an additional +1/+1 counter on it.',
    'Each other creatures you control enters with an additional +1/+1 counter on it.',
    'Each other creature an opponent controls enters with an additional +1/+1 counter on it.',
    'Each other creature you control enters with X additional +1/+1 counters on it.',
    'Each other creature you control enters with two additional +1/+1 counter on it.',
    'Each other creature you control enters with an additional +1/+1 counters on it.',
    'Each other creature you control enters with an additional +1/+1 counter on it for each creature.',
    'Each other creature you control enters with an additional +1/+1 counter on it for each creature you control and each land.',
    'Each creature you control enters with two additional +1/+1 counters on it for each mana spent to cast it.',
    'Each creature you control enters with an additional +1/+1 counter on it for each mana spent to cast ~.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.others-enter-with-counters';
    const subject = quiet(
      family<IrNoun>('noun', { only: ['noun.each-permanent', 'noun.plain-permanents'] }),
    )(ctx, pos);
    if (!subject.ok) return subject;
    const noun = subject.value;
    // "Each other" leaves the source out; a plain plural includes it. The permanents are the controller's own.
    if (noun.filter.controller !== 'you') return fail(ctx, pos);
    const tail = sequence(
      pattern(noun.plural ? / enter with /iu : / enters with /iu),
      satisfy(positiveCount, () => true),
      pattern(/ additional /iu),
      pattern(/([+-]\d+\/[+-]\d+|[a-z]+) counters?(?![\p{L}\p{N}])/iu),
      literal(noun.plural ? ' on them' : ' on it'),
    )(ctx, subject.pos);
    if (!tail.ok) return tail;
    const [, number, , kind] = tail.value;
    const countWord = ctx.text.slice(subject.pos + ' enters with '.length, tail.pos);
    const plural = /counters\b/i.test(kind[0]);
    // "an additional +1/+1 counter" is one, "two additional +1/+1 counters" two or more: the noun agrees in number.
    if (plural !== number > 1 || /^x\b/i.test(countWord)) return fail(ctx, pos);
    const each = optional(
      quiet(
        map(
          sequence(
            literal(' '),
            family<IrAmount>('amount', {
              only: ['amount.for-each', 'amount.for-each-mana-spent', 'amount.for-each-died'],
            }),
          ),
          ([, amount]) => amount,
        ),
      ),
      null,
    )(ctx, tail.pos);
    if (!each.ok) return each;
    // One counter for each thing counted ("two counters for each" is another statement), as in `replacement.enters-with-counters`.
    if (each.value !== null && number !== 1) return fail(ctx, pos);
    // Stage P39 (D-184): "it" is the permanent that enters; "~" would be the permanent with this ability, which is not the one that was cast.
    if (each.value?.kind === 'manaSpent' && each.value.who === 'self') return fail(ctx, pos);
    const end = PERIOD(ctx, each.pos);
    if (!end.ok) return end;
    const count: IrAmount = each.value ?? {
      kind: 'number',
      value: number,
      span: { start: subject.pos, end: tail.pos },
    };
    return {
      ok: true,
      value: staticOf(
        id,
        noun,
        [{ kind: 'othersEnterWithCounters', counter: (kind[1] ?? '').toLowerCase(), count }],
        pos,
        end.pos,
      ),
      pos: end.pos,
    };
  },
});

/**
 * `static.tap-alt-cost`: "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost." (CR
 * 118.9: an alternative cost, chosen as the spell is cast; CR 118.3: tapping permanents is a cost; CR 302.6: a creature that came under
 * control this turn can be tapped for a cost that is not its own {T}). The spell's own statement (`this spell` is `~`): mana, and
 * a number of untapped permanents of the caster's that a phrase of the permanent family describes. Not read: a cost with no mana, more
 * than one cost of another kind, "tap an untapped creature" (a count of one is "tap a creature"), a condition and any other alternative.
 */
export const STATIC_TAP_ALT_COST = defineRule<IrStatic>({
  id: 'static.tap-alt-cost',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 118.9 (Costs)',
    'CR 118.3 (Costs)',
    'CR 302.6 (Summoning Sickness)',
    'CR 601.2b (Casting Spells)',
  ],
  examples: [
    "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost.",
    "You may pay {1}{W} and tap three untapped creatures you control rather than pay ~'s mana cost.",
    "You may pay {G} and tap two untapped Elves you control rather than pay ~'s mana cost.",
  ],
  rejects: [
    "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost",
    "You may pay {W} rather than pay ~'s mana cost.",
    "You may tap four untapped creatures you control with flying rather than pay ~'s mana cost.",
    "You may pay {W} and tap four untapped creatures with flying rather than pay ~'s mana cost.",
    "You may pay {X} and tap four untapped creatures you control rather than pay ~'s mana cost.",
    "You may pay {W} and tap an untapped creature you control rather than pay ~'s mana cost.",
    'You may pay {W} and tap four untapped creatures you control with flying rather than pay its mana cost.',
    "You may pay {W} and tap four untapped creatures you control with flying instead of paying ~'s mana cost.",
    "You may pay {W} and tap four untapped creatures an opponent controls rather than pay ~'s mana cost.",
    "You may pay {W} and tap four untapped creatures you control with flying rather than pay ~'s mana cost and draw a card.",
    "If you control a commander, you may pay {W} and tap four untapped creatures you control rather than pay ~'s mana cost.",
    "You may pay {W} and sacrifice a creature rather than pay ~'s mana cost.",
  ],
  parse: (ctx, pos) => {
    const id = 'static.tap-alt-cost';
    const r = sequence(
      literal('you may pay '),
      family<IrCost>('cost', { only: ['cost.mana'] }),
      literal(' and '),
      family<IrCost>('cost', { only: ['cost.tap-permanents'] }),
      pattern(/ rather than pay ~['’]s mana cost/iu),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, mana, , tap] = r.value;
    if (tap.kind !== 'tapPermanents' || mana.kind !== 'mana' || mana.symbols.includes('X')) {
      return fail(ctx, pos);
    }
    // More than one permanent ("tap four"): one is "tap a creature", which the cost rule reads with "another" or an article.
    if (tap.count < 2) return fail(ctx, pos);
    // The spell itself: its `~` is in the last words ("rather than pay ~'s mana cost").
    const selfAt = ctx.text.indexOf('~', pos);
    const self = subjectNoun('self', '~', { start: selfAt, end: selfAt + 1 }, id);
    const effect: IrStaticEffect = {
      kind: 'tapAlternative',
      cost: mana,
      what: tap.what,
      count: tap.count,
    };
    return { ok: true, value: staticOf(id, self, [effect], pos, r.pos), pos: r.pos };
  },
});

/**
 * `static.graveyard-sacrifice-alt-cost`: "You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creatures rather than paying its mana cost." (issue 159, Scourge of
 * Nel Toth; CR 118.9: an alternative cost, chosen as the spell is cast; CR 601.2h, 701.21a: sacrificing permanents is a cost, and only the caster's own can be sacrificed). The spell's
 * own statement: mana, and two or more permanents of the caster's that a phrase of the permanent family names. Not read: a count of one, a cost with no mana, another zone, a
 * different ending ("instead of paying"), a permanent that is not the caster's.
 */
export const STATIC_GRAVEYARD_SACRIFICE_ALT_COST = defineRule<IrStatic>({
  id: 'static.graveyard-sacrifice-alt-cost',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 118.9 (Costs)',
    'CR 601.2h (Casting Spells)',
    'CR 701.21a (Sacrifice)',
    'CR 601.2b (Casting Spells)',
  ],
  examples: [
    'You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creatures rather than paying its mana cost.',
    'You may cast ~ from your graveyard by paying {1}{R} and sacrificing three artifacts rather than paying its mana cost.',
  ],
  rejects: [
    'You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creatures rather than paying its mana cost',
    'You may cast ~ from your graveyard by paying {B}{B} and sacrificing a creature rather than paying its mana cost.',
    'You may cast ~ from your graveyard by paying {X} and sacrificing two creatures rather than paying its mana cost.',
    'You may cast ~ from your graveyard by sacrificing two creatures rather than paying its mana cost.',
    'You may cast ~ from your hand by paying {B}{B} and sacrificing two creatures rather than paying its mana cost.',
    'You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creatures instead of paying its mana cost.',
    'You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creatures an opponent controls rather than paying its mana cost.',
    'You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creatures rather than paying its mana cost and draw a card.',
    'You may cast ~ from your graveyard by paying {B}{B} and sacrificing two creature rather than paying its mana cost.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.graveyard-sacrifice-alt-cost';
    const r = sequence(
      literal('you may cast ~ from your graveyard by paying '),
      family<IrCost>('cost', { only: ['cost.mana'] }),
      literal(' and sacrificing '),
      spanned(satisfy(quantity, (n) => n >= 2)),
      literal(' '),
      satisfy(
        map(permanentPhrase(true, 'all'), withoutZone),
        (filter) => filter.controller === undefined || filter.controller === 'you',
      ),
      literal(' rather than paying its mana cost'),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, mana, , count, , filter] = r.value;
    if (mana.kind !== 'mana' || mana.symbols.includes('X') || filter.anyOf !== undefined) {
      return fail(ctx, pos);
    }
    const selfAt = ctx.text.indexOf('~', pos);
    const self = subjectNoun('self', '~', { start: selfAt, end: selfAt + 1 }, id);
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: true,
      other: false,
      count: { kind: 'number', value: count.value, span: count.span },
      span: { start: count.span.end + 1, end: r.pos },
      rule: id,
    };
    const effect: IrStaticEffect = {
      kind: 'graveyardSacrificeAlternative',
      cost: mana,
      what,
      count: count.value,
    };
    return { ok: true, value: staticOf(id, self, [effect], pos, r.pos), pos: r.pos };
  },
});

/**
 * `static.sacrifice-alt-cost`: "You may sacrifice a nontoken black creature rather than pay ~'s mana cost." (Flare of Malice; CR 118.9: an alternative cost, chosen as the spell is cast;
 * CR 601.2h, 701.21a: sacrificing a permanent is a cost, and only the caster's own can be sacrificed). One permanent a phrase of the permanent family names, no mana. Not read: a number, a
 * cost with mana, "instead of paying", another end, a permanent that is not the caster's, a choice of kinds.
 */
export const STATIC_SACRIFICE_ALT_COST = defineRule<IrStatic>({
  id: 'static.sacrifice-alt-cost',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 118.9 (Costs)',
    'CR 601.2h (Casting Spells)',
    'CR 701.21a (Sacrifice)',
    'CR 601.2b (Casting Spells)',
  ],
  examples: [
    "You may sacrifice a nontoken black creature rather than pay ~'s mana cost.",
    "You may sacrifice a creature rather than pay ~'s mana cost.",
    "You may sacrifice an artifact rather than pay ~'s mana cost.",
  ],
  rejects: [
    "You may sacrifice a nontoken black creature rather than pay ~'s mana cost",
    "You may sacrifice two creatures rather than pay ~'s mana cost.",
    "You may sacrifice a nontoken black creature instead of paying ~'s mana cost.",
    "You may sacrifice a creature an opponent controls rather than pay ~'s mana cost.",
    "You may sacrifice a creature or an artifact rather than pay ~'s mana cost.",
    "You may sacrifice a creature rather than pay ~'s mana cost and draw a card.",
    "You may pay {B} and sacrifice a creature rather than pay ~'s mana cost.",
  ],
  parse: (ctx, pos) => {
    const id = 'static.sacrifice-alt-cost';
    const r = sequence(
      literal('you may sacrifice '),
      pattern(/an? /iu),
      satisfy(
        map(permanentPhrase(false, 'all'), withoutZone),
        (filter) => filter.controller === undefined || filter.controller === 'you',
      ),
      literal(" rather than pay ~'s mana cost"),
      PERIOD,
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , filter] = r.value;
    if (filter.anyOf !== undefined) return fail(ctx, pos);
    const selfAt = ctx.text.indexOf('~', pos);
    const self = subjectNoun('self', '~', { start: selfAt, end: selfAt + 1 }, id);
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos + 'you may sacrifice '.length, end: r.pos },
      rule: id,
    };
    const effect: IrStaticEffect = { kind: 'sacrificeAlternative', what, count: 1 };
    return { ok: true, value: staticOf(id, self, [effect], pos, r.pos), pos: r.pos };
  },
});

export const ANGEL_PLAY_RULES = [
  STATIC_BLOCK_TAX,
  STATIC_OTHERS_ENTER_WITH_COUNTERS,
  STATIC_TAP_ALT_COST,
  STATIC_GRAVEYARD_SACRIFICE_ALT_COST,
  STATIC_SACRIFICE_ALT_COST,
].map(quietly);
