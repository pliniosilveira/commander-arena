/**
 * The amounts that read the game (stage P28, D-131): one family of amount phrases for the numbers a card gets from
 * the board instead of printing them. The phrases are built from a few parts that combine, not one rule for each
 * card line:
 *
 * - a count of objects ("the number of Zombies you control", the filter family of `count.ts`);
 * - a number read from one object ("that creature's toughness", "its power", "the number of +1/+1 counters on ~");
 * - a number read from a group ("the greatest power among creatures you control", "the total power of creatures
 *   you control", "the greatest mana value among artifacts you control");
 * - a number read from a player ("your devotion to black", CR 700.5, "the number of colors in your commanders'
 *   color identity", CR 903.4);
 * - arithmetic on those ("half the number of Zombies you control, rounded down", CR 107.1a, "twice the number of
 *   ...", "the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards");
 * - the counts that follow "for each" and are not objects ("for each opponent who has more cards in hand than
 *   you", "for each creature sacrificed this way", "for each +1/+1 counter on ~").
 *
 * The value phrases are used after "equal to " (`amount.equal-to`: the kinds the older rules do not read) and after
 * "where X is " (`amount.where-x`: every kind; CR 107.3c says what the text defines X as is its value wherever X is
 * read). The older rules (`amount.number-of`, `amount.power-of`, ...) keep the plain "equal to the number of ..."
 * and "equal to its power".
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { possessedNoun } from '../noun/controller';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { CARD_TYPES_AMONG_THOSE_VALUE, CARD_TYPES_AMONG_VALUE } from './card-types';
import { countAmount, counted } from './count';
import { DESTROYED_VALUE_AMOUNT } from './death-toll-d';
import { HISTORY_VALUE } from './history';
import { DAMAGE_DEALT_AMOUNT } from './hofri';
import { MANA_SPENT_AMOUNT } from './mana-spent';
import { VOTES_AMOUNT } from './votes';

const COLOR_WORD = pattern(/(white|blue|black|red|green)(?![\p{L}\p{N}])/iu);

/** `~` or "it" as the object of "counters on ...": the permanent itself, or what the binding pass makes of "it". */
function selfOrIt(rule: string): Parser<IrNoun> {
  return (ctx, pos) => {
    const m = pattern(/(~|it)(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!m.ok) return m;
    const word = (m.value[1] ?? '').toLowerCase();
    const span = { start: pos, end: m.pos };
    const noun: IrNoun = {
      kind: 'noun',
      det: word === '~' ? 'self' : 'anaphor',
      filter: { raw: word },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule,
    };
    return { ok: true, value: noun, pos: m.pos };
  };
}

/** A counter's name as the text writes it: "+1/+1", "-1/-1" or a word ("charge", "stun"). */
const COUNTER_NAME = pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i);

/** "+1/+1 counter on ~", "+1/+1 counters on it": the number of counters of a kind an object has (CR 122.1). */
function countersOn(rule: string, head: Parser<unknown>, plural: boolean): Parser<IrAmount> {
  const tail = pattern(new RegExp(` counter${plural ? 's' : ''} on `, 'i'));
  return (ctx, pos) => {
    const r = spanned(sequence(head, COUNTER_NAME, tail, selfOrIt(rule)))(ctx, pos);
    if (!r.ok) return r;
    const [, name, , of] = r.value.value;
    // A word that is no counter ("for each creature on ...") stays for the counted-noun rules.
    if (!/^[+-]/.test(name[0]) && /^(?:creatures?|cards?|permanents?|lands?)$/i.test(name[0])) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: { kind: 'countersOn', of, counter: name[0].toLowerCase(), span: r.value.span },
      pos: r.pos,
    };
  };
}

/** "the number of Zombies you control": a count of the objects a filter matches (CR 608.2c). */
const NUMBER_OF = (rule: string): Parser<IrAmount> =>
  countAmount(rule, literal('the number of '), true);

/** "the number of +1/+1 counters on ~". Exported for the rules of effects that read it as a limit (Galadriel deck, group 1: "mana value less than or equal to the number of loyalty counters on ~"). */
export const NUMBER_OF_COUNTERS = (rule: string): Parser<IrAmount> =>
  countersOn(rule, literal('the number of '), true);

const AGGREGATE_HEAD = /the (greatest|total) (power|toughness|mana value) (among|of) /iu;

/**
 * "the greatest power among creatures you control", "the total power of creatures you control", "the greatest mana
 * value among artifacts you control" (CR 208.1, 202.3): over the objects a group names, the largest or the sum of
 * a stat. "Greatest" goes with "among"; "total" with "of" or "among".
 */
