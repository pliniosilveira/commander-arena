/**
 * `condition.they-attacked-you`: "they attacked you and/or a planeswalker you control" (Ever-Watching Threshold, CR 508.1b, 603.4: a creature is declared as attacking a player, a
 * planeswalker or a battle; this counts the declaration at "you" and at the planeswalkers "you" control together, and one creature is enough). "They" is the player whose attack
 * triggered the ability (`trigger.opponent-attacks-bare`), which the lowering checks, and the condition is the intervening "if" of the ability: the engine's
 * `attackersAtYouAtLeast` with a count of one.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, quietly } from '../registry';

export const CONDITION_THEY_ATTACKED_YOU = defineRule<IrCondition>({
  id: 'condition.they-attacked-you',
  family: 'condition',
  leading: ['they'],
  cites: ['CR 508.1b (Declare Attackers Step)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ['they attacked you and/or a planeswalker you control'],
  rejects: [
    'they attacked you',
    'they attacked you or a planeswalker you control',
    'they attacked you and/or planeswalkers you control',
    'they attacked you and/or a planeswalker',
    'they attacked you and/or a planeswalker they control',
    'they attack you and/or a planeswalker you control',
    'they attacked you and/or a planeswalker you control and',
    'you attacked you and/or a planeswalker you control',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/they attacked you and\/or a planeswalker you control(?![\p{L}\p{N}'’])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'attackersAtYou', atLeast: 1 },
        span: { start: pos, end: r.pos },
        rule: 'condition.they-attacked-you',
      },
      pos: r.pos,
    };
  },
});

export const THEY_ATTACKED_YOU_CONDITION_RULES = [CONDITION_THEY_ATTACKED_YOU].map(quietly);
