/**
 * Cost rules: one cost of an activated ability (CR 118, 602.1) or of a keyword (Cycling, Ward). {T},
 * plain mana, an {X} cost (stage P16), "Sacrifice ~ / a creature", "Discard a card", "Pay N life",
 * "Pay X life" and "Remove a counter from ~" are read; every other cost (exile, tap an untapped
 * creature, ...) is a new rule here plus the engine feature it needs.
 */
import { choice, fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCost, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, family, node, spanned } from '../registry';
import { DANITHA_G5_COST_RULES } from './danitha-group-5';
import { GISA_G4_COST_RULES } from './gisa-g4';
import { HASHATON_G2_COST_RULES } from './hashaton-group-2';
import { HASHATON_G9_COST_RULES } from './hashaton-group-9';
import { HASHATON_G10_COST_RULES } from './hashaton-group-10';
import { HOFRI_COST_RULES } from './hofri';

/** `cost.tap`: "{T}" (CR 107.5 the tap symbol, 602.5a: tapping as a cost). */
export const COST_TAP = defineRule<IrCost>({
  id: 'cost.tap',
  family: 'cost',
  leading: ['{t}'],
  cites: ['CR 107.5 (Numbers and Symbols)', 'CR 602.5a (Activating Activated Abilities)'],
  examples: ['{T}', '{t}'],
  rejects: ['{Q}', 'tap', '{T}{T}', '{1}'],
  parse: node<string, IrCost>(
    'cost.tap',
    map(literal('{T}'), (raw) => raw),
    () => ({ kind: 'tap' }),
  ),
});

/** The symbols of a plain mana cost: a generic number or a single color, as `{1}{G}`. */
const PLAIN_SYMBOLS = map(pattern(/(?:\{(?:0|[1-9][0-9]*|[WUBRGC])\})+/i), (m): string[] =>
  [...m[0].matchAll(/\{([^}]+)\}/g)].map((s) => (s[1] ?? '').toUpperCase()),
);

/**
 * `cost.mana`: "{1}", "{G}", "{2}{B}" (CR 107.4 mana symbols, 118.1 costs, 602.1 the cost of an
 * activated ability is what precedes the colon). Only generic and single-color symbols are read
 * here: a hybrid symbol is `cost.mana-hybrid`, and X, Phyrexian and snow symbols have no cost the
 * engine can pay on a mana ability, so the text stays unparsed rather than being half read.
 */
export const COST_MANA = defineRule<IrCost>({
  id: 'cost.mana',
  family: 'cost',
  leading: [],
  cites: [
    'CR 107.4 (Numbers and Symbols)',
    'CR 118.1 (Costs)',
    'CR 602.1 (Activating Activated Abilities)',
  ],
  examples: ['{1}', '{G}', '{2}{B}', '{C}'],
  rejects: ['{T}', '{X}', '{R/W}', '{2/W}', '{G/P}', '{S}', '1', '{1} {G}'],
  parse: node<string[], IrCost>('cost.mana', PLAIN_SYMBOLS, (symbols) => ({
    kind: 'mana',
    symbols,
  })),
});

/**
 * One symbol of a cost that has a hybrid symbol: a plain one, or a hybrid pair of two different
 * colors ({R/W}), a color or {C} (colorless) with a color ({C/W}) or a color paid with {2} ({2/W}),
 * as CR 107.4e writes them. Phyrexian ({G/P}), X and snow symbols are not read.
 */
const HYBRID_SYMBOL = /\{(?:[WUBRG]\/[WUBRG]|C\/[WUBRG]|2\/[WUBRG])\}/i;
const HYBRID_COST = new RegExp(
  `(?:\\{(?:0|[1-9][0-9]*|[WUBRGC])\\}|${HYBRID_SYMBOL.source})+`,
  'i',
);

/**
 * `cost.mana-hybrid`: "{R/W}", "{2/G}", "{1}{R/W}" (CR 107.4e: a hybrid symbol is paid with either
 * of its halves; `{2/W}` with one {W} or two mana of any type). At least one hybrid symbol, which is
 * what tells it from `cost.mana`; it lowers in the cost of a mana ability (stage P14, the filter
 * lands) and of an ordinary activated ability (stage P15: "{R/W}: ~ gains first strike until end of
 * turn."), which the engine's planner pays; a keyword's cost (Cycling, Equip) is dropped whole by
 * `lowerCost`.
 */
