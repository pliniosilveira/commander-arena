/**
 * Trigger rule of the card "Whenever one or more creatures an opponent controls attack you and aren't blocked, ..." (CR 509.1h, 603.2, 508.1b): `trigger.unblocked-opponent-attackers`.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.unblocked-opponent-attackers';

/**
 * `trigger.unblocked-opponent-attackers`: "one or more creatures an opponent controls attack you and aren't blocked" (CR 509.1h: an attacking creature no creature was declared to
 * block is unblocked; CR 508.1b: "attack you" is an attack on the player, not on a planeswalker or a battle). The engine's `unblockedAttackBatch` of an opponent: once for
 * each opponent whose creatures attack the controller of the ability and are not blocked; "that player" of the effect is that opponent. Not read: "one or more" left out,
 * "you control", "a player controls", another player attacked ("attack target player"), "attack and are blocked", "attack you or a planeswalker you control", "isn't blocked".
 */
export const TRIGGER_UNBLOCKED_OPPONENT_ATTACKERS = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 509.1h (Declare Blockers Step)',
    'CR 508.1b (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ["one or more creatures an opponent controls attack you and aren't blocked"],
  rejects: [
    "one or more creatures you control attack you and aren't blocked",
    "one or more creatures a player controls attack you and aren't blocked",
    'one or more creatures an opponent controls attack you and are blocked',
    "one or more creatures an opponent controls attack you and isn't blocked",
    "one or more creatures an opponent controls attack you or a planeswalker you control and aren't blocked",
    "one or more creatures an opponent controls attack and aren't blocked",
    "creatures an opponent controls attack you and aren't blocked",
    "one or more creatures an opponent controls attack you and aren't blocked by a creature",
    "one creature an opponent controls attacks you and isn't blocked",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /one or more creatures an opponent controls attack you and aren['’]t blocked(?![\p{L}\p{N}'’])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const who = 'an opponent';
    const at = pos + 'one or more creatures '.length;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'unblockedAttackBatch',
        actor: makeNoun(ID, { start: at, end: at + who.length }, 'eachOpponent', { raw: who }),
        args: {},
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const UNBLOCKED_TRIGGER_RULES = [TRIGGER_UNBLOCKED_OPPONENT_ATTACKERS].map(quietly);
