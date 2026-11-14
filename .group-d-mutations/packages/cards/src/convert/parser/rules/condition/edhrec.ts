/**
 * Conditions of the Vraska EDHREC deck (stage P63, D-216): "you created a token this turn" (CR 111.2, 400.7). It is read as the restriction of an activated
 * ability ("Activate only if ...", Idol of Oblivion) or the test of an "if". The engine's `enteredThisTurn` of tokens: the player who creates a token
 * owns it and it enters under their control (CR 111.2), so a token that entered under the controller's control this turn is one they created.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/**
 * `condition.created-token`: "you created a token this turn". Not read: another player ("an opponent created a token this turn"), a number of tokens
 * ("you created two or more tokens this turn"), a kind ("you created a Treasure token this turn"), a period other than this turn.
 */
export const CONDITION_CREATED_TOKEN = defineRule<IrCondition>({
  id: 'condition.created-token',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 111.2 (Tokens)', 'CR 400.7 (Zones)', 'CR 602.5b (Activating Activated Abilities)'],
  examples: ['you created a token this turn'],
  rejects: [
    'you created a token this turn.',
    'you created a token',
    'you created a token this combat',
    'you created two or more tokens this turn',
    'you created a Treasure token this turn',
    'an opponent created a token this turn',
    'you created tokens this turn',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/you created a token this turn(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'enteredThisTurn', count: 1, token: true },
        span: r.value.span,
        rule: 'condition.created-token',
      },
      pos: r.pos,
    };
  },
});

export const EDHREC_CONDITION_RULES = [CONDITION_CREATED_TOKEN];
