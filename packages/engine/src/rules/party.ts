/**
 * A player's party (CR 700.8): up to one Cleric, one Rogue, one Warrior and one Wizard among the creatures they control. The number of creatures in it is
 * worked out by the game, never declared (CR 700.8a); a creature with several of the four types fills one slot (CR 700.8b), and where that can be done in
 * different ways the one with the most creatures counts. That is the size of a maximum matching between the creatures and the four types, found here
 * by augmenting paths (`partySizeOf`, `assignParty`: they read no state, callers pass the creature types after layer 4). Stick Together asks each player to choose
 * a party from among their creatures (CR 700.8d): the rest of the file holds what is needed to ask and check that choice.
 */

import type { Subtype } from '../characteristics';
import { PARTY_TYPES, type PartyType } from '../characteristics';
import type { ObjectId } from '../ids';

export { PARTY_TYPES };

/**
 * The party roles each creature could fill: for creature `i`, the indexes into `PARTY_TYPES` of the party types among its `subtypes`.
 * A creature with none of them is left out.
 */
function slotsOf(creatures: readonly (readonly Subtype[])[]): number[][] {
  const slots: number[][] = [];
  for (const subtypes of creatures) {
    const mine: number[] = [];
    PARTY_TYPES.forEach((type, i) => {
      if (subtypes.includes(type)) mine.push(i);
    });
    if (mine.length > 0) slots.push(mine);
  }
  return slots;
}

/**
 * CR 700.8, 700.8a, 700.8b: the number of creatures in the party of a player whose creatures have the given creature `subtypes`
 * (one entry for each creature they control): a number from 0 to 4.
 */
export function partySizeOf(creatures: readonly (readonly Subtype[])[]): number {
  return assignParty(creatures).filter((slot) => slot !== null).length;
}

/**
 * The creature that fills each party slot (an index into `creatures`, or null for an empty slot), for a way of filling the slots with the most creatures
 * (CR 700.8b). The slots are in the order of `PARTY_TYPES`.
 */
export function assignParty(creatures: readonly (readonly Subtype[])[]): (number | null)[] {
  const index: number[] = [];
  creatures.forEach((subtypes, i) => {
    if (PARTY_TYPES.some((t) => subtypes.includes(t))) index.push(i);
  });
  const slots = slotsOf(creatures);
  const holder: (number | null)[] = PARTY_TYPES.map(() => null);
  const place = (c: number, seen: boolean[]): boolean => {
    for (const s of slots[c] ?? []) {
      if (seen[s]) continue;
      seen[s] = true;
      const current = holder[s];
      if (current === null || current === undefined || place(current, seen)) {
        holder[s] = c;
        return true;
      }
    }
    return false;
  };
  for (let c = 0; c < slots.length; c++)
    place(
      c,
      PARTY_TYPES.map(() => false),
    );
  return holder.map((c) => (c === null || c === undefined ? null : (index[c] ?? null)));
}

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
