/**
 * Condition of Revolt (an ability word, CR 207.2c): "a permanent left the battlefield under your control this turn" (the intervening "if" of Call for Unity).
 */
import { pattern } from '../../combinators';
import type { IrAmount, IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/**
 * `condition.permanent-left-under-control`: "a permanent left the battlefield under your control this turn" (CR 207.2c, 400.7, 603.4). At least one permanent, a token included,
 * left the battlefield for any zone while the controller of the ability controlled it; it is not counted again for each one. The engine's `diedThisTurn` amount with
 * `leftBattlefield`, at least one. Not read: another controller, another span than the turn, a card type ("a creature left"), the present or future tense, "dies".
 */
export const CONDITION_PERMANENT_LEFT_UNDER_CONTROL = defineRule<IrCondition>({
  id: 'condition.permanent-left-under-control',
  family: 'condition',
  leading: ['a'],
  cites: [
    'CR 207.2c (Ability Words)',
    'CR 400.7 (Zones)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: ['a permanent left the battlefield under your control this turn'],
  rejects: [
    'a permanent left the battlefield this turn',
    'a permanent left the battlefield under an opponent’s control this turn',
    'a permanent left the battlefield under your control',
    'a permanent left the battlefield under your control last turn',
    'a permanent leaves the battlefield under your control this turn',
    'a creature left the battlefield under your control this turn',
    'a permanent left the graveyard under your control this turn',
    'a permanent left the battlefield under your control this turn and',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `a permanent left the battlefield under your control this turn${BOUNDARY}(?! and\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const amount: IrAmount = {
      kind: 'diedThisTurn',
      controller: 'you',
      leftBattlefield: true,
      span,
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'amountIs', amount, compare: { cmp: 'atLeast', value: 1 } },
        span,
        rule: 'condition.permanent-left-under-control',
      },
      pos: r.pos,
    };
  },
});

export const REVOLT_CONDITION_RULES = [CONDITION_PERMANENT_LEFT_UNDER_CONTROL];
