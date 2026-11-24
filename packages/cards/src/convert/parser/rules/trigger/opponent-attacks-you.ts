/**
 * Trigger rule of the Counter Blitz deck (Lulu, Stern Guardian): "an opponent attacks you" (CR 508.1b, 603.2, 603.2c): once for the declaration of attackers in which at least one
 * creature was declared as attacking the controller of the ability as a player (an attack on their planeswalker or battle is not one on them), however many creatures attack. The
 * engine's `attackBatch` with `attackedYou`; "that player" in the body is the attacking opponent.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.opponent-attacks-you';

export const TRIGGER_OPPONENT_ATTACKS_YOU = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['an', 'another'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['an opponent attacks you', 'another player attacks you'],
  rejects: [
    'an opponent attacks',
    'an opponent attacks you or a planeswalker you control',
    'an opponent attacks you with two or more creatures',
    'an opponent attack you',
    'an opponent attacks you and',
    'a player attacks you',
    'you attack an opponent',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /(?:an opponent|another player) attacks you(?![\p{L}\p{N}'’])(?! (?:or|and|with)\b)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(ID, span, 'eachOpponent', { raw: 'an opponent' }),
        atLeast: 1,
        attackedYou: true,
        args: {},
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const OPPONENT_ATTACKS_YOU_TRIGGER_RULES = [TRIGGER_OPPONENT_ATTACKS_YOU].map(quietly);