const AGGREGATE = (rule: string): Parser<IrAmount> => {
  const group = counted(rule, true);
  return (ctx, pos) => {
    const head = spanned(pattern(AGGREGATE_HEAD))(ctx, pos);
    if (!head.ok) return head;
    const how = (head.value.value[1] ?? '').toLowerCase() as 'greatest' | 'total';
    const stat = (head.value.value[2] ?? '').toLowerCase();
    const prep = (head.value.value[3] ?? '').toLowerCase();
    if (how === 'greatest' && prep !== 'among') return fail(ctx, pos);
    const of = group(ctx, head.pos);
    if (!of.ok) return of;
    // " as you cast ~" (stage P32, D-147, CR 601.2d): the total of a divided damage is read once, as the spell is cast.
    const cast = optional(quiet(literal(' as you cast ~')), null)(ctx, of.pos);
    if (!cast.ok) return cast;
    return {
      ok: true,
      value: {
        kind: 'aggregate',
        how,
        stat: stat === 'mana value' ? 'manaValue' : (stat as 'power' | 'toughness'),
        of: of.value,
        ...(cast.value === null ? {} : { asCast: true as const }),
        span: { start: pos, end: cast.pos },
      },
      pos: cast.pos,
    };
  };
};

/** "your devotion to black", "your devotion to white and blue" (CR 700.5): the colors, as the words write them. */
const DEVOTION: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(
    sequence(
      literal('your devotion to '),
      satisfy(
        separatedBy1(
          map(COLOR_WORD, (m) => (m[1] ?? '').toLowerCase()),
          choice(literal(', and '), literal(', '), literal(' and ')),
        ),
        (colors) => new Set(colors).size === colors.length,
      ),
    ),
  )(ctx, pos);
  if (!r.ok) return r;
  return {
    ok: true,
    value: { kind: 'devotion', colors: r.value.value[1], span: r.value.span },
    pos: r.pos,
  };
};

