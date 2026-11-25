/**
 * `condition.youre-defending-player`: "you're the defending player" (Kazuul, Tyrant of the Cliffs; CR 508.5: the defending player of an attacking creature is the player it attacks, the
 * controller of the planeswalker it attacks or the protector of the battle it attacks; CR 603.4: the intervening "if" of the attack trigger). The condition is about the creature the
 * trigger is about, so the lowering folds it into the event of an `attacks` trigger (`at: 'defendingYou'`); it is read for no other ability.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, quietly } from '../registry';

export const CONDITION_YOURE_DEFENDING_PLAYER = defineRule<IrCondition>({
  id: 'condition.youre-defending-player',
  family: 'condition',
  leading: ["you're", 'you’re', 'you'],
  cites: ['CR 508.5 (Declare Attackers Step)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: ["you're the defending player", 'you’re the defending player'],
  rejects: [
    "you're a defending player",
    "you're the defending players",
    "you're not the defending player",
    "you're the attacking player",
    "you're the defending player and",
    "they're the defending player",
    'you are the defending player and',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you(?:['’]re| are) the defending player(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'youAreDefendingPlayer' },
        span: { start: pos, end: r.pos },
        rule: 'condition.youre-defending-player',
      },
      pos: r.pos,
    };
  },
});

export const DEFENDING_PLAYER_CONDITION_RULES = [CONDITION_YOURE_DEFENDING_PLAYER].map(quietly);
