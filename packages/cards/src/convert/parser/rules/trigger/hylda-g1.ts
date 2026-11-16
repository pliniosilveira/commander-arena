/**
 * Trigger rules of group 1 of the Hylda deck (issue 42, D-1500, D-1503): "whenever you tap an untapped creature an opponent controls" and "whenever you tap one or more
 * untapped creatures your opponents control" (CR 701.26a: only an untapped permanent is tapped; CR 603.2c: one or more is one event) and "whenever you scry" (CR 701.22).
 * Each says what the text says; what the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { fail, map, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { BOUNDARY, permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.tap-untapped`: "you tap an untapped creature an opponent controls", "you tap one or more untapped creatures your opponents control" (CR 701.26a: to tap a permanent
 * is to turn it sideways from upright, so an effect that taps a permanent that is already tapped taps nothing and triggers nothing; CR 603.2c: "one or more" is one trigger for
 * the permanents tapped together). The player who taps is the controller of the effect or the cost that does it, which the engine's `tapped` event carries. The permanents are a
 * phrase of permanents after "untapped" (what they are and who controls them). Not read: the past tense, a player other than you ("an opponent taps"), a phrase with no
 * "untapped", "one or more" with a singular noun and the other way round, a number ("two untapped creatures"), tapping for mana (`trigger.tapped-for-mana`).
 */
export const TRIGGER_TAP_UNTAPPED = defineRule<IrTrigger>({
  id: 'trigger.tap-untapped',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 701.26a (Tap and Untap)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 603.2e (Handling Triggered Abilities)',
  ],
  examples: [
    'you tap an untapped creature an opponent controls',
    'you tap an untapped creature',
    'you tap one or more untapped creatures your opponents control',
    'you tap one or more untapped creatures',
    'you tap an untapped artifact an opponent controls',
  ],
  rejects: [
    'you tap a creature an opponent controls',
    'you tap an untapped creatures an opponent controls',
    'you tap one or more untapped creature an opponent controls',
    'you tap one or more creatures your opponents control',
    'you tapped an untapped creature an opponent controls',
    'an opponent taps an untapped creature',
    'you tap an untapped creature an opponent controls for mana',
    'you tap an untapped creature an opponent controls and',
    'you tap two untapped creatures an opponent controls',
    'you tap untapped creatures',
    'you tap an untapped',
    'you untap an untapped creature',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.tap-untapped';
    const head = pattern(/you tap (an untapped |one or more untapped )(?=[\p{L}])/iu)(ctx, pos);
    if (!head.ok) return head;
    const batch = /^one or more/iu.test(head.value[1] ?? '');
    const phrase = spanned(map(permanentPhrase(batch, 'all'), withoutZone))(ctx, head.pos);
    if (!phrase.ok) return phrase;
    // The phrase ends the event: "for mana", "and ..." and "or ..." after it are other events or other rules'.
    if (/^ (?:for|and|or)\b/iu.test(ctx.text.slice(phrase.pos))) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'becomesTapped',
        subject: makeNoun(id, phrase.value.span, 'a', phrase.value.value),
        actor: makeNoun(id, { start: pos, end: pos + 3 }, 'you', { raw: 'you' }),
        args: {},
        ...(batch ? { batch: true as const } : {}),
        span: { start: pos, end: phrase.pos },
        rule: id,
      },
      pos: phrase.pos,
    };
  },
});

/**
 * `trigger.scry`: "you scry", "an opponent scries", "a player scries" (CR 701.22: a player scries when they look at the top cards of their library and put them back; CR 701.22b:
 * "scry 0" is not a scry, so it triggers nothing; CR 701.22d: a scry of an empty library is one). The engine's `scries`. Not read: the past tense, "one or more", "you scry N" (a
 * number belongs to an instruction), "whenever you surveil".
 */
export const TRIGGER_SCRY = defineRule<IrTrigger>({
  id: 'trigger.scry',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 701.22 (Scry)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ['you scry', 'an opponent scries', 'a player scries'],
  rejects: [
    'you scries',
    'an opponent scry',
    'a player scry',
    'you scried',
    'you scry 2',
    'you scry or surveil',
    'you surveil',
    'each opponent scries',
    'you scry and',
    'you',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.scry';
    const r = pattern(new RegExp(`(you scry|an opponent scries|a player scries)${BOUNDARY}`, 'iu'))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    if (/^ (?:\d|or\b|and\b)/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const words = (r.value[1] ?? '').replace(/ scr(?:y|ies)$/iu, '');
    const lower = words.toLowerCase();
    const det = lower === 'you' ? 'you' : lower === 'a player' ? 'eachPlayer' : 'eachOpponent';
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'scries',
        actor: makeNoun(id, { start: pos, end: pos + words.length }, det, { raw: words }),
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const HYLDA_G1_TRIGGER_RULES = [TRIGGER_TAP_UNTAPPED, TRIGGER_SCRY].map(quietly);