export const COST_MANA_HYBRID = defineRule<IrCost>({
  id: 'cost.mana-hybrid',
  family: 'cost',
  leading: [],
  cites: [
    'CR 107.4e (Numbers and Symbols)',
    'CR 118.1 (Costs)',
    'CR 602.1 (Activating Activated Abilities)',
  ],
  examples: ['{R/W}', '{C/W}', '{2/G}', '{1}{R/W}', '{r/w}'],
  rejects: [
    '{R/R}',
    '{G}',
    '{1}{G}',
    '{T}',
    '{G/P}',
    '{X}',
    '{S}',
    '{R/W}{T}',
    '{W/U/B}',
    '{R/W}{G/P}',
  ],
  parse: node<string[], IrCost>(
    'cost.mana-hybrid',
    satisfy(
      map(pattern(HYBRID_COST), (m): string[] =>
        [...m[0].matchAll(/\{([^}]+)\}/g)].map((x) => (x[1] ?? '').toUpperCase()),
      ),
      // `{R/R}` says nothing a plain symbol does not, and no Oracle text writes it.
      (symbols) =>
        symbols.some((x) => x.includes('/')) &&
        symbols.every((x) => !x.includes('/') || x.charAt(0) !== x.charAt(2)),
    ),
    (symbols) => ({ kind: 'mana', symbols }),
  ),
});

/**
 * The symbols of a cost with an {X}: {X} (once or more), generic numbers and single colors, as
 * `{X}{R}{G}`. At least one {X}, which is what tells it from `cost.mana`.
 */
const X_COST = /(?:\{(?:X|0|[1-9][0-9]*|[WUBRGC])\})+/i;

/**
 * `cost.mana-x`: "{X}", "{X}{X}", "{X}{R}{G}" (CR 107.3: X is announced as the ability is activated,
 * CR 602.2b; two {X} are twice X, CR 107.3a). It lowers only in the cost of an ordinary activated
 * ability (stage P16); a keyword's cost (Cycling, Equip, Ward, Kicker, Flashback) and a mana
 * ability's cost have no X the engine runs, so `lowerCost` drops those whole.
 */
export const COST_MANA_X = defineRule<IrCost>({
  id: 'cost.mana-x',
  family: 'cost',
  leading: [],
  cites: [
    'CR 107.3 (Numbers and Symbols)',
    'CR 107.3a (Numbers and Symbols)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: ['{X}', '{X}{X}', '{X}{R}{G}', '{1}{X}', '{x}'],
  rejects: ['{1}', '{R}', '{T}', '{X/R}', '{X}{R/W}', '{X}{G/P}', '{X}{S}', 'X', '{X} {R}'],
  parse: node<string[], IrCost>(
    'cost.mana-x',
    satisfy(
      map(pattern(X_COST), (m): string[] =>
        [...m[0].matchAll(/\{([^}]+)\}/g)].map((x) => (x[1] ?? '').toUpperCase()),
      ),
      (symbols) => symbols.includes('X'),
    ),
    (symbols) => ({ kind: 'mana', symbols }),
  ),
});

/** A cost of nothing is not a cost: "Pay 0 life" is not read. */
const atLeastOne = (amount: IrAmount) => amount.kind === 'number' && amount.value >= 1;

/**
 * `cost.sacrifice`: "Sacrifice ~", "Sacrifice a creature", "Sacrifice another permanent", "Sacrifice
 * two lands" (CR 701.21, 118.1). Only your own permanents can be sacrificed (CR 701.21a), so the
 * object is "~" or a noun you choose among (`noun.a-permanent`), never a target or an opponent's.
 */
