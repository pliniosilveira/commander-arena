/**
 * The effects that put cards from the top of your own library somewhere and keep the rest together with them in one instruction: "reveal the top five cards of your library. Put a land
 * card from among them onto the battlefield and the rest into your graveyard" (Cavalier of Thorns), "look at the top X cards of your library, where X is that creature's power. If you
 * do, put one of those cards on top of your library and the rest on the bottom of your library in any order" (Cream of the Crop) and "look at the top card of your library. If it's a
 * land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand" (Risen Reef). All three are the engine's `lookAtTop`;
 * the sentences are kept together by `splitSentences` (`segment.ts`).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrArg } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, single } from './operands';

/** A number of cards: digits or a word from one to ten (X is not read). */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/**
 * `effect.reveal-put-one-battlefield`: "reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest into your graveyard" (CR 701.20a:
 * every one of the cards is shown to all players, 701.20b: they stay in the library until they move, 608.2c: a card that must be put is put whenever one matches, so there is no "you
 * may"; with none of the kind among them everything goes into the graveyard). The engine's `lookAtTop` with `revealAll` and a `take` of one card (`min` 1) onto the battlefield
 * untapped. The kind is what `effect.look-take` reads. Not read: a count of fewer than two cards or X, another library, a card "you may" put, the card put tapped, more than one card,
 * another place for the card or for the rest.
 */
export const EFFECT_REVEAL_PUT_ONE_BATTLEFIELD = defineRule<Clauses>({
  id: 'effect.reveal-put-one-battlefield',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 701.20b (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'Reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest into your graveyard',
    'reveal the top four cards of your library. put a creature card from among them onto the battlefield and the rest into your graveyard',
    'reveal the top three cards of your library. put a permanent card from among them onto the battlefield and the rest into your graveyard',
  ],
  rejects: [
    'reveal the top five cards of your library. put a land card from among them onto the battlefield',
    'reveal the top five cards of your library. you may put a land card from among them onto the battlefield and the rest into your graveyard',
    'reveal the top five cards of your library. put a land card from among them onto the battlefield tapped and the rest into your graveyard',
    'reveal the top five cards of your library. put a land card from among them into your hand and the rest into your graveyard',
    'reveal the top five cards of your library. put a land card from among them onto the battlefield and the rest on the bottom of your library in a random order',
    'reveal the top five cards of your library. put two land cards from among them onto the battlefield and the rest into your graveyard',
    'reveal the top one card of your library. put a land card from among them onto the battlefield and the rest into your graveyard',
    'reveal the top x cards of your library. put a land card from among them onto the battlefield and the rest into your graveyard',
    'reveal the top five cards of target player’s library. put a land card from among them onto the battlefield and the rest into your graveyard',
  ],
  parse: single(
    'effect.reveal-put-one-battlefield',
    sequence(
      literal('reveal the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' cards of your library. put '),
      TAKEN_CARD,
      pattern(
        new RegExp(
          ` from among them onto the battlefield and the rest into your graveyard${BOUNDARY}`,
          'iu',
        ),
      ),
    ),
    ([, count, , take]) => ({ verb: 'revealPutOneBattlefield', args: { count, take } }),
  ),
});

/**
 * `effect.look-top-x-one-on-top`: "look at the top X cards of your library, where X is that creature's power. If you do, put one of those cards on top of your library and the rest on
 * the bottom of your library in any order" (CR 401.2: the order of a library is hidden, 401.4: the owner arranges cards put on the bottom at the same time, 701.20a: nothing says
 * reveal, so nothing is shown). The "you may" before it is the offer of the ability. The engine's `lookAtTop`: exactly one card of any kind stays on top, the rest go on the bottom in
 * the order the owner chooses; X is read as the effect resolves (the definition at the end of the sentence is the count). Not read: a plain number of cards (the wording of a fixed
 * count differs), another library, another number kept, another place for either group, a rest put on top.
 */
export const EFFECT_LOOK_TOP_X_ONE_ON_TOP = defineRule<Clauses>({
  id: 'effect.look-top-x-one-on-top',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 401.2 (Library)',
    'CR 401.4 (Library)',
    'CR 701.20a (Reveal)',
    'CR 107.3c (Numbers and Symbols)',
  ],
  examples: [
    "look at the top X cards of your library, where X is that creature's power. If you do, put one of those cards on top of your library and the rest on the bottom of your library in any order",
    'look at the top X cards of your library, where X is the number of creatures you control. if you do, put one of those cards on top of your library and the rest on the bottom of your library in any order',
  ],
  rejects: [
    "look at the top X cards of your library, where X is that creature's power",
    "look at the top X cards of your library, where X is that creature's power. if you do, put one of those cards on top of your library and the rest on the bottom of your library in a random order",
    "look at the top X cards of your library, where X is that creature's power. if you do, put two of those cards on top of your library and the rest on the bottom of your library in any order",
    "look at the top X cards of your library, where X is that creature's power. if you do, put one of those cards into your hand and the rest on the bottom of your library in any order",
    "look at the top X cards of your library, where X is that creature's power. if you do, put one of those cards on top of your library and the rest into your graveyard",
    "look at the top X cards of target player’s library, where X is that creature's power. if you do, put one of those cards on top of your library and the rest on the bottom of your library in any order",
    'look at the top three cards of your library. if you do, put one of those cards on top of your library and the rest on the bottom of your library in any order',
  ],
  parse: single(
    'effect.look-top-x-one-on-top',
    sequence(
      literal('look at the top x cards of your library, '),
      family<IrAmount>('amount', { only: ['amount.where-x'] }),
      pattern(
        new RegExp(
          `\\. if you do, put one of those cards on top of your library and the rest on the bottom of your library in any order${BOUNDARY}`,
          'iu',
        ),
      ),
    ),
    ([, count]) => ({ verb: 'lookTopXOneOnTop', args: { count } }),
  ),
});

