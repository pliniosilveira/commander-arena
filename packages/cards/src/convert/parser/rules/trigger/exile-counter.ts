/**
 * Trigger rule of the surveil group of the Revenant Recon deck (Watcher of Hours): "Whenever you remove a time counter from this card while it's exiled, surveil 1." The ability of a
 * suspended card that works from exile (CR 113.6b, 702.62a): it triggers each time the player removes a time counter from the card, which Suspend's upkeep trigger does.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

/**
 * `trigger.remove-counter-exiled`: "you remove a time counter from ~ while it's exiled" (CR 122.1, 113.6b, 603.2). Only the controller of the ability, only ~ itself, only a time counter, only
 * while the card is exiled. Not read: another player, another permanent, another kind of counter, "one or more", another zone, a missing "while".
 */
export const TRIGGER_REMOVE_COUNTER_EXILED = defineRule<IrTrigger>({
  id: 'trigger.remove-counter-exiled',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 113.6b (Abilities)',
    'CR 702.62a (Suspend)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: [
    "you remove a time counter from ~ while it's exiled",
    'you remove a time counter from ~ while it’s exiled',
    // The card names itself "this card": the normalization of the self nouns does not read it as "~" (a spell and a card in a hand say it too).
    "you remove a time counter from this card while it's exiled",
  ],
  rejects: [
    'you remove a time counter from ~',
    'you remove a time counter from this card',
    "you remove a time counter from this creature while it's exiled",
    "you remove a +1/+1 counter from ~ while it's exiled",
    "you remove a time counter from another card while it's exiled",
    "an opponent removes a time counter from ~ while it's exiled",
    "you remove a time counter from ~ while it's on the battlefield",
    "you remove one or more time counters from ~ while it's exiled",
    "you remove a time counter from ~ while it's exiled and",
    "you remove a time counter from ~ while it's in exile",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you remove a time counter from (~|this card) while it['’]s exiled(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const actor = makeNoun('trigger.remove-counter-exiled', { start: pos, end: pos + 3 }, 'you', {
      raw: 'you',
    });
    const from = pos + 'you remove a time counter from '.length;
    const subject = makeNoun(
      'trigger.remove-counter-exiled',
      { start: from, end: from + (r.value[1] ?? '').length },
      'self',
      { raw: '~' },
    );
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'countersRemoved',
        actor,
        subject,
        counter: 'time',
        whileExiled: true,
        args: {},
        span,
        rule: 'trigger.remove-counter-exiled',
      },
      pos: r.pos,
    };
  },
});

export const EXILE_COUNTER_TRIGGER_RULES = [TRIGGER_REMOVE_COUNTER_EXILED].map(quietly);
