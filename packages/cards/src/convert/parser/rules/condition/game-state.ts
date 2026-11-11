/**
 * Conditions about the state of the game (stage P28, D-131): a designation a player has ("if you're the monarch",
 * CR 725.1) and an amount of the game compared with a number ("if you have seven or more creature cards in your
 * graveyard", "if creatures you control have total power 8 or greater", "if an opponent controls more creatures than
 * you"). They are read after the "if" of an intervening "if" (CR 603.4: checked as the ability triggers and again as
 * it resolves) and of a sentence of a body ("If you're the monarch, create a 4/4 Dragon token instead.", CR 608.2c:
 * checked as that instruction runs). The amounts are those of the amount family (`amount/count.ts`): one phrase for
 * what is counted, whatever the condition.
 */
import {
  choice,
  fail,
  literal,
  map,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrComparison, IrCondition, IrNoun } from '../../ir/types';
import { counted } from '../amount/count';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

function condition(
  rule: string,
  start: number,
  end: number,
  test: IrCondition['test'],
): IrCondition {
  return { kind: 'condition', test, span: { start, end }, rule };
}

/** "N or more", "N or greater", "N or less", "N or fewer": the comparison of a whole number (CR 107.1). */
function numberCompare(): Parser<IrComparison> {
  return map(
    sequence(
      satisfy(quantity, (n) => n >= 1),
      pattern(/ or (more|greater|less|fewer)(?![\p{L}\p{N}])/iu),
    ),
    ([value, word]): IrComparison => ({
      cmp: ['more', 'greater'].includes((word[1] ?? '').toLowerCase()) ? 'atLeast' : 'atMost',
      value,
    }),
  );
}

const DESIGNATION =
  /(you(?:['’]re| are)(?: not)?|you aren['’]t|an opponent is|a player is) the monarch(?![\p{L}\p{N}])/iu;

/**
 * `condition.designation`: "you're the monarch", "you are the monarch", "an opponent is the monarch", "a player is
 * the monarch", and the negatives "you're not the monarch", "you aren't the monarch" (CR 725.1: the monarch is a
 * designation a player has, not an object; only one player has it, CR 725.3). "You" is the controller of the
 * ability, "an opponent" any opponent, "a player" any player: the engine's `playerHasDesignation` holds when the holder
 * is one of the players the selector names. Nobody has it until an effect gives it (CR 725.1).
 */
export const CONDITION_DESIGNATION = defineRule<IrCondition>({
  id: 'condition.designation',
  family: 'condition',
  leading: ['you', 'you’re', "you're", 'an', 'a'],
  cites: [
    'CR 725.1 (The Monarch)',
    'CR 725.3 (The Monarch)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    "you're the monarch",
    'you’re the monarch',
    'you are the monarch',
    'an opponent is the monarch',
    'a player is the monarch',
    "you're not the monarch",
    "you aren't the monarch",
    'you are not the monarch',
  ],
  rejects: [
    'you become the monarch',
    "you're the monarch.",
    "you're monarch",
    'you are the initiative',
    'an opponent is not the monarch',
    'each opponent is the monarch',
    'target player is the monarch',
    "you're the monarch of the realm",
    'the monarch',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(DESIGNATION))(ctx, pos);
    if (!r.ok) return r;
    const words = (r.value.value[1] ?? '').toLowerCase();
    const det = words.startsWith('you')
      ? 'you'
      : words.startsWith('an opponent')
        ? 'eachOpponent'
        : 'eachPlayer';
    const span = r.value.span;
    const who: IrNoun = {
      kind: 'noun',
      det,
      filter: { raw: det === 'you' ? 'you' : det === 'eachOpponent' ? 'an opponent' : 'a player' },
      upTo: false,
      plural: false,
      other: false,
      span,
      rule: 'condition.designation',
    };
    const has = condition('condition.designation', pos, r.pos, {
      kind: 'designation',
      who,
      designation: 'monarch',
    });
    const negative = /(?: not|aren['’]t)$/.test(words);
    return {
      ok: true,
      value: negative
        ? condition('condition.designation', pos, r.pos, { kind: 'not', term: has })
        : has,
      pos: r.pos,
    };
  },
});

/**
 * `condition.amount-count`: "you have seven or more creature cards in your graveyard", "you have three or more
 * cards in your hand" (CR 603.4): a count of the cards you have in a zone compared with a number. The count is the
 * one of "the number of ...", `countOf`, worked out when the condition is read. The engine's `amountIs`.
 */
export const CONDITION_AMOUNT_COUNT = defineRule<IrCondition>({
  id: 'condition.amount-count',
  family: 'condition',
  leading: ['you', 'there'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'you have seven or more creature cards in your graveyard',
    'you have 3 or more cards in your hand',
    'you have two or fewer cards in your hand',
    'you have four or more Zombie cards in your graveyard',
    // Stage P36 (D-178): the same count said of the game ("Threshold").
    'there are seven or more cards in your graveyard',
    'there are four or more creature cards in your graveyard',
  ],
  rejects: [
    'you have seven or more',
    'you have seven creature cards in your graveyard',
    'you have zero or more cards in your hand',
    'you have seven or more creature cards',
    'you have two or more opponents',
    'you have seven or more life',
    'you control seven or more creatures',
    'you have seven or more creature cards in your graveyard.',
    'you have more cards in your hand than each opponent',
    'there are seven or more',
    'there are seven cards in your graveyard',
    'there is one or more card in your graveyard',
    'there are seven or more creature cards',
    'there are seven or more cards in a graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      choice(literal('you have '), literal('there are ')),
      numberCompare(),
      literal(' '),
      counted('condition.amount-count', true),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, compare, , of] = r.value;
    // Only cards in a zone: "you have seven or more creatures" is not English; a controlled group is "you control".
    if (of.filter.card !== true) return fail(ctx, pos);
    const amount: IrAmount = { kind: 'countOf', of, span: of.span };
    return {
      ok: true,
      value: condition('condition.amount-count', pos, r.pos, { kind: 'amountIs', amount, compare }),
      pos: r.pos,
    };
  },
});

/**
 * `condition.total-stat`: "creatures you control have total power 8 or greater", "creatures you control have total
 * toughness 10 or greater" (CR 208.1: the sum of the stat over the group, now; a creature with no such stat counts
 * nothing). The engine's `amountIs` of an `aggregate`.
 */
export const CONDITION_TOTAL_STAT = defineRule<IrCondition>({
  id: 'condition.total-stat',
  family: 'condition',
  leading: [],
  cites: ['CR 208.1 (Power/Toughness)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'creatures you control have total power 8 or greater',
    'creatures you control have total toughness 10 or greater',
    'Dragons you control have total power 12 or greater',
    'creatures you control have total power 3 or less',
  ],
  rejects: [
    'creatures you control have total power',
    'creatures you control have total power 8',
    'creatures you control have total mana value 8 or greater',
    'creatures you control has total power 8 or greater',
    'creatures have total power 8 or greater',
    'you have total power 8 or greater',
    'creatures you control have total power 8 or greater.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      counted('condition.total-stat', true),
      pattern(/ have total (power|toughness) /iu),
      numberCompare(),
    )(ctx, pos);
    if (!r.ok) return r;
    const [of, stat, compare] = r.value;
    const span = { start: pos, end: r.pos };
    const amount: IrAmount = {
      kind: 'aggregate',
      how: 'total',
      stat: (stat[1] ?? '').toLowerCase() as 'power' | 'toughness',
      of,
      span,
    };
    return {
      ok: true,
      value: condition('condition.total-stat', pos, r.pos, { kind: 'amountIs', amount, compare }),
      pos: r.pos,
    };
  },
});

