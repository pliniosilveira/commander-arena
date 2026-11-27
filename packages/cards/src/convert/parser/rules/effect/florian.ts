/**
 * Effect rule of Florian, Voldaren Scion: "look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the
 * rest on the bottom of your library in a random order. You may play the exiled card this turn." (CR 401.2, 406.3, 119.3, 601.2, 305.1): three sentences that `splitSentences` keeps together.
 * The engine's `lookAtTop` of the controller's library (the count is `opponentsLifeLostThisTurn`) with `take.to` `exile` (one card), the rest on the bottom in a random order, then a `mayPlay`
 * of the exiled card until end of turn. The lowering is in `lower/florian.ts`.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.look-lost-life-exile-one-play';

/**
 * `effect.look-lost-life-exile-one-play`: the three sentences above, with the number of cards the life the opponents lost this turn. Not read: another count ("the top three cards"), "you may"
 * exile, another number of cards exiled, an order the controller chooses, "cast" for "play", another length ("until your next turn"), another player's library.
 */
export const EFFECT_LOOK_LOST_LIFE_EXILE_ONE_PLAY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 401.2 (Library)',
    'CR 406.3 (Exile)',
    'CR 119.3 (Life)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
  ],
  examples: [
    'look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the rest on the bottom of your library in a random order. You may play the exiled card this turn',
  ],
  rejects: [
    'look at the top three cards of your library. Exile one of those cards and put the rest on the bottom of your library in a random order. You may play the exiled card this turn',
    'look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the rest on the bottom of your library in any order. You may play the exiled card this turn',
    'look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the rest on the bottom of your library in a random order. You may cast the exiled card this turn',
    'look at the top X cards of your library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the rest on the bottom of your library in a random order',
    "look at the top X cards of target opponent's library, where X is the total amount of life your opponents lost this turn. Exile one of those cards and put the rest on the bottom of your library in a random order. You may play the exiled card this turn",
    'look at the top X cards of your library, where X is the total amount of life you lost this turn. Exile one of those cards and put the rest on the bottom of your library in a random order. You may play the exiled card this turn',
  ],
  parse: single(
    ID,
    pattern(
      new RegExp(
        `look at the top X cards of your library, where X is the total amount of life your opponents lost this turn\\. exile one of those cards and put the rest on the bottom of your library in a random order\\. you may play the exiled card this turn${BOUNDARY}`,
        'iu',
      ),
    ),
    () => ({ verb: 'lookLostLifeExileOnePlay', args: {} }),
  ),
});

export const FLORIAN_EFFECT_RULES = [quietly(EFFECT_LOOK_LOST_LIFE_EXILE_ONE_PLAY)];
