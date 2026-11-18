/**
 * `trigger.opponent-attacks-bare`: "an opponent attacks" (Ever-Watching Threshold, CR 508.1, 603.2, 603.2c): the attackers are declared together and the ability triggers once for
 * the declaration, however many creatures it holds. One or more creatures, so `atLeast` 1 and every creature declared counts: the engine's `attackBatch` of an opponent. What the
 * declaration attacked is the intervening "if" of the ability (`condition.they-attacked-you`). The words that say with which creatures ("with creatures", "with two or more
 * creatures") belong to `trigger.opponent-attacks` and `trigger.attack-batch`.
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

export const TRIGGER_OPPONENT_ATTACKS_BARE = defineRule<IrTrigger>({
  id: 'trigger.opponent-attacks-bare',
  family: 'trigger',
  leading: ['an'],
  cites: [
    'CR 508.1 (Declare Attackers Step)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
  ],
  examples: ['an opponent attacks'],
  rejects: [
    'an opponent attacks with creatures',
    'an opponent attacks with two or more creatures',
    'an opponent attacks you',
    'an opponent attacks alone',
    'an opponent attacks or',
    'an opponent attacks and',
    'an opponent attack',
    'an opponent attacked',
    'a player attacks',
    'you attack',
    'each opponent attacks',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.opponent-attacks-bare';
    // What follows ("with ...", "you", "alone", "or ...") belongs to another trigger rule: a rule that reads a prefix would hide it.
    const r = pattern(
      /an opponent attacks(?![\p{L}\p{N}'’])(?!\s+(?:with|alone|you|or|and)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'attackBatch',
        actor: makeNoun(id, span, 'eachOpponent', { raw: 'an opponent' }),
        atLeast: 1,
        args: {},
        span,
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const OPPONENT_ATTACKS_TRIGGER_RULES = [TRIGGER_OPPONENT_ATTACKS_BARE].map(quietly);
