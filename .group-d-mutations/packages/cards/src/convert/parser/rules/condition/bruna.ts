/**
 * Conditions of the Bruna deck program (D-252): what the engine's turn log tells about life. "You gained 3 or more life this turn" (CR 119.3: a
 * player gains life by any event; the amounts of one turn add up).
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrClause, IrCondition } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';

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
    // D-363 (the Hashaton deck, Ob Nixilis): "you gained life this turn" is at least 1 life gained (CR 119.9: a gain of 0 life is no event).
    'you gained life this turn',
  ],
  rejects: [
    'you gained 3 or more life',
    'you gained life this turn and',
    'you gained life',
    'you gained life this turn, create',
    'you gained 3 life this turn',
    'you gained 3 or less life this turn',
    'you gained 0 or more life this turn',
    'you gained X or more life this turn',
    'an opponent gained 3 or more life this turn',
    'you gained 3 or more life this turn and',
    'you gain 3 or more life this turn',
  ],
  parse: (ctx, pos) => {
    const bare = pattern(new RegExp(`you gained life this turn${BOUNDARY}`, 'iu'))(ctx, pos);
    const r = bare.ok
      ? { ...bare, value: 1 }
      : (() => {
          const counted = sequence(
            pattern(/you gained /iu),
            spanned(satisfy(quantity, (n) => n >= 1)),
            pattern(new RegExp(` or more life this turn${BOUNDARY}`, 'iu')),
          )(ctx, pos);
          return counted.ok ? { ...counted, value: counted.value[1].value } : counted;
        })();
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'lifeGainedThisTurn', atLeast: r.value },
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

/**
 * `condition.unless-return`: "unless you return an untapped Plains you control to its owner's hand" (Karoo, D-258, CR 118.12a: "[Do something] unless [a player
 * does something else]" means "[A player may do something else]. If [that player doesn't], [do something]"). The "something else" is the return of one
 * permanent the player controls and chooses (the `effect.return` of a noun with "you control"); the sentence rules attach the condition to the one clause it
 * follows and the lowering makes the offer and the "if you don't".
 */
export const CONDITION_UNLESS_RETURN = defineRule<IrCondition>({
  id: 'condition.unless-return',
  family: 'condition',
  leading: ['unless'],
  cites: [
    'CR 118.12a (Costs)',
    'CR 118.12 (Costs)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 400.3 (General)',
  ],
  examples: [
    "unless you return an untapped Plains you control to its owner's hand",
    'unless you return an untapped Plains you control to its owner’s hand',
    "unless you return a land you control to its owner's hand",
    "unless you return a Forest you control to its owner's hand",
  ],
  rejects: [
    "unless you return a land to its owner's hand",
    "unless you return target land to its owner's hand",
    "unless you return ~ to its owner's hand",
    "unless you return another land you control to its owner's hand",
    "unless you return two lands you control to their owners' hands",
    "unless an opponent returns a land you control to its owner's hand",
    "unless that player returns a land they control to its owner's hand",
    'unless you return an untapped Plains you control to your hand',
    'unless you return an untapped Plains you control',
    "unless you return a land you control to its owner's hand and",
    "if you return a land you control to its owner's hand",
    "unless you returns a land you control to its owner's hand",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('unless you '),
      satisfy(family<readonly IrClause[]>('effect', { only: ['effect.return'] }), (clauses) => {
        const [clause] = clauses;
        const objects = clause?.args.objects;
        return (
          clauses.length === 1 &&
          clause?.verb === 'return' &&
          objects !== undefined &&
          'filter' in objects &&
          objects.filter.controller === 'you'
        );
      }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, clauses] = r.value;
    const [clause] = clauses;
    if (clause === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'unlessReturn', clause },
        span: { start: pos, end: r.pos },
        rule: 'condition.unless-return',
      },
      pos: r.pos,
    };
  },
});

export const BRUNA_CONDITION_RULES = [
  CONDITION_LIFE_GAINED_THIS_TURN,
  CONDITION_LIFE_ABOVE_STARTING,
  CONDITION_UNLESS_RETURN,
];
