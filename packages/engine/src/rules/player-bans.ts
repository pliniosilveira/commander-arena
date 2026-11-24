/**
 * The "you can't" effects of a resolving spell or ability that bind the player who controls it for the turn (Call for Aid; CR 508.1a, 701.21a, 101.2, 611.2a, 611.2c): "You can't attack
 * that player this turn." and "You can't sacrifice those creatures this turn." Each is one continuous effect that ends with the turn (CR 514.2); the rules read it where attackers are
 * declared (`rules/attack-bans.ts`) and where a sacrifice is chosen or made (`rules/sacrifice-prevention.ts`).
 */
import type { Effect } from '../ast/types';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { resolveObjects, resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

/**
 * Runs `youCantAttackPlayers`: the players the selector names as the effect resolves (CR 611.2c) can't be attacked by any creature the controller of the effect controls this turn. A
 * selector that names nobody (a player who left the game) makes no effect. No set of objects: a creature that arrives or changes control later is held as well, as the rules read it.
 */
export function runYouCantAttackPlayers(
  state: GameState,
  node: Extract<Effect, { kind: 'youCantAttackPlayers' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const players = resolvePlayers(state, node.players, ctx, targets);
  if (players.length === 0) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: [],
    until: 'endOfTurn',
    change: { kind: 'controllerCantAttackPlayers', seat: ctx.controller, players },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}

/**
 * Runs `youCantSacrifice`: the permanents the selector names as the effect resolves (CR 611.2c; one that is not on the battlefield is skipped, CR 608.2b) can't be sacrificed by the controller
 * of the effect this turn, while they control them.
 */
export function runYouCantSacrifice(
  state: GameState,
  node: Extract<Effect, { kind: 'youCantSacrifice' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const objects = resolveObjects(state, node.objects, ctx, targets).filter(
    (id) => state.objects[id]?.zone === 'battlefield',
  );
  if (objects.length === 0) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  const created: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects,
    until: 'endOfTurn',
    change: { kind: 'controllerCantSacrifice', seat: ctx.controller },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, created] });
}