export const COST_SACRIFICE = defineRule<IrCost>({
  id: 'cost.sacrifice',
  family: 'cost',
  leading: ['sacrifice'],
  cites: ['CR 701.21 (Sacrifice)', 'CR 701.21a (Sacrifice)', 'CR 118.1 (Costs)'],
  examples: [
    'Sacrifice ~',
    'Sacrifice a creature',
    'Sacrifice another permanent',
    'Sacrifice an artifact',
    'Sacrifice a Treasure',
  ],
  rejects: [
    'Sacrifice',
    'Sacrifice target creature',
    'Sacrifice it',
    'Sacrifice all creatures',
    'Sacrifice a creature an opponent controls',
  ],
  parse: node<IrNoun, IrCost>(
    'cost.sacrifice',
    map(
      sequence(
        literal('sacrifice '),
        family<IrNoun>('noun', { only: ['noun.self', 'noun.a-permanent'] }),
      ),
      ([, what]) => what,
    ),
    (what) => ({ kind: 'sacrifice', what }),
  ),
});

/**
 * `cost.discard`: "Discard a card", "Discard two cards" (CR 701.9: the player chooses the cards, CR
 * 118.3: a cost that can't be paid isn't). A count of cards of the hand and nothing else: "Discard
 * this card" is the cost of an ability that works from the hand (not built), "Discard a creature
 * card" and "Discard your hand" name a quality or a quantity the engine's cost has no field for,
 * and "at random" is a different discard.
 */
export const COST_DISCARD = defineRule<IrCost>({
  id: 'cost.discard',
  family: 'cost',
  leading: ['discard'],
  cites: ['CR 701.9 (Discard)', 'CR 118.3 (Costs)', 'CR 118.1 (Costs)'],
  examples: ['Discard a card', 'Discard two cards', 'discard a card', 'Discard 2 cards'],
  rejects: [
    'Discard',
    'Discard this card',
    'Discard ~',
    'Discard a creature card',
    'Discard your hand',
    'Discard a card at random',
    'Discard X cards',
    'Discard cards',
    'Discard a',
    'Discard 0 cards',
    'Discards a card',
    'Discard a land',
  ],
  parse: node<IrAmount, IrCost>(
    'cost.discard',
    map(
      sequence(
        literal('discard '),
        satisfy(
          family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
          atLeastOne,
        ),
        pattern(/ cards?(?![\p{L}\p{N}])/iu),
      ),
      ([, amount]) => amount,
    ),
    (amount) => ({ kind: 'discard', amount }),
  ),
});

/**
 * `cost.pay-life`: "Pay 2 life" (CR 119.4: a payment of life greater than 0 needs a life total at
 * least that high, CR 118.3). A whole number of at least one, written as a digit or a number word.
 */
export const COST_PAY_LIFE = defineRule<IrCost>({
  id: 'cost.pay-life',
  family: 'cost',
  leading: ['pay'],
  cites: ['CR 119.4 (Life)', 'CR 118.3 (Costs)'],
  examples: ['Pay 1 life', 'Pay 2 life', 'Pay three life'],
  rejects: ['Pay 0 life', 'Pay X life', 'Pay life', 'Pay {1}', 'Pay half your life, rounded up'],
  parse: node<IrAmount, IrCost>(
    'cost.pay-life',
    map(
      sequence(
        literal('pay '),
        satisfy(family<IrAmount>('amount', { only: ['amount.number'] }), atLeastOne),
        literal(' life'),
      ),
      ([, amount]) => amount,
    ),
    (amount) => ({ kind: 'payLife', amount }),
  ),
});

/**
 * `cost.pay-life-amount`: "Pay life equal to the number of colors in your commanders' color identity" (stage P30, D-135, CR 119.4: a
 * payment of life needs a life total at least that high; CR 118.3; CR 903.4 the colors of a commander's identity): the amount is read
 * as the ability is activated (CR 601.2f: the total cost is worked out then), and is zero with no commander. A count or any value
 * phrase of "equal to ..." (`amount.number-of`, `amount.equal-to`). Its own rule, not a form of `cost.pay-life`, so the keyword costs
 * that name "pay N life" (Cycling, Equip, Ward) do not read it; it lowers in the cost of an ordinary activated ability only.
 */
