import { choice, fail, map, type Parser, pattern, satisfy } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { possessedNoun } from '../noun/controller';
import { defineRule, spanned } from '../registry';
import { CARD_TYPES_AMOUNT_RULES } from './card-types';
import { CHOSEN_PLAYER_LEAD_AMOUNT_RULES } from './chosen-player-lead';
import { COUNT_AMOUNT_RULES } from './count';
import { DAMAGED_PLAYERS_AMOUNT_RULES } from './damaged-players';
import { DISCARDED_TYPES_AMOUNT_RULES } from './discarded-types';
import { AMOUNT_FOR_EACH_AURA_ATTACHED, AMOUNT_FOR_EACH_STILL_EXILED } from './dragons';
import { EXPERIENCE_AMOUNT_RULES } from './experience';
import { F144_AMOUNT_RULES } from './f144';
import { FEATHER_G1_AMOUNT_RULES } from './feather-g1';
import { GALADRIEL_G2_AMOUNT_RULES } from './galadriel-g2';
import { HALF_X_AMOUNT_RULES } from './half-x';
import { HAND_OF_THAT_PLAYER_AMOUNT_RULES } from './hand-of-that-player';
import { HASHATON_G2_AMOUNT_RULES } from './hashaton-group-2';
import { AMOUNT_FOR_EACH_DIED, AMOUNT_FOR_EACH_OTHER_SPELL_CAST } from './history';
import { HOFRI_AMOUNT_RULES } from './hofri';
import { AMOUNT_TIMES_KICKED } from './kicked';
import { KORVOLD_AMOUNT_RULES } from './korvold';
import { LOREHOLD_G2_AMOUNT_RULES } from './lorehold-g2';
import { AMOUNT_FOR_EACH_MANA_SPENT } from './mana-spent';
import { QUANDRIX_G_AMOUNT_RULES } from './quandrix-g';
import { SPELLS_CAST_EACH_AMOUNT_RULES } from './spells-cast-each';
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

