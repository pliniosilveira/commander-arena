/**
 * Effect rules of group A of the Witherbloom Witchcraft deck (issue 190): Suffer the Past's two sentences.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';
import { EFFECT_REVEAL_TOP_BRANCHES } from './witherbloom-a-reveal';

const EXILE_ID = 'effect.exile-x-cards-of-player';

/**
 * `effect.exile-x-cards-of-player`: "Exile X target cards from target player's graveyard." (CR 115.1, 601.2b-c, 404.1, 107.3a, 406.1): the player is a target and so are
 * as many cards as the X announced, which must all be in that player's graveyard. The engine's `exile` of a `countX` slot with `ownedByTarget`. Not read: a number
 * or "up to" in place of X, a graveyard that is not the targeted player's ("your", "a"), "target opponent", "all cards".
 */
export const EFFECT_EXILE_X_CARDS_OF_PLAYER = defineRule<Clauses>({
  id: EXILE_ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2b (Casting Spells)',
    'CR 404.1 (Graveyard)',
    'CR 107.3a (X in Spells)',
    'CR 406.1 (Exile)',
  ],
  examples: [
    "exile X target cards from target player's graveyard",
    'exile X target cards from target player’s graveyard',
  ],
  rejects: [
    "exile three target cards from target player's graveyard",
    "exile up to X target cards from target player's graveyard",
    "exile X target cards from target opponent's graveyard",
    'exile X target cards from your graveyard',
    'exile X target cards from a graveyard',
    "exile X target card from target player's graveyard",
    "exile X cards from target player's graveyard",
    "exile X target cards from target player's hand",
    "exile all cards from target player's graveyard",
    "exile X target cards from target players' graveyards",
  ],
  parse: single(
    EXILE_ID,
    sequence(
      literal('exile '),
      spanned(literal('X target cards')),
      literal(' from '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.filter.player === 'any',
      ),
      pattern(/['’]s graveyard(?![\p{L}\p{N}])/iu),
    ),
    ([, what, , player]) => {
      return {
        verb: 'exileGraveyardCardsOfPlayer',
        args: {
          player,
          cards: {
            kind: 'noun',
            det: 'target',
            filter: { zone: 'graveyard', card: true, raw: "cards from target player's graveyard" },
            count: { kind: 'x', span: what.span },
            upTo: false,
            plural: true,
            other: false,
            span: what.span,
            rule: EXILE_ID,
          },
        },
      };
    },
  ),
});

const DRAIN_ID = 'effect.drain-for-each-exiled';

/**
 * `effect.drain-for-each-exiled`: "For each card exiled this way, that player loses 1 life and you gain 1 life." (CR 608.2c, 119.3, 119.4): after the instruction before it
 * exiled cards, the player the text named loses one life for each card it exiled and the controller gains as much. Exactly one life each, to "that player" and "you".
 * Not read: another number, another order, "target player" (a new target), "each opponent", a count that is not "for each card exiled this way".
 */
export const EFFECT_DRAIN_FOR_EACH_EXILED = defineRule<Clauses>({
  id: DRAIN_ID,
  family: 'effect',
  leading: ['for'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 119.3 (Life)', 'CR 119.4 (Life)'],
  examples: ['for each card exiled this way, that player loses 1 life and you gain 1 life'],
  rejects: [
    'for each card exiled this way, that player loses 2 life and you gain 2 life',
    'for each card exiled this way, that player loses 1 life and you gain 2 life',
    'for each card exiled this way, you gain 1 life and that player loses 1 life',
    'for each card exiled this way, target player loses 1 life and you gain 1 life',
    'for each card exiled this way, each opponent loses 1 life and you gain 1 life',
    'for each creature exiled this way, that player loses 1 life and you gain 1 life',
    'for each card exiled, that player loses 1 life and you gain 1 life',
    'for each card exiled this way, that player loses 1 life',
    'for each card exiled this way, that player loses 1 life and you gain 1 life and draw a card',
  ],
  parse: single(
    DRAIN_ID,
    sequence(
      pattern(/for each card exiled this way, /iu),
      family<IrNoun>('noun', { only: ['noun.that-player'] }),
      literal(' loses '),
      satisfy(
        family<IrAmount>('amount', { only: ['amount.number'] }),
        (n) => n.kind === 'number' && n.value === 1,
      ),
      literal(' life and you gain '),
      satisfy(
        family<IrAmount>('amount', { only: ['amount.number'] }),
        (n) => n.kind === 'number' && n.value === 1,
      ),
      pattern(/ life(?=\.|$)/iu),
    ),
    ([, player, , loss, , gain]) => ({
      verb: 'drainForEachExiled',
      args: { player, loss, gain },
    }),
  ),
});

export const WITHERBLOOM_A_EFFECT_RULES = [
  EFFECT_EXILE_X_CARDS_OF_PLAYER,
  EFFECT_DRAIN_FOR_EACH_EXILED,
  EFFECT_REVEAL_TOP_BRANCHES,
];
