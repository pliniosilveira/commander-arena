/**
 * Effect rule of issue 279 (Rakdos Charm): "each creature deals 1 damage to its controller" (CR 120.3, 109.4: every creature of the group is a source of damage that is dealt to the
 * player who controls it). The engine runs `dealDamageToController` (rules/effects.ts, rules/damage-effects.ts); what can be lowered is the lowering's business
 * (`lower/controller-damage.ts`).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.deal-damage-to-its-controller`: "each creature deals 1 damage to its controller", "each creature deals 2 damage to its controller" (CR 120.3, 109.4). A group of
 * permanents with "each" and a kind; a whole number of at least one; "its controller" only. Not read: another recipient ("to you", "to each opponent"), "damage equal to its power",
 * a variable number, "deals 1 damage to itself", "deals 1 damage to its owner", a target, a singular verb with a plural subject.
 */
export const EFFECT_DEAL_DAMAGE_TO_ITS_CONTROLLER = defineRule<Clauses>({
  id: 'effect.deal-damage-to-its-controller',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 120.3 (Damage)',
    'CR 109.4 (Objects)',
    'CR 120.8 (Damage)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: [
    'each creature deals 1 damage to its controller',
    'Each creature deals 1 damage to its controller',
    'each creature deals 2 damage to its controller',
    'each creature deals one damage to its controller',
    'each artifact creature deals 1 damage to its controller',
    'each creature you control deals 1 damage to its controller',
  ],
  rejects: [
    'each creature deals damage to its controller',
    'each creature deals 0 damage to its controller',
    'each creature deals X damage to its controller',
    'each creature deals 1 damage to itself',
    'each creature deals 1 damage to its owner',
    'each creature deals 1 damage to you',
    'each creature deals 1 damage to each opponent',
    'each creature deals damage to its controller equal to its power',
    'each creature deals 1 damage to its controller and gains flying',
    'each creature deals 1 damage to its controller, then draw a card',
    'each creature deals 1 damage to its controller.',
    'each creature deals 1 damage to that creature’s controller',
    'target creature deals 1 damage to its controller',
    'each creature deal 1 damage to its controller',
  ],
  parse: single(
    'effect.deal-damage-to-its-controller',
    sequence(
      family<IrNoun>('noun', { only: ['noun.each-permanent'] }),
      literal(' deals '),
      satisfy(
        family<IrAmount>('amount', { only: ['amount.number'] }),
        (amount) => amount.kind === 'number' && amount.value >= 1,
      ),
      pattern(
        new RegExp(
          ` damage to its controller${BOUNDARY}(?!\\s*(?:,|and|then|equal)${BOUNDARY})`,
          'iu',
        ),
      ),
    ),
    ([objects, , amount]) => ({ verb: 'dealDamageToController', args: { objects, amount } }),
  ),
});

/** Quiet: it starts like a rule that reads other lines ("each creature ...") and must leave those where they were. */
export const CONTROLLER_DAMAGE_EFFECT_RULES = [quietly(EFFECT_DEAL_DAMAGE_TO_ITS_CONTROLLER)];
