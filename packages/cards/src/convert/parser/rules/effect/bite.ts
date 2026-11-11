/**
 * Damage dealt by a creature other than the source of the ability (stage P28, D-131), the engine's `dealDamage.from`:
 * "Target creature you control deals damage equal to its power to target creature you don't control." (a bite) and
 * "Whenever a creature you control enters, it deals damage equal to its power to any target." The creature is the
 * source of the damage (CR 120.1, 120.3: its lifelink, deathtouch, infect and wither apply, and prevention for that
 * source applies; it is never combat damage); it takes none back, unlike a fight (CR 701.14).
 */
import { choice, fail, literal, map, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { NUMBER_OR_X } from '../amount/index';
import { EQUAL_AMOUNTS } from '../amount/scaled';
import { defineRule, family } from '../registry';
import { type Clauses, DAMAGE_RECIPIENTS, operands, single } from './operands';

/**
 * The amount of a damage clause, said before the recipient: "3 damage", "X damage", "damage equal to its power",
 * "damage equal to the number of creatures you control" (CR 120.3: the amount is worked out as the damage is dealt).
 */
export const DAMAGE_AMOUNT = choice<IrAmount>(
  map(
    sequence(family<IrAmount>('amount', { only: NUMBER_OR_X }), literal(' damage')),
    ([amount]) => amount,
  ),
  map(
    sequence(literal('damage '), family<IrAmount>('amount', { only: EQUAL_AMOUNTS })),
    ([, amount]) => amount,
  ),
  // Stage P34 (D-152, CR 120.3, 603.12): "it deals that much damage to any target", the amount paid or the damage of the event.
  map(
    sequence(family<IrAmount>('amount', { only: ['amount.that-much'] }), literal(' damage')),
    ([amount]) => amount,
  ),
);

/**
 * `effect.bite`: "Target creature you control deals damage equal to its power to target creature or planeswalker you
 * don't control.", "Target creature you control deals 3 damage to any target.": one target creature deals the damage
 * (CR 120.3). The two targets are chosen as the spell is cast (CR 601.2c); if the creature is no longer a legal target as
 * the spell resolves it deals no damage (CR 608.2b). "Each other creature" as the recipient is read, and not run: it
 * would leave out the source of the ability, not the creature that deals the damage.
 */
export const EFFECT_BITE = defineRule<Clauses>({
  id: 'effect.bite',
  family: 'effect',
  leading: ['target', 'another'],
  cites: [
    'CR 120.3 (Damage)',
    'CR 120.1 (Damage)',
    'CR 701.14 (Fight)',
    'CR 608.2b (Resolving Spells and Abilities)',
    'CR 115.1 (Targets)',
  ],
  examples: [
    'target creature you control deals damage equal to its power to target creature you don’t control',
    "target creature you control deals damage equal to its power to target creature or planeswalker you don't control",
    'target creature you control deals damage equal to its power to any target',
    'target creature you control deals damage equal to its toughness to target creature',
    'target creature you control deals 3 damage to target creature',
    'target creature you control deals X damage to each opponent',
    'another target creature you control deals damage equal to its power to target creature',
  ],
  rejects: [
    'target creature you control deals damage to target creature',
    '~ deals damage equal to its power to target creature',
    'target creatures you control deal damage equal to their power to target creature',
    'two target creatures you control deal damage equal to their power to target creature',
    'target creature you control deals damage equal to its power',
    'target creature you control deals damage equal to its power to',
    'target creature you control deals damage equal to its power to it',
    'target creature you control deals damage equal to its power to target creature and draw a card',
    'target creature you control deal damage equal to its power to target creature',
    'target creature you control fights target creature you don’t control',
    'target player deals damage equal to its power to target creature',
    'up to one target creature you control deals damage equal to its power to target creature',
  ],
  parse: single(
    'effect.bite',
    sequence(
      // One target creature, never "up to" or plural: it names the source of the damage.
      (ctx, pos) => {
        const r = family<IrNoun>('noun', { only: ['noun.target-permanent'] })(ctx, pos);
        if (!r.ok) return r;
        const one = !r.value.plural && !r.value.upTo && r.value.count === undefined;
        return one ? r : fail(ctx, pos);
      },
      literal(' deals '),
      DAMAGE_AMOUNT,
      literal(' to '),
      operands(DAMAGE_RECIPIENTS, 'effect.bite'),
    ),
    ([source, , amount, , to]) => ({ verb: 'dealDamage', args: { source, amount, to } }),
  ),
});

export const BITE_RULES = [EFFECT_BITE];
