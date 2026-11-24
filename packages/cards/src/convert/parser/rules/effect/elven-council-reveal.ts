/**
 * Effect rules of the Elven Council deck, group "reveal": the two instructions that reveal cards of a library and decide from them what happens next.
 *
 * `effect.reveal-any-permanents-x` is Genesis Wave, `effect.opponents-reveal-share-type` is Gandalf, Westward Voyager. The sentences of each are kept together by the segmenter
 * (`segment.ts`). The engine runs `lookAtTop` with `take.any` and `revealTopCard` with an `objectMatches` of the cards revealed (rules/look-take.ts, rules/reveal-top-card.ts).
 */
import { map, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.reveal-any-permanents-x`: "reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield.
 * Then put all cards revealed this way that weren't put onto the battlefield into your graveyard." (Genesis Wave; CR 701.20a Reveal, 401.4, 107.3a, 202.3, 110.2a, 404.1: the top X cards
 * are revealed together, the controller chooses any number of the permanent cards among them whose mana value is at most the same X, they enter together under the controller's control,
 * and every revealed card that did not go onto the battlefield is put into the graveyard). Three sentences that `splitSentences` keeps together. The engine's `lookAtTop` of a reveal with
 * `take.any`, `manaValueAtMost` X and the rest into the graveyard. Not read: another number than X for the cards revealed or for the limit, another kind of card, "up to", another place
 * for the cards taken or the rest, a sentence missing.
 */
export const EFFECT_REVEAL_ANY_PERMANENTS_X = defineRule<Clauses>({
  id: 'effect.reveal-any-permanents-x',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 401.4 (Library)',
    'CR 107.3a (Numbers and Symbols)',
    'CR 202.3 (Mana Value)',
    'CR 110.2a (Permanents)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    "reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
  ],
  rejects: [
    'reveal the top X cards of your library',
    'reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield',
    "reveal the top X cards of your library. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
    "reveal the top three cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
    "reveal the top X cards of your library. You may put any number of permanent cards with mana value 3 or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
    "reveal the top X cards of your library. You may put any number of creature cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
    "reveal the top X cards of your library. You may put up to two permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
    "reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them into your hand. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
    "reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield tapped. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard",
    "reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield on the bottom of your library",
    "reveal the top X cards of your library. You may put any number of permanent cards with mana value X or less from among them onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield into your graveyard and draw a card",
  ],
  parse: single(
    'effect.reveal-any-permanents-x',
    map(
      spanned(
        pattern(
          /reveal the top (X) cards of your library\.\s+you may put any number of permanent cards with mana value X or less from among them onto the battlefield\.\s+then put all cards revealed this way that weren['’]t put onto the battlefield into your graveyard(?![\p{L}\p{N}])(?!\s*(?:,|and\b|then\b))/iu,
        ),
      ),
      ({ span }): IrAmount => ({ kind: 'x', span }),
    ),
    (count) => ({ verb: 'revealTopAnyPermanents', args: { count } }),
  ),
});

/**
 * `effect.opponents-reveal-share-type`: "each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose
 * new targets for the copy, and each opponent draws a card. Otherwise, you draw a card." (Gandalf, Westward Voyager; CR 701.20a Reveal, 608.2c, 205.2a, 707.10, 707.10c: every opponent
 * still in the game reveals the top card of their own library, in turn order; when at least one of the cards revealed has a card type the spell the trigger is about has, the controller
 * copies that spell and may choose new targets for the copy, and each opponent draws a card; if none does, or no card was revealed, the controller draws a card). Three sentences that
 * `splitSentences` keeps together, in the effect of a trigger about a cast spell. The engine's `revealTopCard` of each opponent, then a `conditional` on `objectMatches` of all the cards
 * revealed (`moved`, `any`) that `sharesCardTypeWith` the spell, whose branches are a `copySpell` of it with new targets and a draw for each opponent, or a draw for you. Not read: another
 * player word, another number of cards, another tie than a card type, another count of cards drawn, a different order of the instructions, a sentence missing or added.
 */
export const EFFECT_OPPONENTS_REVEAL_SHARE_TYPE = defineRule<Clauses>({
  id: 'effect.opponents-reveal-share-type',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 205.2a (Card Types)',
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
    'CR 101.4 (Handling Simultaneous Decisions)',
  ],
  examples: [
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card',
  ],
  rejects: [
    'each opponent reveals the top card of their library',
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card',
    'each opponent reveals the top card of their library. Otherwise, you draw a card',
    'each player reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card',
    'target opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card',
    'each opponent reveals the top two cards of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card',
    'each opponent reveals the top card of their library. If all of those cards share a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card',
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, and each opponent draws a card. Otherwise, you draw a card',
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and you draw a card. Otherwise, you draw a card',
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws two cards. Otherwise, you draw a card',
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw two cards',
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, each opponent draws a card',
    'each opponent reveals the top card of their library. If any of those cards shares a creature type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card',
    'each opponent reveals the top card of their library. If any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card. Otherwise, you draw a card and gain 1 life',
  ],
  parse: single(
    'effect.opponents-reveal-share-type',
    pattern(
      /each opponent reveals the top card of their library\.\s+if any of those cards shares a card type with that spell, copy that spell, you may choose new targets for the copy, and each opponent draws a card\.\s+otherwise, you draw a card(?![\p{L}\p{N}])(?!\s*(?:,|and\b|then\b))/iu,
    ),
    () => ({ verb: 'opponentsRevealShareType', args: {} }),
  ),
});

export const ELVEN_COUNCIL_REVEAL_EFFECT_RULES = [
  EFFECT_OPPONENTS_REVEAL_SHARE_TYPE,
  EFFECT_REVEAL_ANY_PERMANENTS_X,
];