/**
 * `effect.look-top-land-else-hand`: "look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the
 * battlefield, put it into your hand" (CR 608.2c, 701.20a: nothing says reveal, so the card is not shown, and a card that is not of the kind goes to the hand too). The engine's
 * `lookAtTop` of one card with `take.elseAnyToHand` (the card of the kind put onto the battlefield tapped, or else into the hand unrevealed). The kind is what `effect.look-take`
 * reads. Not read: the card put untapped, "reveal it", another place for either branch, a second card, another library, a card left on top or on the bottom instead.
 */
export const EFFECT_LOOK_TOP_LAND_ELSE_HAND = defineRule<Clauses>({
  id: 'effect.look-top-land-else-hand',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 701.20a (Reveal)',
    'CR 401.2 (Library)',
  ],
  examples: [
    "Look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. If you don't put the card onto the battlefield, put it into your hand",
    'look at the top card of your library. if it’s a creature card, you may put it onto the battlefield tapped. if you don’t put the card onto the battlefield, put it into your hand',
  ],
  rejects: [
    "look at the top card of your library. if it's a land card, you may put it onto the battlefield tapped",
    "look at the top card of your library. if it's a land card, you may put it onto the battlefield. if you don't put the card onto the battlefield, put it into your hand",
    "look at the top card of your library. if it's a land card, you may reveal it and put it onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand",
    "look at the top card of your library. if it's a land card, you may put it onto the battlefield tapped. if you don't put the card onto the battlefield, put it on the bottom of your library",
    "look at the top card of your library. if it's a land card, you may put it into your hand. if you don't put the card onto the battlefield, put it into your hand",
    "look at the top two cards of your library. if it's a land card, you may put it onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand",
    "look at the top card of target player’s library. if it's a land card, you may put it onto the battlefield tapped. if you don't put the card onto the battlefield, put it into your hand",
  ],
  parse: single(
    'effect.look-top-land-else-hand',
    sequence(
      pattern(/look at the top card of your library\. if it['’]s /iu),
      TAKEN_CARD,
      pattern(
        new RegExp(
          `, you may put it onto the battlefield tapped\\. if you don['’]t put the card onto the battlefield, put it into your hand${BOUNDARY}`,
          'iu',
        ),
      ),
    ),
    ([, take]) => ({ verb: 'lookTopElseHand', args: { take } }),
  ),
});

export const LIBRARY_TOP_EFFECT_RULES = [
  EFFECT_REVEAL_PUT_ONE_BATTLEFIELD,
  EFFECT_LOOK_TOP_X_ONE_ON_TOP,
  EFFECT_LOOK_TOP_LAND_ELSE_HAND,
];
