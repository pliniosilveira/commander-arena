/**
 * Noun rule of the Desert Bloom deck, group G5 (Dune Chanter): the permanents of a kind you control and the cards of that kind you own outside the battlefield, as one group.
 */
import { map, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY } from './phrases';

const KINDS = 'artifact|creature|enchantment|land|planeswalker';

/**
 * `noun.permanents-and-cards-off-battlefield`: "lands you control and land cards you own that aren't on the battlefield" (Dune Chanter, CR 108.3, 205.2a, 613.1d): the permanents of a card
 * type that you control, and the cards of the same type that you own in any zone but the battlefield. A plural group that only the statement "are Deserts in addition to their other types"
 * (the engine's `setTypes` for the permanents and `giveTypesToCardsOffBattlefield` for the cards) reads: the lowering refuses it for any other effect. Not read: another type for the cards
 * than for the permanents, "cards you control", "permanents you own", the cards in one zone ("in your graveyard"), a singular, "other", "that aren't on the battlefield" left out.
 */
export const NOUN_PERMANENTS_AND_CARDS_OFF_BATTLEFIELD = defineRule<IrNoun>({
  id: 'noun.permanents-and-cards-off-battlefield',
  family: 'noun',
  leading: [],
  cites: [
    'CR 108.3 (Owner)',
    'CR 205.2a (Card Types)',
    'CR 613.1d (Interaction of Continuous Effects)',
  ],
  examples: [
    "lands you control and land cards you own that aren't on the battlefield",
    'Lands you control and land cards you own that aren’t on the battlefield',
    "creatures you control and creature cards you own that aren't on the battlefield",
  ],
  rejects: [
    "lands you control and creature cards you own that aren't on the battlefield",
    "lands you control and land cards you control that aren't on the battlefield",
    "lands you control and land cards you own that aren't in your graveyard",
    'lands you control and land cards you own',
    "land you control and land card you own that isn't on the battlefield",
    "other lands you control and land cards you own that aren't on the battlefield",
    "lands your opponents control and land cards you own that aren't on the battlefield",
    "lands you own and land cards you own that aren't on the battlefield",
  ],
  parse: node<{ readonly kind: string; readonly raw: string }, IrNoun>(
    'noun.permanents-and-cards-off-battlefield',
    map(
      pattern(
        new RegExp(
          `(${KINDS})s you control and \\1 cards you own that aren['’]t on the battlefield${BOUNDARY}`,
          'iu',
        ),
      ),
      (m) => ({ kind: (m[1] ?? '').toLowerCase(), raw: m[0] }),
    ),
    ({ kind, raw }): Omit<IrNoun, 'span' | 'rule'> => {
      const filter: IrFilter = { types: [kind], controller: 'you', raw };
      return {
        kind: 'noun',
        det: 'each',
        filter,
        upTo: false,
        plural: true,
        other: false,
        alsoCardsYouOwnOffBattlefield: true,
      };
    },
  ),
});

export const DESERT_BLOOM_NOUN_RULES = [NOUN_PERMANENTS_AND_CARDS_OFF_BATTLEFIELD];
