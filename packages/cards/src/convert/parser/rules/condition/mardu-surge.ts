/**
 * Condition rules of the Mardu Surge deck (issue 101).
 *
 * - `condition.damage-dealt-by-type`: "any of that damage was dealt by a Warrior" (CR 510.2, 603.4): the intervening "if" of a combat damage batch trigger, which the lowering of the
 *   trigger folds into the filter of the sources (the engine's `combatDamageBatch`).
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { defineRule } from '../registry';

export const CONDITION_DAMAGE_DEALT_BY_TYPE = defineRule<IrCondition>({
  id: 'condition.damage-dealt-by-type',
  family: 'condition',
  leading: ['any'],
  cites: ['CR 510.2 (Combat Damage Step)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['any of that damage was dealt by a Warrior', 'any of that damage was dealt by an Elf'],
  rejects: [
    'all of that damage was dealt by a Warrior',
    'any of that damage was dealt by Warriors',
    'any of that damage was dealt by a Banana',
    'any of that damage was dealt by a Warrior and',
    'any of that damage was dealt by a Warrior you control',
    'any of that damage was dealt',
    'some of that damage was dealt by a Warrior',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /any of that damage was dealt by an? ([A-Z][a-z]+)(?![\p{L}\p{N}])(?! you control)/u,
    )(ctx, pos);
    if (!r.ok) return r;
    const subtype = r.value[1];
    if (subtype === undefined || !CREATURE_TYPES.has(subtype)) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'damageDealtByType', subtype },
        span: { start: pos, end: r.pos },
        rule: 'condition.damage-dealt-by-type',
      },
      pos: r.pos,
    };
  },
});

export const MARDU_SURGE_CONDITION_RULES = [CONDITION_DAMAGE_DEALT_BY_TYPE];
