/**
 * Dungeons and venturing (CR 309, 701.49). A player's dungeon is the dungeon card they own in the command zone and the room their venture marker is on
 * (`SeatState.dungeon`); the cards themselves are data (`rules/dungeon-data.ts`), outside the game until a venture brings one in (CR 309.2).
 *
 * - "Venture into [a dungeon]" is the `venture` effect, run as the `venture` instruction (`runVenture`): a player in no dungeon puts the dungeon into the command zone and the marker on
 *   its topmost room (CR 701.49a, 701.49d, 309.4a); a player in a room moves the marker to the next room, choosing which when two arrows leave it (CR 701.49b, 309.5a: a
 *   `chooseOption` decision of purpose `dungeonRoom`); a player on the bottommost room completes the dungeon and enters it again (CR 701.49c, 309.5b). Undercity is the only dungeon,
 *   so "venture into Undercity" and "venture into the dungeon" are the same here, and the rulings that a player in another dungeon continues in it hold trivially.
 * - Each room has a triggered room ability, "When you move your venture marker into this room, [effect]" (CR 309.4c): `findDungeonTriggers` makes it a pending trigger with no source from
 *   the `ventured` event, controlled by the dungeon's owner (it goes on the stack with its targets chosen as any trigger's, CR 603.3d).
 * - CR 704.5t, 309.6, 309.7: a venture marker on the bottommost room whose dungeon is not the source of a room ability that has triggered and not yet left the stack: the dungeon is removed
 *   from the game, and its owner has completed it (`completeDungeons`, run with the state-based actions).
 */

import type { UndercityRoom } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat, setSeat } from '../state/ops';
import type {
  GameState,
  InherentAbility,
  Instruction,
  PendingTrigger,
  ResolutionContext,
  TriggeredAbility,
} from '../state/types';
import { DUNGEONS, type RoomData, roomAbilityKey, UNDERCITY_ROOMS } from './dungeon-data';
import { done, type StepOutcome } from './step-outcome';

type VentureInstruction = Extract<Instruction, { kind: 'venture' }>;

/** The room ability of `room` of Undercity as a triggered ability (CR 309.4c); its trigger is a record of the rule, never evaluated (the pending trigger is made from the event). */
function roomAbility(data: RoomData): TriggeredAbility {
  return {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'each' },
    effect: data.effect,
    ...(data.targets === undefined ? {} : { targets: data.targets }),
  };
}

/** The text a room ability shows on the stack (CR 309.4c). */
export function roomText(room: UndercityRoom): string {
  const data = DUNGEONS.undercity.rooms[room];
  return `${data.name} — When you move your venture marker into this room, ${data.text.charAt(0).toLowerCase()}${data.text.slice(1)}`;
}

/** The room abilities' texts by the key of their inherent ability (`INHERENT_TEXT`). */
export const ROOM_TEXT: Readonly<Record<`undercity:${UndercityRoom}`, string>> = Object.fromEntries(
  UNDERCITY_ROOMS.map((room) => [roomAbilityKey(room), roomText(room)]),
) as Record<`undercity:${UndercityRoom}`, string>;

/** The room an inherent ability key names, or null when it is not a room ability. */
export function roomOfInherent(inherent: InherentAbility): UndercityRoom | null {
  const prefix = 'undercity:';
  if (!inherent.startsWith(prefix)) return null;
  const room = inherent.slice(prefix.length) as UndercityRoom;
  return DUNGEONS.undercity.rooms[room] === undefined ? null : room;
}

/** `seat` has no dungeon: the dungeon card is removed from the game (CR 309.7); the field is left out rather than set to undefined. */
function withoutDungeon(state: GameState, seat: SeatId): GameState {
  const { dungeon: _removed, ...rest } = getSeat(state, seat);
  // CR 309.7: the dungeon is completed as it is removed from the game; the player remembers how many.
  return setSeat(state, { ...rest, dungeonsCompleted: (rest.dungeonsCompleted ?? 0) + 1 });
}

/** The room with this name (the option of the question), or null. */
function roomNamed(name: string): UndercityRoom | null {
  return UNDERCITY_ROOMS.find((room) => DUNGEONS.undercity.rooms[room].name === name) ?? null;
}

/** The option of the room question that stands for `room`. */
export const roomOption = (room: UndercityRoom): string => DUNGEONS.undercity.rooms[room].name;

/**
 * The instruction `venture` (CR 701.49): moves the venture marker of `ins.seat`. Asks which room when two arrows leave the one it is on and `chosen` is null.
 */
