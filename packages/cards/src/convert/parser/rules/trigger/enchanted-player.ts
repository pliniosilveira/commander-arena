/**
 * Trigger rules of the Grave Danger deck (issue 159, Curse of Disturbance): "Whenever enchanted player is attacked" (CR 508.3b: it triggers if one or more creatures are declared
 * as attackers attacking that player; CR 303.4m: "enchanted player" is the player the Aura with the ability is attached to, CR 702.5d). The engine's `playerAttacked`.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';

/**
 * `trigger.enchanted-player-attacked`: "enchanted player is attacked". Once for the declaration of attackers, and not when a creature is put onto the battlefield attacking
 * (CR 508.3b). Not read: "you are attacked", "a player is attacked", "enchanted creature is attacked", "enchanted player attacks".
 */
export const TRIGGER_ENCHANTED_PLAYER_ATTACKED = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.enchanted-player-attacked',
    family: 'trigger',
    leading: ['enchanted'],
    cites: [
      'CR 508.3b (Declare Attackers Step)',
      'CR 303.4m (Enchantments)',
      'CR 508.6 (Declare Attackers Step)',
    ],
    examples: ['enchanted player is attacked'],
    rejects: [
      'enchanted player attacks',
      'enchanted player is attacked.',
      'enchanted creature is attacked',
      'enchanted players are attacked',
      'enchanted player is attacked and',
      'a player is attacked',
      'you are attacked',
    ],
    parse: (ctx, pos) => {
      const r = spanned(pattern(/enchanted player is attacked(?![\p{L}\p{N}.])/iu))(ctx, pos);
      if (!r.ok) return r;
      return {
        ok: true,
        value: {
          kind: 'trigger',
          event: 'playerAttacked',
          args: {},
          span: r.value.span,
          rule: 'trigger.enchanted-player-attacked',
        },
        pos: r.pos,
      };
    },
  }),
);

export const ENCHANTED_PLAYER_TRIGGER_RULES = [TRIGGER_ENCHANTED_PLAYER_ATTACKED];