const OPPONENT_HAS_MORE =
  /an opponent (?:has more (life|cards in hand)|controls more (creatures)) than you(?![\p{L}\p{N}])/iu;

/**
 * `condition.opponent-has-more`: "an opponent controls more creatures than you", "an opponent has more life than
 * you", "an opponent has more cards in hand than you" (CR 102.2, 603.4): at least one opponent has more than the
 * controller of the ability, now. The engine's `amountIs` of `opponentsWithMore` that is at least 1.
 */
export const CONDITION_OPPONENT_HAS_MORE = defineRule<IrCondition>({
  id: 'condition.opponent-has-more',
  family: 'condition',
  leading: ['an'],
  cites: ['CR 102.2 (Players)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'an opponent controls more creatures than you',
    'an opponent has more life than you',
    'an opponent has more cards in hand than you',
  ],
  rejects: [
    'an opponent controls more creatures',
    'an opponent has more life',
    'an opponent has more lands than you',
    'each opponent has more life than you',
    'an opponent has fewer cards in hand than you',
    'an opponent controls more creatures than each other player',
    'an opponent controls more creatures than you.',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(OPPONENT_HAS_MORE))(ctx, pos);
    if (!r.ok) return r;
    const word = (r.value.value[1] ?? r.value.value[2] ?? '').toLowerCase();
    const stat = word === 'life' ? 'life' : word === 'creatures' ? 'creatures' : 'cardsInHand';
    const amount: IrAmount = { kind: 'opponentsWithMore', stat, span: r.value.span };
    return {
      ok: true,
      value: condition('condition.opponent-has-more', pos, r.pos, {
        kind: 'amountIs',
        amount,
        compare: { cmp: 'atLeast', value: 1 },
      }),
      pos: r.pos,
    };
  },
});

export const GAME_STATE_CONDITION_RULES = [
  CONDITION_DESIGNATION,
  CONDITION_AMOUNT_COUNT,
  CONDITION_TOTAL_STAT,
  CONDITION_OPPONENT_HAS_MORE,
];

/** The conditions a sentence of a body may start with: "If you're the monarch, ..." (CR 608.2c). */
export const LEAD_GAME_STATE_CONDITIONS = GAME_STATE_CONDITION_RULES.map((r) => r.id);
