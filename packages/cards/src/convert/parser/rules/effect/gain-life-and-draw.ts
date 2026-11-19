/**
 * `effect.gain-life-and-draw-equal`: "you gain life and draw cards equal to its power" (CR 119.1, 121.1, 608.2c, 603.10a; the Quandrix Unlimited deck, Lifeblood Hydra). One amount
 * is read once and shared by the two instructions: you gain that much life and draw that many cards. The amount is any "equal to ..." phrase of the amount family.
 */
import { pattern } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { EQUAL_AMOUNTS } from '../amount/scaled';
import { defineRule, family } from '../registry';
import { type Clauses, makeClause } from './operands';

export const EFFECT_GAIN_LIFE_AND_DRAW_EQUAL = defineRule<Clauses>({
  id: 'effect.gain-life-and-draw-equal',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 119.1 (Life)',
    'CR 121.1 (Drawing a Card)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 603.10a (Handling Triggered Abilities)',
  ],
  examples: [
    'you gain life and draw cards equal to its power',
    'you gain life and draw cards equal to the number of creatures you control',
  ],
  rejects: [
    'you gain life and draw cards',
    'you gain life and draw cards equal to',
    'you gain life and draw a card equal to its power',
    'you gain life and discard cards equal to its power',
    'target player gains life and draws cards equal to its power',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/you gain life and draw cards /iu)(ctx, pos);
    if (!head.ok) return head;
    const amount = family<IrAmount>('amount', { only: EQUAL_AMOUNTS })(ctx, head.pos);
    if (!amount.ok) return amount;
    const span = { start: pos, end: amount.pos };
    const you: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: '' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 3 },
      rule: 'effect.gain-life-and-draw-equal',
    };
    const id = 'effect.gain-life-and-draw-equal';
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'gainLife', { player: you, amount: amount.value }, span),
          connector: 'and',
        },
        makeClause(id, 'draw', { player: you, amount: amount.value }, span),
      ],
      pos: amount.pos,
    };
  },
});

export const GAIN_LIFE_AND_DRAW_EFFECT_RULES = [EFFECT_GAIN_LIFE_AND_DRAW_EQUAL];
