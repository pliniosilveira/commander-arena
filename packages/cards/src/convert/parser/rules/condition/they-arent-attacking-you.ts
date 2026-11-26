/**
 * `condition.they-arent-attacking-you`: "they aren't attacking you" (Mirkwood Trapper, CR 508.1b, 603.4: a creature is declared as attacking a player, a planeswalker or a battle;
 * "you" is the player alone, so an attack on a planeswalker you control is not an attack on you). "They" is the player whose attack triggered the ability (`trigger.player-attacks-bare`),
 * which the lowering checks, and the condition is the intervening "if" of the ability: the engine's `attackersAttackedYou`, negated.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, quietly } from '../registry';

export const CONDITION_THEY_ARENT_ATTACKING_YOU = defineRule<IrCondition>({
  id: 'condition.they-arent-attacking-you',
  family: 'condition',
  leading: ['they'],
  cites: ['CR 508.1b (Declare Attackers Step)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ["they aren't attacking you", 'they aren’t attacking you'],
  rejects: [
    "they aren't attacking you or a planeswalker you control",
    "they aren't attacking",
    "they aren't attacking me",
    "they aren't attacking an opponent",
    'they are attacking you',
    "they aren't attacked you",
    "they aren't attacking you and",
    "you aren't attacking you",
    'they are not attacking you',
  ],
  parse: (ctx, pos) => {
    // "or a planeswalker you control" says the opposite of what the engine reads ("attacking you" is the player alone): not read.
    const r = pattern(
      /they aren['’]t attacking you(?![\p{L}\p{N}'’])(?!\s+(?:or|and)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const rule = 'condition.they-arent-attacking-you';
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'not',
          term: { kind: 'condition', test: { kind: 'attackersAttackedYou' }, span, rule },
        },
        span,
        rule,
      },
      pos: r.pos,
    };
  },
});

export const THEY_ARENT_ATTACKING_YOU_CONDITION_RULES = [CONDITION_THEY_ARENT_ATTACKING_YOU].map(
  quietly,
);
