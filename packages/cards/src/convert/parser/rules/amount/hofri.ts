/**
 * The amounts of the Hofri Ghostforge deck (stage P68, D-229): "for each time you've cast your commander from the command zone this game" (CR 903.8: the
 * count the commander tax is made from). The engine's `commanderCasts`.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-commander-cast`: "for each time you've cast your commander from the command zone this game" (CR 903.8, 601.2: the times the controller's
 * commanders were cast from the command zone, all of them added). Not read: another player's commander, "each time" with another verb, another zone, a turn
 * instead of the game.
 */
export const AMOUNT_FOR_EACH_COMMANDER_CAST = defineRule<IrAmount>({
  id: 'amount.for-each-commander-cast',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 903.8 (Commander)', 'CR 601.2 (Casting Spells)', 'CR 611.3a (Continuous Effects)'],
  examples: ["for each time you've cast your commander from the command zone this game"],
  rejects: [
    "for each time you've cast your commander from the command zone",
    "for each time you've cast your commander from the command zone this turn",
    "for each time you've cast your commander from your hand this game",
    "for each time you've cast a commander from the command zone this game",
    'for each time an opponent has cast their commander from the command zone this game',
    "for each time you've cast a spell this game",
    'for each time',
    "each time you've cast your commander from the command zone this game",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /for each time you['’]ve cast your commander from the command zone this game(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'commanderCasts', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

/**
 * The value phrase "the amount of damage ~ dealt to that player" (CR 120.3, 510.2: the combat damage a creature dealt, which the trigger of "Whenever ~ deals combat
 * damage to a player" carries): an atom of the value family ("..., where X is ..."). The engine's `triggerDamage`.
 */
export const DAMAGE_DEALT_AMOUNT = (
  ctx: Parameters<ReturnType<typeof pattern>>[0],
  pos: number,
) => {
  const r = pattern(/the amount of damage ~ dealt to that player(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (!r.ok) return r;
  const value: IrAmount = { kind: 'triggerDamage', span: { start: pos, end: r.pos } };
  return { ok: true as const, value, pos: r.pos };
};

/**
 * `amount.for-each-own-nontoken-destroyed`: "for each nontoken creature you controlled that was destroyed this way" (CR 608.2c, 701.8, 608.2h: what the instruction before it
 * destroyed, the creatures that were the controller's as they were destroyed). The engine's `thisWay` `destroyedOwnNontoken`. Not read: another player's creatures, tokens,
 * another verb, "each creature destroyed this way" (`amount.for-each-this-way`).
 */
export const AMOUNT_FOR_EACH_OWN_NONTOKEN_DESTROYED = defineRule<IrAmount>({
  id: 'amount.for-each-own-nontoken-destroyed',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.8 (Destroy)', 'CR 111.1 (Tokens)'],
  examples: ['for each nontoken creature you controlled that was destroyed this way'],
  rejects: [
    'for each creature you controlled that was destroyed this way',
    'for each nontoken creature you controlled that was sacrificed this way',
    'for each nontoken creature an opponent controlled that was destroyed this way',
    'for each nontoken creature that was destroyed this way',
    'for each nontoken creature you controlled that was destroyed',
    'for each nontoken creatures you controlled that were destroyed this way',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /for each nontoken creature you controlled that was destroyed this way(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'thisWay',
        what: 'destroyedOwnNontoken',
        words: ['creature'],
        span: { start: pos, end: r.pos },
      },
      pos: r.pos,
    };
  },
});

export const HOFRI_AMOUNT_RULES = [
  AMOUNT_FOR_EACH_COMMANDER_CAST,
  AMOUNT_FOR_EACH_OWN_NONTOKEN_DESTROYED,
];
