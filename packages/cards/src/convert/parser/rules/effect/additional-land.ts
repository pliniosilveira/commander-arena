/**
 * Effect rule of issue 208 (Explore): "You may play an additional land this turn." (CR 305.2). A spell or ability effect that raises the number of lands its controller can play
 * in this turn by one; the engine runs `additionalLandDropThisTurn` (`rules/effects.ts`, `turn.extraLandDrops`). The permanent's ability of the same words with "on each of your
 * turns" is the static rule `static.additional-land`.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.additional-land-this-turn';

/**
 * `effect.additional-land-this-turn`: "you may play an additional land this turn" (CR 305.2: the number of lands a player can play in a turn is raised by an effect; CR 305.2a:
 * it is compared with the lands already played). Not read: "two additional lands" (no real line in the repository), "on each of your turns" (a static ability), another
 * player, a condition, and "this turn" missing.
 */
export const EFFECT_ADDITIONAL_LAND_THIS_TURN = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['you'],
  cites: ['CR 305.2 (Lands)', 'CR 305.2a (Lands)', 'CR 305.3 (Lands)'],
  examples: [
    'You may play an additional land this turn',
    'you may play an additional land this turn',
  ],
  rejects: [
    'You may play an additional land on each of your turns',
    'You may play an additional land',
    'You may play two additional lands this turn',
    'You may play an additional lands this turn',
    'Each player may play an additional land this turn',
    'You may play an additional land this turn if you control a Forest',
    'You may cast an additional spell this turn',
    'You may play an additional land from your graveyard this turn',
  ],
  parse: single(ID, pattern(/you may play an additional land this turn(?![\p{L}\p{N}])/iu), () => ({
    verb: 'additionalLandDrop',
    args: {},
  })),
});

const ID_X = 'effect.additional-lands-x-this-turn';

/**
 * `effect.additional-lands-x-this-turn`: "you may play X additional lands this turn" (Nahiri's Lithoforming; CR 305.2, 107.3a: the number of lands a player can play in a turn is
 * raised by the X of the spell, read as the effect runs). The engine's `additionalLandDropThisTurn` with an amount. Not read: a number ("two additional lands"), "an additional
 * land" (`effect.additional-land-this-turn`), another player, a condition, "this turn" missing, "on each of your turns".
 */
export const EFFECT_ADDITIONAL_LANDS_X_THIS_TURN = defineRule<Clauses>({
  id: ID_X,
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 305.2 (Lands)',
    'CR 305.2a (Lands)',
    'CR 305.3 (Lands)',
    'CR 107.3a (Numbers and Symbols)',
  ],
  examples: [
    'You may play X additional lands this turn',
    'you may play X additional lands this turn',
  ],
  rejects: [
    'You may play two additional lands this turn',
    'You may play X additional land this turn',
    'You may play X additional lands',
    'You may play X additional lands on each of your turns',
    'Each player may play X additional lands this turn',
    'You may play X additional lands this turn if you control a Forest',
    'You may play X additional lands from your graveyard this turn',
    'You may cast X additional spells this turn',
  ],
  parse: single(
    ID_X,
    sequence(
      literal('you may play '),
      family<IrAmount>('amount', { only: ['amount.x'] }),
      pattern(/ additional lands this turn(?![\p{L}\p{N}])/iu),
    ),
    ([, count]) => ({ verb: 'additionalLandDrop', args: { count } }),
  ),
});

export const ADDITIONAL_LAND_EFFECT_RULES = [
  EFFECT_ADDITIONAL_LAND_THIS_TURN,
  EFFECT_ADDITIONAL_LANDS_X_THIS_TURN,
].map(quietly);
