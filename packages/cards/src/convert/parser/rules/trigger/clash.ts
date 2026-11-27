/**
 * Trigger rule of the clash (Marvo, Deep Operative; CR 701.30d): "whenever you win a clash". What the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.win-clash`: "you win a clash", "an opponent wins a clash", "a player wins a clash" (CR 701.30d, 603.2: a player wins a clash when the card they revealed has a greater mana
 * value than every other card revealed). Once each time the player wins. Not read: "lose", the past tense, "one or more clashes", "a clash or", a verb that does not agree with its
 * subject, the plural of a player, "win the clash".
 */
export const TRIGGER_WIN_CLASH = defineRule<IrTrigger>({
  id: 'trigger.win-clash',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 701.30d (Clash)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['you win a clash', 'an opponent wins a clash', 'a player wins a clash'],
  rejects: [
    'you lose a clash',
    'you won a clash',
    'you wins a clash',
    'an opponent win a clash',
    'you win the clash',
    'you win two clashes',
    'you win a clash and',
    'you win a clash or',
    'each opponent wins a clash',
    'you win a coin flip',
    'you',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.win-clash';
    const r = pattern(new RegExp(`(you|an opponent|a player) (wins?) a clash${BOUNDARY}`, 'iu'))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const who = (r.value[1] ?? '').toLowerCase();
    const verb = (r.value[2] ?? '').toLowerCase();
    // The verb agrees with its subject: "you win", "an opponent wins".
    if (verb !== (who === 'you' ? 'win' : 'wins')) return fail(ctx, pos);
    // Another phrase follows it ("... clash and ...", "... clash or ..."): not this one.
    if (/^ (?:and|or)\b/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const det = who === 'you' ? 'you' : who === 'a player' ? 'eachPlayer' : 'eachOpponent';
    const actor = makeNoun(id, { start: pos, end: pos + who.length }, det, { raw: who });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'winsClash',
        actor,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const CLASH_TRIGGER_RULES = [TRIGGER_WIN_CLASH].map(quietly);