export const COST_PAY_LIFE_AMOUNT = defineRule<IrCost>({
  id: 'cost.pay-life-amount',
  family: 'cost',
  leading: ['pay'],
  cites: [
    'CR 119.4 (Life)',
    'CR 118.3 (Costs)',
    'CR 601.2f (Casting Spells)',
    'CR 903.4 (Commander)',
  ],
  examples: [
    'Pay life equal to the number of colors in your commanders’ color identity',
    "Pay life equal to the number of colors in your commanders' color identity",
    'Pay life equal to the number of creatures you control',
    'pay life equal to your devotion to black',
  ],
  rejects: [
    'Pay life',
    'Pay 2 life',
    'Pay X life',
    'Pay life equal to',
    'Pay life equal to its power',
    'Pay life equal to the number of creatures',
    'Pay half your life, rounded up',
    'Pay life equal to the number of creatures you control.',
  ],
  parse: node<IrAmount, IrCost>(
    'cost.pay-life-amount',
    map(
      sequence(
        literal('pay life '),
        family<IrAmount>('amount', { only: ['amount.number-of', 'amount.equal-to'] }),
      ),
      ([, amount]) => amount,
    ),
    (amount) => ({ kind: 'payLife', amount }),
  ),
});

/**
 * `cost.pay-x-life`: "Pay X life" (CR 107.3a: X is announced as the ability is activated or the
 * spell cast; CR 119.4: a payment of life needs a life total at least that high). Its own rule, not
 * a form of `cost.pay-life`, so the keyword costs that name "pay N life" (Cycling, Equip, Ward) do
 * not read it; it lowers as the engine's `payXLife` in an activated ability and as an additional
 * cost to cast a spell.
 */
export const COST_PAY_X_LIFE = defineRule<IrCost>({
  id: 'cost.pay-x-life',
  family: 'cost',
  leading: ['pay'],
  cites: ['CR 107.3a (Numbers and Symbols)', 'CR 119.4 (Life)', 'CR 118.3 (Costs)'],
  examples: ['Pay X life', 'pay X life'],
  rejects: [
    'Pay 1 life',
    'Pay X',
    'Pay life',
    'Pay {X}',
    'Pay Y life',
    'Pay X lives',
    'Pay half X life',
  ],
  parse: node<string, IrCost>(
    'cost.pay-x-life',
    map(pattern(/pay X life(?![\p{L}\p{N}])/iu), (m) => m[0]),
    () => ({ kind: 'payXLife' }),
  ),
});

/**
 * `cost.remove-counters`: "Remove a +1/+1 counter from ~", "Remove two charge counters from ~"
 * (CR 118.1, 122.1). Only the ability's own permanent: the engine cost has no other object.
 */
export const COST_REMOVE_COUNTERS = defineRule<IrCost>({
  id: 'cost.remove-counters',
  family: 'cost',
  leading: ['remove'],
  cites: ['CR 122.1 (Counters)', 'CR 118.1 (Costs)'],
  examples: [
    'Remove a +1/+1 counter from ~',
    'Remove a charge counter from ~',
    'Remove two +1/+1 counters from ~',
  ],
  rejects: [
    'Remove a counter from ~',
    'Remove a +1/+1 counter from target creature',
    'Remove X +1/+1 counters from ~',
    'Remove all +1/+1 counters from ~',
    'Remove a +1/+1 counter from a creature you control',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        sequence(
          literal('remove '),
          satisfy(
            family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
            atLeastOne,
          ),
          literal(' '),
          pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
          pattern(/ counters? from ~/i),
        ),
      ),
      ({ value, span }): IrCost => ({
        kind: 'removeCounters',
        counter: value[3][0].toLowerCase(),
        amount: value[1],
        span,
        rule: 'cost.remove-counters',
      }),
    )(ctx, pos),
});

/**
 * `cost.tap-permanents`: "Tap three untapped Zombies you control", "Tap two untapped artifacts you control", "Tap
 * another untapped creature you control", "Tap an untapped creature you control" (stage P29, D-133, CR 118.3, 602.2,
 * 302.6: tapping permanents is a cost, and only a creature's own {T} ability is held back by summoning sickness). The
 * permanents are the player's own, so the phrase says "you control"; what kind they are is any phrase of the permanent
 * family (a type of the table of CR 205.3m, a card type, a color). "Untapped" is the cost's own word (the permanents
 * tapped are untapped ones) and is not part of the filter.
 */
