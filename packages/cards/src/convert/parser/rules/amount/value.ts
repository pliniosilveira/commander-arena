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
import { countAmount, counted } from './count';
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

/** "the number of +1/+1 counters on ~". */
const NUMBER_OF_COUNTERS = (rule: string): Parser<IrAmount> =>
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
  /(its|that (?:creature|permanent|card)['’]s) mana value(?![\p{L}\p{N}])/iu;

/** "its mana value", "that card's mana value" (CR 202.3). */
const MANA_VALUE_OF =
  (rule: string): Parser<IrAmount> =>
  (ctx, pos) => {
    const m = pattern(MANA_VALUE_OF_HEAD)(ctx, pos);
    if (!m.ok) return m;
    const of = possessedNoun(rule, m.value[1] ?? '', pos);
    return {
      ok: true,
      value: { kind: 'manaValueOf', of, span: { start: pos, end: m.pos } },
      pos: m.pos,
    };
  };

/** One number read from the game: what "plus", "half" and "twice" combine. */
const ATOM = (rule: string): Parser<IrAmount> =>
  choice(
    // Stage P44 (D-195): "the number of profit votes" (the words "votes" end it, so no count of objects is mistaken for it).
    VOTES_AMOUNT,
    NUMBER_OF_COUNTERS(rule),
    NUMBER_OF(rule),
    AGGREGATE(rule),
    DEVOTION,
    COMMANDER_COLORS,
    COMMANDER_MANA_VALUE,
    STAT_OF(rule),
    MANA_VALUE_OF(rule),
    // Stage P39 (D-184): "the amount of mana spent to cast it".
    MANA_SPENT_AMOUNT,
    // Stage P68 (D-230): "the amount of damage ~ dealt to that player".
    DAMAGE_DEALT_AMOUNT,
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
    const first = atom(ctx, pos);
    if (!first.ok) return first;
    const parts: IrAmount[] = [first.value];
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

/** Any value phrase: arithmetic first, then the atoms (and their sums). */
export const VALUE = (rule: string): Parser<IrAmount> =>
  choice(HALF(rule), MULTIPLE(rule), SUM_OR_ATOM(rule));

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
    'equal to the greatest power among creatures you control',
    'equal to the total power of creatures you control',
    'equal to the greatest mana value among artifacts you control',
    "equal to that creature's toughness",
    'equal to its toughness',
    'equal to your devotion to black',
    'equal to your devotion to black and red',
    'equal to half the number of creatures you control, rounded down',
    'equal to half the number of cards in your hand, rounded up',
    'equal to the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards',
    'equal to the number of colors in your commanders’ color identity',
    'equal to twice the number of creatures you control',
    'equal to the number of +1/+1 counters on ~',
    // Stage P44 (D-195, CR 701.38a): the votes for one option of the vote earlier in the text.
    'equal to the number of profit votes',
    'equal to twice the number of security votes',
    'equal to the number of profit votes plus the number of security votes',
    'equal to half the number of gold votes, rounded down',
  ],
  rejects: [
    'equal to the number of lands you control',
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
    if (OLDER_EQUAL_KINDS.has(value.value.kind)) return fail(ctx, pos);
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
    'where X is the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards',
    'where X is the number of +1/+1 counters on ~',
    'where X is that card’s mana value',
    // Stage P39 (D-184, CR 601.2h): the mana spent to cast the spell the ability is on.
    'where X is the amount of mana spent to cast it',
    // Stage P37 (D-180): the card an earlier instruction exiled.
    "where X is the exiled card's power",
    // Stage P32 (D-147): the commanders' mana value, and a total read as the spell is cast.
    'where X is the greatest mana value among your commanders',
    'where X is the greatest power among creatures you control as you cast ~',
  ],
  rejects: [
    'where X is',
    'where X is 3',
    'where X is the number of creatures',
    'where Y is the number of Zombies you control',
    'where x is the number of Zombies you control',
    'where X is half the number of Zombies you control',
    'where X is the greatest power among creatures you control as you cast it',
    'where X is the greatest mana value among commanders',
    'where X is the number of Zombies you control.',
    'X is the number of Zombies you control',
    'where X is the amount of mana spent',
    'where X is the amount of mana spent to cast that spell',
    'where X is the mana spent to cast it',
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
  ],
  rejects: [
    'for each opponent',
    'for each opponent who has more cards in hand',
    'for each opponent who has more cards in hand than each other player',
    'for each opponent who has fewer cards in hand than you',
    'for each opponent who has more lands than you',
    'for each player who has more life than you',
    'for each opponent who controls more creatures',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /for each opponent who (?:has more (life|cards in hand)|controls more (creatures)) than you(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const word = (r.value.value[1] ?? r.value.value[2] ?? '').toLowerCase();
    const stat = word === 'life' ? 'life' : word === 'creatures' ? 'creatures' : 'cardsInHand';
    return {
      ok: true,
      value: { kind: 'opponentsWithMore', stat, span: r.value.span },
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
    'for each creature destroyed this way',
    'for each opponent who drew a card this way',
    'for each player who drew a card this way',
  ],
  rejects: [
    'for each creature sacrificed',
    'for each creature exiled this way',
    'for each opponent who drew this way',
    'for each opponent who drew a card',
    'for each creatures sacrificed this way',
    'for each card drawn this way',
    'for each opponent who discarded a card this way',
  ],
  parse: (ctx, pos) => {
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