/** A whole number written as digits, as a number word from one to twenty, or "one hundred". */
export const quantity: Parser<number> = choice(
  // "up to one hundred target creatures" (Baldin, Century Herdmaster): the one number word above twenty the text uses.
  map(pattern(/one hundred(?![\p{L}\p{N}])/iu), () => 100),
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
  examples: ['3', 'three', '12', 'ten', 'thirteen', 'twenty', 'one hundred'],
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
const TARGET_CREATURE_POWER =
  /equal to the power of (target creature you control)(?![\p{L}\p{N}])/iu;

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
    const targetMatch = pattern(TARGET_CREATURE_POWER)(ctx, pos);
    if (targetMatch.ok) {
      const start = pos + 'equal to the power of '.length;
      const target: IrNoun = {
        kind: 'noun',
        det: 'target',
        filter: { types: ['creature'], controller: 'you', raw: targetMatch.value[1] ?? '' },
        upTo: false,
        plural: false,
        other: false,
        span: { start, end: targetMatch.pos },
        rule: 'noun.target-permanent',
      };
      return {
        ok: true,
        value: { kind: 'powerOf', of: target, span: { start: pos, end: targetMatch.pos } },
        pos: targetMatch.pos,
      };
    }
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
 * `amount.that-spells-mana-value`: "that spell's mana value", the limit of "target nonland permanent an opponent controls with mana value less than or equal to
 * that spell's mana value" (CR 202.3: the total of the mana cost; CR 601.2i: the spell was cast). "That spell" is the spell that caused a cast trigger, which the
 * lowering reads as the engine's `triggerSubject`, as for `amount.mana-value-of`. Not read: another possessor ("that card's"), a missing apostrophe and the
 * "equal to" form, which is `amount.mana-value-of`.
 */
export const AMOUNT_THAT_SPELLS_MANA_VALUE = defineRule<IrAmount>({
  id: 'amount.that-spells-mana-value',
  family: 'amount',
  leading: ['that'],
  cites: ['CR 202.3 (Mana Value)', 'CR 601.2i (Casting Spells)'],
  examples: ["that spell's mana value", 'that spell’s mana value'],
  rejects: [
    "that card's mana value",
    'that spells mana value',
    "equal to that spell's mana value",
    "that spell's power",
    "that spell's mana values",
    "that spell's mana",
    "~'s mana value",
    'that spell',
  ],
  parse: (ctx, pos) => {
    const m = pattern(/(that spell['’]s) mana value(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!m.ok) return fail(ctx, pos);
    const of = possessedNoun('amount.that-spells-mana-value', m.value[1] ?? '', pos);
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
  examples: [
    'equal to the total mana value of those cards',
    // Lorehold Spirit deck, group 2 (issue 86): the cards "milled this way".
    'equal to the total mana value of cards milled this way',
    'equal to the total mana value of the cards milled this way',
  ],
  rejects: [
    'equal to the total mana value of cards milled',
    'equal to the total mana value of cards exiled this way',
    'equal to the total mana value of cards milled this way plus 1',
    'the total mana value of cards milled this way',
    'equal to the total mana value of those cards milled this way',
    'the total mana value of those cards',
    'equal to the mana value of those cards',
    'equal to the total mana value',
    'equal to the total mana value of the cards',
    'equal to the total mana value of those cards plus 1',
    'equal to the greatest mana value of those cards',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /equal to the total mana value of (?:those cards|(?:the )?cards milled this way)(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'thisWay', what: 'milledValue', words: [], span: r.value.span },
      pos: r.pos,
    };
  },
});

/**
 * `amount.discarded-most-this-way`: "equal to the greatest number of cards a player discarded this way" (issue 279, Windfall, CR 608.2c, 701.9a): the most cards any one
 * player discarded to the instruction before it in the same text ("Each player discards their hand, then draws cards equal to ..."), read as the engine's `thisWay`
 * `discardedMost`. Read only where the lowering finds a `discard` of the same text before it. Not read: "the total number of cards discarded this way" (a sum), "the least
 * number", a player named ("a player" is the only word it says: "that player" or "you" name one), a count in front ("twice"), another verb ("exiled").
 */
export const AMOUNT_DISCARDED_MOST_THIS_WAY = defineRule<IrAmount>({
  id: 'amount.discarded-most-this-way',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 701.9a (Discard)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['equal to the greatest number of cards a player discarded this way'],
  rejects: [
    'equal to the greatest number of cards a player discarded',
    'equal to the greatest number of cards you discarded this way',
    'equal to the greatest number of cards that player discarded this way',
    'equal to the least number of cards a player discarded this way',
    'equal to the total number of cards a player discarded this way',
    'equal to the greatest number of cards a player exiled this way',
    'equal to the greatest number of creature cards a player discarded this way',
    'the greatest number of cards a player discarded this way',
    'equal to the greatest number of cards a player discarded this way plus 1',
    'equal to twice the greatest number of cards a player discarded this way',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /equal to the greatest number of cards a player discarded this way(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'thisWay', what: 'discardedMost', words: [], span: r.value.span },
      pos: r.pos,
    };
  },
});

/**
 * `amount.damage-dealt-this-way`: "equal to the damage dealt this way" (issue 159, CR 120.3, 615.6, 608.2c): the damage the instruction
 * before it in the same text dealt, after prevention. Read only where the lowering finds a `dealDamage` of the same text before it.
 */
export const AMOUNT_DAMAGE_DEALT_THIS_WAY = defineRule<IrAmount>({
  id: 'amount.damage-dealt-this-way',
  family: 'amount',
  leading: ['equal'],
  cites: [
    'CR 120.3 (Damage)',
    'CR 615.6 (Prevention Effects)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['equal to the damage dealt this way'],
  rejects: [
    'the damage dealt this way',
    'equal to the damage dealt',
    'equal to damage dealt this way',
    'equal to the damage dealt this turn',
    'equal to the damage dealt this way plus 1',
    'equal to the life lost this way',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/equal to the damage dealt this way(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'thisWay', what: 'damageDealt', words: [], span: r.value.span },
      pos: r.pos,
    };
  },
});

/**
 * `amount.excess-damage-dealt-this-way`: "equal to the amount of excess damage dealt to that creature this way" (CR 120.10 Excess Damage, 608.2c; Goblin Negotiation): what the
 * `dealDamage` before it dealt to the creature beyond lethal damage. Only "that creature" or "that permanent", the object the damage was dealt to, and only after a damage
 * instruction; "excess damage dealt this turn" and the other recipients are not read.
 */
export const AMOUNT_EXCESS_DAMAGE_DEALT_THIS_WAY = defineRule<IrAmount>({
  id: 'amount.excess-damage-dealt-this-way',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 120.10 (Damage)', 'CR 120.6 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'equal to the amount of excess damage dealt to that creature this way',
    'equal to the amount of excess damage dealt to that permanent this way',
  ],
  rejects: [
    'equal to the amount of excess damage dealt to that creature',
    'equal to the amount of excess damage dealt to target creature this way',
    'equal to the excess damage dealt to that creature this way',
    'equal to the amount of excess damage dealt to that creature this turn',
    'equal to the amount of excess damage dealt to that player this way',
    'the amount of excess damage dealt to that creature this way',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /equal to the amount of excess damage dealt to that (?:creature|permanent) this way(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'thisWay', what: 'excessDamageDealt', words: [], span: r.value.span },
      pos: r.pos,
    };
  },
});

export const AMOUNT_RULES = [
  AMOUNT_EXCESS_DAMAGE_DEALT_THIS_WAY,
  AMOUNT_FOR_EACH_DIED,
  // Stage P37 (D-180): "for each color among permanents you control", which `amount.for-each` does not read.
  ...KORVOLD_AMOUNT_RULES,
  // CR 205.2a: "for each card type among cards in your graveyard".
  ...CARD_TYPES_AMOUNT_RULES,
  // Stage P68 (D-229): "for each time you've cast your commander from the command zone this game".
  ...HOFRI_AMOUNT_RULES,
  // Issue 144 (Glimpse the Impossible): "for each card put into your graveyard this way".
  ...F144_AMOUNT_RULES,
  ...DISCARDED_TYPES_AMOUNT_RULES,
  // Quandrix Unlimited deck, group G: "equal to the damage dealt" of a combat damage batch trigger.
  ...QUANDRIX_G_AMOUNT_RULES,
  // Hashaton deck, group 2 (D-365): "equal to the life that player lost this turn".
  ...HASHATON_G2_AMOUNT_RULES,
  // CR 402.1: "equal to the number of cards in that player's hand", the amount of damage to each opponent.
  ...HAND_OF_THAT_PLAYER_AMOUNT_RULES,
  // Feather deck, group 1 (D-450): "for each card you've drawn this turn".
  ...FEATHER_G1_AMOUNT_RULES,
  ...SPELLS_CAST_EACH_AMOUNT_RULES,
  // Ahoy Mateys deck, group 1 (Malcolm): "for each opponent dealt damage".
  ...DAMAGED_PLAYERS_AMOUNT_RULES,
  ...CHOSEN_PLAYER_LEAD_AMOUNT_RULES,
  // Lock and Load (issue 121): "for each other instant and sorcery spell you've cast this turn".
  AMOUNT_FOR_EACH_OTHER_SPELL_CAST,
  // Meren of Clan Nel Toth: "the number of experience counters you have".
  ...EXPERIENCE_AMOUNT_RULES,
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
  AMOUNT_THAT_SPELLS_MANA_VALUE,
  AMOUNT_LIFE_LOST_THIS_WAY,
  AMOUNT_MILLED_VALUE_THIS_WAY,
  AMOUNT_DISCARDED_MOST_THIS_WAY,
  AMOUNT_DAMAGE_DEALT_THIS_WAY,
  // Galadriel deck, group 2 (D-539): two counts added; before `amount.for-each`, which would stop after the first.
  ...GALADRIEL_G2_AMOUNT_RULES,
  ...COUNT_AMOUNT_RULES,
  ...FOR_EACH_VALUE_RULES,
  AMOUNT_TIMES_KICKED,
  AMOUNT_FOR_EACH_STILL_EXILED,
  AMOUNT_FOR_EACH_AURA_ATTACHED,
  AMOUNT_FOR_EACH_MANA_SPENT,
  // Lorehold Spirit deck, group 2 (issue 86): "for each past vote".
  ...LOREHOLD_G2_AMOUNT_RULES,
  // Quandrix Unlimited deck, group D2: "half X, rounded down".
  ...HALF_X_AMOUNT_RULES,
];

/** The amounts of a damage or life clause: a number or X, never an article. */
export const NUMBER_OR_X = ['amount.number', 'amount.x'] as const;