export const COST_TAP_PERMANENTS = defineRule<IrCost>({
  id: 'cost.tap-permanents',
  family: 'cost',
  leading: ['tap'],
  cites: [
    'CR 118.3 (Costs)',
    'CR 602.2 (Activating Activated Abilities)',
    'CR 302.6 (Summoning Sickness)',
  ],
  examples: [
    'Tap three untapped Zombies you control',
    'Tap two untapped artifacts you control',
    'Tap another untapped creature you control',
    'Tap an untapped creature you control',
    'Tap two untapped Elves you control',
    'Tap two untapped Time Lords you control',
    'Tap two untapped Mice you control',
    'Tap two untapped nontoken creatures you control',
  ],
  rejects: [
    'Tap',
    'Tap three Zombies you control',
    'Tap three untapped Zombies',
    'Tap three untapped Zombies an opponent controls',
    'Tap one untapped creature you control',
    'Tap three untapped Zombie you control',
    'Tap an untapped Zombies you control',
    'Tap target creature',
    'Tap two untapped creatures you control with total power 4 or greater',
    'Tap ~',
    'Tap another creature you control',
    'Tap X untapped creatures you control',
    'Tap two untapped creatures you control and',
  ],
  parse: (ctx, pos) => {
    const lead = literal('tap ')(ctx, pos);
    if (!lead.ok) return lead;
    const howMany = choice(
      map(spanned(satisfy(quantity, (n) => n >= 2)), ({ value, span }) => ({
        count: value,
        other: false,
        plural: true,
        span,
      })),
      map(spanned(literal('another ')), ({ span }) => ({
        count: 1,
        other: true,
        plural: false,
        span,
      })),
      map(spanned(pattern(/an? /i)), ({ span }) => ({
        count: 1,
        other: false,
        plural: false,
        span,
      })),
    )(ctx, lead.pos);
    if (!howMany.ok) return howMany;
    const { count, other, plural, span } = howMany.value;
    // "two untapped": the space is before the word; "another " and "an " end in it.
    const word = pattern(/ ?untapped /iu)(ctx, howMany.pos);
    if (!word.ok) return word;
    const phrase = satisfy(
      map(permanentPhrase(plural, 'all'), withoutZone),
      (filter) => filter.controller === 'you',
    )(ctx, word.pos);
    if (!phrase.ok) return phrase;
    if (phrase.value.anyOf !== undefined) return fail(ctx, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: phrase.value,
      upTo: false,
      plural,
      other,
      ...(plural ? { count: { kind: 'number' as const, value: count, span } } : {}),
      span: { start: word.pos, end: phrase.pos },
      rule: 'cost.tap-permanents',
    };
    return {
      ok: true,
      value: {
        kind: 'tapPermanents',
        what: noun,
        count,
        span: { start: pos, end: phrase.pos },
        rule: 'cost.tap-permanents',
      },
      pos: phrase.pos,
    };
  },
});

/**
 * `cost.put-counters`: "Put a page counter on ~", "Put two +1/+1 counters on ~" (stage P31, D-140, CR 118.3, 122.1): counters put on the
 * permanent the ability belongs to as part of the cost. Only the ability's own permanent: the engine cost has no other object.
 */
export const COST_PUT_COUNTERS = defineRule<IrCost>({
  id: 'cost.put-counters',
  family: 'cost',
  leading: ['put'],
  cites: ['CR 118.3 (Costs)', 'CR 122.1 (Counters)'],
  examples: ['Put a page counter on ~', 'Put a +1/+1 counter on ~', 'Put two charge counters on ~'],
  rejects: [
    'Put a page counter on target creature',
    'Put X charge counters on ~',
    'Put a counter on ~',
    'Put a page counter on each artifact you control',
    "Put ~ on top of its owner's library",
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        sequence(
          literal('put '),
          satisfy(
            family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
            atLeastOne,
          ),
          literal(' '),
          pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
          pattern(/ counters? on ~(?![\p{L}\p{N}])/iu),
        ),
      ),
      ({ value, span }): IrCost => ({
        kind: 'putCounters',
        counter: value[3][0].toLowerCase(),
        count: value[1].kind === 'number' ? value[1].value : 0,
        span,
        rule: 'cost.put-counters',
      }),
    )(ctx, pos),
});

/**
 * `cost.return-to-hand`: "Return an artifact you control to its owner's hand", "Return ~ to its owner's hand", "Return two lands you
 * control to their owner's hand" (stage P31, D-140, CR 118.3: returning permanents is a cost; CR 108.3: the owner's hand). The
 * permanents are the player's own (they control them), chosen as the cost is paid; "~" is the permanent the ability belongs to.
 */
