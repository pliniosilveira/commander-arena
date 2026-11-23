/**
 * `effect.damage-by-it-count`: "it deals damage to any target equal to the number of Elementals you control": the permanent the ability is on ("it", read as `~` by the binding
 * pass for a trigger about `~`) deals damage counted as it resolves (CR 120.3 (Damage), CR 608.2c (Resolving Spells and Abilities)). The neighbour of `effect.damage-count`, which
 * reads `~` as the source, and of `effect.damage-by-it`, which reads a stated amount or the amount before the recipient.
 */
import { literal, sequence } from '../../combinators';
import type { IrArg, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, DAMAGE_RECIPIENTS, operands, single } from './operands';

export const EFFECT_DAMAGE_BY_IT_COUNT = defineRule<Clauses>({
  id: 'effect.damage-by-it-count',
  family: 'effect',
  leading: ['it'],
  cites: ['CR 120.3 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'it deals damage to any target equal to the number of Elementals you control',
    'it deals damage to target creature equal to the number of lands you control',
  ],
  rejects: [
    'it deals damage to any target',
    'it deals damage to any target equal to the number of',
    'it deals 2 damage to any target equal to the number of Elementals you control',
    'its deals damage to any target equal to the number of Elementals you control',
    '~ deals damage to any target equal to the number of Elementals you control',
  ],
  parse: single(
    'effect.damage-by-it-count',
    sequence(
      family<IrNoun>('noun', { only: ['noun.it'] }),
      literal(' deals damage to '),
      operands(DAMAGE_RECIPIENTS, 'effect.damage-by-it-count'),
      literal(' equal to '),
      family<IrArg>('amount', { only: ['amount.number-of'] }),
    ),
    ([source, , to, , amount]) => ({ verb: 'dealDamage', args: { source, amount, to } }),
  ),
});

export const DAMAGE_IT_COUNT_EFFECT_RULES = [EFFECT_DAMAGE_BY_IT_COUNT];
