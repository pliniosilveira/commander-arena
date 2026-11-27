/**
 * Effect rule of the Exit from Exile deck (Green Slime): "If a permanent's ability is countered this way, destroy that permanent." (CR 701.6a, 701.8, 113.7a). The words of the whole
 * sentence are one instruction: destroy the permanents that were the sources of the abilities the counter instruction before it countered (the engine's `moved`).
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.destroy-countered-ability-source';

/**
 * `effect.destroy-countered-ability-source`: "If a permanent's ability is countered this way, destroy that permanent". Only after a counter of an ability, which the lowering requires. Not read:
 * another verb, "exile", a spell, "this way" missing, "if" missing, a second instruction.
 */
export const EFFECT_DESTROY_COUNTERED_ABILITY_SOURCE = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['if'],
  cites: [
    'CR 701.6a (Counter)',
    'CR 701.8 (Destroy)',
    'CR 113.7a (Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ["If a permanent's ability is countered this way, destroy that permanent"],
  rejects: [
    "If a permanent's ability is countered this way, exile that permanent",
    'If a spell is countered this way, destroy that permanent',
    "If a permanent's ability is countered, destroy that permanent",
    "If a permanent's ability is countered this way, destroy it",
    "If a permanent's ability is countered this way, destroy that permanent and draw a card",
  ],
  parse: single(
    ID,
    pattern(
      /if a permanent['’]s ability is countered this way, destroy that permanent(?![\p{L}\p{N}])(?! and\b| then\b|,)/iu,
    ),
    () => ({ verb: 'destroyCounteredAbilitySource', args: {} }),
  ),
});

export const DESTROY_COUNTERED_SOURCE_EFFECT_RULES = [EFFECT_DESTROY_COUNTERED_ABILITY_SOURCE];
