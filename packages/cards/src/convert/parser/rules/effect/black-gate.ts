/**
 * Effect rules of The Black Gate (CR 608.2d, 119.1, 509.1b, 611.2a): "Choose a player with the most life or tied for most life." and "Target creature can't be blocked by creatures that
 * player controls this turn."
 */
import { chain, map, pattern, refuseAt } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause, single } from './operands';

/**
 * `effect.choose-player-most-life`: "Choose a player with the most life or tied for most life" (CR 608.2d: the controller of the effect chooses; CR 119.1: life totals). The player is
 * what "that player" means in the instructions after it, as the engine's `choosePlayer` says (`chosenPlayer`). Not read: another rule for the choice ("the least life"), "an
 * opponent", a number of players, the words without "or tied for most life".
 */
export const EFFECT_CHOOSE_PLAYER_MOST_LIFE = defineRule<Clauses>({
  id: 'effect.choose-player-most-life',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 119.1 (Life)'],
  examples: ['choose a player with the most life or tied for most life'],
  rejects: [
    'choose a player with the most life',
    'choose a player with the least life or tied for least life',
    'choose an opponent with the most life or tied for most life',
    'choose two players with the most life or tied for most life',
    'choose a player with the most life or tied for most life and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/choose a player with the most life or tied for most life(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.choose-player-most-life', 'choosePlayer', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/** One creature that is a target (CR 115.1): "target creature", not several, not "up to". */
const targetCreature = refuseAt(
  family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
  (n) =>
    !n.plural &&
    !n.upTo &&
    n.count === undefined &&
    n.det === 'target' &&
    n.filter.anyOf === undefined &&
    n.filter.types?.length === 1 &&
    n.filter.types[0] === 'creature',
  (_n, _ctx, start) => start,
);

/**
 * `effect.cant-be-blocked-by-that-players-creatures`: "Target creature can't be blocked by creatures that player controls this turn" (CR 509.1b: blocking restrictions; CR 611.2a: lasts
 * this turn). "That player" is the player a "Choose a player ..." sentence before it chose. The engine's `cantBeBlockedByPlayer` of the `chosenPlayer`. Not read: another subject than one
 * target creature, "that player's creatures", "an opponent", "until end of turn", a missing "this turn".
 */
export const EFFECT_CANT_BE_BLOCKED_BY_THAT_PLAYER = defineRule<Clauses>({
  id: 'effect.cant-be-blocked-by-that-players-creatures',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 509.1b (Declare Blockers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ["target creature can't be blocked by creatures that player controls this turn"],
  rejects: [
    "target creature can't be blocked by creatures that player controls",
    "target creature can't be blocked by creatures an opponent controls this turn",
    "target creatures can't be blocked by creatures that player controls this turn",
    "target creature can't be blocked by creatures that player controls until end of turn",
    "target creature can't be blocked by that player's creatures this turn",
    "target creature can't be blocked by creatures that player controls this turn and draw a card",
    "up to one target creature can't be blocked by creatures that player controls this turn",
  ],
  parse: single(
    'effect.cant-be-blocked-by-that-players-creatures',
    chain(targetCreature, (objects) =>
      map(
        spanned(
          pattern(
            / can['’]t be blocked by creatures that player controls this turn(?![\p{L}\p{N}])/iu,
          ),
        ),
        (tail) => [objects, tail.span] as const,
      ),
    ),
    ([objects, span]) => {
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'thisTurn',
        span,
        rule: 'effect.cant-be-blocked-by-that-players-creatures',
      };
      return { verb: 'cantBeBlockedByChosenPlayer', args: { objects }, duration };
    },
  ),
});

export const BLACK_GATE_EFFECT_RULES = [
  EFFECT_CHOOSE_PLAYER_MOST_LIFE,
  EFFECT_CANT_BE_BLOCKED_BY_THAT_PLAYER,
];
