/**
 * Trigger rule of voting (Erestor of the Council, Model of Unity; CR 701.38a, 603.2): "whenever players finish voting". What the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';

/**
 * `trigger.players-finish-voting`: "players finish voting" (CR 701.38a, 603.2: once each time every player has voted in a vote, of any spell or ability, whoever controls it). Not read: "you
 * finish voting", "a player finishes voting", another tense, words after "voting".
 */
export const TRIGGER_PLAYERS_FINISH_VOTING = defineRule<IrTrigger>({
  id: 'trigger.players-finish-voting',
  family: 'trigger',
  leading: ['players'],
  cites: ['CR 701.38a (Vote)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['players finish voting'],
  rejects: [
    'you finish voting',
    'a player finishes voting',
    'players finished voting',
    'players finish voting and',
    'players finish',
    'players finish voting or',
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`players finish voting${BOUNDARY}`, 'iu'))(ctx, pos);
    if (!r.ok) return r;
    if (/^ (?:and|or)\b/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'votingFinished',
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.players-finish-voting',
      },
      pos: r.pos,
    };
  },
});

export const VOTING_TRIGGER_RULES = [TRIGGER_PLAYERS_FINISH_VOTING].map(quietly);
