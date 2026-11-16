/**
 * Trigger rules of group 3 of the Galadriel deck (issue 43): "whenever you roll a die's highest natural result" (Netherese Puzzle-Ward; CR 706.1a: a die with N sides has N
 * outcomes numbered 1 to N, so its highest is N; CR 706.2: the natural result is the number on the top face before any modifier). What the engine can run is the lowering's
 * business (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.roll-highest`: "you roll a die's highest natural result", "an opponent rolls a die's highest natural result", "a player rolls a die's highest natural result"
 * (CR 706.1a, 706.2, 603.2). Once for each die the player rolls whose natural result is the most it can show. Not read: any other result ("lowest", "natural 1"), no "natural",
 * the past tense, "dice", several dice at once ("one or more dice"), the plural of a player, a verb that does not agree with its subject.
 */
export const TRIGGER_ROLL_HIGHEST = defineRule<IrTrigger>({
  id: 'trigger.roll-highest',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: [
    'CR 706.1a (Rolling a Die)',
    'CR 706.2 (Rolling a Die)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    'you roll a die’s highest natural result',
    "you roll a die's highest natural result",
    'an opponent rolls a die’s highest natural result',
    'a player rolls a die’s highest natural result',
  ],
  rejects: [
    'you roll a die',
    'you roll a die’s lowest natural result',
    'you roll a die’s highest result',
    'you roll a die’s highest natural results',
    'you rolled a die’s highest natural result',
    'you roll dice’s highest natural result',
    'you roll one or more dice’s highest natural result',
    'an opponent roll a die’s highest natural result',
    'you rolls a die’s highest natural result',
    'each opponent rolls a die’s highest natural result',
    'you roll a die’s highest natural result and',
    'you roll a die’s highest natural result of',
    'you',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.roll-highest';
    const r = pattern(
      new RegExp(
        `(you|an opponent|a player) (rolls?) a die['’]s highest natural result${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const who = (r.value[1] ?? '').toLowerCase();
    const verb = (r.value[2] ?? '').toLowerCase();
    // The verb agrees with its subject: "you roll", "an opponent rolls".
    if (verb !== (who === 'you' ? 'roll' : 'rolls')) return fail(ctx, pos);
    // Another phrase follows it ("... result of ...", "... result and ..."): not this one.
    if (/^ (?:of|and)\b/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const det = who === 'you' ? 'you' : who === 'a player' ? 'eachPlayer' : 'eachOpponent';
    const actor = makeNoun(id, { start: pos, end: pos + who.length }, det, { raw: who });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'rollsHighest',
        actor,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const GALADRIEL_G3_TRIGGER_RULES = [TRIGGER_ROLL_HIGHEST].map(quietly);
