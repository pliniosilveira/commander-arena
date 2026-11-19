/**
 * Effect rule of the Multiverse Reforged deck (issue 81, The Ur-Sphinx): "For each player, you may cast a card that player milled this way without paying its mana cost."
 */
import { literal } from '../../combinators';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.cast-milled-each-player`: "for each player, you may cast a card that player milled this way without paying its mana cost" (CR 701.17a, 608.2g, 118.9, 101.4): after an
 * instruction that milled cards, the controller is asked once for each player whose cards were milled, and may cast one of that player's cards from their graveyard without paying
 * its mana cost. The engine's `castFree` of the cards moved with `perOwner`; the lowering refuses the sentence after any instruction but a mill. Not read: "up to", other
 * players, "a spell", a cost.
 */
export const EFFECT_CAST_MILLED_EACH_PLAYER = defineRule<Clauses>({
  id: 'effect.cast-milled-each-player',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 701.17a (Mill)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 101.4 (Handling Simultaneous Choices)',
  ],
  examples: [
    'for each player, you may cast a card that player milled this way without paying its mana cost',
  ],
  rejects: [
    'for each player, you may cast a card that player milled this way',
    'for each player, you may cast a card that player milled this way without paying its mana cost.',
    'for each opponent, you may cast a card that player milled this way without paying its mana cost',
    'for each player, you may cast up to one card that player milled this way without paying its mana cost',
    'for each player, you may cast two cards that player milled this way without paying their mana costs',
    'for each player, you may cast a card that player milled without paying its mana cost',
    'for each player, you may cast a card that player discarded this way without paying its mana cost',
    'for each player, you cast a card that player milled this way without paying its mana cost',
    'for each player, they may cast a card that player milled this way without paying its mana cost',
  ],
  parse: single(
    'effect.cast-milled-each-player',
    literal(
      'for each player, you may cast a card that player milled this way without paying its mana cost',
    ),
    () => ({ verb: 'castMilledEachPlayer', args: {} }),
  ),
});

export const CAST_MILLED_EFFECT_RULES = [EFFECT_CAST_MILLED_EACH_PLAYER].map(quietly);
