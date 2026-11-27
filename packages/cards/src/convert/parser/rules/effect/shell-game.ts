/**
 * Effect rule of Sadistic Shell Game: "Starting with the next opponent in turn order, each player chooses a creature you don't control. Destroy the chosen creatures." (CR 101.4, 608.2d,
 * 701.8): two sentences that `splitSentences` keeps together. The engine's `chooseObjects` with `perPlayer` (each player chooses one creature the controller does not control, the next
 * opponent first and the controller last) and a `destroy` of what was chosen. The lowering is in `lower/shell-game.ts`.
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.each-player-chooses-destroy-chosen';

/**
 * `effect.each-player-chooses-destroy-chosen`: the two sentences above. Not read: another order ("starting with you"), "each opponent", a creature "you control" or a permanent, only one
 * sentence, "exile" or "sacrifice" for "destroy", "the chosen creature" in the singular.
 */
export const EFFECT_EACH_PLAYER_CHOOSES_DESTROY_CHOSEN = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['starting'],
  cites: [
    'CR 101.4 (APNAP Order)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.8 (Destroy)',
  ],
  examples: [
    "starting with the next opponent in turn order, each player chooses a creature you don't control. Destroy the chosen creatures",
    'starting with the next opponent in turn order, each player chooses a creature you don’t control. Destroy the chosen creatures',
  ],
  rejects: [
    "starting with you, each player chooses a creature you don't control. Destroy the chosen creatures",
    "starting with the next opponent in turn order, each opponent chooses a creature you don't control. Destroy the chosen creatures",
    'starting with the next opponent in turn order, each player chooses a creature you control. Destroy the chosen creatures',
    "starting with the next opponent in turn order, each player chooses a permanent you don't control. Destroy the chosen permanents",
    "starting with the next opponent in turn order, each player chooses a creature you don't control",
    "starting with the next opponent in turn order, each player chooses a creature you don't control. Exile the chosen creatures",
    "starting with the next opponent in turn order, each player chooses a creature you don't control. Destroy the chosen creature",
  ],
  parse: single(
    ID,
    pattern(
      new RegExp(
        `starting with the next opponent in turn order, each player chooses a creature you don['’]t control\\. destroy the chosen creatures${BOUNDARY}`,
        'iu',
      ),
    ),
    () => ({ verb: 'eachPlayerChoosesDestroyChosen', args: {} }),
  ),
});

export const SHELL_GAME_EFFECT_RULES = [quietly(EFFECT_EACH_PLAYER_CHOOSES_DESTROY_CHOSEN)];
