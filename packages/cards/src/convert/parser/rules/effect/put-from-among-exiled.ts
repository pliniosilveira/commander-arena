/**
 * Effect rule of the Exit from Exile deck (Journey to the Lost City): "You may put a land card from among those cards onto the battlefield." after "exile the top four cards of your
 * library" (CR 608.2c, 608.2d, 110.2a). The lowering is `PUT_FROM_AMONG_EXILED` (`lower/troyan-g4.ts`), which refuses it unless the cards are those the exile before it moved.
 */
import { literal, optional, pattern, sequence } from '../../combinators';
import type { IrFlag, IrNoun } from '../../ir/types';
import { defineRule } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, single } from './operands';

const ID = 'effect.put-from-among-those-cards-onto-battlefield';

/**
 * `effect.put-from-among-those-cards-onto-battlefield`: "you may put a land card from among those cards onto the battlefield". One card of the kind named, from among the cards the
 * instruction before it exiled, onto the battlefield under the control of the player. Not read: another place ("into your hand"), "them" (the Troyan sentence's wording, read with its
 * own rule), more than one card, "up to", a second instruction in the same sentence.
 */
export const EFFECT_PUT_FROM_AMONG_THOSE_CARDS_ONTO_BATTLEFIELD = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['you', 'put'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'you may put a land card from among those cards onto the battlefield',
    'put a land card from among those cards onto the battlefield',
    'you may put a creature card from among those cards onto the battlefield',
  ],
  rejects: [
    'you may put a land card from among those cards into your hand',
    'you may put a land card from among them onto the battlefield',
    'you may put two land cards from among those cards onto the battlefield',
    'you may put up to two land cards from among those cards onto the battlefield',
    'you may put a land card from among those cards onto the battlefield tapped',
    'you may put a land card from among those cards onto the battlefield and draw a card',
    'you may put it from among those cards onto the battlefield',
  ],
  parse: single(
    ID,
    sequence(
      optional(literal('you may '), null),
      literal('put '),
      TAKEN_CARD,
      literal(' from among those cards onto the battlefield'),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then|tapped)(?![\p{L}\p{N}]))/u),
    ),
    ([may, , objects]: [string | null, string, IrNoun, string, unknown]) => {
      const flag: IrFlag = {
        kind: 'flag',
        value: may !== null,
        span: { start: 0, end: 0 },
        rule: ID,
      };
      return { verb: 'putFromAmongExiled', args: { objects, may: flag } };
    },
  ),
});

export const PUT_FROM_AMONG_EXILED_EFFECT_RULES = [
  EFFECT_PUT_FROM_AMONG_THOSE_CARDS_ONTO_BATTLEFIELD,
];
