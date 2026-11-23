/**
 * Trigger rules of the coin flip (Setzer, Wandering Gambler; CR 705.2, 705.3): "whenever you win a coin flip". What the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.win-coin-flip`: "you win a coin flip", "an opponent wins a coin flip", "a player wins a coin flip" (CR 705.2, 603.2: only the player who flips the coin wins or loses
 * the flip, when the call matches the result). Once each time the player wins. Not read: "lose", the past tense, "one or more flips", "a coin flip or", a verb that does not agree
 * with its subject, the plural of a player, "win the coin flip".
 */
export const TRIGGER_WIN_COIN_FLIP = defineRule<IrTrigger>({
  id: 'trigger.win-coin-flip',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 705.2 (Flipping a Coin)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['you win a coin flip', 'an opponent wins a coin flip', 'a player wins a coin flip'],
  rejects: [
    'you lose a coin flip',
    'you won a coin flip',
    'you wins a coin flip',
    'an opponent win a coin flip',
    'you win the coin flip',
    'you win two coin flips',
    'you win a coin flip and',
    'you win a coin flip or',
    'each opponent wins a coin flip',
    'you win a coin',
    'you',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.win-coin-flip';
    const r = pattern(
      new RegExp(`(you|an opponent|a player) (wins?) a coin flip${BOUNDARY}`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    const who = (r.value[1] ?? '').toLowerCase();
    const verb = (r.value[2] ?? '').toLowerCase();
    // The verb agrees with its subject: "you win", "an opponent wins".
    if (verb !== (who === 'you' ? 'win' : 'wins')) return fail(ctx, pos);
    // Another phrase follows it ("... coin flip and ...", "... coin flip or ..."): not this one.
    if (/^ (?:and|or)\b/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const det = who === 'you' ? 'you' : who === 'a player' ? 'eachPlayer' : 'eachOpponent';
    const actor = makeNoun(id, { start: pos, end: pos + who.length }, det, { raw: who });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'winsCoinFlip',
        actor,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const COIN_FLIP_TRIGGER_RULES = [TRIGGER_WIN_COIN_FLIP].map(quietly);
