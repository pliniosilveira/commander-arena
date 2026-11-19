/**
 * When unlocking a half of a Room is legal as a special action (CR 709.5e, 116), and what it costs. Used both to list the options of a priority decision (`rules/priority.ts`)
 * and to validate the action chosen (`rules/unlock-actions.ts`), as every legality function is, so the UI and the AI cannot diverge from the rules. It imports nothing that lists
 * priority options, so `priority.ts` can import it.
 *
 * CR 709.5e: "A player who controls a permanent that has one or more locked halves may pay the mana cost of a locked half of that permanent to give that permanent the
 * appropriate unlocked designation. ... A player can take this action any time they have priority and the stack is empty during a main phase of their turn."
 */
import type { Ability } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import { definitionOf, getObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { copiableValues } from './copiable';
import { isRoomDefinition } from './layouts';
import { hasSorceryTiming } from './legality';
import { planFor } from './mana-engine';

/** Whether `obj` could be a Room: a card of a split layout with permanent halves, or a token that copies one (cheap, no values are derived). */
function mayBeRoom(state: GameState, obj: GameObject): boolean {
  if (obj.zone !== 'battlefield') return false;
  if (obj.token !== null) return obj.token.doors !== undefined;
  return obj.card !== null && isRoomDefinition(definitionOf(state, obj.card));
}

/** The halves of the Room `obj` (as the copiable values it has now, CR 709.5b), or null when it is not one. */
export function doorsOf(state: GameState, obj: GameObject) {
  return mayBeRoom(state, obj) ? (copiableValues(state, obj).doors ?? null) : null;
}

/** Whether the half `door` of `obj` is unlocked (CR 709.5c). */
export function isDoorUnlocked(obj: GameObject, door: number): boolean {
  return obj.unlockedDoors?.includes(door) === true;
}

/** The unlock cost of the half `door` of the Room `obj` (CR 709.5e): the mana symbols of that half's mana cost, or null when `obj` is not a Room or the half has no cost. */
export function unlockSymbols(
  state: GameState,
  obj: GameObject,
  door: number,
): readonly string[] | null {
  const doors = doorsOf(state, obj);
  const cost = doors?.[door]?.characteristics.manaCost ?? null;
  return cost === null ? null : cost.filter((symbol) => symbol !== 'X' && symbol !== '0');
}

/**
 * CR 709.5e, 116.1, 601.2f: whether `seat` may unlock the half `door` of `obj` now: they control a Room with that half locked, it is a main phase of their turn with an empty
 * stack, and they can pay the half's mana cost.
 */
export function canUnlockDoor(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  door: number,
): boolean {
  if (!mayBeRoom(state, obj) || controllerOf(state, obj) !== seat) return false;
  if (isDoorUnlocked(obj, door) || !hasSorceryTiming(state, seat)) return false;
  const symbols = unlockSymbols(state, obj, door);
  if (symbols === null) return false;
  return symbols.length === 0 || planFor(state, seat, symbols, { ability: true }) !== null;
}

/** The halves `seat` may unlock now, in battlefield order and then door order. */
export function unlockableDoors(
  state: GameState,
  seat: SeatId,
): { readonly object: ObjectId; readonly door: number }[] {
  if (!hasSorceryTiming(state, seat)) return [];
  const found: { object: ObjectId; door: number }[] = [];
  for (const id of state.battlefield) {
    const obj = getObject(state, id);
    for (const door of [0, 1]) {
      if (canUnlockDoor(state, seat, obj, door)) found.push({ object: id, door });
    }
  }
  return found;
}

/**
 * CR 709.5h: whether `ability` is one of the abilities of the half `door` of the Room `id` (the left half is 0): "When you unlock this door" belongs to one half. Read from the
 * halves the permanent has as copiable values (CR 709.5b), so a copy of a Room keeps each ability with its half. False for a permanent that is not a Room.
 */
export function isAbilityOfDoor(
  state: GameState,
  id: ObjectId,
  ability: Ability,
  door: number | undefined,
): boolean {
  const obj = state.objects[id];
  if (obj === undefined || door === undefined) return false;
  return doorsOf(state, obj)?.[door]?.abilities.includes(ability) === true;
}
