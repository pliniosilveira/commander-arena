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

/**
 * `effect.draw-and-lose-life-equal`: "You draw cards and lose life equal to the number of counters removed this way" (CR 121.1, 119.3, 608.2c; Eventide's Shadow). One amount is read once and
 * shared by the two instructions, in the order written: you draw that many cards, then you lose that much life. The amount is any "equal to ..." phrase of the amount family. Not read:
 * another order, "draw a card", another player, a number of cards without "cards".
 */
export const EFFECT_DRAW_AND_LOSE_LIFE_EQUAL = defineRule<Clauses>({
  id: 'effect.draw-and-lose-life-equal',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 121.1 (Drawing a Card)',
    'CR 119.3 (Life)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'you draw cards and lose life equal to the number of counters removed this way',
    'you draw cards and lose life equal to its power',
  ],
  rejects: [
    'you draw cards and lose life',
    'you draw cards and lose life equal to',
    'you draw a card and lose life equal to its power',
    'you lose life and draw cards equal to its power',
    'you gain life and draw cards equal to its power',
    'target player draws cards and loses life equal to its power',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/you draw cards and lose life /iu)(ctx, pos);
    if (!head.ok) return head;
    const amount = family<IrAmount>('amount', { only: EQUAL_AMOUNTS })(ctx, head.pos);
    if (!amount.ok) return amount;
    const id = 'effect.draw-and-lose-life-equal';
    const span = { start: pos, end: amount.pos };
    const you: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: '' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 3 },
      rule: id,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'draw', { player: you, amount: amount.value }, span),
          connector: 'and',
        },
        makeClause(id, 'loseLife', { player: you, amount: amount.value }, span),
      ],
      pos: amount.pos,
    };
  },
});

export const GAIN_LIFE_AND_DRAW_EFFECT_RULES = [
  EFFECT_GAIN_LIFE_AND_DRAW_EQUAL,
  EFFECT_DRAW_AND_LOSE_LIFE_EQUAL,
];
