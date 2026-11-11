/**
 * Conditions of the players an effect asks (stage P52, D-210, CR 608.2d, 608.2c): "If the player doesn't," after "target opponent may have you draw three cards", and
 * "If a creature card was discarded this way," after "each player may discard a card". Read only in the body of a triggered ability.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/** `condition.player-declines`: "the player doesn't", after the "if" the sentence parser reads: the player a "may have you" sentence asked said no. */
export const CONDITION_PLAYER_DECLINES = defineRule<IrCondition>({
  id: 'condition.player-declines',
  family: 'condition',
  leading: ['the'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ["the player doesn't", 'the player doesn’t', "The player doesn't"],
  rejects: [
    'the player does',
    "the player didn't",
    "that player doesn't",
    "the players don't",
    'the player does not',
    "an opponent doesn't",
    "the player doesn'ts",
  ],
  parse: (ctx, pos) => {
    const r = pattern(/the player doesn['’]t(?![\p{L}\p{N}'’])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'declined' },
        span: { start: pos, end: r.pos },
        rule: 'condition.player-declines',
      },
      pos: r.pos,
    };
  },
});

/** `condition.discarded-this-way`: "a creature card was discarded this way", "a noncreature card was discarded this way" (CR 608.2c, 701.9). */
export const CONDITION_DISCARDED_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.discarded-this-way',
  family: 'condition',
  leading: ['a'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.9 (Discard)'],
  examples: [
    'a creature card was discarded this way',
    'a noncreature card was discarded this way',
    'A creature card was discarded this way',
  ],
  rejects: [
    'a land card was discarded this way',
    'a creature card was discarded',
    'a creature card is discarded this way',
    'a creature was discarded this way',
    'creature cards were discarded this way',
    'a nonland card was discarded this way',
    'a creature card was discarded this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/a (non)?creature card was discarded this way(?![\p{L}\p{N}])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'discardedThisWay', creature: r.value[1] === undefined },
        span: { start: pos, end: r.pos },
        rule: 'condition.discarded-this-way',
      },
      pos: r.pos,
    };
  },
});

export const CHOOSER_CONDITION_RULES = [CONDITION_PLAYER_DECLINES, CONDITION_DISCARDED_THIS_WAY];
