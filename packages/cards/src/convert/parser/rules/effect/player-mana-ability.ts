/**
 * Effect rule of the Quandrix Unlimited deck: "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (Channel).
 */
import { fail, pattern } from '../../combinators';
import type { IrAmount, IrManaSpec } from '../../ir/types';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.player-mana-ability`: "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (CR 605.1a, 605.3a, 118.3, 611.2, 514.2): the
 * two sentences of one instruction, joined by `segment.ts`. The controller has a mana ability of their own until end of turn, which pays life and adds one mana; it may be activated any
 * number of times. The engine's `grantPlayerManaAbility` of "you". The rule is general over the life (a number from 1) and the mana (one symbol of W, U, B, R, G or C), because the
 * engine's effect is; the words of the timing are required exactly. Not read: another duration, a missing "you may" or "if you do", another timing ("any time you could cast an
 * instant"), more than one mana, a mana of a choice of colors, another player, a cost that is not life.
 */
export const EFFECT_PLAYER_MANA_ABILITY = defineRule<Clauses>({
  id: 'effect.player-mana-ability',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 605.1a (Activated Mana Abilities)',
    'CR 605.3a (Activating Mana Abilities)',
    'CR 118.3 (Costs)',
    'CR 611.2 (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}',
    'Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}',
    'until end of turn, any time you could activate a mana ability, you may pay 2 life. If you do, add {G}',
  ],
  rejects: [
    'until end of turn, any time you could activate a mana ability, you may pay 0 life. If you do, add {C}',
    'until your next turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}',
    'until end of turn, you may pay 1 life. If you do, add {C}',
    'until end of turn, any time you could cast an instant, you may pay 1 life. If you do, add {C}',
    'until end of turn, any time you could activate a mana ability, pay 1 life. If you do, add {C}',
    'until end of turn, any time you could activate a mana ability, you may pay 1 life. Add {C}',
    'until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}{C}',
    'until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {1}',
    'until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add one mana of any color',
    'until end of turn, any time you could activate a mana ability, you may pay {1}. If you do, add {C}',
    'until end of turn, any time you could activate a mana ability, you may discard a card. If you do, add {C}',
    'until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C} and draw a card',
    'until end of turn, any time each opponent could activate a mana ability, they may pay 1 life. If they do, add {C}',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /until end of turn, any time you could activate a mana ability, you may pay (\d+) life\. if you do, add \{([WUBRGC])\}(?=\.|$)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const life = Number(r.value[1]);
    const symbol = (r.value[2] ?? '').toUpperCase();
    if (life < 1 || symbol === '') return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const amount: IrAmount = { kind: 'number', value: life, span };
    const mana: IrManaSpec = {
      kind: 'manaSpec',
      what: { kind: 'symbols', symbols: [symbol] },
      span,
      rule: 'effect.player-mana-ability',
    };
    return {
      ok: true,
      value: [
        makeClause('effect.player-mana-ability', 'playerManaAbility', { life: amount, mana }, span),
      ],
      pos: r.pos,
    };
  },
});

export const PLAYER_MANA_ABILITY_EFFECT_RULES = [EFFECT_PLAYER_MANA_ABILITY];
