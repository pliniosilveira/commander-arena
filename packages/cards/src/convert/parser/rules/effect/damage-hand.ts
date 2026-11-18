/**
 * `effect.damage-hand-of-player`: "it deals damage to each opponent equal to the number of cards in that player's hand" (CR 120.3, 402.1, 608.2c): the permanent the ability is on
 * (`~` or "it", read as `~` by the binding pass) deals to each player the recipient names the number of cards in that player's own hand. The recipient is "each opponent" or
 * "each player" (a target player would not make "that player" mean each one). The engine's `dealDamage` with the amount `cardsInHandOfAffected`.
 */
import { choice, literal, map, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

export const EFFECT_DAMAGE_HAND_OF_PLAYER = defineRule<Clauses>({
  id: 'effect.damage-hand-of-player',
  family: 'effect',
  leading: ['it', '~'],
  cites: ['CR 120.3 (Damage)', 'CR 402.1 (Hand)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'it deals damage to each opponent equal to the number of cards in that player’s hand',
    '~ deals damage to each opponent equal to the number of cards in that player’s hand',
    'it deals damage to each player equal to the number of cards in that player’s hand',
  ],
  rejects: [
    'it deals damage to target opponent equal to the number of cards in that player’s hand',
    'it deals damage to each opponent equal to the number of cards in your hand',
    'it deals damage to each creature equal to the number of cards in that player’s hand',
    'it deals damage to each opponent',
    'it deals 2 damage to each opponent equal to the number of cards in that player’s hand',
    'its deals damage to each opponent equal to the number of cards in that player’s hand',
  ],
  parse: single(
    'effect.damage-hand-of-player',
    sequence(
      choice<IrNoun | null>(
        family<IrNoun>('noun', { only: ['noun.it'] }),
        map(literal('~'), () => null),
      ),
      literal(' deals damage to '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'eachOpponent' || noun.det === 'eachPlayer',
      ),
      literal(' '),
      family<IrAmount>('amount', { only: ['amount.cards-in-hand-of-that-player'] }),
    ),
    ([source, , to, , amount]) => ({
      verb: 'dealDamage',
      args: source === null ? { amount, to } : { source, amount, to },
    }),
  ),
});

export const DAMAGE_HAND_EFFECT_RULES = [EFFECT_DAMAGE_HAND_OF_PLAYER];
