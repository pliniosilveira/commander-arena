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
 */
export const TRIGGER_SCRY_OR_SURVEIL = defineRule<IrTrigger>({
  id: 'trigger.scry-or-surveil',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: [
    'CR 701.22 (Scry)',
    'CR 701.25 (Surveil)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: [
    'you scry or surveil',
    'you surveil',
    'an opponent scries or surveils',
    'a player surveils',
    'a player scries or surveils',
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
    if (
      (scryWord !== '' && scryWord !== (singular ? 'scries' : 'scry')) ||
      surveilWord !== (singular ? 'surveils' : 'surveil') ||
      /^ (?:\d|and\b|or\b|,)/iu.test(ctx.text.slice(r.pos))
    ) {
      return fail(ctx, pos);
    }
    const det = who === 'you' ? 'you' : who === 'a player' ? 'eachPlayer' : 'eachOpponent';
    const actor = makeNoun(id, { start: pos, end: pos + who.length }, det, { raw: who });
    const span = { start: pos, end: r.pos };
    const surveil: IrTrigger = {
      kind: 'trigger',
      event: 'surveils',
      actor,
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
      pos: r.pos,
    };
  },
});

export const GALADRIEL_G1_TRIGGER_RULES = [TRIGGER_SCRY_OR_SURVEIL].map(quietly);
