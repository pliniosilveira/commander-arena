/**
 * Trigger rule of issue 160 (D-614): "Whenever enchanted player is attacked" (Curse of Bounty, CR 303.4m, 508.1, 508.1b, 603.2): once for the declaration of attackers in
 * which at least one creature was declared as attacking the player the Aura enchants (as a player: an attack on their planeswalker is not one on them). The engine's
 * `attackBatch` with `attackedEnchantedPlayer`; whoever declares the attackers.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.enchanted-player-attacked';

export const TRIGGER_ENCHANTED_PLAYER_ATTACKED = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['enchanted'],
  cites: [
    'CR 303.4m (Enchantments)',
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['enchanted player is attacked'],
  rejects: [
    'enchanted player attacks',
    'enchanted creature is attacked',
    'enchanted player is attacked by a creature',
    'enchanted players are attacked',
    'you are attacked',
    'enchanted player is attacked.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/enchanted player is attacked(?![\p{L}\p{N}])(?!\s+by\b)/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(ID, { start: pos, end: pos }, 'eachPlayer', { raw: '' }),
        atLeast: 1,
        attackedEnchantedPlayer: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const ENCHANTED_PLAYER_TRIGGER_RULES = [TRIGGER_ENCHANTED_PLAYER_ATTACKED].map(quietly);
