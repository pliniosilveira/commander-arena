/**
 * Trigger rules of group 1 of the Galadriel deck (issue 43): "whenever you scry or surveil" (Matoya, Archon Elder; CR 701.22 and 701.25: scrying and surveilling are two different
 * actions, so the ability is one ability for each of the two events, sharing its body, CR 603.2c) and "whenever you surveil" by itself. Each says what the text says; what the engine
 * can run is the lowering's business (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.scry-or-surveil`: "you scry or surveil", "you surveil", "an opponent scries or surveils", "a player surveils" (CR 701.22, 701.25, 603.2c). "A or B" is one engine ability
 * for each event (`scries` and `surveils`), as every "or" of events is. Not read: the past tense, a number ("you surveil 2" belongs to an instruction), "one or more", a list of three
 * ("you scry, surveil, or"), the order "surveil or scry", the plural of a player ("opponents scry").
 * Whispering Snitch (Revenant Recon deck): "you surveil for the first time each turn" is the surveil of the controller only when it is the first of the turn (CR 603.2); not read
 * with "scry or", nor for another player, where "the first time each turn" would be ambiguous.
 */
export const TRIGGER_SCRY_OR_SURVEIL = defineRule<IrTrigger>({
  id: 'trigger.scry-or-surveil',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 701.22 (Scry)', 'CR 701.25 (Surveil)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: [
    'you scry or surveil',
    'you surveil',
    'an opponent scries or surveils',
    'a player surveils',
    'a player scries or surveils',
    'you surveil for the first time each turn',
  ],
  rejects: [
    'you scry',
    'you scry or surveil 2',
    'you surveil 2',
    'you surveilled',
    'you scried or surveilled',
    'you surveil or scry',
    'you scry, surveil, or',
    'you scry or surveils',
    'an opponent scry or surveil',
    'each opponent scries or surveils',
    'one or more players surveil',
    'you surveil and',
    'you scry or surveil and',
    'you',
    'you scry or surveil for the first time each turn',
    'an opponent surveils for the first time each turn',
    'a player surveils for the first time each turn',
    'you surveil for the first time',
    'you surveil for the first time this turn',
    'you surveil for the second time each turn',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.scry-or-surveil';
    const r = pattern(
      new RegExp(
        `(you|an opponent|a player) (?:(scry|scries) or )?(surveil|surveils)${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const who = (r.value[1] ?? '').toLowerCase();
    const scryWord = (r.value[2] ?? '').toLowerCase();
    const surveilWord = (r.value[3] ?? '').toLowerCase();
    // The verb agrees with its subject: "you scry or surveil", "an opponent scries or surveils".
    const singular = who !== 'you';
    // Whispering Snitch: " for the first time each turn" ends the phrase of the controller's plain surveil, and of no other.
    const first = pattern(/ for the first time each turn(?![\p{L}\p{N}])/iu)(ctx, r.pos);
    if (
      (scryWord !== '' && scryWord !== (singular ? 'scries' : 'scry')) ||
      surveilWord !== (singular ? 'surveils' : 'surveil') ||
      (first.ok && (who !== 'you' || scryWord !== '')) ||
      /^ (?:\d|and\b|or\b|,)/iu.test(ctx.text.slice(r.pos))
    ) {
      return fail(ctx, pos);
    }
    const end = first.ok ? first.pos : r.pos;
    const det = who === 'you' ? 'you' : who === 'a player' ? 'eachPlayer' : 'eachOpponent';
    const actor = makeNoun(id, { start: pos, end: pos + who.length }, det, { raw: who });
    const span = { start: pos, end };
    const surveil: IrTrigger = {
      kind: 'trigger',
      event: 'surveils',
      actor,
      ...(first.ok ? { firstEachTurn: true as const } : {}),
      args: {},
      span,
      rule: id,
    };
    return {
      ok: true,
      value:
        scryWord === ''
          ? surveil
          : {
              kind: 'trigger',
              event: 'scries',
              actor,
              args: {},
              alternatives: [surveil],
              span,
              rule: id,
            },
      pos: end,
    };
  },
});

export const GALADRIEL_G1_TRIGGER_RULES = [TRIGGER_SCRY_OR_SURVEIL].map(quietly);
