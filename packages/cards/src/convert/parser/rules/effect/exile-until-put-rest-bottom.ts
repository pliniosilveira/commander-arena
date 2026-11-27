/**
 * Effect rule of the Exit from Exile deck (Venture Forth): "Exile cards from the top of your library until you exile a land card. Put that card onto the battlefield and the rest on the bottom
 * of your library in a random order." (CR 701.13, 401.4, 110.2a). The two sentences are one instruction, kept together by the segmenter. The engine's `exileUntilFound` with `then`.
 */
import { literal, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.exile-until-put-rest-bottom';

/**
 * `effect.exile-until-put-rest-bottom`: the controller exiles cards from the top of their library until a card of the kind named is exiled, puts that card onto the battlefield (under their
 * control) and the other exiled cards on the bottom of the library in a random order. Not read: another player, another place for the card found, the rest anywhere else, "may", a second
 * instruction in the same text.
 */
export const EFFECT_EXILE_UNTIL_PUT_REST_BOTTOM = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 401.4 (Library)',
    'CR 110.2a (Permanents)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'exile cards from the top of your library until you exile a land card. Put that card onto the battlefield and the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'exile cards from the top of your library until you exile a land card',
    'exile cards from the top of your library until you exile a land card. Put that card into your hand and the rest on the bottom of your library in a random order',
    'exile cards from the top of your library until you exile a land card. Put that card onto the battlefield and the rest on the bottom of your library in any order',
    'exile cards from the top of your library until you exile a land card. Put that card onto the battlefield and the rest into your graveyard',
    "exile cards from the top of target player's library until you exile a land card. Put that card onto the battlefield and the rest on the bottom of your library in a random order",
    'exile cards from the top of your library until you exile a land card. You may put that card onto the battlefield and the rest on the bottom of your library in a random order',
    'exile cards from the top of your library until you exile a land card. Put that card onto the battlefield and the rest on the bottom of your library in a random order. Draw a card',
  ],
  parse: single(
    ID,
    sequence(
      literal('exile cards from the top of your library until you exile '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal(
        '. put that card onto the battlefield and the rest on the bottom of your library in a random order',
      ),
    ),
    ([, card]) => ({
      verb: 'exileUntilPutRestBottom',
      args: { card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

export const EXILE_UNTIL_PUT_REST_BOTTOM_EFFECT_RULES = [EFFECT_EXILE_UNTIL_PUT_REST_BOTTOM];
