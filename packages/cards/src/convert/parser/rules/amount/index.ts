import { choice, fail, map, type Parser, pattern, satisfy } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { possessedNoun } from '../noun/controller';
import { defineRule, spanned } from '../registry';
import { COUNT_AMOUNT_RULES } from './count';
import { AMOUNT_FOR_EACH_STILL_EXILED } from './dragons';
import { HOFRI_AMOUNT_RULES } from './hofri';
import { AMOUNT_TIMES_KICKED } from './kicked';
import { KORVOLD_AMOUNT_RULES } from './korvold';
import { AMOUNT_FOR_EACH_MANA_SPENT } from './mana-spent';
import { FOR_EACH_VALUE_RULES, VALUE_AMOUNT_RULES } from './value';

/** The number words of Oracle text: one to twenty (stage P28: "thirteen tapped Zombie tokens"). */
const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
] as const;

const WORD_RE = new RegExp(`(${NUMBER_WORDS.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

/** A whole number written as digits or as a number word from one to twenty. */
export const quantity: Parser<number> = choice(
  map(pattern(/(\d+)(?![\p{L}\p{N}])/u), (m) => Number(m[1])),
  map(
    pattern(WORD_RE),
    (m) => (NUMBER_WORDS as readonly string[]).indexOf((m[1] ?? '').toLowerCase()) + 1,
  ),
);

/** "a" or "an" as a count of one ("draw a card"). */
export const article: Parser<number> = map(pattern(/an?(?![\p{L}\p{N}])/iu), () => 1);

/** `quantity` or `article`, at least one: the count of "enters with a +1/+1 counter". */
export const positiveCount: Parser<number> = satisfy(choice(quantity, article), (n) => n >= 1);

type BareAmount = IrAmount extends infer A ? (A extends unknown ? Omit<A, 'span'> : never) : never;

/** An amount node: what was read, plus the span it was read from. */
function amountNode(parser: Parser<BareAmount>): Parser<IrAmount> {
  return map(spanned(parser), ({ value, span }) => ({ ...value, span }) as IrAmount);
}

/** `amount.number`: "3", "three" (CR 107.1: whole numbers; words one to ten). */
export const AMOUNT_NUMBER = defineRule<IrAmount>({
  id: 'amount.number',
  family: 'amount',
  leading: [],
  cites: ['CR 107.1 (Numbers and Symbols)'],
  examples: ['3', 'three', '12', 'ten', 'thirteen', 'twenty'],
  rejects: ['X', 'a', 'zero', 'twenty-one', 'twentyone'],
  parse: amountNode(map(quantity, (value) => ({ kind: 'number' as const, value }))),
});

/** `amount.x`: "X" (CR 107.3: a value chosen as the spell is cast). */
export const AMOUNT_X = defineRule<IrAmount>({
  id: 'amount.x',
  family: 'amount',
  leading: ['x'],
  cites: ['CR 107.3 (Numbers and Symbols)'],
  examples: ['X'],
  rejects: ['Y', 'Xs'],
  parse: amountNode(map(pattern(/X(?![\p{L}\p{N}])/u), () => ({ kind: 'x' as const }))),
});

/** `amount.article`: "a" and "an" as one ("draw a card", "enters with a +1/+1 counter"). */
export const AMOUNT_ARTICLE = defineRule<IrAmount>({
  id: 'amount.article',
  family: 'amount',
  leading: ['a', 'an'],
  cites: ['CR 107.1 (Numbers and Symbols)'],
  examples: ['a', 'an', 'A'],
  rejects: ['one', 'X', 'and'],
  parse: amountNode(map(article, (value) => ({ kind: 'number' as const, value }))),
});

/**
 * `amount.that-much`: "that much" (stage P29, D-133, CR 120.3, 603.2): the amount of damage of the event that caused the
 * trigger: "Whenever ~ is dealt damage, you gain that much life." It is read after "gain" and "lose" only, and the lowering
 * names the engine's `triggerDamage`, which `validateCard` allows only in a trigger that has damage (is dealt damage, deals
 * combat damage).
 */
export const AMOUNT_THAT_MUCH = defineRule<IrAmount>({
  id: 'amount.that-much',
  family: 'amount',
  leading: ['that'],
  cites: ['CR 120.3 (Damage)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['that much', 'That much'],
  rejects: ['that many', 'that', 'that muchly', 'this much', 'much'],
  parse: amountNode(
    map(pattern(/that much(?![\p{L}\p{N}])/iu), () => ({ kind: 'triggerDamage' as const })),
  ),
});

/**
 * `amount.that-many`: "that many" (stage P30, D-135, CR 608.2c): the number of things the instruction before it did, "Sacrifice any
 * number of other permanents, then draw that many cards." It is read as what the sentence before it sacrificed, and the lowering
 * refuses it anywhere but after an instruction that sacrificed (the engine's `thisWay` counts the permanents sacrificed by this
 * resolution): another earlier verb ("discard", "exile") is not counted by the engine and the text is not run.
 */
export const AMOUNT_THAT_MANY = defineRule<IrAmount>({
  id: 'amount.that-many',
  family: 'amount',
  leading: ['that'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.21 (Sacrifice)'],
  examples: ['that many', 'That many'],
  rejects: ['that much', 'that', 'that manyx', 'this many', 'many', 'that many cards'],
  parse: amountNode(
    map(pattern(/that many(?![\p{L}\p{N}])/iu), () => ({
      kind: 'thisWay' as const,
      what: 'sacrificed' as const,
      words: [] as string[],
      thatMany: true as const,
    })),
  ),
});

const POWER_OF = /equal to (its|that (?:creature|permanent)['’]s|~['’]s) power(?![\p{L}\p{N}])/iu;

/**
 * `amount.power-of`: "equal to its power", "equal to that creature's power", "equal to ~'s power"
 * (CR 208.1: the power of an object; CR 608.2h: an object that has left the battlefield is read from
 * its last known information, which is how "Exile target creature. Its controller gains life equal
 * to its power" counts the power the creature had). Only the amount of a life or damage clause
 * names it: the object is a pronoun or `~`, left to the binding pass.
 */
export const AMOUNT_POWER_OF = defineRule<IrAmount>({
  id: 'amount.power-of',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 208.1 (Power/Toughness)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    'equal to its power',
    "equal to that creature's power",
    'equal to that permanent’s power',
    "equal to ~'s power",
  ],
  rejects: [
    'equal to its toughness',
    'equal to its power plus 1',
    'equal to the power',
    'equal to its mana value',
    "equal to target creature's power",
    'its power',
    'equal to',
  ],
  parse: (ctx, pos) => {
    const m = pattern(POWER_OF)(ctx, pos);
    if (!m.ok) return fail(ctx, pos);
    const head = m.value[1] ?? '';
    const start = pos + 'equal to '.length;
    const of: IrNoun =
      head === '~' || head.startsWith('~')
        ? {
            kind: 'noun',
            det: 'self',
            filter: { raw: '~' },
            upTo: false,
            plural: false,
            other: false,
            span: { start, end: start + 1 },
            rule: 'amount.power-of',
          }
        : possessedNoun('amount.power-of', head, start);
    return {
      ok: true,
      value: { kind: 'powerOf', of, span: { start: pos, end: m.pos } },
      pos: m.pos,
    };
  },
});

const MANA_VALUE_OF =
  /equal to (its|that (?:creature|permanent|card|spell)['’]s) mana value(?![\p{L}\p{N}])/iu;

/**
 * `amount.mana-value-of`: "equal to its mana value", "equal to that card's mana value", "equal to
 * that permanent's mana value" (CR 202.3: the total of the mana cost; CR 608.2h: what a card or
 * permanent that has left the zone it was in was, from its last known information, which is how a
 * reanimation spell counts the card it just put onto the battlefield). The object is a pronoun
 * left to the binding pass. Only the amount of a life clause names it, like `amount.power-of`; a
 * mana value of `~` is not read. "That spell's" (stage P37, D-180, CR 202.3, 601.2i) is the spell that caused a cast trigger, which the
 * lowering reads as the engine's `triggerSubject`.
 */
export const AMOUNT_MANA_VALUE_OF = defineRule<IrAmount>({
  id: 'amount.mana-value-of',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 202.3 (Mana Value)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    'equal to its mana value',
    "equal to that card's mana value",
    "equal to that creature's mana value",
    'equal to that permanent’s mana value',
    "equal to that spell's mana value",
  ],
  rejects: [
    'equal to its power',
    'equal to that spells mana value',
    "equal to ~'s mana value",
    'equal to its mana cost',
    'equal to the mana value',
    "equal to target creature's mana value",
    'its mana value',
    'equal to',
  ],
  parse: (ctx, pos) => {
    const m = pattern(MANA_VALUE_OF)(ctx, pos);
    if (!m.ok) return fail(ctx, pos);
    const head = m.value[1] ?? '';
    const of = possessedNoun('amount.mana-value-of', head, pos + 'equal to '.length);
    return {
      ok: true,
      value: { kind: 'manaValueOf', of, span: { start: pos, end: m.pos } },
      pos: m.pos,
    };
  },
});

/**
 * `amount.life-lost-this-way`: "equal to the life lost this way", "equal to the total life lost this way"
 * (stage P21, CR 702.101a, 119.3: the life lost by the instruction before it in the same text, which is how
 * "Each opponent loses X life. You gain life equal to the life lost this way." counts what was actually
 * lost). Read only after "gain life"; the lowering refuses it
 * unless a `loseLife` of the same text comes before it, where the engine reads it.
 */
export const AMOUNT_LIFE_LOST_THIS_WAY = defineRule<IrAmount>({
  id: 'amount.life-lost-this-way',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 702.101a (Extort)', 'CR 119.3 (Life)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['equal to the life lost this way', 'equal to the total life lost this way'],
  rejects: [
    'equal to the life lost',
    'equal to life lost this way',
    'equal to the damage dealt this way',
    'equal to the total life lost this turn',
    'equal to the life lost this way plus 1',
    'equal to the number of life lost this way',
    'the life lost this way',
    'equal to the total',
  ],
  parse: amountNode(
    map(pattern(/equal to the (?:total )?life lost this way(?![\p{L}\p{N}])/iu), () => ({
      kind: 'lifeLostThisWay' as const,
    })),
  ),
});

/**
 * `amount.milled-value-this-way`: "equal to the total mana value of those cards" (stage P52, D-210, CR 202.3, 608.2c): the mana values of the cards the instruction before it
 * in the same text milled, added up. Read only where the lowering finds a `mill` of the same text before it. Not read: "the total mana value of those cards" without
 * "equal to", "the number of those cards", "the greatest".
 */
export const AMOUNT_MILLED_VALUE_THIS_WAY = defineRule<IrAmount>({
  id: 'amount.milled-value-this-way',
  family: 'amount',
  leading: ['equal'],
  cites: [
    'CR 202.3 (Mana Value)',
    'CR 701.17a (Mill)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['equal to the total mana value of those cards'],
  rejects: [
    'the total mana value of those cards',
    'equal to the mana value of those cards',
    'equal to the total mana value',
    'equal to the total mana value of the cards',
    'equal to the total mana value of those cards plus 1',
    'equal to the greatest mana value of those cards',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/equal to the total mana value of those cards(?![\p{L}\p{N}])/iu))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'thisWay', what: 'milledValue', words: [], span: r.value.span },
      pos: r.pos,
    };
  },
});

export const AMOUNT_RULES = [
  // Stage P37 (D-180): "for each color among permanents you control", which `amount.for-each` does not read.
  ...KORVOLD_AMOUNT_RULES,
  // Stage P68 (D-229): "for each time you've cast your commander from the command zone this game".
  ...HOFRI_AMOUNT_RULES,
  AMOUNT_NUMBER,
  AMOUNT_X,
  AMOUNT_ARTICLE,
  AMOUNT_THAT_MUCH,
  AMOUNT_THAT_MANY,
  // Before the older "equal to ..." rules: it reads the values they stop short of (a sum, "half ..., rounded down"),
  // and leaves the plain count and the plain power to them.
  ...VALUE_AMOUNT_RULES,
  AMOUNT_POWER_OF,
  AMOUNT_MANA_VALUE_OF,
  AMOUNT_LIFE_LOST_THIS_WAY,
  AMOUNT_MILLED_VALUE_THIS_WAY,
  ...COUNT_AMOUNT_RULES,
  ...FOR_EACH_VALUE_RULES,
  AMOUNT_TIMES_KICKED,
  AMOUNT_FOR_EACH_STILL_EXILED,
  AMOUNT_FOR_EACH_MANA_SPENT,
];

/** The amounts of a damage or life clause: a number or X, never an article. */
export const NUMBER_OR_X = ['amount.number', 'amount.x'] as const;
