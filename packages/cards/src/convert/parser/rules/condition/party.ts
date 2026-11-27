/**
 * The condition of a full party (CR 700.8c: a player has a full party if there are four creatures in their party): "you have a full party" (Archpriest of Iona, Squad Commander,
 * Nalia de'Arnise, Multiclass Baldric). The engine's `amountIs` of `partySize` at least 4, read as the ability triggers and again as it resolves (CR 603.4).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.full-party`: "you have a full party". Not read: another player's party, "you don't have a full party", "you have a party", "you have two creatures in your party", "you
 * had a full party", a trailing word.
 */
export const CONDITION_FULL_PARTY = defineRule<IrCondition>({
  id: 'condition.full-party',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 700.8c (General)', 'CR 603.4 (Triggered Abilities)'],
  examples: ['you have a full party', 'You have a full party'],
  rejects: [
    "you don't have a full party",
    'you have a party',
    'you have two creatures in your party',
    'you had a full party',
    'an opponent has a full party',
    'you have a full party of Clerics',
    'you have full party',
    'they have a full party',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you have a full party(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'amountIs',
          amount: { kind: 'partySize', span },
          compare: { cmp: 'atLeast', value: 4 },
        },
        span,
        rule: 'condition.full-party',
      },
      pos: r.pos,
    };
  },
});

export const PARTY_CONDITION_RULES = [CONDITION_FULL_PARTY];