/** "the number of colors in your commanders' color identity" (CR 903.4: the commanders' colors together). */
const COMMANDER_COLORS: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(
    pattern(/the number of colors in your commanders['’] color identity(?![\p{L}\p{N}])/iu),
  )(ctx, pos);
  return r.ok
    ? { ok: true, value: { kind: 'commanderColors', span: r.value.span }, pos: r.pos }
    : r;
};

/**
 * "the greatest power among those creatures" (CR 508.1, 603.2): the creatures an `attackBatch` trigger ("whenever you attack with one or more creatures") declared. Only the
 * words "those creatures": the group the text names after "among" stays with `AGGREGATE`; whether the ability is such a trigger is the engine's check (`validateCard`).
 */
const ATTACKERS_GREATEST_POWER: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(
    pattern(/the greatest power among (?:those|the) creatures(?![\p{L}\p{N}'’])/iu),
  )(ctx, pos);
  return r.ok
    ? { ok: true, value: { kind: 'attackersGreatestPower', span: r.value.span }, pos: r.pos }
    : r;
};

/** "the number of opponents you have" (CR 102.2, 102.3: the opponents still in the game; Rot Hulk's "where X is the number of opponents you have"). */
const OPPONENT_COUNT: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(pattern(/the number of opponents you have(?![\p{L}\p{N}'’])/iu))(ctx, pos);
  return r.ok ? { ok: true, value: { kind: 'opponentCount', span: r.value.span }, pos: r.pos } : r;
};

/** "the greatest mana value among your commanders" (stage P32, D-147, CR 903.3, 202.3): the controller's commanders, in any zone. */
const COMMANDER_MANA_VALUE: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(pattern(/the greatest mana value among your commanders(?![\p{L}\p{N}'’])/iu))(
    ctx,
    pos,
  );
  return r.ok
    ? { ok: true, value: { kind: 'commanderManaValue', span: r.value.span }, pos: r.pos }
    : r;
};

/**
 * "the result" (Galadriel deck group 3, CR 706.2, 706.3b): the natural result of the die the text rolled before ("Roll a d4. Scry X, where X is the result."). Only the
 * words "the result" followed by the end of the phrase; whether a die was rolled is the lowering's check.
 */
const DIE_RESULT: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(pattern(/the result(?![\p{L}\p{N}'’])/iu))(ctx, pos);
  return r.ok ? { ok: true, value: { kind: 'dieResult', span: r.value.span }, pos: r.pos } : r;
};

/**
 * "the life paid as ~ entered" (Phyrexian Processor, CR 119.4, 614.12): the life the permanent paid as it entered, which it remembers. Only the words themselves; that the card
 * pays life as it enters is the lowering's and `validateCard`'s check.
 */
const LIFE_PAID_AS_ENTERED: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(pattern(/the life paid as ~ entered(?![\p{L}\p{N}'’])/iu))(ctx, pos);
  return r.ok
    ? { ok: true, value: { kind: 'lifePaidAsEntered', span: r.value.span }, pos: r.pos }
    : r;
};

const STAT_OF_HEAD =
  /(its|that (?:creature|permanent)['’]s|the sacrificed (?:creature|permanent)['’]s|the exiled card['’]s|~['’]s) (power|toughness)(?![\p{L}\p{N}])/iu;

/**
 * "its power", "that creature's toughness", "~'s power": a number read from one object (CR 208.1). The object is a
 * pronoun or `~`, left to the binding pass.
 */
const STAT_OF =
  (rule: string): Parser<IrAmount> =>
  (ctx, pos) => {
    const m = pattern(STAT_OF_HEAD)(ctx, pos);
    if (!m.ok) return m;
    const head = m.value[1] ?? '';
    // "The sacrificed creature's power" (stage P29, D-133): what the cost of the ability sacrificed (CR 602.2c, 113.7a).
    const sacrificed = head.toLowerCase().startsWith('the sacrificed');
    // "The exiled card's power" (stage P37, D-180, CR 400.7j, 608.2h): the card the instruction before it exiled, which is "that card" to the
    // binding pass (the most recent object the text named).
    const exiled = head.toLowerCase().startsWith('the exiled card');
    const of: IrNoun = exiled
      ? {
          kind: 'noun',
          det: 'anaphor',
          filter: { raw: 'that card' },
          upTo: false,
          plural: false,
          other: false,
          span: { start: pos, end: pos + head.length - 2 },
          rule,
        }
      : sacrificed
        ? {
            kind: 'noun',
            det: 'sacrificed',
            filter: { raw: head.slice(0, head.length - 2) },
            upTo: false,
            plural: false,
            other: false,
            span: { start: pos, end: pos + head.length - 2 },
            rule,
          }
        : head.startsWith('~')
          ? {
              kind: 'noun',
              det: 'self',
              filter: { raw: '~' },
              upTo: false,
              plural: false,
              other: false,
              span: { start: pos, end: pos + 1 },
              rule,
            }
          : possessedNoun(rule, head, pos);
    const span = { start: pos, end: m.pos };
    const kind = (m.value[2] ?? '').toLowerCase() === 'power' ? 'powerOf' : 'toughnessOf';
    return { ok: true, value: { kind, of, span }, pos: m.pos };
  };

const MANA_VALUE_OF_HEAD =
  /(its|that (?:creature|permanent|card|spell|enchantment|artifact|land|planeswalker)['’]s|the sacrificed (?:creature|permanent|artifact)['’]s) mana value(?![\p{L}\p{N}])/iu;

/** "its mana value", "that card's mana value" (CR 202.3). */
const MANA_VALUE_OF =
  (rule: string): Parser<IrAmount> =>
  (ctx, pos) => {
    const m = pattern(MANA_VALUE_OF_HEAD)(ctx, pos);
    if (!m.ok) return m;
    const head = m.value[1] ?? '';
    // "The sacrificed permanent's mana value" (Boast, CR 202.3, 602.2c, 113.7a): what the cost of the ability sacrificed, as it last was.
    const of: IrNoun = head.toLowerCase().startsWith('the sacrificed')
      ? {
          kind: 'noun',
          det: 'sacrificed',
          filter: { raw: head.slice(0, head.length - 2) },
          upTo: false,
          plural: false,
          other: false,
          span: { start: pos, end: pos + head.length - 2 },
          rule,
        }
      : possessedNoun(rule, head, pos);
    return {
      ok: true,
      value: { kind: 'manaValueOf', of, span: { start: pos, end: m.pos } },
      pos: m.pos,
    };
  };

/** "your life total" (CR 119.1: a player's life total, read as the instruction runs; D-626). */
const LIFE_TOTAL =
  (rule: string): Parser<IrAmount> =>
  (ctx, pos) => {
    const r = spanned(pattern(/your life total(?![\p{L}\p{N}'’])/iu))(ctx, pos);
    if (!r.ok) return r;
    const of: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span: r.value.span,
      rule,
    };
    return { ok: true, value: { kind: 'lifeTotalOf', of, span: r.value.span }, pos: r.pos };
  };

/** One number read from the game: what "plus", "half" and "twice" combine. */
const ATOM = (rule: string): Parser<IrAmount> =>
  choice(
    HISTORY_VALUE,
    // Stage P44 (D-195): "the number of profit votes" (the words "votes" end it, so no count of objects is mistaken for it).
    VOTES_AMOUNT,
    // CR 205.2a: "the number of card types among cards in your graveyard" (before the count of objects, which reads no "card types").
    CARD_TYPES_AMONG_VALUE,
    CARD_TYPES_AMONG_THOSE_VALUE,
    NUMBER_OF_COUNTERS(rule),
    NUMBER_OF(rule),
    AGGREGATE(rule),
    ATTACKERS_GREATEST_POWER,
    DEVOTION,
    COMMANDER_COLORS,
    OPPONENT_COUNT,
    COMMANDER_MANA_VALUE,
    STAT_OF(rule),
    MANA_VALUE_OF(rule),
    LIFE_TOTAL(rule),
    // Stage P39 (D-184): "the amount of mana spent to cast it".
    MANA_SPENT_AMOUNT,
    // Stage P68 (D-230): "the amount of damage ~ dealt to that player".
    DAMAGE_DEALT_AMOUNT,
    // Galadriel deck group 3 (CR 706.2): "the result" of a die rolled earlier in the text.
    DIE_RESULT,
    // Phyrexian Processor (CR 119.4, 614.12): "the life paid as ~ entered".
    LIFE_PAID_AS_ENTERED,
    // Death Toll deck, group D (CR 202.3, 608.2h): "the total mana value of permanents destroyed this way".
    DESTROYED_VALUE_AMOUNT,
  );

/** "half <atom>, rounded down" (CR 107.1a: the text always says how it rounds). */
const HALF = (rule: string): Parser<IrAmount> => {
  const atom = ATOM(rule);
  return (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('half '),
        atom,
        map(
          pattern(/, rounded (down|up)(?![\p{L}\p{N}])/iu),
          (m) => (m[1] ?? '').toLowerCase() as 'down' | 'up',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, of, round] = r.value.value;
    return { ok: true, value: { kind: 'half', of, round, span: r.value.span }, pos: r.pos };
  };
};

const TIMES_WORDS: Readonly<Record<string, number>> = {
  twice: 2,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/** "twice <atom>", "three times <atom>": a whole number of 2 or more times an amount. */
const MULTIPLE = (rule: string): Parser<IrAmount> => {
  const atom = ATOM(rule);
  const head = map(
    pattern(/(twice|two times|three times|four times|five times) /i),
    (m) => TIMES_WORDS[(m[1] ?? '').toLowerCase().split(' ')[0] ?? ''] ?? 0,
  );
  return (ctx, pos) => {
    const r = spanned(sequence(head, atom))(ctx, pos);
    if (!r.ok) return r;
    const [factor, of] = r.value.value;
    if (factor < 2) return fail(ctx, pos);
    return { ok: true, value: { kind: 'multiple', factor, of, span: r.value.span }, pos: r.pos };
  };
};

/** "<atom> plus <atom> ...": the sum of two or more; a single atom is just that amount. */
const SUM_OR_ATOM = (rule: string): Parser<IrAmount> => {
  const atom = ATOM(rule);
  return (ctx, pos) => {
    // D-638 (Prismari deck group 1): "one plus the number of instant and sorcery spells you've cast this turn": a plain 1 more than the amount that follows.
    const one = literal('one plus ')(ctx, pos);
    // Issue 144 (Broadside Bombardiers): "2 plus the sacrificed permanent's mana value": a plain whole number of digits more than the amount that follows.
    const digits = pattern(/([1-9][0-9]*) plus /u)(ctx, pos);
    const lead = one.ok
      ? { pos: one.pos, value: 1 }
      : digits.ok
        ? { pos: digits.pos, value: Number(digits.value[1]) }
        : null;
    const first = atom(ctx, lead === null ? pos : lead.pos);
    if (!first.ok) return first;
    const parts: IrAmount[] =
      lead === null
        ? [first.value]
        : [{ kind: 'number', value: lead.value, span: { start: pos, end: lead.pos } }, first.value];
    let at = first.pos;
    for (;;) {
      const plus = literal(' plus ')(ctx, at);
      if (!plus.ok) break;
      const next = atom(ctx, plus.pos);
      if (!next.ok) break;
      parts.push(next.value);
      at = next.pos;
    }
    if (parts.length === 1) return first;
    return {
      ok: true,
      value: { kind: 'sum', of: parts, span: { start: pos, end: at } },
      pos: at,
    };
  };
};

/**
 * "<atom or sum> minus 4" (D-321, CR 107.1b: a calculation that would be negative uses 0): a whole number of 1 or more taken away, in digits as the
 * cards write it ("the number of cards in your hand minus 4"). Without the suffix it is the atom or the sum itself.
 */
const MINUS_OR_SUM = (rule: string): Parser<IrAmount> => {
  const base = SUM_OR_ATOM(rule);
  return (ctx, pos) => {
    const first = base(ctx, pos);
    if (!first.ok) return first;
    const minus = pattern(/ minus ([1-9][0-9]*)(?![\p{L}\p{N}])/u)(ctx, first.pos);
    if (!minus.ok) return first;
    return {
      ok: true,
      value: {
        kind: 'minus',
        of: first.value,
        by: Number(minus.value[1]),
        span: { start: pos, end: minus.pos },
      },
      pos: minus.pos,
    };
  };
};

/**
 * "<value> or <value>, whichever is greater" (CR 608.2c, 107.1: both are worked out as the instruction runs and the greater, or with "less" the lesser, is
 * used): two amounts of the kinds `MINUS_OR_SUM` reads, joined by "or" and closed by the "whichever" clause the text always carries. Without the clause
 * the words are not read (an "or" alone chooses between things, not numbers).
 */
const EXTREME = (rule: string): Parser<IrAmount> => {
  const part = MINUS_OR_SUM(rule);
  return (ctx, pos) => {
    const first = part(ctx, pos);
    if (!first.ok) return first;
    const or = literal(' or ')(ctx, first.pos);
    if (!or.ok) return or;
    const second = part(ctx, or.pos);
    if (!second.ok) return second;
    const tail = pattern(/, whichever is (greater|less)(?![\p{L}\p{N}])/u)(ctx, second.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: {
        kind: 'extreme',
        pick: tail.value[1] === 'greater' ? 'greater' : 'lesser',
        of: [first.value, second.value],
        span: { start: pos, end: tail.pos },
      },
      pos: tail.pos,
    };
  };
};

/** Any value phrase: arithmetic first, then the atoms (and their sums, less a number). */
export const VALUE = (rule: string): Parser<IrAmount> =>
  choice(HALF(rule), MULTIPLE(rule), EXTREME(rule), MINUS_OR_SUM(rule));

/** The kinds the older "equal to ..." rules read, which `amount.equal-to` leaves to them. */
const OLDER_EQUAL_KINDS: ReadonlySet<string> = new Set([
  'countOf',
  'powerOf',
  'manaValueOf',
  'lifeLostThisWay',
]);

/**
 * `amount.equal-to`: "equal to the greatest power among creatures you control", "equal to that creature's
 * toughness", "equal to your devotion to black", "equal to half the number of Zombies you control, rounded down",
 * "equal to the number of Zombies you control plus the number of lands you control", "equal to the number of
 * colors in your commanders' color identity": the value phrases that `amount.number-of`, `amount.power-of` and
 * `amount.mana-value-of` do not read (CR 107.1, 208.1, 700.5, 903.4, 608.2c: the amount is worked out as the
 * instruction runs). After "gain life", "lose life", "draw cards", "mill", "deals damage" and the like.
 */
export const AMOUNT_EQUAL_TO = defineRule<IrAmount>({
  id: 'amount.equal-to',
  family: 'amount',
  leading: ['equal'],
  cites: [
    'CR 107.1a (Numbers and Symbols)',
    'CR 208.1 (Power/Toughness)',
    'CR 700.5 (Devotion)',
    'CR 903.4 (Commander)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'equal to the amount of life you gained this turn',
    'equal to the number of nontoken creatures you had enter the battlefield under your control this turn',
    'equal to the greatest power among creatures you control',
    'equal to the total power of creatures you control',
    'equal to the greatest mana value among artifacts you control',
    "equal to that creature's toughness",
    'equal to its toughness',
    "equal to the sacrificed creature's power",
    'equal to your devotion to black',
    'equal to your devotion to black and red',
    'equal to half the number of creatures you control, rounded down',
    'equal to the number of cards in your hand plus the number of lands you control minus 1',
    'equal to half the number of cards in your hand, rounded up',
    'equal to the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards',
    'equal to the number of colors in your commanders’ color identity',
    'equal to the number of opponents you have',
    'equal to twice the number of creatures you control',
    'equal to the number of +1/+1 counters on ~',
    // Stage P44 (D-195, CR 701.38a): the votes for one option of the vote earlier in the text.
    'equal to the number of profit votes',
    'equal to twice the number of security votes',
    'equal to the number of profit votes plus the number of security votes',
    'equal to half the number of gold votes, rounded down',
    // CR 608.2c: the greater (or the lesser) of two amounts.
    'equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater',
    'equal to the number of creatures you control or the number of cards in your hand, whichever is less',
  ],
  rejects: [
    'equal to the number of Zombies you control or the number of Zombie cards in your graveyard',
    'equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is smaller',
    'equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater and',
    'equal to the number of Zombies you control, whichever is greater',
    'equal to the number of lands you control',
    'equal to the number of opponents',
    'equal to the number of opponents you control',
    'equal to its power',
    "equal to that creature's power",
    'equal to its mana value',
    'equal to the total life lost this way',
    'equal to the greatest power among creatures',
    'equal to the greatest power of creatures you control',
    'equal to the total power',
    'equal to your devotion to',
    'equal to your devotion to black and black',
    'equal to half the number of creatures you control',
    'equal to half the number of creatures you control, rounded',
    'equal to the number of creatures you control plus',
    'equal to the number of creatures you control plus 1',
    'equal to the number of cards in your hand plus the number of lands you control minus',
    'equal to the number of cards in your hand plus the number of lands you control minus 0',
    'equal to one times the number of creatures you control',
    'equal to its',
    'the greatest power among creatures you control',
    'equal to the number of votes',
    'equal to the number of profit vote',
    'equal to the number of your votes',
    'equal to the number of all votes',
    'equal to the number of profit or security votes',
    'equal to the number of profit votes for',
    'equal to the number of Profit votes cast',
  ],
  // Read quietly: a value this rule does not read stops where the older "equal to ..." rules stop, as it did before it.
  parse: quiet((ctx, pos) => {
    const head = literal('equal to ')(ctx, pos);
    if (!head.ok) return head;
    const value = VALUE('amount.equal-to')(ctx, head.pos);
    if (!value.ok) return value;
    // "equal to the sacrificed creature's power" (CR 602.2c, 113.7a): the older rules read only "its" and "that creature's", so this one reads the sacrificed object.
    const sacrificedStat =
      (value.value.kind === 'powerOf' || value.value.kind === 'manaValueOf') &&
      value.value.of.det === 'sacrificed';
    if (OLDER_EQUAL_KINDS.has(value.value.kind) && !sacrificedStat) return fail(ctx, pos);
    return value;
  }),
});

/**
 * `amount.where-x`: "where X is the number of Zombies you control", "where X is the greatest power among
 * creatures you control", "where X is that creature's power", "where X is your devotion to black", "where X is half
 * the number of Zombies you control, rounded down" (CR 107.3c: the text defines X, and "that's the value of X while
 * that spell or ability is on the stack": it is read wherever the sentence says X, as that instruction runs, so it
 * may change between two instructions). It ends a sentence after a comma, and the node it makes is the amount X
 * stands for.
 */
export const AMOUNT_WHERE_X = defineRule<IrAmount>({
  id: 'amount.where-x',
  family: 'amount',
  leading: ['where'],
  cites: [
    'CR 107.3c (Numbers and Symbols)',
    'CR 107.3 (Numbers and Symbols)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'where X is the number of Zombies you control',
    // CR 102.2: the opponents still in the game.
    'where X is the number of opponents you have',
    'where X is the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater',
    'where X is the number of creatures on the battlefield',
    'where X is the number of creatures attacking you',
    'where X is the greatest power among creatures you control',
    'where X is the total power of creatures you control',
    "where X is that creature's power",
    "where X is that creature's toughness",
    'where X is the sacrificed creature’s power',
    'where X is its power',
    'where X is your devotion to black',
    'where X is half the number of Zombies you control, rounded down',
    // Issue 25 (D-321, CR 107.1b): a number taken away, a negative result counting as 0.
    'where X is the number of cards in your hand minus 4',
    'where X is the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards',
    'where X is the number of +1/+1 counters on ~',
    'where X is that card’s mana value',
    // Prismari deck, group 2 (D-646, CR 202.3): the spell that caused a cast trigger.
    "where X is that spell's mana value",
    'where X is the amount of mana spent to cast that spell',
    "where X is the greatest mana value among instant and sorcery spells you've cast this turn",
    // Stage P39 (D-184, CR 601.2h): the mana spent to cast the spell the ability is on.
    'where X is the amount of mana spent to cast it',
    // Issue 310 (Converge, CR 105.1): how many of the five colors the mana spent had.
    'where X is the number of colors of mana spent to cast it',
    'where X is the number of colors of mana spent to cast ~',
    // Stage P37 (D-180): the card an earlier instruction exiled.
    "where X is the exiled card's power",
    // Stage P32 (D-147): the commanders' mana value, and a total read as the spell is cast.
    'where X is the greatest mana value among your commanders',
    'where X is the greatest power among creatures you control as you cast ~',
    // Galadriel deck group 3 (CR 706.2): the die rolled before.
    'where X is the result',
    // CR 205.2a: the card types of the cards of a graveyard.
    'where X is the number of card types among cards in your graveyard',
    // Death Toll deck, group D (CR 202.3, 608.2h): what a destroy before it in the text destroyed.
    'where X is the total mana value of permanents destroyed this way',
    // CR 109.4, 608.2c: the permanents of the player a target before it names.
    'where X is the greatest power among creatures they control',
    // CR 119.9: the life of the gain a "whenever you gain life" trigger is about.
    'where X is the amount of life you gained',
  ],
  rejects: [
    'where X is the total mana value of creatures destroyed this way',
    'where X is the total mana value of permanents destroyed',
    'where X is the greatest mana value of permanents destroyed this way',
    'where X is the results',
    'where X is the result of',
    'where X is',
    'where X is 3',
    'where X is the number of creatures',
    'where X is the number of opponents',
    'where X is the number of opponents you control',
    'where Y is the number of Zombies you control',
    'where x is the number of Zombies you control',
    'where X is half the number of Zombies you control',
    'where X is the greatest power among creatures you control as you cast it',
    'where X is the greatest mana value among commanders',
    'where X is the number of Zombies you control.',
    'where X is the number of cards in your hand minus',
    'where X is the number of cards in your hand minus 0',
    'where X is the number of cards in your hand minus four',
    'where X is the number of cards in your hand minus X',
    'X is the number of Zombies you control',
    'where X is the amount of mana spent',
    'where X is the mana spent to cast it',
    'where X is your life',
    'where X is the amount of life you gain',
    'where X is the amount of life you gained last turn',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/where X is /)(ctx, pos);
    if (!head.ok) return head;
    return VALUE('amount.where-x')(ctx, head.pos);
  },
});

const SINGLE_TYPE = '(?:creature|permanent|artifact|enchantment|land|planeswalker)';

/**
 * `amount.for-each-counter`: "for each +1/+1 counter on ~", "for each charge counter on it" (CR 122.1: the counters
 * of one kind an object has, now). After a quantity ("Angel spells you cast cost {1} less to cast for each ...",
 * "draw a card for each ..."): the quantity is the count, as for `amount.for-each`.
 */
export const AMOUNT_FOR_EACH_COUNTER = defineRule<IrAmount>({
  id: 'amount.for-each-counter',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 122.1 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'for each +1/+1 counter on ~',
    'for each charge counter on it',
    'for each -1/-1 counter on ~',
  ],
  rejects: [
    'for each +1/+1 counter',
    'for each +1/+1 counters on ~',
    'for each +1/+1 counter on target creature',
    'for each creature on ~',
    'for each counter on ~',
    'for each +1/+1 counter on ~ you control',
  ],
  // Quiet: a "for each" this rule does not read stops where `amount.for-each` stops.
  parse: quiet(countersOn('amount.for-each-counter', literal('for each '), false)),
});

/**
 * `amount.for-each-opponent`: "for each opponent who has more cards in hand than you", "for each opponent who has
 * more life than you", "for each opponent who controls more creatures than you" (CR 102.2: the opponents still in
 * the game; the engine counts those whose total is greater than yours, now).
 */
export const AMOUNT_FOR_EACH_OPPONENT = defineRule<IrAmount>({
  id: 'amount.for-each-opponent',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 102.2 (Players)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'for each opponent who has more cards in hand than you',
    'for each opponent who has more life than you',
    'for each opponent who controls more creatures than you',
    // Issue 160 (D-626): the opponents with less.
    'for each opponent who controls fewer creatures than you',
    'for each opponent who has fewer cards in hand than you',
  ],
  rejects: [
    'for each opponent',
    'for each opponent who has more cards in hand',
    'for each opponent who has more cards in hand than each other player',
    'for each opponent who has more lands than you',
    'for each opponent who has fewer lands than you',
    'for each player who has more life than you',
    'for each opponent who controls more creatures',
    'for each opponent who has more creatures than you',
    'for each opponent who controls more life than you',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /for each opponent who (?:(?:has|controls) (more|fewer) (life|cards in hand|creatures)) than you(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const word = (r.value.value[2] ?? '').toLowerCase();
    const fewer = (r.value.value[1] ?? '').toLowerCase() === 'fewer';
    // "has more life", "has more cards in hand", "controls more creatures" (and "fewer"): the verb goes with its stat.
    const verb = /(has|controls)/i.exec(r.value.value[0] ?? '')?.[1]?.toLowerCase();
    if ((word === 'creatures') !== (verb === 'controls')) return fail(ctx, pos);
    const stat = word === 'life' ? 'life' : word === 'creatures' ? 'creatures' : 'cardsInHand';
    return {
      ok: true,
      value: {
        kind: 'opponentsWithMore',
        stat,
        ...(fewer ? { fewer: true as const } : {}),
        span: r.value.span,
      },
      pos: r.pos,
    };
  },
});

/**
 * `amount.for-each-this-way`: "for each creature sacrificed this way", "for each creature destroyed this way", "for
 * each opponent who drew a card this way" (CR 608.2c: what the instructions before it in the same text did). The
 * lowering checks that an instruction of that kind comes before it and says what the words name.
 */
export const AMOUNT_FOR_EACH_THIS_WAY = defineRule<IrAmount>({
  id: 'amount.for-each-this-way',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 701.21 (Sacrifice)',
    'CR 701.8 (Destroy)',
  ],
  examples: [
    'for each creature sacrificed this way',
    'for each permanent sacrificed this way',
    'for each card exiled this way',
    'for each card discarded this way',
    'for each counter removed this way',
    'for each creature destroyed this way',
    'for each opponent who drew a card this way',
    'for each player who drew a card this way',
    'for each creature card put into a graveyard this way',
    'for each card returned this way',
  ],
  rejects: [
    'for each card returned',
    'for each creature returned this way',
    'for each cards returned this way',
    'for each card put into a graveyard this way',
    'for each land card put into a graveyard this way',
    'for each creature put into a graveyard this way',
    'for each creature cards put into a graveyard this way',
    'for each creature card put into a graveyard',
    'for each creature sacrificed',
    'for each creature exiled this way',
    'for each opponent who drew this way',
    'for each opponent who drew a card',
    'for each creatures sacrificed this way',
    'for each card drawn this way',
    'for each card discarded',
    'for each counter removed',
    'for each counters removed this way',
    'for each cards discarded this way',
    'for each creature card discarded this way',
    'for each opponent who discarded a card this way',
  ],
  parse: (ctx, pos) => {
    const exiled = pattern(/for each card exiled this way(?![\\p{L}\\p{N}])/iu)(ctx, pos);
    if (exiled.ok) {
      return {
        ok: true,
        value: { kind: 'exiledAsCost', span: { start: pos, end: exiled.pos } },
        pos: exiled.pos,
      };
    }
    // Issue 244 (Syphon Mind, CR 701.9, 608.2c): "for each card discarded this way": the cards the discard before it made players discard.
    const discarded = pattern(/for each card discarded this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (discarded.ok) {
      return {
        ok: true,
        value: {
          kind: 'thisWay',
          what: 'discarded',
          words: ['card'],
          span: { start: pos, end: discarded.pos },
        },
        pos: discarded.pos,
      };
    }
    // Nexus Mentality (CR 122.1, 608.2c): "for each counter removed this way": the counters the `remove all counters` before it took off.
    const removed = pattern(/for each counter removed this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (removed.ok) {
      return {
        ok: true,
        value: {
          kind: 'thisWay',
          what: 'countersRemoved',
          words: ['counter'],
          span: { start: pos, end: removed.pos },
        },
        pos: removed.pos,
      };
    }
    // Revival Experiment (CR 608.2c): "for each card returned this way": the cards the return before it put onto the battlefield.
    const returned = pattern(/for each card returned this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (returned.ok) {
      return {
        ok: true,
        value: {
          kind: 'thisWay',
          what: 'returned',
          words: ['card'],
          span: { start: pos, end: returned.pos },
        },
        pos: returned.pos,
      };
    }
    // Dread Summons (CR 701.17a, 608.2c): "for each creature card put into a graveyard this way": the creature cards the mill before it put there.
    const milled = pattern(
      /for each creature card put into a graveyard this way(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (milled.ok) {
      return {
        ok: true,
        value: {
          kind: 'thisWay',
          what: 'milledCreature',
          words: ['creature'],
          span: { start: pos, end: milled.pos },
        },
        pos: milled.pos,
      };
    }
    const r = spanned(
      pattern(
        new RegExp(
          `for each (?:(${SINGLE_TYPE}) (sacrificed|destroyed)|(opponent|player) who drew a card) this way${BOUNDARY}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const m = r.value.value;
    const span = r.value.span;
    if (m[3] !== undefined) {
      const who = (m[3] ?? '').toLowerCase() === 'opponent' ? 'opponent' : 'player';
      return {
        ok: true,
        value: { kind: 'thisWay', what: 'playersDrew', words: [], who, span },
        pos: r.pos,
      };
    }
    const what = (m[2] ?? '').toLowerCase() === 'sacrificed' ? 'sacrificed' : 'destroyed';
    return {
      ok: true,
      value: { kind: 'thisWay', what, words: [(m[1] ?? '').toLowerCase()], span },
      pos: r.pos,
    };
  },
});

export const VALUE_AMOUNT_RULES = [AMOUNT_EQUAL_TO, AMOUNT_WHERE_X];
export const FOR_EACH_VALUE_RULES = [
  AMOUNT_FOR_EACH_COUNTER,
  AMOUNT_FOR_EACH_OPPONENT,
  AMOUNT_FOR_EACH_THIS_WAY,
];
