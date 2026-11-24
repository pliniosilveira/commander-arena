/**
 * A party (CR 700.8): up to one Cleric, one Rogue, one Warrior and one Wizard a player controls. Stick Together asks each player to choose one from among their creatures
 * (CR 700.8d); this file holds what is needed to ask and check that choice. A creature with several of the types may fill any one of them, never two (CR 700.8b).
 */
import { PARTY_TYPES, type PartyType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import { objectsInZone } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';

/** What a player's party can be: for each party type, the creatures that could fill it. */
export interface PartySlot {
  readonly type: PartyType;
  readonly legal: readonly ObjectId[];
}

/** One filled place of a party. */
export interface PartyMember {
  readonly type: PartyType;
  readonly object: ObjectId;
}

/** CR 700.8d: the creatures `seat` controls (as `derive` gives them now), in object order. */
export function creaturesControlledBy(state: GameState, seat: SeatId): ObjectId[] {
  return objectsInZone(state, 'battlefield').filter((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      controllerOf(state, obj) === seat &&
      derive(state, obj).types.includes('creature')
    );
  });
}

/** CR 700.8d: for each party type, the creatures among `creatures` that have it (Changeling and the like are in `derive`'s subtypes). */
export function partySlots(state: GameState, creatures: readonly ObjectId[]): PartySlot[] {
  return PARTY_TYPES.map((type) => ({
    type,
    legal: creatures.filter((id) => {
      const obj = state.objects[id];
      return obj !== undefined && derive(state, obj).subtypes.includes(type);
    }),
  }));
}

/** CR 700.8d: true when the choice fills each type at most once, with a creature the slot lists, and uses no creature twice. */
export function isLegalParty(slots: readonly PartySlot[], party: readonly PartyMember[]): boolean {
  const types = new Set<PartyType>();
  const objects = new Set<ObjectId>();
  for (const member of party) {
    const slot = slots.find((s) => s.type === member.type);
    if (slot === undefined || !slot.legal.includes(member.object)) return false;
    if (types.has(member.type) || objects.has(member.object)) return false;
    types.add(member.type);
    objects.add(member.object);
  }
  return true;
}

/**
 * Every party the slots allow, the fullest first (more creatures before fewer, each in the order of the types and of the objects), at most `limit` of them. The empty party is
 * always included last when `limit` leaves room, because "up to one" allows choosing nobody.
 */
export function enumerateParties(slots: readonly PartySlot[], limit: number): PartyMember[][] {
  const out: PartyMember[][] = [];
  // One pass for each size, the largest first, stopping as soon as `limit` parties are listed (a table of changelings has many).
  const walk = (index: number, taken: PartyMember[], size: number): void => {
    if (out.length >= limit) return;
    if (taken.length === size) {
      out.push([...taken]);
      return;
    }
    const slot = slots[index];
    // Not enough slots left to reach the size.
    if (slot === undefined || size - taken.length > slots.length - index) return;
    for (const object of slot.legal) {
      if (taken.some((m) => m.object === object)) continue;
      walk(index + 1, [...taken, { type: slot.type, object }], size);
    }
    walk(index + 1, taken, size);
  };
  for (let size = slots.length; size >= 0; size--) walk(0, [], size);
  return out;
}
