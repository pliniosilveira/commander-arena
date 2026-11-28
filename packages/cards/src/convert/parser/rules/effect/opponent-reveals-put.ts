/**
 * Effect rule of issue 128 (Lonis, Cryptozoologist): "Target opponent reveals the top X cards of their library. You may put a nonland permanent card with mana value X or less from among them
 * onto the battlefield under your control. That player puts the rest on the bottom of their library in a random order." The engine's `lookAtTop` of that library with `revealAll`; only the
 * words are new. The three sentences of one instruction are kept together by the segmenter (`segment.ts`).
 */
import { fail, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.opponent-reveals-put-nonland';

/**
 * `effect.opponent-reveals-put-nonland`: "target opponent reveals the top X cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the
 * battlefield under your control. That player puts the rest on the bottom of their library in a random order" (CR 701.20a: the cards are shown to everyone and stay in the library while the
 * controller chooses; CR 110.2: the permanent enters under the control of the player who puts it onto the battlefield; CR 401.4, 701.24: the owner puts the rest on the bottom in a random
 * order; CR 107.3: the same X). Not read: another number of cards, another limit, "any permanent", another player, "you may" left out, the rest anywhere else.
 */
export const EFFECT_OPPONENT_REVEALS_PUT_NONLAND = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 110.2 (Permanents)',
    'CR 401.4 (Libraries)',
    'CR 202.3 (Mana Value)',
    'CR 107.3 (Variables)',
  ],
  examples: [
    'target opponent reveals the top X cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest on the bottom of their library in a random order',
  ],
  rejects: [
    'target opponent reveals the top X cards of their library',
    'target opponent reveals the top two cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest on the bottom of their library in a random order',
    'target opponent reveals the top X cards of their library. You may put a permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest on the bottom of their library in a random order',
    'target opponent reveals the top X cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest into their graveyard',
    'target player reveals the top X cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest on the bottom of their library in a random order',
    'target opponent reveals the top X cards of their library. Put a nonland permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest on the bottom of their library in a random order',
  ],
  parse: (ctx, pos) => {
    const who = family<IrNoun>('noun', { only: ['noun.player'] })(ctx, pos);
    if (!who.ok) return who;
    if (who.value.det !== 'target' || who.value.filter.player !== 'opponent') return fail(ctx, pos);
    const rest = sequence(
      pattern(
        / reveals the top X cards of their library\. you may put a nonland permanent card with mana value X or less from among them onto the battlefield under your control\. that player puts the rest on the bottom of their library in a random order(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, who.pos);
    if (!rest.ok) return rest;
    const span = { start: pos, end: rest.pos };
    const count: IrAmount = { kind: 'x', span };
    return {
      ok: true,
      value: [makeClause(ID, 'opponentRevealsPutNonland', { from: who.value, count }, span)],
      pos: rest.pos,
    };
  },
});

export const OPPONENT_REVEALS_PUT_EFFECT_RULES = [EFFECT_OPPONENT_REVEALS_PUT_NONLAND];
