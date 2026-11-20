/**
 * Trigger rule of Landroval, Horizon Witness (Food and Fellowship deck): "Whenever two or more creatures you control attack a player" (CR 508.1b, 508.6, 603.2c).
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.n-or-more-attack-a-player`: "two or more creatures you control attack a player" (CR 508.1b, 508.6: a creature attacks a player when it is declared attacking that
 * player, not their planeswalker or battle; CR 603.2c: one trigger for each player attacked, counting only the creatures that attack that player). The engine's `attackBatch`
 * of `who` "you" with `atLeast` the number and `eachAttackedPlayer`. Not read: one ("one or more" is `trigger.attack-one-or-more`), a kind of creature, another controller,
 * "attack you", "attacks", more words after "a player".
 */
export const TRIGGER_N_OR_MORE_ATTACK_A_PLAYER = defineRule<IrTrigger>({
  id: 'trigger.n-or-more-attack-a-player',
  family: 'trigger',
  leading: ['two', 'three', 'four', 'five', 'six'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'two or more creatures you control attack a player',
    'three or more creatures you control attack a player',
  ],
  rejects: [
    'one or more creatures you control attack a player',
    'two or more creatures attack a player',
    'two or more creatures an opponent controls attack a player',
    'two or more Elves you control attack a player',
    'two or more creatures you control attack',
    'two or more creatures you control attack you',
    'two or more creatures you control attacks a player',
    'two or more creatures you control attack a players',
    'two or more creatures you control attack a player and',
    'two or more creatures you control attack a player or',
    'two creatures you control attack a player',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.n-or-more-attack-a-player';
    const r = sequence(
      spanned(satisfy(quantity, (n) => n >= 2)),
      literal(' or more creatures you control attack a player'),
    )(ctx, pos);
    if (!r.ok) return r;
    if (pattern(/(?:[\p{L}\p{N}]|\s+(?:and|or)(?![\p{L}\p{N}]))/iu)(ctx, r.pos).ok) {
      return fail(ctx, pos);
    }
    const actor = makeNoun(id, { start: pos, end: pos }, 'you', { raw: '' });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor,
        atLeast: r.value[0].value,
        eachAttackedPlayer: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const ATTACK_A_PLAYER_TRIGGER_RULES = [TRIGGER_N_OR_MORE_ATTACK_A_PLAYER];
