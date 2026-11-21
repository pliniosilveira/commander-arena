/**
 * Effect rule of the "choose a creature type" group: reveal cards until as many creature cards of the type chosen earlier as the text says X is, put them onto the battlefield and
 * shuffle the rest (CR 701.20 Reveal, 701.24 Shuffle, 107.3c, 205.3m, 110.2a).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';
import { kindOfCards } from './reveal-x-cards';

const ID = 'effect.reveal-until-chosen-type';

/**
 * `effect.reveal-until-chosen-type`: "reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you
 * control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library" (CR 701.20, 107.3c, 608.2d, 205.3m: the cards are revealed
 * one at a time until as many creature cards of the type chosen as the spell resolves as X says, all of them if the library runs out first; the rest stay in the library, which is then
 * shuffled). The engine's `revealUntil` with a `count` and `rest: 'stay'`, then a `shuffle`; the lowering refuses the clause after any instruction but the choice of a creature type.
 */
export const EFFECT_REVEAL_UNTIL_CHOSEN_TYPE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 701.24 (Shuffle)',
    'CR 107.3c (Numbers and Symbols)',
    'CR 205.3m (Subtypes)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library',
    'reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type, put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type',
    'reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the battlefield',
    'reveal cards from the top of your library until you reveal X creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the battlefield tapped, then shuffle the rest of the revealed cards into your library',
    'reveal cards from the top of your library until you reveal X creature cards of the chosen type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library',
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of creatures you control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library',
    'reveal cards from the top of your library until you reveal two creature cards of the chosen type, where X is the number of creatures you control of that type. Put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library',
  ],
  parse: single(
    ID,
    sequence(
      literal('reveal cards from the top of your library until you reveal X '),
      spanned(literal('creature')),
      literal(' cards of the chosen type, '),
      family<IrAmount>('amount', { only: ['amount.where-x'] }),
      pattern(
        /[.,] put those cards onto the battlefield, then shuffle the rest of the revealed cards into your library(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, kind, , count]) => {
      const card = kindOfCards(ID, 'creature', kind.span);
      return {
        verb: 'revealUntilChosenType',
        args: { card: { ...card, filter: { ...card.filter, chosen: 'type' } }, count },
      };
    },
  ),
});

export const REVEAL_CHOSEN_TYPE_EFFECT_RULES = [EFFECT_REVEAL_UNTIL_CHOSEN_TYPE].map(quietly);
