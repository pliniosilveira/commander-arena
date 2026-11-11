/**
 * Conditions of the Hofri Ghostforge deck (stage P68, D-229): "there are fewer than eight cards in your graveyard" (CR 404.1: the cards in a player's
 * graveyard). The engine's `cardsInGraveyard`, which reads the graveyard of the controller and no characteristic, so a static ability of layer 4 may have it.
 * Stage P73 (D-236): "your opponents control eight or more lands" (CR 109.4, 102.2), the engine's `amountIs` of a count of the lands all the opponents control.
 */
import { fail, literal, map, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrComparison, IrCondition, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

const COUNT: Parser<number> = satisfy(quantity, (n) => n >= 1);

/** "fewer than eight" is at most seven. ("N or more" is `condition.amount-count`'s, an amount comparison that a static ability of layer 4 may not read.) */
const COMPARE: Parser<IrComparison> = (ctx, pos) => {
  const r = pattern(/fewer than /iu)(ctx, pos);
  if (!r.ok) return r;
  const n = COUNT(ctx, r.pos);
  if (!n.ok) return n;
  return n.value < 2
    ? fail(ctx, pos)
    : { ok: true, value: { cmp: 'atMost', value: n.value - 1 }, pos: n.pos };
};

/**
 * `condition.cards-in-graveyard`: "there are fewer than eight cards in your graveyard" (CR 404.1). Not read:
 * a kind of card ("creature cards"), another player's graveyard, "at least", a number of one with "fewer than", a missing "there are".
 */
export const CONDITION_CARDS_IN_GRAVEYARD = defineRule<IrCondition>({
  id: 'condition.cards-in-graveyard',
  family: 'condition',
  leading: ['there'],
  cites: ['CR 404.1 (Graveyard)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    'there are fewer than eight cards in your graveyard',
    'there are fewer than 8 cards in your graveyard',
  ],
  rejects: [
    'there are fewer than eight creature cards in your graveyard',
    "there are fewer than eight cards in an opponent's graveyard",
    'there are fewer than eight cards in a graveyard',
    'there are at least eight cards in your graveyard',
    'there are eight or more cards in your graveyard',
    'there are fewer than one cards in your graveyard',
    'fewer than eight cards are in your graveyard',
    'there are eight cards in your graveyard',
    'there are fewer than eight cards in your graveyard.',
    'there are fewer than eight cards in your library',
  ],
  parse: (ctx, pos) => {
    const r = spanned((c, p) => {
      const head = pattern(/there are /iu)(c, p);
      if (!head.ok) return head;
      const compare = COMPARE(c, head.pos);
      if (!compare.ok) return compare;
      const tail = pattern(/ cards in your graveyard(?![\p{L}\p{N}])/iu)(c, compare.pos);
      return tail.ok ? { ok: true as const, value: compare.value, pos: tail.pos } : tail;
    })(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'cardsInGraveyard', compare: r.value.value },
        span: r.value.span,
        rule: 'condition.cards-in-graveyard',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.that-player-more-lands`: "that player controls more lands than you" (CR 603.4, 109.4: the intervening "if" of a trigger about a land that entered; "that
 * player" is the one who controls it). The engine's `subjectControllerHasMore` of `lands`. Not read: another count ("more creatures"), "at least as many", another
 * player than "that player", "you control fewer lands than that player".
 */
export const CONDITION_THAT_PLAYER_MORE_LANDS = defineRule<IrCondition>({
  id: 'condition.that-player-more-lands',
  family: 'condition',
  leading: ['that'],
  cites: ['CR 603.4 (Triggered Abilities)', 'CR 109.4 (Objects)', 'CR 305.1 (Lands)'],
  examples: ['that player controls more lands than you'],
  rejects: [
    'that player controls more creatures than you',
    'that player controls at least as many lands as you',
    'that player controls more lands than each opponent',
    'that player controls more lands than you.',
    'that player has more lands than you',
    'an opponent controls more lands than you',
    'you control fewer lands than that player',
    'that player controls more lands',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/that player controls more lands than you(?![\p{L}\p{N}])/iu))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'subjectControllerHasMore', stat: 'lands' },
        span: r.value.span,
        rule: 'condition.that-player-more-lands',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.opponents-control-at-least`: "your opponents control eight or more lands" (CR 109.4: the objects a player controls; CR 102.2: in a
 * game of more players every opponent is one, and the text says "your opponents", so their permanents are counted together, which is not "an
 * opponent controls", one opponent's, `condition.opponent-controls-at-least`). The engine's `amountIs` of a `countOf` of the matching permanents
 * with the opponents as their controllers, read through `controllerOf`. A count of one or more of a plural phrase that names no controller and no
 * "other" of its own. Not read: "at most", "fewer", "an opponent controls", "each opponent controls", "you control", a missing count or "or more".
 */
export const CONDITION_OPPONENTS_CONTROL_AT_LEAST = defineRule<IrCondition>({
  id: 'condition.opponents-control-at-least',
  family: 'condition',
  leading: ['your'],
  cites: ['CR 109.4 (Objects)', 'CR 102.2 (Players)', 'CR 614.12 (Replacement Effects)'],
  examples: [
    'your opponents control eight or more lands',
    'your opponents control four or more creatures',
    'your opponents control 8 or more lands',
    'your opponents control three or more nonbasic lands',
  ],
  rejects: [
    'your opponents control eight or more lands.',
    'your opponents control eight lands',
    'your opponents control eight or fewer lands',
    'your opponents control eight or more',
    'your opponents control eight or more land',
    'your opponents control eight or more other lands',
    'your opponents control eight or more lands you control',
    'your opponents control a land',
    'your opponents control zero or more lands',
    'your opponent controls eight or more lands',
    'an opponent controls eight or more lands',
    'each opponent controls eight or more lands',
    'you control eight or more lands',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('your opponents control '),
      spanned(COUNT),
      literal(' or more '),
      satisfy(
        map(permanentPhrase(true, 'all'), withoutZone),
        (filter) => filter.controller === undefined,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count, , filter] = r.value;
    const span = { start: pos, end: r.pos };
    const of: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { ...filter, controller: 'opponent' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: 'condition.opponents-control-at-least',
    };
    const amount: IrAmount = { kind: 'countOf', of, span };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'amountIs', amount, compare: { cmp: 'atLeast', value: count.value } },
        span,
        rule: 'condition.opponents-control-at-least',
      },
      pos: r.pos,
    };
  },
});

export const HOFRI_CONDITION_RULES = [
  CONDITION_CARDS_IN_GRAVEYARD,
  CONDITION_THAT_PLAYER_MORE_LANDS,
  CONDITION_OPPONENTS_CONTROL_AT_LEAST,
];
