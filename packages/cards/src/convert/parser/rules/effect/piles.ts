/**
 * "Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard." (Fact or Fiction,
 * D-971, CR 700.3, 701.20): the engine's `revealAndSeparate`. The three sentences are one instruction (the second and third only make sense with the cards the first reveals), so
 * `splitSentences` keeps them together (`segment.ts`) and one rule reads the whole.
 */
import { literal, type Parser, satisfy, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

/** A number of cards: digits or a word from one to ten ("reveal the top N cards" reads numbers only, not X). */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/** At least two cards: with one card there is nothing to separate. */
const TWO_OR_MORE: Parser<IrArg> = satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2);

/**
 * `effect.reveal-separate-piles`: "reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into
 * your graveyard" (CR 700.3, 701.20). The controller reveals the top cards of their own library, an opponent (the first in turn order still in the game, D-971) separates
 * them into two piles, and the controller chooses which pile goes to the hand; the other goes to the graveyard. Not read: one sentence or two of the three, another number
 * than a count of at least two (an X is not read), another library, a separation by the controller ("you separate ... An opponent chooses one of those piles" is another
 * wording of the same effect, which the engine runs but whose Oracle text the repository does not hold), another place for either pile, a pile put anywhere but the
 * controller's hand and graveyard.
 */
export const EFFECT_REVEAL_SEPARATE_PILES = defineRule<Clauses>({
  id: 'effect.reveal-separate-piles',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 700.3 (General)',
    'CR 700.3c (General)',
    'CR 701.20 (Reveal)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard',
    'reveal the top three cards of your library. an opponent separates those cards into two piles. put one pile into your hand and the other into your graveyard',
  ],
  rejects: [
    'reveal the top five cards of your library. an opponent separates those cards into two piles',
    'reveal the top five cards of your library. put one pile into your hand and the other into your graveyard',
    'reveal the top five cards of your library. an opponent separates those cards into two piles. put one pile into your hand and the other into your library',
    'reveal the top five cards of your library. an opponent separates those cards into two piles. put one pile into your hand and the other into exile',
    'reveal the top five cards of your library. an opponent separates those cards into two piles. put one pile onto the battlefield and the other into your graveyard',
    'reveal the top five cards of your library. you separate those cards into two piles. put one pile into your hand and the other into your graveyard',
    'reveal the top five cards of your library. each opponent separates those cards into two piles. put one pile into your hand and the other into your graveyard',
    'reveal the top five cards of target player’s library. an opponent separates those cards into two piles. put one pile into your hand and the other into your graveyard',
    'reveal the top one card of your library. an opponent separates those cards into two piles. put one pile into your hand and the other into your graveyard',
    'reveal the top x cards of your library. an opponent separates those cards into two piles. put one pile into your hand and the other into your graveyard',
  ],
  parse: single(
    'effect.reveal-separate-piles',
    sequence(
      literal('reveal the top '),
      TWO_OR_MORE,
      literal(
        ' cards of your library. an opponent separates those cards into two piles. put one pile into your hand and the other into your graveyard',
      ),
    ),
    ([, count]) => ({ verb: 'revealAndSeparate', args: { count } }),
  ),
});

export const PILES_EFFECT_RULES = [EFFECT_REVEAL_SEPARATE_PILES];
