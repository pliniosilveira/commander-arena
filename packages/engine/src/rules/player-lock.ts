/** Temporary player-wide protection and life-total lock (D-607). */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import { allocateTimestamp } from '../state/ops';
import type { ChosenTarget, ContinuousEffect, GameState } from '../state/types';
import { resolvePlayers, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';

type PlayerLockEffect = Extract<
  Effect,
  { kind: 'grantPlayerProtectionEverything' | 'preventPlayerLifeTotalChange' }
>;

/** Whether any ongoing effect says this player's life total cannot change. */
export function lifeTotalIsLocked(state: GameState, seat: SeatId): boolean {
  return state.continuousEffects.some(
    (effect) =>
      effect.change.kind === 'playerCantChangeLifeTotal' && (effect.players ?? []).includes(seat),
  );
}

/** Whether an ongoing effect says this player can't cast spells (`playerCantCastSpells`, CR 101.2). */
export function castIsLocked(state: GameState, seat: SeatId): boolean {
  return state.continuousEffects.some(
    (effect) =>
      effect.change.kind === 'playerCantCastSpells' && (effect.players ?? []).includes(seat),
  );
}

/** "You can't cast additional spells this turn" (CR 101.2, 611.2a): the players named can't cast spells until the end of the turn. */
export function runPlayerCantCast(
  state: GameState,
  node: Extract<Effect, { kind: 'playerCantCastSpells' }>,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const players = resolvePlayers(state, node.player, ctx, targets);
  if (players.length === 0) return done(state);
  const [timestamp, stamped] = allocateTimestamp(state);
  const made: ContinuousEffect = {
    id: `ce${timestamp}`,
    timestamp,
    objects: [],
    players: [...players],
    until: 'endOfTurn',
    change: { kind: 'playerCantCastSpells' },
  };
  return done({ ...stamped, continuousEffects: [...stamped.continuousEffects, made] });
}

/** Applies the player-wide effect through the beginning of each named player's next turn. */
export function runPlayerLock(
  state: GameState,
  node: PlayerLockEffect,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): StepOutcome {
  const players = resolvePlayers(state, node.player, ctx, targets);
  if (players.length === 0) return done(state);
  let next = state;
  const made: ContinuousEffect[] = [];
  for (const seat of players) {
    const turnsTaken = (next.seats[seat]?.turnsTaken ?? 0) + 1;
    const [timestamp, stamped] = allocateTimestamp(next);
    next = stamped;
    made.push({
      id: `ce${timestamp}`,
      timestamp,
      objects: [],
      players: [seat],
      until: { kind: 'turnStart', seat, turnsTaken },
      change: {
        kind:
          node.kind === 'grantPlayerProtectionEverything'
            ? 'playerProtectionEverything'
            : 'playerCantChangeLifeTotal',
      },
    });
  }
  return done({ ...next, continuousEffects: [...next.continuousEffects, ...made] });
}
