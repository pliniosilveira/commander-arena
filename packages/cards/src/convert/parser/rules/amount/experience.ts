/**
 * The amount of experience counters (CR 122.1: counters a player has; Meren of Clan Nel Toth): "the number of experience counters you have". The engine's `experienceCounters`.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.experience-counters`: "the number of experience counters you have" (CR 122.1: read as the instruction runs). Not read: another player's counters, another kind of
 * counter, "experience counters on", a missing "the number of", the singular, a verb other than "have".
 */
export const AMOUNT_EXPERIENCE_COUNTERS = defineRule<IrAmount>({
  id: 'amount.experience-counters',
  family: 'amount',
  leading: ['the'],
  cites: ['CR 122.1 (Counters)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'the number of experience counters you have',
    'The number of experience counters you have',
  ],
  rejects: [
    'the number of experience counters an opponent has',
    'the number of experience counters target player has',
    'the number of experience counters you get',
    'the number of poison counters you have',
    'the number of experience counter you have',
    'the number of experience counters',
    'number of experience counters you have',
    'the number of experience counters on it',
    'your experience counters',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/the number of experience counters you have(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'experienceCounters', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const EXPERIENCE_AMOUNT_RULES = [AMOUNT_EXPERIENCE_COUNTERS];
