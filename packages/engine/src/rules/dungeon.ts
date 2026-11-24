/**
 * Dungeons and venturing into them (CR 309, 701.49).
 *
 * A dungeon is data (`data/dungeons.ts`). The dungeon card a player owns in the command zone, and the room their venture marker is on, are a record of the seat
 * (`SeatState.dungeon`): nothing reads a dungeon card's characteristics, so it is not an object here (as the Ring is not, `ring.ts`).
 *
 * "Venture into Undercity" (`ventureIntoDungeon`, CR 701.49, 701.49d) is the instruction `venture`:
 * - with no dungeon the player puts Undercity into the command zone and the marker on its topmost room (CR 701.49a, 309.4a);
 * - with the marker on any other room they move it along an arrow pointing away from the room, and choose one when there are two (CR 701.49b, 309.5a; a `chooseOption`
 *   decision of purpose 'dungeonRoom', unless one arrow leaves the room);
 * - with the marker on the bottommost room (the room ability of which is still on its way, CR 309.6) the dungeon is removed, completed, and the player enters afresh (CR 701.49c, 309.5b).
 *
 * Moving the marker into a room is the event `ventured`, which triggers the room ability (CR 309.4c: "When you move your venture marker into this room, [effect]"): an inherent
 * ability with no source, controlled by the player who owns the dungeon (`findDungeonTriggers`), that goes on the stack like any other and chooses its targets as it does.
 * A venture marker on the bottommost room completes the dungeon as a state-based action once no room ability of that player is waiting or on the stack (CR 309.6, 309.7,
 * `completeDungeons`).
 */

import type { DungeonId, TargetSpec } from '../ast/types';
import { type DungeonRoom, roomOf, topmostRoom } from '../data/dungeons';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat } from '../state/ops';
import type {
  GameObject,
  GameState,
  Instruction,
  PendingTrigger,
  ResolutionContext,
  SeatState,
  TriggeredAbility,
} from '../state/types';
import { controllerOf } from './control';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type Venture = Extract<Instruction, { kind: 'venture' }>;

/** The inherent ability of a room is named `room:<room id>`. */
export const roomAbilityName = (room: string): `room:${string}` => `room:${room}`;

/** The room an inherent ability name stands for, or null when it is not a room ability. */
export function roomOfInherent(inherent: string | undefined): string | null {
  return inherent?.startsWith('room:') === true ? inherent.slice('room:'.length) : null;
}

/** The dungeon and room of a room ability (the only dungeon built is Undercity, which is the one every room id is looked up in). */
function findRoom(room: string): { dungeon: DungeonId; room: DungeonRoom } | null {
  const found = roomOf('undercity', room);
  return found === undefined ? null : { dungeon: 'undercity', room: found };
}

/** CR 309.4c: the room ability of a room, as an ability with no source. */
export function roomAbility(room: DungeonRoom): TriggeredAbility {
  return {
    kind: 'triggered',
    // Never read: `findDungeonTriggers` makes the pending trigger from the `ventured` event.
    trigger: { kind: 'endStep', whose: 'you' },
    effect: room.effect,
    ...(room.targets === undefined ? {} : { targets: room.targets as TargetSpec[] }),
  };
}

/** The text a room ability shows on the stack: "When you move your venture marker into this room, [effect]" (CR 309.4c). */
export function roomText(room: string): string {
  const found = findRoom(room);
  return found === null ? '' : `${found.room.name}: ${found.room.text}`;
}

/** The name a room ability is shown under: the dungeon it belongs to. */
export function roomDungeonName(room: string): string {
  return findRoom(room) === null ? 'Dungeon' : 'Undercity';
}

/** `seat` puts the venture marker on `room`: the event that triggers the room ability. */
function moveMarker(
  state: GameState,
  seat: SeatId,
  dungeon: DungeonId,
  room: DungeonRoom,
  from: string | null,
): { readonly state: GameState; readonly events: GameEvent[] } {
  return {
    state: patchSeat(state, seat, { dungeon: { dungeon, room: room.id } }),
    events: [{ kind: 'ventured', seat, dungeon, room: room.id, from }],
  };
}

/** The seat without its dungeon (`patchSeat` merges, so it could not remove the key, which the hash reads). */
function withoutDungeon(state: GameState, seat: SeatId): GameState {
  const current = getSeat(state, seat);
  const { dungeon: _gone, ...rest } = current;
  return {
    ...state,
    seats: state.seats.map((s) => (s.id === seat ? (rest as SeatState) : s)),
  };
}

