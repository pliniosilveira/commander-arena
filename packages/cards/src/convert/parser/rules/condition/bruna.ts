/**
 * Conditions of the Bruna deck program (D-252): what the engine's turn log tells about life. "You gained 3 or more life this turn" (CR 119.3: a
 * player gains life by any event; the amounts of one turn add up).
 */
import { pattern, satisfy, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, spanned } from '../registry';

/**
 * `condition.life-gained-this-turn`: "you gained 3 or more life this turn", "you gained 4 or more life this turn" (CR 119.3, 603.4: read as the
 * trigger event happens and again as the ability resolves). The life the controller gained this turn, from every source, summed.
 */
export const CONDITION_LIFE_GAINED_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.life-gained-this-turn',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 119.3 (Life)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'you gained 3 or more life this turn',
    'you gained 4 or more life this turn',
    'you gained five or more life this turn',
  ],
  rejects: [
    'you gained 3 or more life',
    'you gained life this turn',
    'you gained 3 life this turn',
    'you gained 3 or less life this turn',
    'you gained 0 or more life this turn',
    'you gained X or more life this turn',
    'an opponent gained 3 or more life this turn',
    'you gained 3 or more life this turn and',
    'you gain 3 or more life this turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/you gained /iu),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(new RegExp(` or more life this turn${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, count] = r.value;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'lifeGainedThisTurn', atLeast: count.value },
        span: { start: pos, end: r.pos },
        rule: 'condition.life-gained-this-turn',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.life-above-starting`: "your life total is greater than your starting life total" (CR 119.1, 903.7: the starting life total of the game, 40 in
 * Commander). The engine's `lifeTotal` of the controller, at least one more than the starting life total (D-253).
 */
export const CONDITION_LIFE_ABOVE_STARTING = defineRule<IrCondition>({
  id: 'condition.life-above-starting',
  family: 'condition',
  leading: ['your'],
  cites: ['CR 119.1 (Life)', 'CR 903.7 (Commander)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['your life total is greater than your starting life total'],
  rejects: [
    'your life total is greater than your starting life',
    'your life total is greater than 40',
    'your life total is less than your starting life total',
    'your life total is greater than your starting life total and',
    'an opponent’s life total is greater than your starting life total',
    'your life total is greater than the starting life total',
    'your life total is at least your starting life total',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`your life total is greater than your starting life total${BOUNDARY}`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'lifeTotal',
          compare: { cmp: 'atLeast', value: 1 },
          aboveStarting: true,
        },
        span: { start: pos, end: r.pos },
        rule: 'condition.life-above-starting',
      },
      pos: r.pos,
    };
  },
});

export const BRUNA_CONDITION_RULES = [
  CONDITION_LIFE_GAINED_THIS_TURN,
  CONDITION_LIFE_ABOVE_STARTING,
];
