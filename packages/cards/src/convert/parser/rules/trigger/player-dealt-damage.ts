/**
 * Trigger rules of the Witherbloom Witchcraft deck, group B (issue 190, Sun Droplet): "whenever you're dealt damage" (CR 120.2, 120.3, 603.2c: damage of any kind from any
 * source, one occurrence for each source and each player it damages). The engine's `dealtDamageToPlayer`.
 */
import { choice, map, pattern } from '../../combinators';
import type { IrNoun, IrTrigger } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.player-dealt-damage`: "you're dealt damage", "an opponent is dealt damage", "a player is dealt damage" (CR 120.2, 120.3, 603.2c, 603.2g: damage of any kind,
 * combat or not; damage that is entirely prevented is not dealt). "That much" is the damage that source dealt, and the player damaged is "that player" in the body. Not read:
 * "combat damage" or "noncombat damage" (a narrower event), damage by a named source ("is dealt damage by a creature"), "~" or a permanent (`trigger.dealt-damage`), "one or
 * more" (a batch), "each opponent", plural players, a past tense.
 */
export const TRIGGER_PLAYER_DEALT_DAMAGE = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.player-dealt-damage',
    family: 'trigger',
    leading: ["you're", 'you’re', 'an', 'a'],
    cites: [
      'CR 120.2 (Damage)',
      'CR 120.3 (Damage)',
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.2g (Handling Triggered Abilities)',
    ],
    examples: [
      "you're dealt damage",
      'you’re dealt damage',
      'an opponent is dealt damage',
      'a player is dealt damage',
    ],
    rejects: [
      "you're dealt combat damage",
      "you're dealt noncombat damage",
      "you're dealt damage by a creature",
      'you are dealt damage',
      "you're dealt",
      "you're dealt damage and",
      'an opponent is dealt combat damage',
      'an opponent is dealt damage by a creature',
      'a player is dealt damage by a source',
      'a creature is dealt damage',
      'each opponent is dealt damage',
      'opponents are dealt damage',
      'an opponent was dealt damage',
      "you've been dealt damage",
    ],
    parse: (ctx, pos) => {
      const id = 'trigger.player-dealt-damage';
      const who = spanned(
        choice(
          map(pattern(/you(?:'|’)re(?= dealt damage)/iu), () => 'you' as const),
          map(pattern(/an opponent is(?= dealt damage)/iu), () => 'opponent' as const),
          map(pattern(/a player is(?= dealt damage)/iu), () => 'player' as const),
        ),
      )(ctx, pos);
      if (!who.ok) return who;
      const tail = pattern(/ dealt damage(?![\p{L}\p{N}]| by )/iu)(ctx, who.pos);
      if (!tail.ok) return tail;
      const damaged = who.value.value;
      // The player damaged is the antecedent of "that player" in the body ("you" needs none).
      const recipient: IrNoun | undefined =
        damaged === 'you'
          ? undefined
          : makeNoun(id, who.value.span, damaged === 'player' ? 'eachPlayer' : 'eachOpponent', {
              raw: damaged === 'player' ? 'a player' : 'an opponent',
            });
      return {
        ok: true,
        value: {
          kind: 'trigger',
          event: 'playerDealtDamage',
          damaged,
          ...(recipient === undefined ? {} : { recipient }),
          args: {},
          span: { start: pos, end: tail.pos },
          rule: id,
        },
        pos: tail.pos,
      };
    },
  }),
);

export const PLAYER_DEALT_DAMAGE_TRIGGER_RULES = [TRIGGER_PLAYER_DEALT_DAMAGE];