/** CR 309.7: the player completes the dungeon as its card is removed from the game. */
function completeDungeon(
  state: GameState,
  seat: SeatId,
  dungeon: DungeonId,
): { readonly state: GameState; readonly events: GameEvent[] } {
  const removed = withoutDungeon(state, seat);
  return {
    state: patchSeat(removed, seat, {
      dungeonsCompleted: (getSeat(state, seat).dungeonsCompleted ?? 0) + 1,
    }),
    events: [{ kind: 'dungeonCompleted', seat, dungeon }],
  };
}

/**
 * Runs `venture` (CR 701.49). With two arrows leading away from the room the player is asked which to follow (the instruction stays at the head of the queue and
 * nothing has changed yet); with one it is followed.
 */
export function runVenture(state: GameState, res: ResolutionContext, ins: Venture): StepOutcome {
  const seat = ins.seat;
  if (getSeat(state, seat).hasLost) return done(state);
  const current = getSeat(state, seat).dungeon;
  const here = current === undefined ? undefined : roomOf(current.dungeon, current.room);
  if (current === undefined || here === undefined) {
    // CR 701.49a: no dungeon: put it into the command zone and the marker on the topmost room.
    const top = topmostRoom(ins.dungeon);
    const entered = moveMarker(state, seat, ins.dungeon, top, null);
    return done(entered.state, entered.events);
  }
  if (here.leadsTo.length === 0) {
    // CR 701.49c, 309.5b: on the bottommost room: the dungeon is removed and completed, and the player enters a dungeon afresh.
    const completed = completeDungeon(state, seat, current.dungeon);
    const entered = moveMarker(completed.state, seat, ins.dungeon, topmostRoom(ins.dungeon), null);
    return done(entered.state, [...completed.events, ...entered.events]);
  }
  const options = here.leadsTo;
  const picked = ins.chosen !== null && options.includes(ins.chosen) ? ins.chosen : options[0];
  if (options.length >= 2 && ins.chosen === null) {
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseOption',
        seat,
        purpose: 'dungeonRoom',
        options: [...options],
        source: res.object,
        sourceName: info?.name ?? 'Undercity',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }
  const next = picked === undefined ? undefined : roomOf(current.dungeon, picked);
  if (next === undefined) return done(state);
  const moved = moveMarker(state, seat, current.dungeon, next, here.id);
  return done(moved.state, moved.events);
}

/**
 * The room abilities (CR 309.4c) the `ventured` events trigger. Each belongs to the player who owns the dungeon, has no source and goes on the stack like any other, choosing
 * its targets as it does.
 */
export function findDungeonTriggers(
  _state: GameState,
  events: readonly GameEvent[],
): PendingTrigger[] {
  const found: PendingTrigger[] = [];
  for (const e of events) {
    if (e.kind !== 'ventured') continue;
    const room = roomOf(e.dungeon, e.room);
    if (room === undefined) continue;
    found.push({
      source: null,
      inherent: roomAbilityName(room.id),
      controller: e.seat,
      abilityIndex: -1,
      ability: roomAbility(room),
      subject: null,
    });
  }
  return found;
}

/** Whether a room ability of the seat has triggered and not yet left the stack (CR 309.6): waiting to be put there, or on the stack. */
function roomAbilityWaiting(state: GameState, seat: SeatId): boolean {
  const isRoom = (inherent: string | undefined, controller: SeatId) =>
    roomOfInherent(inherent) !== null && controller === seat;
  if (state.pendingTriggers.some((t) => isRoom(t.inherent, t.controller))) return true;
  if (state.triggering?.queue.some((t) => isRoom(t.inherent, t.controller)) === true) return true;
  return state.stack.some((id) => {
    const obj: GameObject | undefined = state.objects[id];
    return (
      obj?.stack?.inherent !== undefined && isRoom(obj.stack.inherent, controllerOf(state, obj))
    );
  });
}

/**
 * CR 309.6, 309.7: a player's venture marker is on the bottommost room of the dungeon, and the dungeon is not the source of a room ability that has triggered but not yet left the
 * stack, so the dungeon is removed from the game and the player completes it. A state-based action: null when nothing is to be done.
 */
export function completeDungeons(
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  for (const s of state.seats) {
    if (s.hasLost || s.dungeon === undefined) continue;
    const room = roomOf(s.dungeon.dungeon, s.dungeon.room);
    if (room === undefined || room.leadsTo.length > 0 || roomAbilityWaiting(state, s.id)) continue;
    const completed = completeDungeon(next, s.id, s.dungeon.dungeon);
    next = completed.state;
    events.push(...completed.events);
  }
  return events.length === 0 ? null : { state: next, events };
}
