/**
 * Lowerings of the Riders of Rohan deck (Champions of Minas Tirith, Fealty to the Realm): same contract as effects.ts, each declares the engine features it needs and is checked before it
 * runs.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

/**
 * "That opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you this combat." (CR 118.12a, 107.3, 508.1a, 511.3): the engine's `unlessPays`
 * of the player the trigger is about with `xIsHandSize`, and `creaturesCantAttackYou` of the creatures that player controls until the end of combat. Refused outside a trigger about a
 * player (`validateCard` refuses `triggerPlayer` anywhere else).
 */
const PAY_HAND_OR_CANT_ATTACK_YOU: Lowering<IrClause, Effects> = {
  head: 'payHandOrCantAttackYou',
  id: 'lower.pay-hand-or-cant-attack-you',
  needs: ['effect:unlessPays', 'effect:creaturesCantAttackYou', 'cost:mana', 'duration:thisCombat'],
  lower(clause) {
    return {
      ok: true,
      value: [
        {
          kind: 'unlessPays',
          player: { kind: 'triggerPlayer' },
          cost: [{ kind: 'mana', symbols: ['X'] }],
          xIsHandSize: true,
          effect: {
            kind: 'creaturesCantAttackYou',
            creatures: { types: ['creature'] },
            duration: 'thisCombat',
            player: { kind: 'triggerPlayer' },
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const MONARCH_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  PAY_HAND_OR_CANT_ATTACK_YOU,
];