export const COST_RETURN_TO_HAND = defineRule<IrCost>({
  id: 'cost.return-to-hand',
  family: 'cost',
  leading: ['return'],
  cites: ['CR 118.3 (Costs)', 'CR 108.3 (Cards)'],
  examples: [
    "Return an artifact you control to its owner's hand",
    "Return a land you control to its owner's hand",
    "Return ~ to its owner's hand",
    "Return two Islands you control to their owner's hand",
    'Return an untapped creature you control to its owner’s hand',
  ],
  rejects: [
    "Return target artifact to its owner's hand",
    "Return an artifact to its owner's hand",
    "Return an artifact an opponent controls to its owner's hand",
    'Return an artifact you control to your hand',
    "Return two artifacts you control to its owner's hand",
    "Return an artifact you control to their owner's hand",
    'Return an artifact you control',
  ],
  parse: (ctx, pos) => {
    const lead = literal('return ')(ctx, pos);
    if (!lead.ok) return lead;
    const self = map(literal('~'), () => null)(ctx, lead.pos);
    let what: IrNoun;
    let count = 1;
    let at: number;
    if (self.ok) {
      what = {
        kind: 'noun',
        det: 'self',
        filter: { raw: '~' },
        upTo: false,
        plural: false,
        other: false,
        span: { start: lead.pos, end: self.pos },
        rule: 'cost.return-to-hand',
      };
      at = self.pos;
    } else {
      const howMany = choice(
        map(spanned(satisfy(quantity, (n) => n >= 2)), ({ value, span }) => ({
          count: value,
          plural: true,
          span,
        })),
        map(spanned(pattern(/an? /i)), ({ span }) => ({ count: 1, plural: false, span })),
      )(ctx, lead.pos);
      if (!howMany.ok) return howMany;
      const space = howMany.value.plural
        ? literal(' ')(ctx, howMany.pos)
        : { ok: true as const, value: '', pos: howMany.pos };
      if (!space.ok) return space;
      const phrase = satisfy(
        map(permanentPhrase(howMany.value.plural, 'all'), withoutZone),
        (filter) => filter.controller === 'you' && filter.anyOf === undefined,
      )(ctx, space.pos);
      if (!phrase.ok) return phrase;
      count = howMany.value.count;
      what = {
        kind: 'noun',
        det: 'a',
        filter: phrase.value,
        upTo: false,
        plural: howMany.value.plural,
        other: false,
        ...(howMany.value.plural
          ? { count: { kind: 'number' as const, value: count, span: howMany.value.span } }
          : {}),
        span: { start: space.pos, end: phrase.pos },
        rule: 'cost.return-to-hand',
      };
      at = phrase.pos;
    }
    // "its owner's hand" for one permanent, "their owner's hand" (or "their owners' hands") for several.
    const hand = (
      count === 1
        ? pattern(/ to its owner['’]s hand(?![\p{L}\p{N}])/iu)
        : pattern(/ to (?:their owner['’]s hand|their owners['’] hands)(?![\p{L}\p{N}])/iu)
    )(ctx, at);
    if (!hand.ok) return hand;
    return {
      ok: true,
      value: {
        kind: 'returnToHand',
        what,
        count,
        span: { start: pos, end: hand.pos },
        rule: 'cost.return-to-hand',
      },
      pos: hand.pos,
    };
  },
});

/** A loyalty symbol as Oracle text and the rules write it: "+1", "−2" (U+2212; a hyphen-minus and an en dash too), "0", "−X", in square brackets or not. */
const LOYALTY_BODY = String.raw`(?:\+([1-9]\d*)|[\u2212\u2013-](?:([1-9]\d*)|(X))|(0))`;
const LOYALTY_SYMBOL = new RegExp(
  String.raw`\[${LOYALTY_BODY}\]|${LOYALTY_BODY}(?![\p{L}\p{N}/:])`,
  'iu',
);

/**
 * `cost.loyalty`: "+1", "−2", "0", "−X" (CR 606.2, 606.4, 606.5: the loyalty symbol is the cost of a loyalty ability: [+N] puts N loyalty counters on the
 * permanent, [-N] removes N, [0] neither, and the X of [-X] is announced as the ability is activated). The minus is U+2212 in Oracle text; a hyphen-minus
 * and an en dash are read as well, and the square brackets of the rules text are optional. "+X" is not read (no card has it), nor is "-0".
 */
export const COST_LOYALTY = defineRule<IrCost>({
  id: 'cost.loyalty',
  family: 'cost',
  leading: [],
  cites: [
    'CR 606.2 (Loyalty Abilities)',
    'CR 606.4 (Loyalty Abilities)',
    'CR 606.5 (Loyalty Abilities)',
    'CR 107.15 (Numbers and Symbols)',
  ],
  examples: [
    '+1',
    '+2',
    '\u22122',
    '-3',
    '0',
    '\u2212X',
    '-X',
    '[+1]',
    '[\u22122]',
    '[0]',
    '\u221210',
  ],
  rejects: [
    '1',
    '+',
    '\u2212',
    '+X',
    '+1/+1',
    '-1/-1',
    '+1:',
    '\u22120',
    'X',
    '[+1',
    '++1',
    '+1 +1',
    '{T}',
  ],
  parse: node<RegExpExecArray, IrCost>(
    'cost.loyalty',
    pattern(LOYALTY_SYMBOL),
    (m): Omit<Extract<IrCost, { kind: 'loyalty' }>, 'span' | 'rule'> => {
      // The four groups of the body twice: inside square brackets (1 to 4), or not (5 to 8).
      const at =
        m[1] !== undefined || m[2] !== undefined || m[3] !== undefined || m[4] !== undefined
          ? 1
          : 5;
      const [plus, minus, x, zero] = [m[at], m[at + 1], m[at + 2], m[at + 3]];
      if (x !== undefined) return { kind: 'loyalty', change: 'x' };
      if (zero !== undefined) return { kind: 'loyalty', change: 0 };
      if (plus !== undefined) return { kind: 'loyalty', change: Number(plus) };
      return { kind: 'loyalty', change: -Number(minus) };
    },
  ),
});

/**
 * `cost.discard-filtered`: "Discard a legendary card", "Discard a creature card", "Discard another card named ~" (stage P50, D-207, CR 701.9, 118.3, 201.2):
 * one card of the hand the player chooses among those the words describe: a supertype or a card type, or the cards that have the name of the permanent
 * with the ability (not that permanent). The cost of an ordinary activated ability: the engine's `discard` with a `filter` or `named`. Not read: more
 * than one card, a color or a subtype, "a card of the chosen type", another name, "this card".
 */
export const COST_DISCARD_FILTERED = defineRule<IrCost>({
  id: 'cost.discard-filtered',
  family: 'cost',
  leading: ['discard'],
  cites: ['CR 701.9 (Discard)', 'CR 118.3 (Costs)', 'CR 201.2 (Names)'],
  examples: [
    'Discard a legendary card',
    'Discard a creature card',
    'Discard a land card',
    'Discard another card named ~',
    'discard an artifact card',
  ],
  rejects: [
    'Discard a card',
    'Discard two legendary cards',
    'Discard a red card',
    'Discard a legendary',
    'Discard another card',
    'Discard another card named',
    'Discard another card named Page',
    'Discard a card named ~',
    'Discard this card',
    'Discard a legendary creature card',
    'Discard a Goblin card',
  ],
  parse: (ctx, pos) => {
    const named = pattern(/discard another card named ~(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (named.ok) {
      const span = { start: pos, end: named.pos };
      const cost: IrCost = {
        kind: 'discard',
        amount: { kind: 'number', value: 1, span },
        named: true,
        span,
        rule: 'cost.discard-filtered',
      };
      return { ok: true, value: cost, pos: named.pos };
    }
    const r = pattern(
      /discard an? (legendary|basic|snow|creature|land|artifact|enchantment|instant|sorcery|planeswalker) card(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const word = (r.value[1] ?? '').toLowerCase();
    const span = { start: pos, end: r.pos };
    const supertype = ['legendary', 'basic', 'snow'].includes(word);
    const cost: IrCost = {
      kind: 'discard',
      amount: { kind: 'number', value: 1, span },
      filter: supertype ? { supertypes: [word], raw: word } : { types: [word], raw: word },
      span,
      rule: 'cost.discard-filtered',
    };
    return { ok: true, value: cost, pos: r.pos };
  },
});

/**
 * `cost.mill`: "Mill a card", "Mill two cards" (CR 701.17a, 701.17b: the top cards of the library go to the graveyard, and a player cannot pay it with fewer cards
 * in the library). The cost of a mana ability of one permanent ("{T}, Mill a card: Add {C}", stage P51, D-208). Not read: "Mill X cards", "Mill a card from each
 * library", "Mill your library", more than a number.
 */
export const COST_MILL = defineRule<IrCost>({
  id: 'cost.mill',
  family: 'cost',
  leading: ['mill'],
  cites: ['CR 701.17a (Mill)', 'CR 701.17b (Mill)', 'CR 118.3 (Costs)'],
  examples: ['Mill a card', 'Mill two cards', 'mill a card', 'Mill 2 cards'],
  rejects: [
    'Mill',
    'Mill X cards',
    'Mill cards',
    'Mill a',
    'Mills a card',
    'Mill 0 cards',
    'Mill your library',
    'Mill a card from each library',
  ],
  parse: node<IrAmount, IrCost>(
    'cost.mill',
    map(
      sequence(
        literal('mill '),
        satisfy(
          family<IrAmount>('amount', { only: ['amount.number', 'amount.article'] }),
          atLeastOne,
        ),
        pattern(/ cards?(?![\p{L}\p{N}])/iu),
      ),
      ([, amount]) => amount,
    ),
    (amount) => ({ kind: 'mill', amount }),
  ),
});

/**
 * `cost.energy`: "{E}", "{E}{E}" (CR 107.14: the energy symbol is one energy counter, and paying it removes one from the player). The cost an "unless you pay"
 * names ("discard a card at random unless you pay {E}{E}", stage P51, D-209). Not read: a mix with other symbols ("{1}{E}"), more than eight, "pay {E} for each".
 */
export const COST_ENERGY = defineRule<IrCost>({
  id: 'cost.energy',
  family: 'cost',
  leading: [],
  cites: ['CR 107.14 (Energy)', 'CR 118.3 (Costs)'],
  examples: ['{E}', '{E}{E}', '{E}{E}{E}'],
  rejects: ['{1}{E}', '{E}{R}', 'E', '{E', '{E}{E}{E}{E}{E}{E}{E}{E}{E}', '{e}{x}', '{E} {E}'],
  parse: node<number, IrCost>(
    'cost.energy',
    map(pattern(/(?:\{E\}){1,8}(?![\p{L}\p{N}{])/u), (m) => m[0].length / 3),
    (count) => ({ kind: 'energy', count }),
  ),
});

export const COST_RULES = [
  COST_TAP,
  COST_TAP_PERMANENTS,
  // Before the plain mana cost, which would take the plain prefix of "{1}{R/W}" and stop there.
  COST_MANA_HYBRID,
  COST_MANA_X,
  // Hashaton deck, group 9 (D-390): a Phyrexian symbol ({5}{B/P}), also before the plain mana cost.
  ...HASHATON_G9_COST_RULES,
  COST_MANA,
  COST_SACRIFICE,
  COST_DISCARD,
  COST_DISCARD_FILTERED,
  // Stage P68 (D-229): "Discard this card", "Exile ~".
  ...HOFRI_COST_RULES,
  // Gisa deck, group 4 (D-462): "Reveal this card from your hand".
  ...GISA_G4_COST_RULES,
  COST_MILL,
  COST_ENERGY,
  COST_PAY_LIFE,
  COST_PAY_LIFE_AMOUNT,
  // Hashaton deck, group 2 (D-364): "pay that much life", read by `effect.pay` only.
  ...HASHATON_G2_COST_RULES,
  // Hashaton deck, group 10 (D-386): "discard X cards", read by `static.additional-cost` only.
  ...HASHATON_G10_COST_RULES,
  // Danitha deck, group 5 (D-407): Blight 1, a cost of an activated ability.
  ...DANITHA_G5_COST_RULES,
  COST_PAY_X_LIFE,
  COST_REMOVE_COUNTERS,
  COST_PUT_COUNTERS,
  COST_RETURN_TO_HAND,
  COST_LOYALTY,
];
