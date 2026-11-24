/**
 * Effect rule of the initiative (CR 726, From the Catacombs): "You take the initiative." is a keyword-like action of the controller of the spell or ability: the designation
 * moves to them, and the inherent abilities of the initiative (CR 726.2) make them venture into Undercity; the engine's `takeInitiative` (`rules/initiative.ts`) does the first,
 * its inherent triggers the second.
 */
import { literal } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.take-initiative`: "you take the initiative" (CR 726.1, 726.5: also when the player has it already). Only "you": the engine's node takes any one player, but no card
 * the grammar reads says another, and nothing is guessed. The words after it ("..., then draw a card" is a second clause the sentence rules split off) are not part of this one.
 */
export const EFFECT_TAKE_INITIATIVE = defineRule<Clauses>({
  id: 'effect.take-initiative',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 726.1 (The Initiative)', 'CR 726.5 (The Initiative)'],
  examples: ['you take the initiative', 'You take the initiative'],
  rejects: [
    'you take the initiative twice',
    'you take the initiative and draw a card',
    'target player takes the initiative',
    'you takes the initiative',
    'you take initiative',
    'you may take the initiative',
    'you take the monarch',
    'take the initiative',
  ],
  parse: single('effect.take-initiative', literal('you take the initiative'), () => ({
    verb: 'takeInitiative',
    args: {},
  })),
});

export const INITIATIVE_EFFECT_RULES = [EFFECT_TAKE_INITIATIVE];
