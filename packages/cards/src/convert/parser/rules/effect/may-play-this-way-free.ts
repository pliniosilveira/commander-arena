/**
 * Effect rule of the Exit from Exile deck (Ignite the Future): "you may play cards this way without paying their mana costs" (CR 118.9, 601.2, 305.1, 611.2a). It says only that the permission
 * of the sentence before it, which the lowering reads, costs nothing; the condition of the sentence ("If ~ was cast from a graveyard,") is its own.
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.may-play-this-way-free';

/**
 * `effect.may-play-this-way-free`: the player may play the cards the instruction before it exiled, as long as the permission before it lasts, without paying their mana costs. The
 * engine's `mayPlay` with `free`, lasting as the earlier one does. Not read: "cast", a duration of its own, "that card", a second instruction in the sentence.
 */
export const EFFECT_MAY_PLAY_THIS_WAY_FREE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['you', 'play'],
  cites: [
    'CR 118.9 (Alternative Costs)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'you may play cards this way without paying their mana costs',
    'play cards this way without paying their mana costs',
  ],
  rejects: [
    'you may cast cards this way without paying their mana costs',
    'you may play cards this way',
    'you may play cards this way without paying their mana costs this turn',
    'you may play that card this way without paying its mana cost',
    'you may play cards this way without paying their mana costs and draw a card',
    'you may play cards without paying their mana costs',
  ],
  parse: single(
    ID,
    pattern(
      /(?:you may )?play cards this way without paying their mana costs(?![\p{L}\p{N}])(?!\s+(?:this|and|then|until)\b)/iu,
    ),
    () => ({ verb: 'mayPlayThisWayFree', args: {} }),
  ),
});

export const MAY_PLAY_THIS_WAY_FREE_EFFECT_RULES = [EFFECT_MAY_PLAY_THIS_WAY_FREE];
