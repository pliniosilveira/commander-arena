/**
 * "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put
 * the rest on the bottom of your library in a random order." (Planar Genesis, CR 608.2c, 608.2d): the engine's `lookAtTop` with `take.elseAnyToHand`. The four sentences are one
 * instruction (the second and third depend on each other and on the cards the first looks at), so `splitSentences` keeps them together (`segment.ts`) and one rule reads the whole.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, single } from './operands';

/** A number of cards: digits or a word from one to ten (X is not read). */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/**
 * `effect.look-take-else-hand`: "look at the top four cards of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from
 * among them into your hand. put the rest on the bottom of your library in a random order" (CR 701.20a: nothing says reveal, so nothing is revealed; CR 401.4). The player may
 * put one card of the kind onto the battlefield tapped; when they do not (they decline, or no card of the kind is among them) they must put one card of any kind into their hand;
 * the rest go on the bottom in a random order. The kind is what `effect.look-take` reads. Not read: a count of fewer than two cards, X, "reveal" in either sentence, the card
 * taken untapped, another place for the first card or the second, "any order" or another place for the rest, another library, a second sentence without "if you don't".
 */
export const EFFECT_LOOK_TAKE_ELSE_HAND = defineRule<Clauses>({
  id: 'effect.look-take-else-hand',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.20a (Reveal)',
    'CR 401.4 (Library)',
  ],
  examples: [
    "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put the rest on the bottom of your library in a random order",
    "look at the top five cards of your library. you may put a creature card from among them onto the battlefield tapped. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in a random order",
    'look at the top three cards of your library. you may put a permanent card from among them onto the battlefield tapped. if you don’t, put a card from among them into your hand. put the rest on the bottom of your library in a random order',
  ],
  rejects: [
    "look at the top four cards of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from among them into your hand",
    'look at the top four cards of your library. you may put a land card from among them onto the battlefield tapped. put the rest on the bottom of your library in a random order',
    "look at the top four cards of your library. you may put a land card from among them onto the battlefield. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in a random order",
    "look at the top four cards of your library. you may reveal a land card from among them and put it onto the battlefield tapped. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in a random order",
    "look at the top four cards of your library. you may put a land card from among them into your hand. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in a random order",
    "look at the top four cards of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from among them onto the battlefield. put the rest on the bottom of your library in a random order",
    "look at the top four cards of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put two cards from among them into your hand. put the rest on the bottom of your library in a random order",
    "look at the top four cards of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in any order",
    "look at the top four cards of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from among them into your hand. put the rest into your graveyard",
    "look at the top one card of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in a random order",
    "look at the top x cards of your library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in a random order",
    "look at the top four cards of target player’s library. you may put a land card from among them onto the battlefield tapped. if you don't, put a card from among them into your hand. put the rest on the bottom of your library in a random order",
  ],
  parse: single(
    'effect.look-take-else-hand',
    sequence(
      literal('look at the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' cards of your library. you may put '),
      TAKEN_CARD,
      pattern(
        / from among them onto the battlefield tapped\. if you don['’]t, put a card from among them into your hand\. put the rest on the bottom of your library in a random order(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, count, , take]) => ({ verb: 'lookTakeElseHand', args: { count, take } }),
  ),
});

export const LOOK_ELSE_EFFECT_RULES = [EFFECT_LOOK_TAKE_ELSE_HAND];
