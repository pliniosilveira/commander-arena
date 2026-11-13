/**
 * The static abilities that protect a player, read from the abilities of the permanents on the battlefield (CR 113.6, 604.1, 613.1f: a
 * permanent that lost its abilities protects nobody; D-149):
 * - `playerHexproof` ("You have hexproof", CR 702.11b): opponents' spells and abilities can't target the player;
 * - `cantLoseGame` ("You can't lose the game", CR 104.3): the state-based actions that make a player lose do not (`rules/sba.ts`).
 * `opponentsCantWin` needs no read: no effect makes a player win but CR 104.2a, which overrides it.
 * - `cantGainLife` ("Your opponents can't gain life", CR 119.7, D-363): the opponents of the controller gain no life (`rules/life-gain.ts`).
 */
import type { StaticEffect } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { mayHaveStatic } from './printed-statics';

/** Whether the player has a permanent on the battlefield with a static ability of the kind. */
function hasStaticOf(state: GameState, seat: SeatId, kind: StaticEffect['kind']): boolean {
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    if (!mayHaveStatic(state, obj, kind)) continue;
    if (derive(state, obj).abilities.some((a) => a.kind === 'static' && a.static.kind === kind)) {
      return true;
    }
  }
  return false;
}

/** CR 702.11b: whether a spell or ability controlled by `by` may target the player `seat`. */
export function playerCanBeTargetedBy(state: GameState, seat: SeatId, by: SeatId): boolean {
  return seat === by || !hasStaticOf(state, seat, 'playerHexproof');
}

/** CR 104.3: whether the state-based actions leave the player in the game whatever their life total and counters. */
export function cannotLoseGame(state: GameState, seat: SeatId): boolean {
  return hasStaticOf(state, seat, 'cantLoseGame');
}

/**
 * CR 119.7, 604.1 (D-363): whether an effect says the player `seat` can't gain life: a permanent an opponent of `seat` controls has `cantGainLife` ("Your
 * opponents can't gain life"). `rules/life-gain.ts` reads it, so every gain of life the player would make (an effect, lifelink damage, an exchange that
 * raises the life total) does not happen.
 */
export function cannotGainLife(state: GameState, seat: SeatId): boolean {
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined) continue;
    const controller = controllerOf(state, obj);
    if (controller === seat || !mayHaveStatic(state, obj, 'cantGainLife')) continue;
    if (
      derive(state, obj).abilities.some(
        (a) => a.kind === 'static' && a.static.kind === 'cantGainLife',
      )
    ) {
      return true;
    }
  }
  return false;
}
