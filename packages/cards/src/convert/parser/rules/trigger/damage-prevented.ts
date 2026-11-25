/**
 * Trigger rules of the Riders of Rohan deck, group D (Selfless Squire): "whenever damage that would be dealt to you is prevented" (CR 615.6, 120.2, 603.2c: damage a prevention effect
 * prevented, once for each source and each player it would have damaged). The engine's `damageToPlayerPrevented`.
 */
import { map, pattern } from '../../combinators';
import type { IrNoun, IrTrigger } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.damage-to-player-prevented`: "damage that would be dealt to you is prevented", "damage that would be dealt to an opponent is prevented", "damage that would be dealt to a
 * player is prevented" (CR 615.6, 603.2c). "That many" is the damage prevented, and the player it would have damaged is "that player" in the body. Not read: damage to a creature, a
 * named source, "all damage", "combat damage", "one or more", a past tense, "if damage ... is prevented" of a replacement.
 */
export const TRIGGER_DAMAGE_TO_PLAYER_PREVENTED = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.damage-to-player-prevented',
    family: 'trigger',
    leading: ['damage'],
    cites: [
      'CR 615.6 (Damage Prevention Effects)',
      'CR 120.2 (Damage)',
      'CR 603.2c (Handling Triggered Abilities)',
    ],
    examples: [
      'damage that would be dealt to you is prevented',
      'damage that would be dealt to an opponent is prevented',
      'damage that would be dealt to a player is prevented',
    ],
    rejects: [
      'damage that would be dealt to you is',
      'damage that would be dealt to you was prevented',
      'damage that would be dealt to a creature is prevented',
      'damage that would be dealt to target player is prevented',
      'damage that would be dealt to you by a creature is prevented',
      'damage that would be dealt to you is prevented and',
      'combat damage that would be dealt to you is prevented',
      'damage is prevented',
      'damage that would be dealt to each opponent is prevented',
    ],
    parse: (ctx, pos) => {
      const id = 'trigger.damage-to-player-prevented';
      const who = spanned(
        map(
          pattern(
            /damage that would be dealt to (you|an opponent|a player)(?= is prevented(?![\p{L}\p{N}]))/iu,
          ),
          (m) => (m[1] === 'you' ? 'you' : m[1] === 'a player' ? 'player' : ('opponent' as const)),
        ),
      )(ctx, pos);
      if (!who.ok) return who;
      const tail = pattern(/ is prevented(?![\p{L}\p{N}])/iu)(ctx, who.pos);
      if (!tail.ok) return tail;
      const damaged: 'you' | 'opponent' | 'player' = who.value.value;
      // The player whose damage it was is the antecedent of "that player" in the body ("you" needs none).
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
          event: 'damageToPlayerPrevented',
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

export const DAMAGE_PREVENTED_TRIGGER_RULES = [TRIGGER_DAMAGE_TO_PLAYER_PREVENTED];
