/**
 * Effect rules of the Quandrix deck (Secrets of Strixhaven Commander): a player shuffles cards of their own graveyard into their library.
 */
import { choice, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.shuffle-graveyard-cards';

/**
 * `effect.shuffle-graveyard-cards`: "Target player shuffles up to three target cards from their graveyard into their library." (CR 115.1, 701.24, 404.1,
 * 108.3): the player is a target and so are the cards, which must be in that player's graveyard ("their"). The cards go into the library of their owner and that
 * player shuffles. "Target card" is one card, "up to N target cards" none to N (N is two or more). Only a target player and their own graveyard and library.
 */
export const EFFECT_SHUFFLE_GRAVEYARD_CARDS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 701.24 (Shuffle)',
    'CR 404.1 (Graveyard)',
    'CR 108.3 (Owner and Controller)',
  ],
  examples: [
    'target player shuffles up to three target cards from their graveyard into their library',
    'target player shuffles up to two target cards from their graveyard into their library',
    'target player shuffles target card from their graveyard into their library',
  ],
  rejects: [
    'target player shuffles up to three target cards from your graveyard into their library',
    'target player shuffles up to three target cards from their graveyard into your library',
    'target player shuffles up to three target cards from a graveyard into their library',
    'target player shuffles up to three cards from their graveyard into their library',
    'target player shuffles up to one target cards from their graveyard into their library',
    'target player shuffles three target cards from their graveyard into their library',
    'target opponent shuffles up to three target cards from their graveyard into their library',
    'target player shuffles up to three target cards from their graveyard into their library and draws a card',
    'target player shuffles their graveyard into their library',
    'you shuffle up to three target cards from your graveyard into your library',
  ],
  parse: single(
    ID,
    sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.filter.player === 'any',
      ),
      literal(' shuffles '),
      spanned(
        choice(
          map(
            sequence(
              literal('up to '),
              satisfy(quantity, (n) => n >= 2),
              literal(' target cards'),
            ),
            ([, count]) => count,
          ),
          map(literal('target card'), () => 1),
        ),
      ),
      pattern(/ from their graveyard into their library(?=\.|$)/iu),
    ),
    ([player, , cards]) => ({
      verb: 'shuffleGraveyardCards',
      args: {
        player,
        cards: {
          kind: 'noun',
          det: 'target',
          filter: { zone: 'graveyard', card: true, raw: 'cards from their graveyard' },
          count: { kind: 'number', value: cards.value, span: cards.span },
          upTo: cards.value > 1,
          plural: cards.value > 1,
          other: false,
          span: cards.span,
          rule: ID,
        },
      },
    }),
  ),
});

const MOVE_ID = 'effect.move-all-counters';

/**
 * `effect.move-all-counters`: "Move all counters from target nonland permanent you control onto another target nonland permanent you control." (CR 122.1, 122.6,
 * 115.3: every counter of every kind goes from one permanent to another, and the two are different targets). The engine's `moveAllCounters`. Not read: a kind or a
 * number of counters ("move a +1/+1 counter"), "any number of", a permanent that is not a target ("from ~"), the second target without "another", plural targets.
 */
export const EFFECT_MOVE_ALL_COUNTERS = defineRule<Clauses>({
  id: MOVE_ID,
  family: 'effect',
  leading: ['move'],
  cites: ['CR 122.1 (Counters)', 'CR 122.6 (Counters)', 'CR 115.3 (Targets)'],
  examples: [
    'move all counters from target nonland permanent you control onto another target nonland permanent you control',
    'move all counters from target creature onto another target creature',
  ],
  rejects: [
    'move all +1/+1 counters from target creature onto another target creature',
    'move a counter from target creature onto another target creature',
    'move all counters from target creature onto target creature',
    'move all counters from ~ onto another target creature',
    'move all counters from target creature onto ~',
    'move all counters from target creatures onto another target creature',
    'move all counters from target creature onto another target creature and draw a card',
    'move all counters from target creature',
  ],
  parse: single(
    MOVE_ID,
    sequence(
      literal('move all counters from '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (noun) => noun.det === 'target' && !noun.plural && !noun.other && !noun.upTo,
      ),
      literal(' onto '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
        (noun) => noun.det === 'target' && !noun.plural && noun.other && !noun.upTo,
      ),
      pattern(/(?=\.|$)/u),
    ),
    ([, from, , to]) => ({
      verb: 'moveAllCounters',
      // "Another" is a different target (CR 115.3), not "other than the source".
      args: { from, to: { ...to, other: false, otherTarget: true } },
    }),
  ),
});

export const QUANDRIX_EFFECT_RULES = [EFFECT_SHUFFLE_GRAVEYARD_CARDS, EFFECT_MOVE_ALL_COUNTERS].map(
  quietly,
);
