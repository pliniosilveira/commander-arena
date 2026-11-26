/**
 * Trigger rule of the Grand Larceny deck (Cunning Rhetoric): "an opponent attacks you and/or one or more planeswalkers you control" (CR 508.1b, 508.6, 603.2, 603.2c): once for the
 * declaration of attackers in which at least one creature was declared as attacking the controller of the ability as a player or a planeswalker they control, however many creatures
 * attack. The engine's `attackBatch` with `attackedYouOrPlaneswalkers`; "that player" in the body is the attacking opponent.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.opponent-attacks-you-or-planeswalkers';

export const TRIGGER_OPPONENT_ATTACKS_YOU_OR_PLANESWALKERS = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['an'],
  cites: [
    'CR 508.1b (Declare Attackers Step)',
    'CR 508.6 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['an opponent attacks you and/or one or more planeswalkers you control'],
  rejects: [
    'an opponent attacks you',
    'an opponent attacks you or a planeswalker you control',
    'an opponent attacks you and/or a planeswalker you control',
    'an opponent attacks you and/or one or more planeswalkers',
    'an opponent attacks you and/or one or more planeswalkers you control with two or more creatures',
    'an opponent attacks you and/or one or more planeswalkers you control and',
    'a player attacks you and/or one or more planeswalkers you control',
    'an opponent attack you and/or one or more planeswalkers you control',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /an opponent attacks you and\/or one or more planeswalkers you control(?![\p{L}\p{N}'’])(?! (?:and|or|with)\b)/iu,
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
        attackedYouOrPlaneswalkers: true,
        args: {},
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const ATTACKS_YOU_OR_WALKERS_TRIGGER_RULES = [
  TRIGGER_OPPONENT_ATTACKS_YOU_OR_PLANESWALKERS,
].map(quietly);
