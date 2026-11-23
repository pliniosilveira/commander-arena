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
    const gainedAndLost = pattern(
      new RegExp(`you gained and lost life this turn${BOUNDARY}`, 'iu'),
    )(ctx, pos);
    if (gainedAndLost.ok) {
      return {
        ok: true,
        value: {
          kind: 'condition',
          test: { kind: 'lifeGainedAndLostThisTurn' },
          span: { start: pos, end: gainedAndLost.pos },
          rule: 'condition.life-gained-this-turn',
        },
        pos: gainedAndLost.pos,
      };
    }
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

/**
 * `condition.cast-from-graveyard-this-turn`: "you've cast a spell from a graveyard or activated an ability of a card in a graveyard this turn" (issue 159, Laboratory Drudge; CR
 * 601.2a, 602.2, 603.4: read as the trigger event happens and again as the ability resolves). The engine's `castFromGraveyardThisTurn`, read from the turn log. Not read: only one of
 * the two halves, another player, another zone, "last turn".
 */
export const CONDITION_CAST_FROM_GRAVEYARD_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.cast-from-graveyard-this-turn',
  family: 'condition',
  leading: ['you', "you've", 'you’ve'],
  cites: [
    'CR 601.2a (Casting Spells)',
    'CR 602.2 (Activating Activated Abilities)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    "you've cast a spell from a graveyard or activated an ability of a card in a graveyard this turn",
    'you’ve cast a spell from a graveyard or activated an ability of a card in a graveyard this turn',
  ],
  rejects: [
    "you've cast a spell from a graveyard this turn",
    "you've activated an ability of a card in a graveyard this turn",
    "you've cast a spell from a graveyard or activated an ability of a card in a graveyard",
    "you've cast a spell from your graveyard or activated an ability of a card in a graveyard this turn",
    'an opponent has cast a spell from a graveyard or activated an ability of a card in a graveyard this turn',
    "you've cast a spell from a graveyard or activated an ability of a card in a graveyard this turn and",
    "you've cast a spell from a graveyard or activated an ability of a card in a graveyard last turn",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `you['’]ve cast a spell from a graveyard or activated an ability of a card in a graveyard this turn${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'castFromGraveyardThisTurn' },
        span: { start: pos, end: r.pos },
        rule: 'condition.cast-from-graveyard-this-turn',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.a-player-lost-life-this-turn`: "a player lost 4 or more life this turn", "a player lost life this turn" (CR 119.3, 603.4: some player, any player, lost at least that much life
 * in all this turn, from damage, life loss and life paid, summed for the player; read as the event happens and again as the ability resolves). The engine's `aPlayerLostLifeThisTurn`.
 * Not read: "an opponent lost ..." (another group), a count that is 0 or a variable, "lost 4 life", "less", another span, a count with no "or more".
 */
export const CONDITION_A_PLAYER_LOST_LIFE_THIS_TURN = defineRule<IrCondition>({
  id: 'condition.a-player-lost-life-this-turn',
  family: 'condition',
  leading: ['a', 'an'],
  cites: [
    'CR 119.3 (Life)',
    'CR 102.2 (Players and Opponents)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: [
    'a player lost 4 or more life this turn',
    'a player lost four or more life this turn',
    'a player lost life this turn',
    'an opponent lost 3 or more life this turn',
    'an opponent lost life this turn',
  ],
  rejects: [
    'a player lost 4 or more life',
    'a player lost 4 life this turn',
    'a player lost 4 or less life this turn',
    'a player lost 0 or more life this turn',
    'a player lost X or more life this turn',
    'a player lost life',
    'a player lost life this turn and',
    'a player lost 4 or more life this turn and',
    'an opponent lost 4 or more life',
    'an opponent lost 4 life this turn',
    'an opponent lost 4 or less life this turn',
    'an opponents lost 4 or more life this turn',
    'a player gained 4 or more life this turn',
    'a player loses 4 or more life this turn',
    'a players lost 4 or more life this turn',
  ],
  parse: (ctx, pos) => {
    const who = pattern(/(a player|an opponent) lost /iu)(ctx, pos);
    if (!who.ok) return who;
    const opponent = /^an opponent$/iu.test(who.value[1] ?? '');
    const bare = pattern(new RegExp(`life this turn${BOUNDARY}`, 'iu'))(ctx, who.pos);
    const r = bare.ok
      ? { ...bare, value: 1 }
      : (() => {
          const counted = sequence(
            spanned(satisfy(quantity, (n) => n >= 1)),
            pattern(new RegExp(` or more life this turn${BOUNDARY}`, 'iu')),
          )(ctx, who.pos);
          return counted.ok ? { ...counted, value: counted.value[0].value } : counted;
        })();
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'aPlayerLostLifeThisTurn',
          atLeast: r.value,
          ...(opponent ? { opponent: true as const } : {}),
        },
        span: { start: pos, end: r.pos },
        rule: 'condition.a-player-lost-life-this-turn',
      },
      pos: r.pos,
    };
  },
});

export const BRUNA_CONDITION_RULES = [
  CONDITION_LIFE_GAINED_THIS_TURN,
  CONDITION_LIFE_ABOVE_STARTING,
  CONDITION_UNLESS_RETURN,
  CONDITION_CAST_FROM_GRAVEYARD_THIS_TURN,
  CONDITION_A_PLAYER_LOST_LIFE_THIS_TURN,
];
