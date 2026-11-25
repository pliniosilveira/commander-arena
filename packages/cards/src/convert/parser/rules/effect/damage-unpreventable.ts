/**
 * Effect rule of the Exit from Exile deck (Stomp, the Adventure of Bonecrusher Giant): "Damage can't be prevented this turn." (CR 615.12, 101.2, 611.2a). The engine's
 * `damageCantBePreventedThisTurn`.
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.damage-cant-be-prevented-this-turn';

/**
 * `effect.damage-cant-be-prevented-this-turn`: "Damage can't be prevented this turn" (CR 615.12: damage that can't be prevented is dealt as it would be if no prevention effect applied; CR
 * 611.2a: the effect lasts for the turn). Not read: the static ability without "this turn" (`static.damage-cant-be-prevented`), another length, damage dealt by or to a stated object, a second
 * instruction in the same sentence.
 */
export const EFFECT_DAMAGE_CANT_BE_PREVENTED_THIS_TURN = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['damage'],
  cites: [
    'CR 615.12 (Prevention Effects)',
    'CR 101.2 (Golden Rules)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: ["Damage can't be prevented this turn", 'Damage can’t be prevented this turn'],
  rejects: [
    "Damage can't be prevented",
    "Damage can't be prevented this combat",
    "Damage dealt by creatures can't be prevented this turn",
    "Combat damage can't be prevented this turn",
    "Damage can't be prevented this turn and you gain 1 life",
    "Damage can't be prevented until end of turn",
  ],
  parse: single(
    ID,
    pattern(/damage can['’]t be prevented this turn(?![\p{L}\p{N}])(?! and\b| then\b|,)/iu),
    () => ({ verb: 'damageCantBePreventedThisTurn', args: {} }),
  ),
});

export const DAMAGE_UNPREVENTABLE_EFFECT_RULES = [EFFECT_DAMAGE_CANT_BE_PREVENTED_THIS_TURN];
