/**
 * Effect rules of group 1b of the Danitha deck (issue 26, D-1213 provisional), the body of Cosmic Rebirth: "Choose target permanent card in your graveyard. If it has mana value 3
 * or less, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand." The first sentence is `effect.choose-graveyard-cards`, the
 * second is `condition.its-mana-value` and `effect.put-it-onto-battlefield`, the third is `condition.you-dont-put-it-onto-battlefield` and the rule here; the lowerings are in
 * `lower/danitha-g1b.ts` and `lower/sentences.ts`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.put-it-into-hand`: "put it into your hand" (CR 400.3: a card goes to its owner's hand; CR 608.2c: "it" is the object an earlier instruction of the text chose). "It" is
 * the card a target phrase of the text named, and the lowering accepts it only for a target card of your own graveyard (a card from there goes to your hand, CR 400.3); any other
 * "it" makes the clause unread. The words "you may" before it are the sentence's own, which the lowering refuses (nothing here is an offer). Not read: another zone, "its owner's
 * hand", "that card", "them", "put it into your hand and draw a card", "put it into your hand tapped".
 */
export const EFFECT_PUT_IT_INTO_HAND = defineRule<Clauses>({
  id: 'effect.put-it-into-hand',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 400.3 (General)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['put it into your hand', 'Put it into your hand'],
  rejects: [
    "put it into its owner's hand",
    'put it into your graveyard',
    'put it into your library',
    'put it onto the battlefield',
    'put that card into your hand',
    'put them into your hand',
    'put it into your hand and draw a card',
    'put it into your hand then draw a card',
    'put it in your hand',
    'put it into their hand',
    'put target creature card into your hand',
  ],
  parse: single(
    'effect.put-it-into-hand',
    sequence(
      literal('put '),
      family<IrNoun>('noun', { only: ['noun.it'] }),
      pattern(/ into your hand(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu),
    ),
    ([, objects]) => ({ verb: 'putItIntoHand', args: { objects } }),
  ),
});

/**
 * Quiet: a line this rule does not read ("Put a +1/+1 counter on ~", "Put target card into your hand") must stop where it always did, so the word it shares with the older rules
 * ("put ") does not become the closest rule of its diagnostic.
 */
export const DANITHA_G1B_EFFECT_RULES = [quietly(EFFECT_PUT_IT_INTO_HAND)];
