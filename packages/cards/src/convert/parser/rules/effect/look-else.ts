/**
 * "Look at the top four cards of your library. You may put a land card from among them onto the battlefield tapped. If you don't, put a card from among them into your hand. Put
 * the rest on the bottom of your library in a random order." (Planar Genesis, CR 608.2c, 608.2d): the engine's `lookAtTop` with `take.elseAnyToHand`. The four sentences are one
 * instruction (the second and third depend on each other and on the cards the first looks at), so `splitSentences` keeps them together (`segment.ts`) and one rule reads the whole.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg, IrNoun } from '../../ir/types';
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

/** A count of cards: two or more, or X. */
const COUNT_OR_X = satisfy(
  family<IrArg>('amount', { only: ['amount.number', 'amount.x'] }),
  (a) => a.kind === 'x' || (a.kind === 'number' && a.value >= 2),
);

/**
 * `effect.reveal-put-shuffle`: "reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then
 * shuffle the rest into your library" (Genesis Hydra; CR 701.20a, 701.20b, 701.24, 202.3: the cards are revealed and stay in the library while the player chooses; the card put
 * onto the battlefield is the player's choice, and the library is shuffled with the cards that were not put). The engine's `lookAtTop` of a reveal that leaves the cards where they are
 * (`rest: 'top'`), then a shuffle. The limit is the same X as the count. Not read: a card taken into the hand, a tapped card, another place for the rest, a limit other than X, another
 * library.
 */
export const EFFECT_REVEAL_PUT_SHUFFLE = defineRule<Clauses>({
  id: 'effect.reveal-put-shuffle',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 701.20b (Reveal)',
    'CR 701.24 (Shuffle)',
    'CR 202.3 (Mana Value)',
    'CR 401.4 (Library)',
  ],
  examples: [
    'reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library',
    'reveal the top X cards of your library. You may put a creature card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library',
  ],
  rejects: [
    'reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield',
    'reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield tapped. Then shuffle the rest into your library',
    'reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them into your hand. Then shuffle the rest into your library',
    'reveal the top X cards of your library. You may put a nonland permanent card from among them onto the battlefield. Then shuffle the rest into your library',
    'reveal the top X cards of your library. You may put a nonland permanent card with mana value 3 or less from among them onto the battlefield. Then shuffle the rest into your library',
    'reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then put the rest on the bottom of your library in a random order',
    'reveal the top X cards of target player’s library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library',
    'reveal the top card of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library',
  ],
  parse: single(
    'effect.reveal-put-shuffle',
    sequence(
      literal('reveal the top '),
      COUNT_OR_X,
      literal(' cards of your library. you may put '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      pattern(
        / with mana value X or less from among them onto the battlefield\. then shuffle the rest into your library(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, count, , card]) => ({ verb: 'revealPutShuffle', args: { count, card } }),
  ),
});

/**
 * `effect.choose-reveal-put-all-hand`: "choose creature or land. reveal the top four cards of your library. put all cards of the chosen type revealed this way into your hand and the
 * rest into your graveyard" (Winding Way; CR 608.2d: the choice is made as the spell resolves; CR 701.20a: every card is shown; CR 608.2c). The engine's `chooseOne` of the two types,
 * each option the `lookAtTop` of a reveal taking every card of that type into the hand, the rest into the graveyard. Only the two types of the card, in this order. Not read: another
 * pair of types, a count of fewer than two cards or X, another place for either group, another library.
 */
export const EFFECT_CHOOSE_REVEAL_PUT_ALL_HAND = defineRule<Clauses>({
  id: 'effect.choose-reveal-put-all-hand',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard',
  ],
  rejects: [
    'choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand',
    'choose creature or artifact. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard',
    'choose land or creature. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard',
    'choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest on the bottom of your library in a random order',
    'choose creature or land. Reveal the top one card of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard',
    'choose creature or land. Reveal the top X cards of your library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard',
    'choose creature or land. Reveal the top four cards of target player’s library. Put all cards of the chosen type revealed this way into your hand and the rest into your graveyard',
    'choose creature or land. Reveal the top four cards of your library. Put all cards of the chosen type revealed this way onto the battlefield and the rest into your graveyard',
  ],
  parse: single(
    'effect.choose-reveal-put-all-hand',
    sequence(
      literal('choose creature or land. reveal the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(
        ' cards of your library. put all cards of the chosen type revealed this way into your hand and the rest into your graveyard',
      ),
    ),
    ([, count]) => ({ verb: 'chooseRevealPutAllHand', args: { count } }),
  ),
});

export const LOOK_ELSE_EFFECT_RULES = [
  EFFECT_LOOK_TAKE_ELSE_HAND,
  EFFECT_REVEAL_PUT_SHUFFLE,
  EFFECT_CHOOSE_REVEAL_PUT_ALL_HAND,
];
