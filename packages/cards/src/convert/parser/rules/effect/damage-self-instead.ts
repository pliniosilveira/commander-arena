/**
 * Effect rule of Unholy Heat (CR 120.2, 614.1a, 207.2c): "~ deals 6 damage" that ends "Delirium — ~ deals 6 damage instead if there are four or more card types among cards in your
 * graveyard.", where the sentence before it ("~ deals 2 damage to target creature or planeswalker.") has said who is dealt the damage. It names no recipient, so it means something
 * only as the "instead" of a damage sentence, and the lowering of such a sentence is the only one that reads it (`ellipticalDamage`): the engine runs the earlier `dealDamage` with the
 * new amount, for the same recipients. The same clause as `effect.damage-it`, with the source named by `~`. Anywhere else the clause has no recipient and is reported as not runnable.
 */
import { literal, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.damage-self-instead`: "~ deals 6 damage", a number of damage and no recipient. Only the lowering of a sentence that says " instead" after one damage effect reads it. Not
 * read: no number, X, a recipient ("~ deals 6 damage to target creature"), "damage equal to", "it deals 6 damage" (`effect.damage-it`).
 */
export const EFFECT_DAMAGE_SELF_INSTEAD = defineRule<Clauses>({
  id: 'effect.damage-self-instead',
  family: 'effect',
  leading: ['~'],
  cites: ['CR 120.2 (Damage)', 'CR 614.1a (Replacement Effects)'],
  examples: ['~ deals 6 damage', '~ deals three damage', '~ deals 4 damage'],
  rejects: [
    '~ deals damage',
    '~ deals X damage',
    '~ deals 6 damage to target creature',
    '~ deals 6',
    'it deals 6 damage',
    '~ deals damage equal to its power',
  ],
  parse: single(
    'effect.damage-self-instead',
    sequence(
      literal('~ deals '),
      family<IrArg>('amount', { only: ['amount.number'] }),
      literal(' damage'),
    ),
    ([, amount]) => ({ verb: 'dealDamage', args: { amount } }),
  ),
});

export const DAMAGE_SELF_INSTEAD_EFFECT_RULES = [EFFECT_DAMAGE_SELF_INSTEAD].map(quietly);
