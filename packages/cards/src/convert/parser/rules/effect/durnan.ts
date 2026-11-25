/**
 * Effect rules of Durnan of the Yawning Portal and Vivien, Champion of the Wilds (Exit from Exile precon): a look at the top of the controller's own library, one card exiled, the rest
 * on the bottom in any order, and a permission to cast the exiled card for as long as it stays exiled. The lowerings are in `lower/durnan.ts`.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

const DURNAN_RULE = 'effect.look-exile-creature-cast-undaunted';

/**
 * `effect.look-exile-creature-cast-undaunted`: "look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any
 * order. For as long as that card remains exiled, you may cast it. That spell has undaunted." (CR 401.2, 406.3, 611.2, 702.125a): five sentences that `splitSentences` keeps together. The
 * engine's `lookAtTop` of the controller's library with `take.to` `exile` (an offer, one creature card), the rest on the bottom in an order the controller chooses, then a `mayPlay` of the
 * card that lasts while it is exiled, to cast only, with `undaunted`. Not read: another card kind, another number of cards, a random order, another length, another player's library.
 */
export const EFFECT_LOOK_EXILE_CREATURE_CAST_UNDAUNTED = defineRule<Clauses>({
  id: DURNAN_RULE,
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 401.2 (Library)',
    'CR 406.3 (Exile)',
    'CR 611.2 (Continuous Effects)',
    'CR 702.125a (Undaunted)',
  ],
  examples: [
    'look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains exiled, you may cast it. That spell has undaunted',
    'look at the top three cards of your library. you may exile a creature card from among them. put the rest on the bottom of your library in any order. for as long as that card remains exiled, you may cast it. that spell has undaunted',
  ],
  rejects: [
    'look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains exiled, you may cast it',
    'look at the top four cards of your library. You may exile a land card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains exiled, you may cast it. That spell has undaunted',
    'look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in a random order. For as long as that card remains exiled, you may cast it. That spell has undaunted',
    'look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. This turn, you may cast it. That spell has undaunted',
    "look at the top four cards of target opponent's library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains exiled, you may cast it. That spell has undaunted",
    'look at the top one card of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains exiled, you may cast it. That spell has undaunted',
  ],
  parse: single(
    DURNAN_RULE,
    sequence(
      literal('look at the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      pattern(
        / cards of your library\. you may exile a creature card from among them\. put the rest on the bottom of your library in any order\. for as long as that card remains exiled, you may cast it\. that spell has undaunted(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, count]) => ({ verb: 'lookExileCreatureUndaunted', args: { count } }),
  ),
});

const VIVIEN_RULE = 'effect.look-exile-face-down-cast-creature';

/**
 * `effect.look-exile-face-down-cast-creature`: "look at the top three cards of your library. Exile one face down and put the rest on the bottom of your library in any order. For as long
 * as it remains exiled, you may cast it if it's a creature spell." (CR 401.2, 406.3, 611.2: the card is exiled face down and its controller may look at it). Three sentences that
 * `splitSentences` keeps together. The engine's `lookAtTop` of the controller's library with `take.to` `exileFaceDownUnlinked`, the rest on the bottom in an order the controller chooses, then a
 * `mayPlay` of the card (a creature card only) that lasts while it is exiled, to cast only. Not read: another number kept, a random order, another condition, "play".
 */
export const EFFECT_LOOK_EXILE_FACE_DOWN_CAST_CREATURE = defineRule<Clauses>({
  id: VIVIEN_RULE,
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 401.2 (Library)',
    'CR 406.3 (Exile)',
    'CR 611.2 (Continuous Effects)',
    'CR 601.2 (Casting Spells)',
  ],
  examples: [
    "look at the top three cards of your library. Exile one face down and put the rest on the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a creature spell",
    'look at the top four cards of your library. exile one face down and put the rest on the bottom of your library in any order. for as long as it remains exiled, you may cast it if it’s a creature spell',
  ],
  rejects: [
    'look at the top three cards of your library. Exile one face down and put the rest on the bottom of your library in any order',
    "look at the top three cards of your library. Exile one face down and put the rest on the bottom of your library in a random order. For as long as it remains exiled, you may cast it if it's a creature spell",
    "look at the top three cards of your library. Exile one face down and put the rest on the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a land spell",
    "look at the top three cards of your library. Exile two face down and put the rest on the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a creature spell",
    "look at the top three cards of target opponent's library. Exile one face down and put the rest on the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a creature spell",
    "look at the top one card of your library. Exile one face down and put the rest on the bottom of your library in any order. For as long as it remains exiled, you may cast it if it's a creature spell",
  ],
  parse: single(
    VIVIEN_RULE,
    sequence(
      literal('look at the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      pattern(
        / cards of your library\. exile one face down and put the rest on the bottom of your library in any order\. for as long as it remains exiled, you may cast it if it['’]s a creature spell(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, count]) => ({ verb: 'lookExileFaceDownCastCreature', args: { count } }),
  ),
});

export const DURNAN_EFFECT_RULES = [
  EFFECT_LOOK_EXILE_CREATURE_CAST_UNDAUNTED,
  EFFECT_LOOK_EXILE_FACE_DOWN_CAST_CREATURE,
].map(quietly);