export function runVenture(
  state: GameState,
  res: ResolutionContext,
  ins: VentureInstruction,
): StepOutcome {
  const seat = getSeat(state, ins.seat);
  if (seat.hasLost) return done(state);
  const dungeon = DUNGEONS[ins.dungeon];
  const here = seat.dungeon;
  const events: GameEvent[] = [];
  let from: UndercityRoom | null = null;
  let to: UndercityRoom;
  let next = state;
  const exits = here === undefined ? [] : DUNGEONS[here.dungeon].rooms[here.room].exits;
  if (here === undefined) {
    // CR 701.49a, 309.4a: the dungeon comes into the command zone, the marker on the topmost room.
    to = dungeon.top;
  } else if (exits.length === 0) {
    // CR 701.49c, 309.5b: on the bottommost room: the dungeon is removed from the game (completed, CR 309.7), then a dungeon is put into the command zone again.
    next = withoutDungeon(next, ins.seat);
    events.push({ kind: 'dungeonCompleted', seat: ins.seat, dungeon: here.dungeon });
    to = dungeon.top;
  } else {
    from = here.room;
    const [only] = exits;
    if (exits.length === 1 && only !== undefined) {
      to = only;
    } else if (ins.chosen !== null && exits.includes(ins.chosen)) {
      // CR 701.49b, 309.5a: the room the player chose among the arrows leaving the one they are in.
      to = ins.chosen;
    } else {
      return {
        state,
        events: [],
        front: [],
        needs: {
          kind: 'chooseOption',
          seat: ins.seat,
          purpose: 'dungeonRoom',
          options: exits.map(roomOption),
          source: res.object,
          sourceName: dungeon.name,
          sourceOracleText: '',
        },
      };
    }
  }
  next = patchSeat(next, ins.seat, { dungeon: { dungeon: ins.dungeon, room: to } });
  events.push({ kind: 'ventured', seat: ins.seat, dungeon: ins.dungeon, room: to, from });
  return done(next, events);
}

/** The room the answer of the question names, for the instruction that asked. */
export function roomChosen(option: string): UndercityRoom | null {
  return roomNamed(option);
}

/** CR 309.4c: the room abilities that the `ventured` events trigger, each controlled by the player who moved their venture marker. */
export function findDungeonTriggers(events: readonly GameEvent[]): PendingTrigger[] {
  const found: PendingTrigger[] = [];
  for (const e of events) {
    if (e.kind !== 'ventured') continue;
    found.push({
      source: null,
      inherent: roomAbilityKey(e.room),
      controller: e.seat,
      abilityIndex: -1,
      ability: roomAbility(DUNGEONS[e.dungeon].rooms[e.room]),
      subject: null,
    });
  }
  return found;
}

/** Whether a room ability of `seat`'s dungeon has triggered and not yet left the stack (CR 704.5t): waiting to go on the stack, being put there, or on it. */
function hasRoomAbilityPending(state: GameState, seat: SeatId): boolean {
  const isRoom = (inherent: InherentAbility | undefined): boolean =>
    inherent !== undefined && roomOfInherent(inherent) !== null;
  return (
    state.pendingTriggers.some((t) => t.controller === seat && isRoom(t.inherent)) ||
    (state.triggering?.queue ?? []).some((t) => t.controller === seat && isRoom(t.inherent)) ||
    state.stack.some((id) => {
      const obj = state.objects[id];
      return obj?.controller === seat && isRoom(obj.stack?.inherent);
    })
  );
}

/**
 * CR 704.5t, 309.6, 309.7: every player whose venture marker is on the bottommost room of their dungeon, and whose dungeon is the source of no room ability that is waiting or on the
 * stack, has the dungeon removed from the game: they complete it. Returns null when no player does.
 */
export function completeDungeons(
  state: GameState,
): { readonly state: GameState; readonly events: GameEvent[] } | null {
  let next = state;
  const events: GameEvent[] = [];
  for (const seat of state.seats) {
    const here = seat.dungeon;
    if (here === undefined) continue;
    if (DUNGEONS[here.dungeon].rooms[here.room].exits.length > 0) continue;
    if (hasRoomAbilityPending(state, seat.id)) continue;
    next = withoutDungeon(next, seat.id);
    events.push({ kind: 'dungeonCompleted', seat: seat.id, dungeon: here.dungeon });
  }
  return events.length === 0 ? null : { state: next, events };
}
