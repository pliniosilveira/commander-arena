/**
 * "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains ..."
 * (Serra Paragon) and "Once during each of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped."
 * (Edgar, Master Machinist): CR 601.2a, 305.1, 113.6, D-232. The static ability `playFromGraveyardOnceEachTurn` of a permanent gives its controller the permission in their
 * own turn; the permission of each permanent is used once a turn (`TurnLog.graveyardPlays`), whether for a land or for a spell. The card keeps its own permission to be cast
 * from the graveyard when it has one (a spell cast that way uses nothing of this one). What the permanent the card becomes does because it was played this way
 * (enters tapped, gains an ability) is applied as it enters the battlefield (`applyGraveyardRider`).
 */
import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { GameObject, GameState, StackData } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { type GraveyardPlaySource, graveyardPlaySources } from './derive-statics';
import { matchesFilter } from './select';

/** What a use of the permission gives the permanent: kept on the spell on the stack (`StackData.graveyardPlay`). */
export type GraveyardRider = NonNullable<StackData['graveyardPlay']>;

/**
 * The permission, not yet used this turn, that lets `seat` play `obj` (a card in their graveyard) as a land (`asLand`) or cast it as a spell; null when none does. It
 * is read on the turn of `seat` only ("during each of your turns").
 */
export function graveyardPlayPermission(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  asLand: boolean,
): GraveyardPlaySource | null {
  if (obj.zone !== 'graveyard' || obj.owner !== seat || obj.card === null) return null;
  if (state.turn.activeSeat !== seat) return null;
  const used = state.turnLog.graveyardPlays ?? [];
  const types = derive(state, obj).types;
  for (const source of graveyardPlaySources(state)) {
    if (controllerOf(state, source.object) !== seat || used.includes(source.object.id)) continue;
    if (asLand) {
      if (source.land && types.includes('land')) return source;
      continue;
    }
    if (types.includes('land') || source.cast === undefined) continue;
    if (
      matchesFilter(
        state,
        obj,
        { ...source.cast, zone: 'graveyard' },
        { controller: seat, source: source.object.id },
      )
    ) {
      return source;
    }
  }
  return null;
}

/** The rider a use of `source` gives. */
export function riderOf(source: GraveyardPlaySource, asLand: boolean): GraveyardRider {
  return {
    source: source.object.id,
    // "If you cast a spell this way, that artifact enters tapped": a land played this way is not a spell (CR 305.1) and enters as it would.
    ...(source.entersTapped && !asLand ? { entersTapped: true as const } : {}),
    ...(source.gains === undefined ? {} : { gains: source.gains }),
  };
}

/** The permission of `source` is used for this turn. */
export function markGraveyardPlay(state: GameState, source: ObjectId): GameState {
  return {
    ...state,
    turnLog: {
      ...state.turnLog,
      graveyardPlays: [...(state.turnLog.graveyardPlays ?? []), source],
    },
  };
}

/** The permanent `id` entered the battlefield because of the permission: it enters tapped and gains the ability (a continuous effect that lasts, CR 611.2a). */
export function applyGraveyardRider(
  state: GameState,
  id: ObjectId,
  rider: GraveyardRider,
): GameState {
  let next = state;
  if (next.objects[id] === undefined) return state;
  if (rider.entersTapped === true) next = patchObject(next, id, { tapped: true });
  if (rider.gains !== undefined) {
    const [stamp, stamped] = allocateTimestamp(next);
    next = {
      ...stamped,
      continuousEffects: [
        ...stamped.continuousEffects,
        {
          id: `ce${stamp}`,
          timestamp: stamp,
          objects: [id],
          until: 'permanent',
          change: { kind: 'grantAbility', ability: rider.gains },
        },
      ],
    };
  }
  return next;
}
