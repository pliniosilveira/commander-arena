/**
 * Condition of the Scions & Spellcraft deck (Tataru Taru): "it isn't that player's turn", the intervening "if" of a trigger about a player ("Whenever an opponent draws a card,
 * if it isn't that player's turn, ..."). CR 603.4 (the condition is checked as the ability triggers and as it resolves), CR 500.1 (the active player is the player whose turn it is).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.that-players-turn`: "it's that player's turn", "it isn't that player's turn", "it's not that player's turn". The player is the one the event of the trigger is about (the
 * lowering reads it only in a trigger about a player, and refuses it anywhere else). Not read: "your turn" (`yourTurn`), "an opponent's turn", "that player's next turn", "that
 * player's turns", a missing "it".
 */
export const CONDITION_THAT_PLAYERS_TURN = defineRule<IrCondition>({
  id: 'condition.that-players-turn',
  family: 'condition',
  leading: ["it's", 'it’s', 'it'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 500.1 (General)', 'CR 102.1 (Players)'],
  examples: [
    "it's that player's turn",
    'it’s that player’s turn',
    "it isn't that player's turn",
    'it isn’t that player’s turn',
    "it's not that player's turn",
    'it is not that player’s turn',
  ],
  rejects: [
    "it's that player's turn.",
    "it's your turn",
    "it's an opponent's turn",
    "it's that player's next turn",
    "it's that player's turns",
    "it isn't that player's",
    "that's that player's turn",
    "it isn't that players turn",
    "it's not not that player's turn",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /it(?: is not| isn['’]t| is|['’]s not|['’]s) that player['’]s turn(?![\p{L}\p{N}'’])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const negated = /\bnot\b|n['’]t\b/iu.test(r.value.value[0] ?? '');
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'thatPlayersTurn', negated },
        span: r.value.span,
        rule: 'condition.that-players-turn',
      },
      pos: r.pos,
    };
  },
});

export const THAT_PLAYERS_TURN_CONDITION_RULES = [CONDITION_THAT_PLAYERS_TURN];
